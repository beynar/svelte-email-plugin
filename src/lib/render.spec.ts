import { describe, it, expect } from 'vitest';
import { render, cleanSvelteMarkup, toPlainText } from './render.js';
import WelcomeEmail from '../tests/fixtures/WelcomeEmail.svelte';

describe('render', () => {
	it('produces a full XHTML document starting with the Transitional doctype', async () => {
		const [html] = await render(WelcomeEmail, { name: 'Svelte' });
		expect(html.startsWith('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"')).toBe(
			true
		);
		expect(html).toContain('<html');
		expect(html).toContain('</html>');
	});

	it('renders prop values into the document', async () => {
		const [html] = await render(WelcomeEmail, { name: 'Svelte' });
		expect(html).toContain('Welcome, Svelte!');
	});

	it('defaults props to an empty object when omitted', async () => {
		const [html] = await render(WelcomeEmail);
		expect(html).toContain('<html');
	});

	it('strips Svelte SSR hydration artifacts but keeps MSO comments', async () => {
		const [html] = await render(WelcomeEmail, { name: 'Svelte' });
		expect(html).not.toContain('<!--[-->');
		expect(html).not.toContain('<!--]-->');
		expect(html).not.toContain('<!---->');
		expect(html).not.toContain('this.__e=event');
		// indexed block markers from {#if}/{#each} (Preview) must be gone
		expect(html).not.toMatch(/<!--\[\d/);
		// dev-only {@html} hydration hashes must be gone
		expect(html).not.toMatch(/<!--[a-z0-9]+-->/);
		// MSO conditional comments from the Button MUST survive
		expect(html).toContain('<!--[if mso]>');
	});
});

describe('plain text', () => {
	it('returns visible text without HTML tags and excludes the Preview node', async () => {
		const [, out] = await render(WelcomeEmail, { name: 'Svelte' });
		// the <h1> heading is upper-cased by html-to-text, so match case-insensitively
		expect(out).toMatch(/welcome, svelte!/i);
		// non-heading body copy is preserved verbatim
		expect(out).toContain("Thanks for joining svelte-email-plugin. We're glad you're here.");
		expect(out).not.toMatch(/<[a-z]/i);
		// the hidden Preview text must never leak into plain text
		expect(out).not.toContain('HIDDEN_PREVIEW_TEXT');
	});

	it('merges user selectors over the defaults (ignoreHref honored)', async () => {
		const out = await toPlainText('<a href="https://x.com">link</a>', {
			selectors: [{ selector: 'a', options: { ignoreHref: true } }]
		});
		expect(out).toContain('link');
		expect(out).not.toContain('https://x.com');
	});

	it('still skips images and Preview when user options are supplied', async () => {
		const out = await toPlainText(
			'<img src="x.png" alt="logo"><div data-skip-in-text="true">HIDDEN_PREVIEW_TEXT</div><p>visible</p>',
			{ wordwrap: false }
		);
		expect(out).toContain('visible');
		expect(out).not.toContain('logo');
		expect(out).not.toContain('HIDDEN_PREVIEW_TEXT');
	});
});

describe('cleanSvelteMarkup', () => {
	it('removes hydration markers and injected load/error handlers', () => {
		const dirty =
			'<!--[--><body onload="this.__e=event" onerror="this.__e=event"><!---->hi<!----></body><!--]-->';
		expect(cleanSvelteMarkup(dirty)).toBe('<body>hi</body>');
	});

	it('removes indexed block-open markers from {#if}/{#each}', () => {
		expect(cleanSvelteMarkup('<!--[0--><span>a</span><!--]-->')).toBe('<span>a</span>');
		expect(cleanSvelteMarkup('<!--[12-->x<!--]-->')).toBe('x');
	});

	it('removes else and failed-snippet markers', () => {
		expect(cleanSvelteMarkup('<!--[!-->else<!--]-->')).toBe('else');
		expect(cleanSvelteMarkup('<!--[?{"a":1}-->fail<!--]-->')).toBe('fail');
	});

	it('removes dev-only {@html} hydration hashes', () => {
		expect(cleanSvelteMarkup('<!--1x4s7i4--><!--[if mso]>X<![endif]-->')).toBe(
			'<!--[if mso]>X<![endif]-->'
		);
	});

	it('preserves MSO conditional comments', () => {
		const mso = '<!--[if mso]><i>&nbsp;</i><![endif]-->';
		expect(cleanSvelteMarkup(mso)).toBe(mso);
	});

	it('preserves downlevel-revealed conditional comments', () => {
		const dlr = '<!--[if !mso]><!--><span>x</span><!--<![endif]-->';
		expect(cleanSvelteMarkup(dlr)).toBe(dlr);
	});
});
