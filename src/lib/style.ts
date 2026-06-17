import type { CSSProperties, Margin, Style } from './types.js';

/**
 * Serialize a typed CSS object into an inline-style string.
 *
 * - Keys whose value is `null`/`undefined` are skipped.
 * - camelCase keys become kebab-case via
 *   `key.split(/(?=[A-Z])/).join('-').toLowerCase()`, so `msoPaddingAlt`
 *   becomes `mso-padding-alt` and `WebkitFoo` becomes `-webkit-foo`.
 * - Values are emitted as-is (no automatic `px` suffix).
 */
export function styleToString(style: CSSProperties): string {
	return (Object.keys(style) as Array<keyof CSSProperties>).reduce((acc, key) => {
		const value = style[key];
		if (value === null || value === undefined) {
			return acc;
		}
		const property = String(key)
			.split(/(?=[A-Z])/)
			.join('-')
			.toLowerCase();
		return `${acc}${property}:${value};`;
	}, '');
}

/**
 * Convert a pixel value to points (`(px * 3) / 4`). Returns `null` when the
 * input does not parse to a number.
 */
export function pxToPt(px: string | number): number | null {
	const parsed = parseFloat(px as string);
	return isNaN(parsed) ? null : (parsed * 3) / 4;
}

/**
 * Resolve a CSS length to a `px` number (mirrors react-email's `convertToPx`):
 * `px` → as-is, `em`/`rem` → ×16, `%` → relative to a 600px email width, and a
 * bare number → that number. Anything unparseable resolves to `0`.
 *
 * @example convertToPx('1em') // 16
 * @example convertToPx('10%') // 60
 */
export function convertToPx(value: string | number): number {
	if (typeof value === 'number') return value;
	const match = /^(-?[\d.]+)(px|em|rem|%)?$/.exec(String(value).trim());
	if (!match) return 0;
	const numeric = parseFloat(match[1]);
	if (Number.isNaN(numeric)) return 0;
	switch (match[2]) {
		case 'em':
		case 'rem':
			return numeric * 16;
		case '%':
			return (numeric / 100) * 600;
		default:
			return numeric; // `px` or unitless
	}
}

/** Whether a spacing value is a bare number (so it should get a `px` suffix). */
function isBareNumber(value: string | number): boolean {
	return typeof value === 'number' || /^-?\d*\.?\d+$/.test(String(value).trim());
}

/**
 * Apply a single spacing value to the given longhand properties. A bare number
 * gets a `px` suffix; a string carrying its own unit/keyword (`auto`, `2rem`,
 * `10%`) is emitted verbatim; `undefined`/`null`/`''` is skipped.
 */
function withSpace(
	value: string | number | undefined,
	properties: Array<keyof CSSProperties>
): CSSProperties {
	if (value === undefined || value === null || value === '') return {};
	const resolved = isBareNumber(value) ? `${value}px` : String(value);
	return properties.reduce<CSSProperties>(
		(styles, property) => ({ ...styles, [property]: resolved }),
		{}
	);
}

/**
 * Resolve margin shorthand props (`m`, `mx`, `my`, `mt`, `mr`, `mb`, `ml`) into
 * `margin*` longhands. All provided shorthands are merged (later, more-specific
 * sides win): `{ mt: 10, mb: 20 }` → `{ marginTop, marginBottom }`,
 * `{ m: 5, mt: 10 }` → `{ margin: '5px', marginTop: '10px' }`.
 */
export function withMargin(props: Margin): CSSProperties {
	return Object.assign(
		{},
		withSpace(props.m, ['margin']),
		withSpace(props.mx, ['marginLeft', 'marginRight']),
		withSpace(props.my, ['marginTop', 'marginBottom']),
		withSpace(props.mt, ['marginTop']),
		withSpace(props.mr, ['marginRight']),
		withSpace(props.mb, ['marginBottom']),
		withSpace(props.ml, ['marginLeft'])
	);
}

/**
 * Parse a CSS `padding` shorthand (1–4 space-separated values) into its four
 * resolved sides (in `px`, via {@link convertToPx}) following CSS rules:
 * 1 value → all sides, 2 → [vertical, horizontal], 3 → [top, horizontal,
 * bottom], 4 → [top, right, bottom, left]. Non-`px` units (`em`/`rem`/`%`) are
 * converted, not truncated.
 */
export function parsePadding(padding: string | number): {
	paddingTop: number;
	paddingRight: number;
	paddingBottom: number;
	paddingLeft: number;
} {
	const values = String(padding)
		.trim()
		.split(/\s+/)
		.map((value) => convertToPx(value));

	let top: number;
	let right: number;
	let bottom: number;
	let left: number;

	switch (values.length) {
		case 1:
			top = right = bottom = left = values[0];
			break;
		case 2:
			top = bottom = values[0];
			right = left = values[1];
			break;
		case 3:
			top = values[0];
			right = left = values[1];
			bottom = values[2];
			break;
		default:
			top = values[0];
			right = values[1];
			bottom = values[2];
			left = values[3];
			break;
	}

	return { paddingTop: top, paddingRight: right, paddingBottom: bottom, paddingLeft: left };
}

/**
 * Merge object and/or string styles into a single inline-style string,
 * left-to-right. Object styles are serialized with `styleToString`; string
 * styles are normalized to end with a single `;`.
 */
export function mergeStyle(...inputs: Array<Style | undefined>): string {
	return inputs.reduce<string>((acc, input) => {
		if (input === null || input === undefined) {
			return acc;
		}
		if (typeof input === 'string') {
			const trimmed = input.trim();
			if (!trimmed) {
				return acc;
			}
			return `${acc}${trimmed.endsWith(';') ? trimmed : `${trimmed};`}`;
		}
		return `${acc}${styleToString(input)}`;
	}, '');
}

/**
 * Split a merged `<Body>` inline-style string for react-email's Yahoo/AOL fix
 * (issue #662): those clients convert `<body>` to a `<div>` and drop its styles,
 * so the full style lives on an inner `<td>` (`cell`) while the `<body>` keeps
 * only `background`/`background-color` and **zeroes** any author-set margin or
 * padding (so it can't sum with the client's/browser's own body spacing).
 */
export function splitBodyStyle(merged: string): { body: string; cell: string } {
	const bodyParts: string[] = [];
	let hasMargin = false;
	let hasPadding = false;
	for (const decl of merged.split(';')) {
		const trimmed = decl.trim();
		if (!trimmed) continue;
		const prop = trimmed.slice(0, trimmed.indexOf(':')).trim().toLowerCase();
		if (prop === 'background' || prop === 'background-color') bodyParts.push(trimmed);
		if (prop === 'margin' || prop.startsWith('margin-')) hasMargin = true;
		if (prop === 'padding' || prop.startsWith('padding-')) hasPadding = true;
	}
	if (hasMargin) bodyParts.push('margin:0');
	if (hasPadding) bodyParts.push('padding:0');
	return { body: bodyParts.length ? `${bodyParts.join(';')};` : '', cell: merged };
}
