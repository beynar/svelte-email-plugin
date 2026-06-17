import type { AtRule, ChildNode, Container, Declaration, Rule } from 'postcss';
import {
	convertOklch,
	convertColorMix,
	normalizeRgb,
	evalCalc,
	remToPx,
	expandLogical,
	sanitizeClass,
	convertMediaParams
} from './resolve.js';

/**
 * The class→style map produced by {@link generateTailwindMap}. It carries
 * everything a baker needs to rewrite an email's source: inlinable
 * declarations for simple utilities, the renamed class names for variant
 * utilities, and the hoisted CSS rules those renamed classes point at.
 */
export interface TailwindMap {
	/** class → inlinable declaration string, e.g. `"color:rgb(...);padding-left:20px;"` */
	inline: Record<string, string>;
	/** original variant class → sanitized class name (`sm:text-lg` → `sm_text-lg`) */
	rename: Record<string, string>;
	/** sanitized class → its hoisted CSS rule(s), e.g. `"@media (min-width: 640px){.sm_text-lg{font-size:18px}}"` */
	hoist: Record<string, string>;
}

/**
 * Options for {@link generateTailwindMap}.
 */
export interface GenerateMapOptions {
	/**
	 * Extra CSS prepended to the Tailwind compile input — use Tailwind v4's
	 * CSS-first config here, e.g. `@theme { --color-brand: #6d28d9; }` or
	 * `@import` / `@plugin` directives. Defaults to none.
	 */
	css?: string;
}

/**
 * Load the build-time peer dependencies. They are not bundled with `svelte-plugin-mail`,
 * so consumers only pay for them in the build (the Vite plugin), never at runtime.
 */
async function loadDeps() {
	try {
		const [tailwind, postcss, mod, fs] = await Promise.all([
			import('tailwindcss'),
			import('postcss'),
			import('node:module'),
			import('node:fs')
		]);
		return {
			compile: tailwind.compile,
			postcss: postcss.default,
			createRequire: mod.createRequire,
			readFileSync: fs.readFileSync
		};
	} catch {
		throw new Error(
			"svelte-plugin-mail: building the Tailwind map requires 'tailwindcss@^4' and 'postcss'. " +
				'Install them to use the build-time Tailwind support.'
		);
	}
}

/**
 * Build the class→style map for a set of Tailwind (v4) utility classes.
 *
 * Compiles the given `classes` with Tailwind v4's programmatic compiler, then
 * resolves the output into email-safe values — CSS variables substituted,
 * `oklch()`→`rgb()`, opacity modifiers (`bg-blue-500/50` → `color-mix(…)`)
 * folded to `rgba()`, `rounded-full`'s `calc(infinity * 1px)` mapped to `9999px`,
 * `calc()` (`*`/`/`) evaluated, `rem`→`px`, logical properties expanded, and
 * modern `rgb()` syntax normalized to commas. Additive/mixed-unit `calc()` is
 * left intact.
 *
 * Instead of mutating HTML, it emits a {@link TailwindMap}:
 * - a **simple** utility → `inline[cls]` accumulates its resolved declarations;
 * - a **variant** utility (nested `@media`/`&:pseudo`) → `rename[cls]` is its
 *   sanitized class name and `hoist[sanitized]` accumulates the hoisted rule(s),
 *   so the sanitized class is idempotent (a second pass is a no-op).
 *
 * @throws if the build-time peer deps are missing.
 */
