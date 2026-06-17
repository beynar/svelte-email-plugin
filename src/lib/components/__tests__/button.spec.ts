import { describe, it, expect } from 'vitest';
import { renderToStaticString } from '../../../tests/render.js';
import Button from '../../../tests/fixtures/ButtonCase.svelte';

describe('Button', () => {
	it('renders the full MSO padding hack for `padding: 12px 20px`', async () => {
		const html = await renderToStaticString(Button, {
			href: 'https://example.com',
			style: { padding: '12px 20px' }
		});

		// MSO conditional comments survive cleanSvelteMarkup.
		expect(html).toContain('<!--[if mso]>');
		// Horizontal padding (20px each side) → 500% font width.
		expect(html).toContain('mso-font-width:500%');
		// Vertical raise = pxToPt(12 + 12) = 18.
		expect(html).toContain('mso-text-raise:18');
		// Content span raise = pxToPt(12) = 9px.
		expect(html).toContain('mso-text-raise:9px');
		// Hair spaces: 20px / 5 (maxFontWidth) / 2 → 2 spaces per side.
		expect(html).toContain('hidden>&#8202;&#8202;</i>');
		expect(html).toContain('hidden>&#8202;&#8202;&#8203;</i>');
		// Padding longhands resolved on the anchor.
		expect(html).toContain(
			'padding-top:12px;padding-right:20px;padding-bottom:12px;padding-left:20px'
		);

		expect(html).toMatchInlineSnapshot(
			`"<a href="https://example.com" target="_blank" style="line-height:100%;text-decoration-line:none;display:inline-block;max-width:100%;mso-padding-alt:0px;padding:12px 20px;padding-top:12px;padding-right:20px;padding-bottom:12px;padding-left:20px;"><!--[if mso]><i style="mso-font-width:500%;mso-text-raise:18" hidden>&#8202;&#8202;</i><![endif]--><span style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:9px;">Click me</span><!--[if mso]><i style="mso-font-width:500%" hidden>&#8202;&#8202;&#8203;</i><![endif]--></a>"`
		);
	});

	it('emits zero font width and no hair spaces when padding is absent', async () => {
		const html = await renderToStaticString(Button, { href: 'https://example.com' });

		// computeFontWidthAndSpaceCount(0) → [0, 0]: 0% width, no hair spaces.
		expect(html).toContain('mso-font-width:0%');
		expect(html).toContain('hidden></i>');
		expect(html).toContain('hidden>&#8203;</i>');
		expect(html).toContain('padding-top:0px;padding-right:0px;padding-bottom:0px;padding-left:0px');

		expect(html).toMatchInlineSnapshot(
			`"<a href="https://example.com" target="_blank" style="line-height:100%;text-decoration-line:none;display:inline-block;max-width:100%;mso-padding-alt:0px;padding-top:0px;padding-right:0px;padding-bottom:0px;padding-left:0px;"><!--[if mso]><i style="mso-font-width:0%;mso-text-raise:0" hidden></i><![endif]--><span style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:0px;">Click me</span><!--[if mso]><i style="mso-font-width:0%" hidden>&#8203;</i><![endif]--></a>"`
		);
	});
});
