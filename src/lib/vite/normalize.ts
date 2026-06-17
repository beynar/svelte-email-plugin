import { parse } from 'svelte/compiler';
import MagicString from 'magic-string';

/** A minimal structural view of the Svelte AST nodes we walk and edit. */
interface AstNode {
	type: string;
	start?: number;
	end?: number;
	name?: unknown;
	[key: string]: unknown;
}

function isNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

/**
 * HTML void elements — they have no closing tag. When one of these is remapped to
 * a component (which Svelte requires be closed), the open tag must be self-closed
 * (`<hr>` → `<Hr/>`). Only `hr`/`img` are remappable today, but the full set keeps
 * the slash-injection correct if the remap table is extended.
 */
const VOID_TAGS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

/**
 * The built-in native-tag → component remap table. `div`/`span` are intentionally
 * absent from the *unambiguous* set but `div`→`Container` is included per project
 * choice; `span`/`table` are left native (no clean component). `h1`–`h6` map to
 * `Heading` and additionally carry an `as="hN"` attribute (added by the remapper).
 */
export const DEFAULT_REMAP_TABLE: Record<string, string> = {
	html: 'Html',
	head: 'Head',
	body: 'Body',
	div: 'Container',
	section: 'Section',
	p: 'Text',
	hr: 'Hr',
	a: 'Link',
	img: 'Img',
	h1: 'Heading',
	h2: 'Heading',
	h3: 'Heading',
	h4: 'Heading',
	h5: 'Heading',
	h6: 'Heading'
};

/** Options controlling {@link normalizeEmail}. */
export interface NormalizeOptions {
	/** Auto-inject missing `<Html>`/`<Head>`/`<Body>`. */
	wrap: boolean;
	/** Rewrite native tags into components per {@link remapTable}. */
	remap: boolean;
	/** Native-tag → component map (merged from {@link DEFAULT_REMAP_TABLE}; `false` disables an entry). */
	remapTable: Record<string, string | false>;
	/** Module specifier the injected component imports point at. */
	importSource: string;
}

/** The result of normalization. */
export interface NormalizeResult {
	/** The (possibly) rewritten source. Equals the input string when `changed` is false. */
	code: string;
	/** Whether any edit was made (remap, wrap, or import injection). */
	changed: boolean;
}

/** Whether `source` is the library's import specifier (the configured one, or a `$lib` alias). */
function isLibSource(source: string, importSource: string): boolean {
	return (
		source === importSource ||
		source === '$lib' ||
		source === '$lib/index' ||
		source === '$lib/index.js' ||
		source === '$lib/index.ts'
	);
}

/**
 * Parse the instance `<script>`'s import declarations for bindings imported from
 * the library. Returns a `local → exported` alias map (e.g. `T → Text` for
 * `import { Text as T }`). Only the **instance** script is inspected, never
 * `context="module"`.
 */
function collectLibImports(instance: unknown, importSource: string): Map<string, string> {
	const aliases = new Map<string, string>();
	if (!isNode(instance)) return aliases;
	const content = (instance as { content?: { body?: unknown } }).content;
	const body = content?.body;
	if (!Array.isArray(body)) return aliases;
	for (const stmt of body) {
		if (!isNode(stmt) || stmt.type !== 'ImportDeclaration') continue;
		const src = (stmt.source as { value?: unknown } | undefined)?.value;
		if (typeof src !== 'string' || !isLibSource(src, importSource)) continue;
		const specifiers = stmt.specifiers;
		if (!Array.isArray(specifiers)) continue;
		for (const spec of specifiers) {
			if (!isNode(spec) || spec.type !== 'ImportSpecifier') continue;
			const exported = (spec.imported as { name?: unknown } | undefined)?.name;
			const local = (spec.local as { name?: unknown } | undefined)?.name;
			if (typeof exported === 'string' && typeof local === 'string') aliases.set(local, exported);
		}
	}
	return aliases;
}

/** Resolve a template node to the exported library component name it represents, if any. */
function exportedName(
	node: AstNode,
	aliases: Map<string, string>,
	table: Record<string, string | false>,
	remap: boolean
): string | undefined {
	if (node.type === 'Component' && typeof node.name === 'string') {
		return aliases.get(node.name) ?? node.name;
	}
	if (remap && node.type === 'RegularElement' && typeof node.name === 'string') {
		const target = table[node.name];
		if (target) return target;
	}
	return undefined;
}

