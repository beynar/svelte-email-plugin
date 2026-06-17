// ---------------------------------------------------------------------------
// Value processing: turn Tailwind v4's CSS-variable / oklch / calc / rem /
// logical-property output into the concrete, email-safe declarations that
// email clients understand.
//
// Build-only: these pure resolvers are composed by `generate-map.ts` to build
// the class→style map at build time. They never run at render time.
// ---------------------------------------------------------------------------

/** Convert an oklch color to sRGB (Björn Ottosson's oklab matrices, clamped). */
function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
	const hr = (H * Math.PI) / 180;
	const a = C * Math.cos(hr);
	const b = C * Math.sin(hr);
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;
	const l = l_ ** 3;
	const m = m_ ** 3;
	const s = s_ ** 3;
	const lin = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
	const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
	const to255 = (c: number) => Math.min(255, Math.max(0, Math.round(gamma(c) * 255)));
	return [to255(lin[0]), to255(lin[1]), to255(lin[2])];
}

/** Replace `oklch(L C H[ / a])` with `rgb(r, g, b)`. */
export function convertOklch(value: string): string {
	return value.replace(
		/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)/g,
		(_, l: string, c: string, h: string) => {
			const L = l.endsWith('%') ? parseFloat(l) / 100 : parseFloat(l);
			const [r, g, b] = oklchToRgb(L, parseFloat(c), parseFloat(h));
			return `rgb(${r}, ${g}, ${b})`;
		}
	);
}

/** Normalize modern space/slash `rgb()` syntax to the widely supported comma form. */
export function normalizeRgb(value: string): string {
	return value
		.replace(
			/rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)(%?)\s*\)/g,
			(_whole, r: string, g: string, b: string, a: string, pct: string) =>
				`rgba(${r}, ${g}, ${b}, ${pct ? parseFloat(a) / 100 : a})`
		)
		.replace(/rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g, 'rgb($1, $2, $3)');
}

/** Parse an `rgb()`/`rgba()` or hex color to `[r, g, b]` (0–255), or `null` if unrecognized. */
function colorToRgb(color: string): [number, number, number] | null {
	const rgb = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
	if (rgb) return [Math.round(+rgb[1]), Math.round(+rgb[2]), Math.round(+rgb[3])];
	const hex = color.match(/^#([0-9a-fA-F]{3,8})$/);
	if (hex) {
		let h = hex[1];
		if (h.length === 3 || h.length === 4) {
			h = h
				.split('')
				.map((c) => c + c)
				.join('');
		}
		return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
	}
	return null;
}

/**
 * Fold Tailwind v4's opacity modifier — `color-mix(in <space>, <color> NN%, transparent)`
 * (e.g. `bg-blue-500/50`) — into an `rgba()` color. Runs after {@link convertOklch}, so the
 * inner color is already `rgb(...)` or a hex value. Only the `…, transparent)` form (Tailwind's
 * opacity mechanism) is handled, matching react-email's `sanitizeDeclarations`.
 */
export function convertColorMix(value: string): string {
	return value.replace(
		/color-mix\(\s*in\s+[\w-]+\s*,\s*(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})\s+([\d.]+)%\s*,\s*transparent\s*\)/g,
		(whole, color: string, pct: string) => {
			const rgb = colorToRgb(color);
			if (!rgb) return whole;
			const alpha = parseFloat(pct) / 100;
			return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
		}
	);
}

/** Evaluate a numeric arithmetic expression (`+ - * /`, parens) — no units. */
function evalArith(s: string): number {
	let i = 0;
	const expr = (): number => {
		let v = term();
		while (s[i] === '+' || s[i] === '-') {
			const op = s[i++];
			v = op === '+' ? v + term() : v - term();
		}
		return v;
	};
	const term = (): number => {
		let v = factor();
		while (s[i] === '*' || s[i] === '/') {
			const op = s[i++];
			v = op === '*' ? v * factor() : v / factor();
		}
		return v;
	};
	const factor = (): number => {
		while (s[i] === ' ') i++;
		if (s[i] === '(') {
			i++;
			const v = expr();
			while (s[i] === ' ') i++;
			i++;
			return v;
		}
		let j = i;
		if (s[j] === '-') j++;
		while (j < s.length && /[\d.]/.test(s[j])) j++;
		const n = parseFloat(s.slice(i, j));
		i = j;
		while (s[i] === ' ') i++;
		return n;
	};
	return expr();
}

const UNITS = /px|rem|em|%|vh|vw|pt/g;

/**
 * Resolve `calc(...)` expressions — but ONLY when it is safe to: no spaced `+`/`-` operator and
 * at most one distinct unit. Tailwind v4's spacing/ratio utilities (`calc(var(--spacing) * 5)`,
 * `calc(1 / 2 * 100%)`, line-height ratios) are all `*`/`/`, single-unit, so they fully resolve;
 * additive or mixed-unit `calc()` is left verbatim — mirroring react-email, which only folds `*`
 * and `/`. (A non-finite result, e.g. a stray `infinity`, is also left as `calc()`.)
 */
export function evalCalc(value: string): string {
	return value.replace(/calc\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (whole, inner: string) => {
		if (/\s[+-]\s/.test(inner)) return whole; // additive operator → leave intact
		const units = new Set(inner.match(UNITS) ?? []);
		if (units.size > 1) return whole; // mixed units → leave intact
		const unit = [...units][0] ?? '';
		const cleaned = inner.replace(UNITS, '');
		try {
			const result = evalArith(cleaned);
			if (!Number.isFinite(result)) return whole;
			return `${parseFloat(result.toFixed(4))}${unit}`;
		} catch {
			return whole;
		}
	});
}

/** Convert every `rem` length to `px` (1rem = 16px) — email clients dislike `rem`. */
export function remToPx(value: string): string {
	return value.replace(/(-?[\d.]+)rem/g, (_, n: string) => `${parseFloat(n) * 16}px`);
}

/** Expand logical box properties to their physical left/right/top/bottom pair. */
const LOGICAL: Record<string, [string, string]> = {
	'padding-inline': ['padding-left', 'padding-right'],
	'padding-block': ['padding-top', 'padding-bottom'],
	'margin-inline': ['margin-left', 'margin-right'],
	'margin-block': ['margin-top', 'margin-bottom'],
	'inset-inline': ['left', 'right'],
	'inset-block': ['top', 'bottom']
};
export function expandLogical(prop: string, value: string): Array<[string, string]> {
	const pair = LOGICAL[prop];
	return pair
		? [
				[pair[0], value],
				[pair[1], value]
			]
		: [[prop, value]];
}

/** Sanitize a variant class name (`sm:text-lg` → `sm_text-lg`) so a second pass is a no-op. */
export const sanitizeClass = (cls: string): string => cls.replace(/[^\w-]/g, '_');

/** Convert v4 range media syntax to the broadly supported min/max-width form, in px. */
export function convertMediaParams(params: string): string {
	return params
		.replace(
			/\(\s*width\s*>=\s*([\d.]+)rem\s*\)/g,
			(_, n: string) => `(min-width: ${parseFloat(n) * 16}px)`
		)
		.replace(
			/\(\s*width\s*<=\s*([\d.]+)rem\s*\)/g,
			(_, n: string) => `(max-width: ${parseFloat(n) * 16}px)`
		);
}
