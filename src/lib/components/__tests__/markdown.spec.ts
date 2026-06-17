import { describe, it, expect } from 'vitest';
import { renderToStaticString } from '../../../tests/render.js';
import Markdown from '../../../tests/fixtures/MarkdownCase.svelte';

const doc = [
	'# Heading',
	'',
	'This is **bold** text with a [link](https://example.com) and inline `code`.',
	'',
	'- one',
	'- two'
].join('\n');

describe('Markdown', () => {
	it('renders a representative document to inline-styled email HTML', async () => {
		const html = await renderToStaticString(Markdown, { children: doc });

		// Wrapper div with the react-email data-id.
		expect(html).toContain('data-id="react-email-markdown"');
		// Heading with its inline style.
		expect(html).toContain('<h1');
		expect(html).toContain('font-size:2.5rem');
		// Bold → <strong>.
		expect(html).toContain('<strong');
		// Link → external anchor opening in a new tab.
		expect(html).toContain('<a href=');
		expect(html).toContain('target="_blank"');
		// Inline code.
		expect(html).toContain('<code');
		// List.
		expect(html).toContain('<ul');
		expect(html).toContain('<li');
	});

	it('matches the full rendered snapshot', async () => {
		expect(await renderToStaticString(Markdown, { children: doc })).toMatchInlineSnapshot(`
			"<div data-id="react-email-markdown"><h1 style="font-weight:500;padding-top:20px;font-size:2.5rem">Heading</h1><p>This is <strong style="font-weight:bold">bold</strong> text with a <a href="https://example.com" target="_blank" style="color:#007bff;text-decoration:underline;background-color:transparent">link</a> and inline <code style="color:#212529;font-size:87.5%;display:inline;background: #f8f8f8;font-family:SFMono-Regular,Menlo,Monaco,Consolas,monospace;word-wrap:break-word">code</code>.</p>
			<ul>
			<li>one</li>
			<li>two</li>
			</ul>
			</div>"
		`);
	});

	it('applies markdownContainerStyles to the wrapper div', async () => {
		const html = await renderToStaticString(Markdown, {
			children: 'plain text',
			markdownContainerStyles: { padding: 16 }
		});
		expect(html).toContain('data-id="react-email-markdown"');
		expect(html).toContain('style="padding:16px"');
	});

	it('applies markdownCustomStyles overrides', async () => {
		const html = await renderToStaticString(Markdown, {
			children: '# Heading',
			markdownCustomStyles: { h1: { color: 'red' } }
		});
		// Custom style replaces the default h1 style object.
		expect(html).toContain('<h1 style="color:red">');
	});

	it('applies the Spark Mail space fix to fenced and inline code', async () => {
		const md = ['Inline `a  b`.', '', '```', 'def f():', '    return 1', '```'].join('\n');
		const html = await renderToStaticString(Markdown, { children: md });
		// NBSP+ZWJ+ZWSP present; neither the inline double-space nor the block indent survives.
		expect(html).toContain(' ‍​');
		expect(html).not.toContain('a  b');
		expect(html).not.toContain('    return');
	});
});