/** A significant top-level node: skip whitespace-only text and comments. */
function isSignificant(node: unknown): node is AstNode {
	if (!isNode(node)) return false;
	if (node.type === 'Comment') return false;
	if (node.type === 'Text') {
		const data = typeof node.data === 'string' ? node.data : '';
		return data.trim().length > 0;
	}
	return true;
}

/**
 * Rewrite native tags into library components on `magicString`, recording the
 * exported component names introduced. Handles open/close tag renaming, void
 * slash-injection (`<hr>` → `<Hr/>`), and `h1`–`h6` → `<Heading as="hN">`.
 */
function remapElements(
	magicString: MagicString,
	source: string,
	fragment: unknown,
	table: Record<string, string | false>,
	introduced: Set<string>
): void {
	const seen = new Set<unknown>();
	const walk = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) walk(item);
			return;
		}
		if (!isNode(value) || seen.has(value)) return;
		seen.add(value);

		if (value.type === 'RegularElement' && typeof value.name === 'string') {
			const tag = value.name;
			const target = table[tag];
			if (target && typeof value.start === 'number' && typeof value.end === 'number') {
				const start = value.start;
				const end = value.end;
				// Emit the exported component name (its own binding gets imported later).
				magicString.overwrite(start + 1, start + 1 + tag.length, target);
				introduced.add(target);

				// `h1`–`h6` carry the level via `as`.
				if (target === 'Heading' && /^h[1-6]$/.test(tag)) {
					magicString.appendLeft(start + 1 + tag.length, ` as="${tag}"`);
				}

				const slice = source.slice(start, end);
				const selfClosed = slice.trimEnd().endsWith('/>');
				if (selfClosed) {
					// `<hr/>` / `<section/>` — open tag already self-closed; nothing more.
				} else if (VOID_TAGS.has(tag)) {
					// `<hr>` / `<img …>` — a component must be closed; inject the slash.
					magicString.appendLeft(end - 1, '/');
				} else {
					// Open/close form — rename the closing tag too (last `</` in the slice
					// is this element's own close; guard by matching the tag name).
					const rel = slice.lastIndexOf('</');
					if (rel !== -1) {
						let i = start + rel + 2;
						while (i < end && /\s/.test(source[i])) i++;
						if (source.slice(i, i + tag.length) === tag) {
							magicString.overwrite(i, i + tag.length, target);
						}
					}
				}
			}
		}

		for (const key of Object.keys(value)) {
			if (key === 'type' || key === 'start' || key === 'end') continue;
			walk((value as Record<string, unknown>)[key]);
		}
	};
	walk(fragment);
}

/** Find the position just past an element's opening `>` (handles self-closing). */
function openTagEnd(source: string, node: AstNode): number {
	// Scan from the tag name for the first `>` not inside a quoted attribute value.
	let i = node.start! + 1;
	let quote: string | null = null;
	for (; i < node.end!; i++) {
		const ch = source[i];
		if (quote) {
			if (ch === quote) quote = null;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === '>') {
			return i + 1;
		}
	}
	return node.end!;
}

/**
 * Opening tag for an auto-injected `<Body>`. A bare email with no authored body
 * would otherwise inherit the email client's serif default (Times New Roman), so
 * the injected one sets an email-safe sans-serif stack. An authored `<Body>` is
 * never touched, and child styles still override (it's just a sensible default).
 */
const INJECTED_BODY_OPEN = `<Body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">`;

/**
 * Inject the missing `Html`/`Head`/`Body` wrappers around the template, recording
 * any wrapper component names introduced. Insert-only (never moves author content).
 */
