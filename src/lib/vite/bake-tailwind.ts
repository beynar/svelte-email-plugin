import { parse } from 'svelte/compiler';
import MagicString from 'magic-string';
import type { TailwindMap } from '../internal/tailwind/generate-map.js';
import { tokenize } from './extract-classes.js';

/** A minimal structural view of the Svelte AST nodes we walk and edit. */
interface AstNode {
	type: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
}

function isNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

/**
 * A single static `Text` node that is the entire value of an attribute, e.g. the
 * `bg-blue-500` of `class="bg-blue-500"`. Returns `undefined` when the attribute
 * value is anything else (boolean, an `ExpressionTag`, or multiple parts).
 */
function staticTextValue(attribute: AstNode): AstNode | undefined {
	const value = attribute.value;
	if (!Array.isArray(value) || value.length !== 1) return undefined;
	const part = value[0];
	if (!isNode(part) || part.type !== 'Text') return undefined;
	return part;
}

/** Find a named `Attribute` on an element node, if present. */
function findAttribute(attributes: unknown, name: string): AstNode | undefined {
	if (!Array.isArray(attributes)) return undefined;
	for (const attribute of attributes) {
		if (isNode(attribute) && attribute.type === 'Attribute' && attribute.name === name) {
			return attribute;
		}
	}
	return undefined;
}

/** Every `class:name={cond}` directive on an element, in source order. */
function classDirectives(attributes: unknown): AstNode[] {
	if (!Array.isArray(attributes)) return [];
	return attributes.filter((a): a is AstNode => isNode(a) && a.type === 'ClassDirective');
}

/**
 * Whether a `class` attribute's value carries any dynamic part — i.e. it is a
 * lone `ExpressionTag` (`class={expr}`) or a template with at least one
 * interpolation (`class="a {expr} b"`). A purely static `class="…"` is not.
 */
function classValueIsDynamic(attribute: AstNode | undefined): boolean {
	if (!attribute) return false;
	const value = attribute.value;
	if (value === true) return false;
	const parts = Array.isArray(value) ? value : [value];
	return parts.some((p) => isNode(p) && p.type === 'ExpressionTag');
}

/**
 * Escape a string for embedding inside a single-quoted JS string literal, as in
 * `{@html '…'}` or `style={__twStyle(CLS) + '…'}`. Only backslash and single-quote
 * need escaping there.
 */
