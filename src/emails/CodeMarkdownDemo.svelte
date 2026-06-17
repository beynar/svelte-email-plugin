<script lang="ts">
	import {
		Html,
		Head,
		Preview,
		Body,
		Container,
		Heading,
		Hr,
		Markdown,
		CodeBlock,
		xonokai
	} from '$lib/index.js';

	const markdown = `# Markdown + code

This body is authored in **Markdown** and rendered to inline-styled HTML by \`marked\` — headings,
emphasis, [links](https://example.com), and lists all come through.

- Inline code such as \`render(Email)\` is preserved
- Lists, **bold**, and _italics_ are styled inline
- Great for newsletters and release notes

> Blockquote: write the content in Markdown, drop code samples below.`;

	// Prism's built-in languages (no extra imports needed): javascript, css, markup/html.
	const js = `const total = [1, 2, 3, 4].reduce((sum, n) => sum + n, 0);
console.log("total:", total);`;

	const css = `.button {
	background: #2563eb;
	color: #ffffff;
	padding: 12px 20px;
	border-radius: 8px;
}`;

	const html = `<a href="https://acme.com" class="cta">
	Get started
</a>`;
</script>

<Html lang="en">
	<Head />
	<Preview children="Markdown rendered with marked + Prism-highlighted code blocks." />
	<Body class="bg-slate-100 py-10 font-sans">
		<Container class="rounded-xl bg-white p-8">
			<Heading as="h1" class="mt-0 text-2xl font-bold text-slate-900"
				>Code &amp; Markdown demo</Heading
			>

			<Markdown children={markdown} />

			<Hr />

			<Heading as="h2" class="text-base font-semibold text-slate-900"
				>JavaScript (line numbers)</Heading
			>
			<CodeBlock language="javascript" theme={xonokai} lineNumbers code={js} />

			<Heading as="h2" class="text-base font-semibold text-slate-900">CSS</Heading>
			<CodeBlock language="css" theme={xonokai} code={css} />

			<Heading as="h2" class="text-base font-semibold text-slate-900">HTML</Heading>
			<CodeBlock language="markup" theme={xonokai} code={html} />
		</Container>
	</Body>
</Html>