function injectWrappers(
	magicString: MagicString,
	source: string,
	fragment: unknown,
	aliases: Map<string, string>,
	table: Record<string, string | false>,
	remap: boolean,
	introduced: Set<string>
): void {
	const nodesRaw = (fragment as { nodes?: unknown })?.nodes;
	if (!Array.isArray(nodesRaw)) return;
	const top = nodesRaw.filter(isSignificant);
	if (top.length === 0) return;

	const roleOf = (node: AstNode): string | undefined => exportedName(node, aliases, table, remap);
	const htmlNode = top.find((n) => roleOf(n) === 'Html');

	const need = (name: string) => introduced.add(name);

	if (htmlNode) {
		const htmlChildren = ((htmlNode.fragment as { nodes?: unknown })?.nodes ?? []) as unknown[];
		const htmlTop = htmlChildren.filter(isSignificant);
		const hasHead = htmlTop.some((n) => roleOf(n) === 'Head');
		const hasBody = htmlTop.some((n) => roleOf(n) === 'Body');

		if (!hasHead) {
			magicString.appendLeft(openTagEnd(source, htmlNode), '\n\t<Head />');
			need('Head');
		}
		if (!hasBody) {
			// Wrap the non-Head children in <Body>.
			const firstNonHead = htmlTop.find((n) => roleOf(n) !== 'Head');
			if (firstNonHead) {
				const last = htmlTop[htmlTop.length - 1];
				magicString.appendLeft(firstNonHead.start!, INJECTED_BODY_OPEN);
				magicString.appendRight(last.end!, '</Body>');
				need('Body');
			}
		}
		return;
	}

	// No <Html>: wrap the whole contiguous top-level run.
	const contentStart = top[0].start!;
	const contentEnd = top[top.length - 1].end!;
	const headTop = top.find((n) => roleOf(n) === 'Head');
	const hasBody = top.some((n) => roleOf(n) === 'Body');
	const headIsFirst = headTop !== undefined && headTop === top[0];

	let prefix = '<Html lang="en" dir="ltr">\n';
	if (!headTop) {
		prefix += '\t<Head />\n';
		need('Head');
	}
	need('Html');

	const bodyOpenPos = headIsFirst ? headTop!.end! : contentStart;

	if (!hasBody && bodyOpenPos === contentStart) {
		prefix += '\t' + INJECTED_BODY_OPEN;
		need('Body');
	}
	magicString.appendLeft(contentStart, prefix);

	if (!hasBody && bodyOpenPos !== contentStart) {
		magicString.appendLeft(bodyOpenPos, '\n\t' + INJECTED_BODY_OPEN);
		need('Body');
	}

	let suffix = '';
	if (!hasBody) suffix += '</Body>';
	suffix += '\n</Html>';
	magicString.appendRight(contentEnd, suffix);
}

/**
 * Inject a single `import { … } from '<importSource>'` for the introduced
 * components not already bound under their own name. Prepends into the instance
 * `<script>`, or creates one when the email has no instance script.
 */
function injectImports(
	magicString: MagicString,
	instance: unknown,
	aliases: Map<string, string>,
	introduced: Set<string>,
	importSource: string
): void {
	// A component needs importing when no lib import already binds its own name.
	const missing = [...introduced].filter((name) => aliases.get(name) !== name).sort();
	if (missing.length === 0) return;

	const statement = `import { ${missing.join(', ')} } from '${importSource}';`;

	const content = isNode(instance)
		? (instance.content as { start?: number } | undefined)
		: undefined;
	if (content && typeof content.start === 'number') {
		magicString.appendLeft(content.start, `\n\t${statement}`);
	} else {
		magicString.prepend(`<script>\n\t${statement}\n</script>\n\n`);
	}
}

/**
 * The "forgiveness" pass: make a loosely-authored email a complete, component-based
 * document at build time. Pure and string-in/string-out — runs *before* the Tailwind
 * bake. Three ordered sub-passes: remap native tags → components, inject missing
 * `Html`/`Head`/`Body`, then inject the imports the introduced components need.
 *
 * Returns `{ code, changed }`; `code` is the original string (and `changed` is
 * false) when nothing needed rewriting.
 */
export function normalizeEmail(
	source: string,
	filename: string | undefined,
	options: NormalizeOptions
): NormalizeResult {
	const ast = parse(source, { modern: true, filename }) as unknown as {
		fragment?: unknown;
		instance?: unknown;
	};

	const magicString = new MagicString(source);
	const aliases = collectLibImports(ast.instance, options.importSource);
	/** Exported component names this pass introduced (remap targets + injected wrappers). */
	const introduced = new Set<string>();

	if (options.remap) {
		remapElements(magicString, source, ast.fragment, options.remapTable, introduced);
	}

	if (options.wrap) {
		injectWrappers(
			magicString,
			source,
			ast.fragment,
			aliases,
			options.remapTable,
			options.remap,
			introduced
		);
	}

	injectImports(magicString, ast.instance, aliases, introduced, options.importSource);

	if (!magicString.hasChanged()) return { code: source, changed: false };
	return { code: magicString.toString(), changed: true };
}
