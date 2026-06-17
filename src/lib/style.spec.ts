import { describe, it, expect } from 'vitest';
import {
	styleToString,
	pxToPt,
	convertToPx,
	parsePadding,
	withMargin,
	mergeStyle,
	splitBodyStyle
} from './style.js';
import type { CSSProperties } from './types.js';

describe('styleToString', () => {
	it('converts camelCase keys to kebab-case', () => {
		expect(styleToString({ fontSize: '14px', lineHeight: '24px' })).toBe(
			'font-size:14px;line-height:24px;'
		);
	});

	it('kebab-cases mso-prefixed keys (msoPaddingAlt → mso-padding-alt)', () => {
		// mso-* properties are not part of csstype, so cast through a string-keyed record.
		expect(styleToString({ msoPaddingAlt: '0px' } as Record<string, string> as CSSProperties)).toBe(
			'mso-padding-alt:0px;'
		);
	});

	it('emits values as-is without appending px', () => {
		expect(styleToString({ lineHeight: 24 })).toBe('line-height:24;');
	});

	it('skips keys whose value is null or undefined', () => {
		expect(
			styleToString({ color: 'red', margin: undefined, padding: null } as unknown as CSSProperties)
		).toBe('color:red;');
	});

	it('returns an empty string for an empty object', () => {
		expect(styleToString({})).toBe('');
	});
});

describe('pxToPt', () => {
	it('converts 16 to 12', () => {
		expect(pxToPt(16)).toBe(12);
	});

	it('parses numeric strings', () => {
		expect(pxToPt('16px')).toBe(12);
	});

	it('returns null for non-numeric input', () => {
		expect(pxToPt('not-a-number')).toBeNull();
	});
});

describe('parsePadding', () => {
	it('expands a single value to all four sides', () => {
		expect(parsePadding('10px')).toEqual({
			paddingTop: 10,
			paddingRight: 10,
			paddingBottom: 10,
			paddingLeft: 10
		});
	});

	it('treats two values as [vertical, horizontal]', () => {
		expect(parsePadding('10px 20px')).toEqual({
			paddingTop: 10,
			paddingRight: 20,
			paddingBottom: 10,
			paddingLeft: 20
		});
	});

	it('treats three values as [top, horizontal, bottom]', () => {
		expect(parsePadding('10px 20px 30px')).toEqual({
			paddingTop: 10,
			paddingRight: 20,
			paddingBottom: 30,
			paddingLeft: 20
		});
	});

	it('treats four values as [top, right, bottom, left]', () => {
		expect(parsePadding('10px 20px 30px 40px')).toEqual({
			paddingTop: 10,
			paddingRight: 20,
			paddingBottom: 30,
			paddingLeft: 40
		});
	});

	it('accepts a bare number', () => {
		expect(parsePadding(12)).toEqual({
			paddingTop: 12,
			paddingRight: 12,
			paddingBottom: 12,
			paddingLeft: 12
		});
	});

	it('converts non-px units instead of truncating them', () => {
		expect(parsePadding('1em')).toEqual({
			paddingTop: 16,
			paddingRight: 16,
			paddingBottom: 16,
			paddingLeft: 16
		});
		expect(parsePadding('1em 2rem')).toEqual({
			paddingTop: 16,
			paddingRight: 32,
			paddingBottom: 16,
			paddingLeft: 32
		});
	});
});

describe('withMargin', () => {
	it('maps the `m` shorthand to a single margin longhand with px', () => {
		expect(withMargin({ m: 16 })).toEqual({ margin: '16px' });
	});

	it('maps `mx` to left and right margins', () => {
		expect(withMargin({ mx: 8 })).toEqual({ marginLeft: '8px', marginRight: '8px' });
	});

	it('maps `my` to top and bottom margins', () => {
		expect(withMargin({ my: '12' })).toEqual({ marginTop: '12px', marginBottom: '12px' });
	});

	it('maps individual side shorthands', () => {
		expect(withMargin({ mt: 4 })).toEqual({ marginTop: '4px' });
	});

	it('merges all shorthands, more-specific sides winning', () => {
		expect(withMargin({ mt: 10, mb: 20 })).toEqual({ marginTop: '10px', marginBottom: '20px' });
		expect(withMargin({ mx: 10, my: 20 })).toEqual({
			marginLeft: '10px',
			marginRight: '10px',
			marginTop: '20px',
			marginBottom: '20px'
		});
		expect(withMargin({ m: 5, mt: 10 })).toEqual({ margin: '5px', marginTop: '10px' });
	});

	it('emits non-numeric values (keywords/units) verbatim, without a px suffix', () => {
		expect(withMargin({ mt: 'auto' } as never)).toEqual({ marginTop: 'auto' });
		expect(withMargin({ mb: '2rem' } as never)).toEqual({ marginBottom: '2rem' });
	});

	it('returns an empty object when no shorthand is provided', () => {
		expect(withMargin({})).toEqual({});
	});
});

describe('convertToPx', () => {
	it('passes through numbers and px', () => {
		expect(convertToPx(12)).toBe(12);
		expect(convertToPx('12px')).toBe(12);
		expect(convertToPx('12')).toBe(12);
	});

	it('converts em/rem (×16) and % (of 600px)', () => {
		expect(convertToPx('1em')).toBe(16);
		expect(convertToPx('2rem')).toBe(32);
		expect(convertToPx('10%')).toBe(60);
	});

	it('returns 0 for unparseable values', () => {
		expect(convertToPx('auto')).toBe(0);
		expect(convertToPx('')).toBe(0);
	});
});

describe('splitBodyStyle', () => {
	it('keeps background on the body and zeroes author margin/padding', () => {
		expect(splitBodyStyle('background-color:#fff;margin:10px;font-size:14px')).toEqual({
			body: 'background-color:#fff;margin:0;',
			cell: 'background-color:#fff;margin:10px;font-size:14px'
		});
	});

	it('zeroes padding too and leaves the body empty when no relevant props', () => {
		expect(splitBodyStyle('padding:8px')).toEqual({ body: 'padding:0;', cell: 'padding:8px' });
		expect(splitBodyStyle('font-size:14px')).toEqual({ body: '', cell: 'font-size:14px' });
	});
});

describe('mergeStyle', () => {
	it('merges an object style and a string style into one string', () => {
		expect(mergeStyle({ color: 'red' }, 'font-weight:bold')).toBe('color:red;font-weight:bold;');
	});

	it('preserves left-to-right order', () => {
		expect(mergeStyle('a:1', { b: 2 } as Record<string, number> as CSSProperties)).toBe('a:1;b:2;');
	});

	it('does not double up trailing semicolons on string input', () => {
		expect(mergeStyle('color:red;')).toBe('color:red;');
	});

	it('ignores undefined inputs', () => {
		expect(mergeStyle(undefined, { color: 'blue' }, undefined)).toBe('color:blue;');
	});
});
