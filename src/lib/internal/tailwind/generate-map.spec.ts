import { describe, it, expect } from 'vitest';
import { generateTailwindMap } from './generate-map.js';

describe('generateTailwindMap (v4)', () => {
	it('resolves color utilities to email-safe rgb()', async () => {
		const { inline } = await generateTailwindMap(['text-red-500', 'bg-blue-500']);
		// oklch colors resolved to rgb.
		expect(inline['text-red-500']).toContain('color:rgb(251, 44, 54)');
		expect(inline['bg-blue-500']).toContain('background-color:rgb(43, 127, 255)');
	});

	it('folds opacity modifiers (color-mix) to rgba — oklch- and hex-based colors', async () => {
		const { inline } = await generateTailwindMap(['bg-blue-500/50', 'text-black/70']);
		// oklch-based color → rgba with the /50 alpha.
		expect(inline['bg-blue-500/50']).toContain('background-color:rgba(43, 127, 255, 0.5)');
		// hex-based (#000) color → rgba with the /70 alpha.
		expect(inline['text-black/70']).toContain('color:rgba(0, 0, 0, 0.7)');
		// nothing unresolved left behind.
		const values = Object.values(inline).join('');
		expect(values).not.toContain('color-mix(');
		expect(values).not.toContain('var(--');
		expect(values).not.toContain('oklch(');
	});

	it('resolves spacing/sizing/radius utilities (logical expand, calc, rem→px)', async () => {
		const { inline } = await generateTailwindMap([
			'px-5',
			'py-3',
			'm-4',
			'w-1/2',
			'rounded-lg',
			'rounded-full'
		]);
		// logical padding expanded + calc(var(--spacing)*N) resolved to px.
		expect(inline['px-5']).toContain('padding-left:20px');
		expect(inline['px-5']).toContain('padding-right:20px');
		expect(inline['py-3']).toContain('padding-top:12px');
		// margin shorthand.
		expect(inline['m-4']).toContain('margin:16px');
		// calc(1/2*100%) → 50%.
		expect(inline['w-1/2']).toContain('width:50%');
		// rounded-lg → 8px.
		expect(inline['rounded-lg']).toContain('border-radius:8px');
		// rounded-full's calc(infinity * 1px) → 9999px, never NaN/infinity.
		expect(inline['rounded-full']).toContain('border-radius:9999px');
		const values = Object.values(inline).join('');
		expect(values).not.toContain('NaN');
		expect(values).not.toContain('infinity');
		expect(values).not.toContain('var(--');
		expect(values).not.toContain('calc(');
	});

	it('leaves additive / mixed-unit calc() intact (does not mangle it)', async () => {
		// arbitrary value that compiles to an additive, mixed-unit calc.
		const { inline } = await generateTailwindMap(['w-[calc(100%-16px)]']);
		expect(inline['w-[calc(100%-16px)]']).toContain('calc(100% - 16px)');
		// would be the wrong unit-stripped result.
		expect(inline['w-[calc(100%-16px)]']).not.toContain('84');
	});

	it('renames + hoists responsive and stateful variants (idempotent class names)', async () => {
		const { inline, rename, hoist } = await generateTailwindMap([
			'sm:text-lg',
			'hover:underline',
			'focus:bg-red-500'
		]);
		// sanitized, non-colon class names (idempotency).
		expect(rename['sm:text-lg']).toBe('sm_text-lg');
		expect(hoist['sm_text-lg']).toContain('@media (min-width: 640px)');
		expect(hoist['sm_text-lg']).toContain('font-size:18px');
		// `!important` so the hoisted variant beats the inlined base utility on
		// specificity (otherwise `text-base sm:text-lg` would never resize).
		expect(hoist['sm_text-lg']).toContain('font-size:18px !important');
		// stateful pseudo hoisted under its sanitized selector.
		expect(hoist['hover_underline']).toContain(':hover');
		// variant classes are NOT inlinable.
		expect(inline['sm:text-lg']).toBeUndefined();
		expect(inline['hover:underline']).toBeUndefined();
		expect(inline['focus:bg-red-500']).toBeUndefined();
	});

	it('returns an empty map when there are no classes', async () => {
		const map = await generateTailwindMap([]);
		expect(map).toEqual({ inline: {}, rename: {}, hoist: {} });
	});

	it('resolves @property-registered vars instead of leaking var(--tw-*)', async () => {
		// Tailwind v4 declares `--tw-border-style: solid` via `@property`; without
		// seeding those defaults, `border` would inline `var(--tw-border-style)`,
		// which email clients drop.
		const { inline, hoist } = await generateTailwindMap(['border', 'border-dashed', 'divide-x']);
		expect(inline['border']).toBe('border-style:solid;border-width:1px;');
		expect(inline['border-dashed']).toBe('border-style:dashed;');
		expect(hoist['divide-x']).toContain('border-inline-style:solid');
		// No unresolved Tailwind internals leak anywhere in the output.
		const all = JSON.stringify({ ...inline, ...hoist });
		expect(all).not.toMatch(/var\(--tw-/);
	});

	it('resolves box-shadow utilities from their rule-local custom properties', async () => {
		// `.shadow-lg`/`.ring-2` set `--tw-shadow`/`--tw-ring-shadow` in their own rule
		// and consume it in `box-shadow`; resolve those locals (not the transparent
		// `@property` default) and keep the shadow color's alpha.
		const { inline } = await generateTailwindMap(['shadow-lg', 'ring-2']);
		expect(inline['shadow-lg']).toContain('box-shadow:');
		expect(inline['shadow-lg']).toContain('15px -3px rgba(0, 0, 0, 0.1)'); // not solid, not transparent
		expect(inline['shadow-lg']).not.toMatch(/var\(--tw-/);
		expect(inline['ring-2']).toContain('currentcolor'); // ring takes the element color
		expect(inline['ring-2']).not.toMatch(/var\(--tw-/);
	});
});