export async function generateTailwindMap(
	classes: string[],
	options: GenerateMapOptions = {}
): Promise<TailwindMap> {
	const map: TailwindMap = { inline: {}, rename: {}, hoist: {} };

	const classSet = new Set(classes.filter(Boolean));
	if (classSet.size === 0) return map;

	const { compile, postcss, createRequire, readFileSync } = await loadDeps();

	// Compile Tailwind v4 for exactly the candidate classes (theme + utilities,
	// no preflight). `@import "tailwindcss/theme.css"` is resolved from the
	// consumer's installed `tailwindcss` package.
	const require = createRequire(import.meta.url);
	const loadStylesheet = async (id: string, base: string) => {
		const resolved = require.resolve(id, { paths: [base, process.cwd()] });
		return { base, content: readFileSync(resolved, 'utf8'), path: resolved };
	};
	const input =
		`${options.css ?? ''}\n` +
		'@layer theme, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@tailwind utilities;';
	const { build } = await compile(input, { base: process.cwd(), loadStylesheet });
	const ast = postcss.parse(build([...classSet]));

	// Collect variables for resolution. `@property` *registered* custom properties
	// (Tailwind v4 declares its internals like `--tw-border-style: solid` this way)
	// are seeded first as defaults — without them, utilities such as `border`,
	// `divide-x`, `ring-*` would inline an unresolved `var(--tw-…)` that email
	// clients drop. Real `:root`/`:host` theme values then override these.
	const vars: Record<string, string> = {};
	ast.walkAtRules('property', (atRule: AtRule) => {
		const prop = atRule.params.trim();
		if (!prop.startsWith('--')) return;
		atRule.walkDecls('initial-value', (d: Declaration) => {
			vars[prop] = d.value;
		});
	});
	ast.walkRules((rule: Rule) => {
		if (/^:root|:host/.test(rule.selector)) {
			rule.walkDecls((d: Declaration) => {
				if (d.prop.startsWith('--')) vars[d.prop] = d.value;
			});
		}
	});
	const resolveVars = (value: string, scope: Record<string, string>, depth = 0): string => {
		if (depth > 12) return value;
		const out = value.replace(
			/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
			(whole, name: string, fallback?: string) => {
				const v = scope[name];
				if (v && v !== 'initial') return resolveVars(v, scope, depth + 1);
				if (fallback != null) return resolveVars(fallback.trim(), scope, depth + 1);
				return whole;
			}
		);
		return out === value ? out : resolveVars(out, scope, depth + 1);
	};
	const processValue = (v: string, scope: Record<string, string>): string => {
		let out = resolveVars(v, scope);
		// `rounded-full` etc. emit `calc(infinity * 1px)`; react-email maps it to `9999px`.
		out = out.replace(/calc\(\s*infinity\s*\*\s*1px\s*\)/gi, '9999px');
		out = convertOklch(out);
		out = convertColorMix(out); // after oklch so the inner color is rgb/hex
		out = remToPx(out);
		out = evalCalc(out);
		out = normalizeRgb(out);
		return out.trim();
	};

	/** Direct (non-nested) declarations of a rule/at-rule, processed + logical-expanded. */
	const directDecls = (node: Container): Array<[string, string]> => {
		// A rule may set custom properties it then consumes in the same rule —
		// `.shadow-lg`/`.ring-2` declare `--tw-shadow`/`--tw-ring-shadow` and reference
		// them in `box-shadow`. Layer those local values over the global theme/@property
		// defaults so the shadow resolves to a real value instead of the transparent
		// `0 0 #0000` initial-value.
		let scope = vars;
		node.each((child: ChildNode) => {
			if (child.type === 'decl' && child.prop.startsWith('--')) {
				if (scope === vars) scope = { ...vars };
				scope[child.prop] = child.value;
			}
		});
		const out: Array<[string, string]> = [];
		node.each((child: ChildNode) => {
			if (child.type === 'decl' && !child.prop.startsWith('--')) {
				for (const pair of expandLogical(child.prop, processValue(child.value, scope)))
					out.push(pair);
			}
		});
		return out;
	};

	/** Walk a class rule, tracking the nested media/pseudo context (v4 uses CSS nesting). */
	const walk = (node: Container, cls: string, media: string[], pseudo: string): void => {
		const decls = directDecls(node);
		if (decls.length > 0) {
			if (media.length === 0 && pseudo === '') {
				map.inline[cls] = (map.inline[cls] ?? '') + decls.map(([p, v]) => `${p}:${v};`).join('');
			} else {
				const san = sanitizeClass(cls);
				map.rename[cls] = san;
				// `!important` so the hoisted variant rule beats the base utility we
				// inlined onto the element's `style` (inline styles otherwise win on
				// specificity, silently killing `sm:`/`hover:` overrides). Mirrors
				// react-email's `sanitizeNonInlinableRules`.
				let inner = `.${san}${pseudo}{${decls.map(([p, v]) => `${p}:${v} !important`).join(';')}}`;
				for (let i = media.length - 1; i >= 0; i--)
					inner = `@media ${convertMediaParams(media[i])}{${inner}}`;
				map.hoist[san] = (map.hoist[san] ?? '') + inner;
			}
		}
		node.each((child: ChildNode) => {
			if (child.type === 'rule' && child.selector.includes('&')) {
				walk(child, cls, media, pseudo + child.selector.replace(/&/g, ''));
			} else if (child.type === 'atrule' && (child as AtRule).name === 'media') {
				walk(child, cls, [...media, (child as AtRule).params], pseudo);
			}
		});
	};

	ast.each((node: ChildNode) => {
		if (node.type !== 'rule') return;
		const m = node.selector.match(/^\.((?:[\w-]|\\.)+)$/);
		if (!m) return; // skip `*`, `:root`, compound/complex selectors
		walk(node, m[1].replace(/\\/g, ''), [], '');
	});

	return map;
}
