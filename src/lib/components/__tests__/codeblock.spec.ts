// The inline snapshot legitimately contains CodeBlock's NBSP/ZWJ/ZWSP spacing run.
/* eslint-disable no-irregular-whitespace */
import { describe, it, expect } from 'vitest';
import { renderToStaticString } from '../../../tests/render.js';
import { xonokai } from '$lib/index.js';
import CodeBlock from '../../../tests/fixtures/CodeBlockCase.svelte';

describe('CodeBlock', () => {
	it('renders a <pre>/<code> with the theme base style and highlighted tokens', async () => {
		const html = await renderToStaticString(CodeBlock, {
			code: 'const x = 1;',
			language: 'javascript',
			theme: xonokai
		});

		// <pre> with the theme base background.
		expect(html).toContain('<pre');
		expect(html).toContain('background:#2a2a2a');
		expect(html).toContain('width:100%');
		// <code> wrapper.
		expect(html).toContain('<code>');
		// Keyword `const` highlighted with the theme keyword color.
		expect(html).toContain('color:#ef3b7d');
		// Token spans present.
		expect(html).toContain('<span');
		// One <br/> per line (single line here).
		expect(html).toContain('<br/>');
		// The `<pre>` is a Svelte-bound attribute: font-family quotes must be
		// single-encoded by Svelte (`&quot;`), NOT double-encoded (`&amp;#x27;`).
		expect(html).not.toContain('&amp;#x27;');
		expect(html).toContain('&quot;Courier New&quot;');
		expect(html).toMatchInlineSnapshot(
			`"<pre style="moz-tab-size:2;otab-size:2;tab-size:2;webkit-hyphens:none;moz-hyphens:none;hyphens:none;white-space:pre-wrap;word-wrap:normal;font-family:Menlo, Monaco, &quot;Courier New&quot;, monospace;font-size:14px;color:#76d9e6;text-shadow:none;background:#2a2a2a;padding:15px;border-radius:4px;border:1px solid #e1e1e8;overflow:auto;position:relative;width:100%;"><code><span style="color:#ef3b7d">const</span><span style=""> ‍​x ‍​</span><span style="color:#a77afe">=</span><span style=""> ‍​</span><span style="color:#a77afe">1</span><span style="color:#bebec5">;</span><br/></code></pre>"`
		);
	});

	it('adds a line-number span per line when lineNumbers is true', async () => {
		const html = await renderToStaticString(CodeBlock, {
			code: 'const x = 1;\nconst y = 2;',
			language: 'javascript',
			theme: xonokai,
			lineNumbers: true
		});
		expect(html).toContain('width:2em;height:1em;display:inline-block');
		// Line numbers 1 and 2.
		expect(html).toContain('>1</span>');
		expect(html).toContain('>2</span>');
		// Two lines → two <br/>.
		expect(html.match(/<br\/>/g)?.length).toBe(2);
	});

	it('merges a user style object after the theme base (user wins)', async () => {
		const html = await renderToStaticString(CodeBlock, {
			code: 'const x = 1;',
			language: 'javascript',
			theme: xonokai,
			style: { background: '#000' }
		});
		expect(html).toContain('background:#2a2a2a');
		expect(html).toContain('background:#000;');
	});

	it('protects every space run for Spark Mail (indentation + inside string tokens)', async () => {
		// Leading indentation is between-token whitespace; the spaces inside the
		// string literal are *inside* a Prism token — both must be replaced so Spark
		// Mail (which collapses literal space runs even in <pre>) keeps them.
		const html = await renderToStaticString(CodeBlock, {
			code: 'function f() {\n  return "a  b";\n}',
			language: 'javascript',
			theme: xonokai
		});
		// The NBSP+ZWJ+ZWSP sequence is present…
		expect(html).toContain(' ‍​');
		// …and no run of two literal ASCII spaces survives anywhere in the markup.
		expect(html).not.toContain('  ');
	});

	it('throws for an unknown language', async () => {
		await expect(
			renderToStaticString(CodeBlock, {
				code: 'x',
				language: 'definitely-not-a-language',
				theme: xonokai
			})
		).rejects.toThrow(
			'CodeBlock: There is no language defined on Prism called definitely-not-a-language'
		);
	});
});