function escapeSingleQuoted(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// =============================================================================
// PHASE 3 DECISION (PRECOMPILE-PLAN.md §6 "the one decision to finalize")
// -----------------------------------------------------------------------------
// Static classes stay FULLY BAKED (Phase 2): resolved to inline `style` at build
// time, zero runtime cost. DYNAMIC class values (`class={expr}`, template
// `class="a {expr}"`, and `class:name={cond}` directives) take the §6 FALLBACK:
// a tiny generated `__tw` lookup baked into the email module.
//
// Why the fallback, not full build-time branch rewriting: robustly splitting a
// mixed inlinable+variant conditional into separate `style`/`class` branches
// (and re-deriving each branch's truthiness for every nested shape) is brittle.
// The helper is generated PURE JS — plain object lookups over a baked plain-object
// map plus a string split. It pulls in NO `tailwindcss`/`postcss`/`node-html-parser`
// and no Tailwind machinery, so the runtime stays clean: the only generated
// runtime code is the small `__tw*` lookup over a baked map of *this file's*
// classes. The map carries only the classes actually referenced in the file.
// =============================================================================

/** Names of the generated runtime helpers / map injected into the instance script. */
const TW_MAP = '__twMap';
const TW_STYLE = '__twStyle';
const TW_CLASS = '__twClass';

/**
 * Serialize a `Record<string,string>` as a deterministic (sorted-key) JS object
 * literal of single-quoted string entries.
 */
function objectLiteral(record: Record<string, string>): string {
	const keys = Object.keys(record).sort();
	const entries = keys.map((k) => `'${escapeSingleQuoted(k)}': '${escapeSingleQuoted(record[k])}'`);
	return `{ ${entries.join(', ')} }`;
}

/**
 * The generated runtime helper block: a baked `__twMap` (only this file's
 * referenced classes) plus `__twStyle`/`__twClass` doing plain object lookups
 * over a whitespace split. No Tailwind machinery; pure JS.
 */
function helperBlock(inline: Record<string, string>, rename: Record<string, string>): string {
	return (
		`const ${TW_MAP} = { inline: ${objectLiteral(inline)}, rename: ${objectLiteral(rename)} };\n` +
		`function ${TW_STYLE}(cls) {\n` +
		`	let s = '';\n` +
		`	for (const c of String(cls ?? '').split(/\\s+/)) { if (c && ${TW_MAP}.inline[c]) s += ${TW_MAP}.inline[c]; }\n` +
		`	return s;\n` +
		`}\n` +
		`function ${TW_CLASS}(cls) {\n` +
		`	const out = [];\n` +
		`	for (const c of String(cls ?? '').split(/\\s+/)) {\n` +
		`		if (!c || ${TW_MAP}.inline[c]) continue;\n` +
		`		out.push(${TW_MAP}.rename[c] ?? c);\n` +
		`	}\n` +
		`	return out.join(' ');\n` +
		`}\n`
	);
}

/** A dynamic element rewrite recorded during the walk, applied after it. */
interface DynamicEdit {
	/** Element attributes span where `class`/`class:`/merged-away `style` live. */
	start: number;
	end: number;
	/** The replacement attribute text (the new `style={…} class={…}`). */
	replacement: string;
}

/**
 * Build the runtime "class-string expression" `CLS` for a dynamic element from
 * its `class` attribute value parts and its `class:name={cond}` directives.
 *
 * Each piece becomes a JS term that yields a class substring at runtime; the
 * terms are joined with `+`:
 * - static `Text` part         → a quoted string literal of its raw text (keeps
 *                                 the author's spacing, e.g. `'px-4 '`);
 * - `ExpressionTag` (`{expr}`) → `(expr)`;
 * - `class:name={cond}`        → `(cond ? ' name' : '')` (leading space so it
 *                                 can't fuse with a preceding token).
 *
 * Directive terms are always space-prefixed and an element has at most one
 * `class` attribute, so no extra padding is needed; the helpers' whitespace
 * split tolerates any incidental double-spacing.
 */
function buildClassExpression(
	source: string,
	classAttribute: AstNode | undefined,
	directives: AstNode[]
): string {
	const terms: string[] = [];

	if (classAttribute) {
		const value = classAttribute.value;
		const parts = Array.isArray(value) ? value : value === true ? [] : [value];
		for (const part of parts) {
			if (!isNode(part)) continue;
			if (part.type === 'Text') {
				const data = typeof part.data === 'string' ? part.data : '';
				if (data.length > 0) terms.push(`'${escapeSingleQuoted(data)}'`);
			} else if (part.type === 'ExpressionTag') {
				const expression = part.expression as AstNode | undefined;
				if (isNode(expression) && typeof expression.start === 'number') {
					const exprText = source.slice(expression.start, expression.end!);
					terms.push(`(${exprText})`);
				}
			}
		}
	}

	for (const directive of directives) {
		const name = typeof directive.name === 'string' ? directive.name : '';
		const expression = directive.expression as AstNode | undefined;
		if (!name || !isNode(expression) || typeof expression.start !== 'number') continue;
		const condText = source.slice(expression.start, expression.end!);
		terms.push(`(${condText} ? ' ${escapeSingleQuoted(name)}' : '')`);
	}

	if (terms.length === 0) return `''`;
	if (terms.length === 1) return terms[0];
	return terms.join(' + ');
}

/**
 * Rewrite a `.svelte` email source so Tailwind classes become inline styles.
 *
 * **Static** `class="…"` attributes are fully baked at build time (Phase 2):
 * inlinable utilities → merged inline `style="…"`, variant utilities (`sm:`,
 * `hover:`) → sanitized class names with their CSS rules hoisted into `<Head>`.
 *
 * **Dynamic** class values — `class={expr}`, template `class="a {expr} b"`, and
 * `class:name={cond}` directives — use the §6 fallback: a tiny generated `__tw`
 * lookup baked into the email module. Each dynamic element is rewritten to
 * `style={__twStyle(CLS) + '<author style>'} class={__twClass(CLS)}` where `CLS`
 * is a runtime class-string expression folded from the original value and any
 * directives. See the PHASE 3 DECISION comment above for the rationale.
 *
 * Operates on the Svelte source AST (`parse({ modern: true })`) with
 * `magic-string` for precise, source-mapped edits.
 *
 * The author's existing inline `style` always wins: Tailwind declarations are
 * emitted **first**, the author's style **after**.
 *
 * @param source The `.svelte` file contents.
 * @param map The class→style map from `generateTailwindMap`.
 * @param filename Optional filename, forwarded to `parse` for error messages.
 * @throws if variant rules are produced but the email has no `<Head>`.
 */
export function bakeTailwind(source: string, map: TailwindMap, filename?: string): string {
	const ast = parse(source, { modern: true, filename }) as unknown as {
		fragment?: unknown;
		instance?: { start?: number; end?: number; content?: { start?: number; end?: number } };
	};

	const magicString = new MagicString(source);

	/** The first `<Head>` element found, for hoisted-rule injection. */
	let headNode: AstNode | undefined;

	/** Whether any dynamic element needs the generated `__tw` helper. */
	let needsHelper = false;
	/** The minimal `inline`/`rename` entries (this file's classes) for the helper. */
	const helperInline: Record<string, string> = {};
	const helperRename: Record<string, string> = {};
	/** Deferred dynamic-element edits, applied after the walk. */
	const dynamicEdits: DynamicEdit[] = [];

	/**
	 * Record the helper map entry for a class token referenced in a dynamic value
	 * (so the baked `__twMap` is minimal). Variant classes also contribute their
	 * hoisted rule — done separately via the full-map union below.
	 */
	const recordHelperClass = (token: string) => {
		const inlineDecls = map.inline[token];
		if (inlineDecls !== undefined) {
			helperInline[token] = inlineDecls;
			return;
		}
		const renamed = map.rename[token];
		if (renamed !== undefined) helperRename[token] = renamed;
		// Unknown tokens need no map entry: the helper keeps them verbatim.
	};

	/** All literal class tokens reachable from a dynamic `class` value / directive. */
	const collectLiteralTokens = (node: AstNode, out: string[]): void => {
		switch (node.type) {
			case 'Literal':
				if (typeof node.value === 'string') out.push(...tokenize(node.value));
				break;
			case 'TemplateLiteral': {
				const quasis = (node.quasis ?? []) as AstNode[];
				for (const quasi of quasis) {
					const cooked = (quasi.value as { cooked?: string | null } | undefined)?.cooked;
					if (typeof cooked === 'string') out.push(...tokenize(cooked));
				}
				for (const expr of (node.expressions ?? []) as AstNode[]) {
					if (isNode(expr)) collectLiteralTokens(expr, out);
				}
				break;
			}
			case 'ConditionalExpression':
				if (isNode(node.consequent)) collectLiteralTokens(node.consequent as AstNode, out);
				if (isNode(node.alternate)) collectLiteralTokens(node.alternate as AstNode, out);
				break;
			case 'LogicalExpression':
				if (node.operator === '&&') {
					if (isNode(node.right)) collectLiteralTokens(node.right as AstNode, out);
				} else {
					if (isNode(node.left)) collectLiteralTokens(node.left as AstNode, out);
					if (isNode(node.right)) collectLiteralTokens(node.right as AstNode, out);
				}
				break;
			case 'ArrayExpression':
				for (const el of (node.elements ?? []) as Array<AstNode | null>) {
					if (isNode(el)) collectLiteralTokens(el, out);
				}
				break;
			// Anything else is a non-literal expression — its classes can't be known
			// statically (out of grammar; Phase 6 rejects it), so nothing to record.
		}
	};

	/** Process one dynamic element: fold `CLS`, emit `style`/`class`, record edit. */
	const processDynamicElement = (
		node: AstNode,
		classAttribute: AstNode | undefined,
		directives: AstNode[]
	): void => {
		// Record this file's referenced classes for the minimal baked map.
		const literalTokens: string[] = [];
		if (classAttribute) {
			const value = classAttribute.value;
			const parts = Array.isArray(value) ? value : value === true ? [] : [value];
			for (const part of parts) {
				if (!isNode(part)) continue;
				if (part.type === 'Text') {
					// A static literal segment of the class value (e.g. the `px-4` of
					// `class="px-4 {…}"` or the whole `class="px-4"` on an element that
					// also has a `class:` directive) still contributes baked-map entries.
					if (typeof part.data === 'string') literalTokens.push(...tokenize(part.data));
				} else if (part.type === 'ExpressionTag' && isNode(part.expression)) {
					collectLiteralTokens(part.expression as AstNode, literalTokens);
				}
			}
		}
		for (const directive of directives) {
			if (typeof directive.name === 'string') literalTokens.push(...tokenize(directive.name));
		}
		for (const token of literalTokens) recordHelperClass(token);

		// Build the runtime class-string expression from the value + directives.
		const cls = buildClassExpression(source, classAttribute, directives);

		// Merge any existing *static* inline style — author style wins (emitted after).
		const styleAttribute = findAttribute(node.attributes, 'style');
		const styleText = styleAttribute ? staticTextValue(styleAttribute) : undefined;
		const existingStyle =
			styleText && typeof styleText.data === 'string' ? styleText.data : undefined;

		const styleExpr =
			existingStyle && existingStyle.length > 0
				? `${TW_STYLE}(${cls}) + '${escapeSingleQuoted(existingStyle)}'`
				: `${TW_STYLE}(${cls})`;
		const replacement = `style={${styleExpr}} class={${TW_CLASS}(${cls})}`;

		needsHelper = true;

		// Compute the element-attribute span to replace. We overwrite from the first
		// touched attribute to the last, removing the `class`, all `class:` directives,
		// and the merged-away static `style` (when one existed), and dropping the new
		// pair in. Untouched attributes in-between are preserved by slicing around them.
		const touched: AstNode[] = [];
		if (classAttribute) touched.push(classAttribute);
		for (const directive of directives) touched.push(directive);
		if (styleText && existingStyle !== undefined && styleAttribute) touched.push(styleAttribute);
		touched.sort((a, b) => a.start! - b.start!);

		// Rebuild the slice between the first and last touched attribute, keeping any
		// untouched attributes that fall inside that span verbatim, then inject the
		// new pair where the first touched attribute was.
		const spanStart = touched[0].start!;
		const spanEnd = touched[touched.length - 1].end!;
		const touchedSet = new Set(touched);
		const untouched = (Array.isArray(node.attributes) ? (node.attributes as AstNode[]) : []).filter(
			(a) => isNode(a) && a.start! >= spanStart && a.end! <= spanEnd && !touchedSet.has(a)
		);
		const preserved = untouched
			.map((a) => source.slice(a.start!, a.end!))
			.filter((s) => s.length > 0);
		const pieces = [replacement, ...preserved];

		dynamicEdits.push({ start: spanStart, end: spanEnd, replacement: pieces.join(' ') });
	};

	/** Process one element node's `class` attribute(s) — static or dynamic. */
	const processElement = (node: AstNode) => {
		const attributes = node.attributes;
		const directives = classDirectives(attributes);
		const classAttribute = findAttribute(attributes, 'class');

		// Dynamic when the element has any `class:` directive or a dynamic `class`
		// value (lone `ExpressionTag` or a template with interpolation). Otherwise
		// fall through to the Phase 2 static path.
		if (directives.length > 0 || classValueIsDynamic(classAttribute)) {
			processDynamicElement(node, classAttribute, directives);
			return;
		}

		if (!classAttribute) return;

		// Only purely static `class="…"` (a single `Text` node) is in scope.
		const classText = staticTextValue(classAttribute);
		if (!classText || typeof classText.data !== 'string') return;

		const tokens = tokenize(classText.data);
		if (tokens.length === 0) return;

		let twDecls = '';
		const residualClasses: string[] = [];
		for (const token of tokens) {
			const inlineDecls = map.inline[token];
			if (inlineDecls !== undefined) {
				twDecls += inlineDecls;
				continue;
			}
			const renamed = map.rename[token];
			if (renamed !== undefined) {
				residualClasses.push(renamed);
				continue;
			}
			// Unknown (non-Tailwind) class — keep the original token.
			residualClasses.push(token);
		}

		// Nothing recognized → leave the element as-is.
		if (twDecls === '' && residualClasses.length === tokens.length) return;

		// Merge Tailwind declarations with any existing static inline style; the
		// author's declarations come *after* so they win in the cascade.
		const styleAttribute = findAttribute(attributes, 'style');
		const styleText = styleAttribute ? staticTextValue(styleAttribute) : undefined;
		const existingStyle =
			styleText && typeof styleText.data === 'string' ? styleText.data : undefined;
		const mergedStyle = `${twDecls}${existingStyle ?? ''}`;

		// Apply the style edit. When an existing static `style` is present, merge
		// into it in place; the `class` slot then only needs the residual classes.
		// Otherwise the `class` slot is overwritten with the new `style` (+ residual
		// classes). Either way we keep edits within the element's tag and never
		// emit an empty `style=""`.
		if (styleText && existingStyle !== undefined) {
			if (mergedStyle !== '') {
				magicString.overwrite(styleText.start!, styleText.end!, mergedStyle);
			}
			// Overwrite the `class` slot with the residual classes (in place, so the
			// surrounding whitespace is preserved), or drop it entirely if empty.
			if (residualClasses.length > 0) {
				magicString.overwrite(
					classAttribute.start!,
					classAttribute.end!,
					`class="${residualClasses.join(' ')}"`
				);
			} else {
				removeAttribute(magicString, source, classAttribute);
			}
		} else {
			// No existing static style — replace the `class` attribute span in place
			// with the new `style` (and residual `class`, if any).
			const parts: string[] = [];
			if (mergedStyle !== '') parts.push(`style="${mergedStyle}"`);
			if (residualClasses.length > 0) parts.push(`class="${residualClasses.join(' ')}"`);
			if (parts.length > 0) {
				magicString.overwrite(classAttribute.start!, classAttribute.end!, parts.join(' '));
			} else {
				removeAttribute(magicString, source, classAttribute);
			}
		}
	};

	// Generic deep walk (mirrors extract-classes): recurse arrays and any object
	// carrying a `type`, covering RegularElement/Component/SvelteElement and the
	// block nodes (IfBlock/EachBlock/…) via their child fragments.
	const seen = new Set<unknown>();
	const walk = (value: unknown) => {
		if (Array.isArray(value)) {
			for (const item of value) walk(item);
			return;
		}
		if (!isNode(value) || seen.has(value)) return;
		seen.add(value);

		if (value.name === 'Head' && !headNode) headNode = value;
		if ('attributes' in value) processElement(value);

		for (const key of Object.keys(value)) {
			if (key === 'type' || key === 'start' || key === 'end') continue;
			walk((value as Record<string, unknown>)[key]);
		}
	};

	walk(ast.fragment);

	// Apply the deferred dynamic-element edits (no overlap: each is one element).
	for (const edit of dynamicEdits) {
		magicString.overwrite(edit.start, edit.end, edit.replacement);
	}

	// Inject the generated `__tw` helper once, into the instance <script>.
	if (needsHelper) {
		const helper = helperBlock(helperInline, helperRename);
		injectHelper(magicString, ast.instance, helper);
	}

	// Inject hoisted variant rules into the email's <Head>. We hoist the union of
	// *all* `map.hoist` rules (deduped, stable order) — a variant class may live
	// only inside a dynamic branch, which the static walk wouldn't observe.
	const hoistRules = [
		...new Set(
			Object.keys(map.hoist)
				.sort()
				.map((k) => map.hoist[k])
		)
	];
	if (hoistRules.length > 0) {
		if (!headNode) {
			throw new Error(
				'svelte-email-plugin: Tailwind produced responsive/stateful styles but the email has no <Head> to hoist them into.'
			);
		}
		const style = `<style>${hoistRules.join('')}</style>`;
		const injection = `{@html '${escapeSingleQuoted(style)}'}`;
		injectHeadChild(magicString, source, headNode, injection);
	}

	return magicString.toString();
}

/**
 * Inject the generated `__tw` helper block into the email's instance `<script>`.
 * When the email has no instance script, prepend a fresh `<script>…</script>`.
 */
function injectHelper(
	magicString: MagicString,
	instance: { content?: { start?: number; end?: number } } | undefined,
	helper: string
): void {
	const content = instance?.content;
	if (content && typeof content.start === 'number' && typeof content.end === 'number') {
		// Append the helper at the *end* of the existing instance script body so it
		// follows any imports/`<script>`-level declarations it never references.
		magicString.appendLeft(content.end, `\n${helper}`);
	} else {
		// No instance script — prepend one at the very top of the file.
		magicString.prepend(`<script>\n${helper}</script>\n`);
	}
}

/**
 * Remove an attribute's full `name="value"` span plus one leading whitespace
 * character (so neighbouring attributes don't end up jammed together).
 */
function removeAttribute(magicString: MagicString, source: string, attribute: AstNode): void {
	let from = attribute.start!;
	if (from > 0 && /\s/.test(source[from - 1])) from -= 1;
	magicString.remove(from, attribute.end!);
}

/**
 * Inject `child` as the first child of a `<Head>` element. A self-closing
 * `<Head/>` is expanded to `<Head>child</Head>`; an open `<Head>…</Head>` gets
 * `child` inserted right after its opening tag.
 */
function injectHeadChild(
	magicString: MagicString,
	source: string,
	headNode: AstNode,
	child: string
): void {
	const name = typeof headNode.name === 'string' ? headNode.name : 'Head';
	const slice = source.slice(headNode.start!, headNode.end!);

	if (slice.trimEnd().endsWith('/>')) {
		// Self-closing `<Head … />` → `<Head …>child</Head>`. Replace just the
		// trailing `/>` so any attributes on the tag are preserved.
		const slashIndex = source.lastIndexOf('/>', headNode.end!);
		magicString.overwrite(slashIndex, headNode.end!, `>${child}</${name}>`);
	} else {
		// Open/close form → insert right before the closing `</Head>` tag.
		const closeTag = `</${name}>`;
		const insertAt = headNode.end! - closeTag.length;
		magicString.appendLeft(insertAt, child);
	}
}
