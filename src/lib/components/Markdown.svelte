<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { marked, Renderer } from 'marked';
	import { parseCssInJsToInlineCss } from '../cssInJs.js';
	import { styles as defaultStyles, type StylesType } from './markdownStyles.js';
	import type { CSSProperties } from '../types.js';

	// `children` is the markdown source *string* (parsed text), not a snippet —
	// so it is omitted from the inherited `HTMLAttributes`. `style` is owned by
	// `markdownContainerStyles`, so it is dropped from the passthrough too.
	interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'style'> {
		children: string;
		markdownCustomStyles?: StylesType;
		markdownContainerStyles?: CSSProperties;
	}

	let { children, markdownCustomStyles, markdownContainerStyles, ...rest }: Props = $props();

	const finalStyles = $derived({ ...defaultStyles, ...markdownCustomStyles });

	// Spark Mail collapses runs of literal spaces even inside `<pre>`/`<code>`, so
	// code (block + inline) gets the NBSP+ZWJ+ZWSP treatment — same fix as CodeBlock.
	const SPACE_REPLACEMENT = ' ‍​';
	const sparkSafe = (text: string) => text.replaceAll(' ', SPACE_REPLACEMENT);

	// Port of react-email's Markdown renderer. Each override injects an inline
	// `style="…"` attribute only when the serialized CSS is non-empty, and keeps
	// react-email's exact `\n` whitespace so output is faithful.
	const html = $derived.by(() => {
		const renderer = new Renderer();

		renderer.blockquote = ({ tokens }) => {
			const text = renderer.parser.parse(tokens);
			return `<blockquote${
				parseCssInJsToInlineCss(finalStyles.blockQuote) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.blockQuote)}"`
					: ''
			}>\n${text}</blockquote>\n`;
		};

		renderer.br = () => {
			return `<br${
				parseCssInJsToInlineCss(finalStyles.br) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.br)}"`
					: ''
			} />`;
		};

		renderer.code = ({ text }) => {
			const code = `${sparkSafe(text.replace(/\n$/, ''))}\n`;
			return `<pre${
				parseCssInJsToInlineCss(finalStyles.codeBlock) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.codeBlock)}"`
					: ''
			}><code>${code}</code></pre>\n`;
		};

		renderer.codespan = ({ text }) => {
			return `<code${
				parseCssInJsToInlineCss(finalStyles.codeInline) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.codeInline)}"`
					: ''
			}>${sparkSafe(text)}</code>`;
		};

		renderer.del = ({ tokens }) => {
			const text = renderer.parser.parseInline(tokens);
			return `<del${
				parseCssInJsToInlineCss(finalStyles.strikethrough) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.strikethrough)}"`
					: ''
			}>${text}</del>`;
		};

		renderer.em = ({ tokens }) => {
			const text = renderer.parser.parseInline(tokens);
			return `<em${
				parseCssInJsToInlineCss(finalStyles.italic) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.italic)}"`
					: ''
			}>${text}</em>`;
		};

		renderer.heading = ({ tokens, depth }) => {
			const text = renderer.parser.parseInline(tokens);
			const headingStyles = finalStyles[`h${depth}` as keyof StylesType];
			return `<h${depth}${
				parseCssInJsToInlineCss(headingStyles) !== ''
					? ` style="${parseCssInJsToInlineCss(headingStyles)}"`
					: ''
			}>${text}</h${depth}>`;
		};

		renderer.hr = () => {
			return `<hr${
				parseCssInJsToInlineCss(finalStyles.hr) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.hr)}"`
					: ''
			} />\n`;
		};

		renderer.image = ({ href, text, title }) => {
			return `<img src="${href.replaceAll('"', '&quot;')}" alt="${text.replaceAll('"', '&quot;')}"${
				title ? ` title="${title}"` : ''
			}${
				parseCssInJsToInlineCss(finalStyles.image) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.image)}"`
					: ''
			}>`;
		};

		renderer.link = ({ href, title, tokens }) => {
			const text = renderer.parser.parseInline(tokens);
			return `<a href="${href}" target="_blank"${title ? ` title="${title}"` : ''}${
				parseCssInJsToInlineCss(finalStyles.link) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.link)}"`
					: ''
			}>${text}</a>`;
		};

		renderer.listitem = ({ tokens, loose }) => {
			const hasNestedList = tokens.some((token) => token.type === 'list');
			const text =
				loose || hasNestedList
					? renderer.parser.parse(tokens)
					: renderer.parser.parseInline(tokens);

			return `<li${
				parseCssInJsToInlineCss(finalStyles.li) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.li)}"`
					: ''
			}>${text}</li>\n`;
		};

		renderer.list = ({ items, ordered, start }) => {
			const type = ordered ? 'ol' : 'ul';
			const startAt = ordered && start !== 1 ? ` start="${start}"` : '';
			const listStyles = parseCssInJsToInlineCss(finalStyles[ordered ? 'ol' : 'ul']);

			return (
				'<' +
				type +
				startAt +
				`${listStyles !== '' ? ` style="${listStyles}"` : ''}>\n` +
				items.map((item) => renderer.listitem(item)).join('') +
				'</' +
				type +
				'>\n'
			);
		};

		renderer.paragraph = ({ tokens }) => {
			const text = renderer.parser.parseInline(tokens);
			return `<p${
				parseCssInJsToInlineCss(finalStyles.p) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.p)}"`
					: ''
			}>${text}</p>\n`;
		};

		renderer.strong = ({ tokens }) => {
			const text = renderer.parser.parseInline(tokens);
			return `<strong${
				parseCssInJsToInlineCss(finalStyles.bold) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.bold)}"`
					: ''
			}>${text}</strong>`;
		};

		renderer.table = ({ header, rows }) => {
			const styleTable = parseCssInJsToInlineCss(finalStyles.table);
			const styleThead = parseCssInJsToInlineCss(finalStyles.thead);
			const styleTbody = parseCssInJsToInlineCss(finalStyles.tbody);

			const theadRow = renderer.tablerow({
				text: header.map((cell) => renderer.tablecell(cell)).join('')
			});

			const tbodyRows = rows
				.map((row) =>
					renderer.tablerow({
						text: row.map((cell) => renderer.tablecell(cell)).join('')
					})
				)
				.join('');

			const thead = `<thead${styleThead ? ` style="${styleThead}"` : ''}>\n${theadRow}</thead>`;
			const tbody = `<tbody${styleTbody ? ` style="${styleTbody}"` : ''}>${tbodyRows}</tbody>`;

			return `<table role="presentation"${styleTable ? ` style="${styleTable}"` : ''}>\n${thead}\n${tbody}</table>\n`;
		};

		renderer.tablecell = ({ tokens, align, header }) => {
			const text = renderer.parser.parseInline(tokens);
			const type = header ? 'th' : 'td';
			const tag = align
				? `<${type} align="${align}"${
						parseCssInJsToInlineCss(finalStyles.td) !== ''
							? ` style="${parseCssInJsToInlineCss(finalStyles.td)}"`
							: ''
					}>`
				: `<${type}${
						parseCssInJsToInlineCss(finalStyles.td) !== ''
							? ` style="${parseCssInJsToInlineCss(finalStyles.td)}"`
							: ''
					}>`;
			return `${tag}${text}</${type}>\n`;
		};

		renderer.tablerow = ({ text }) => {
			return `<tr${
				parseCssInJsToInlineCss(finalStyles.tr) !== ''
					? ` style="${parseCssInJsToInlineCss(finalStyles.tr)}"`
					: ''
			}>\n${text}</tr>\n`;
		};

		return marked.parse(children, { renderer, async: false }) as string;
	});
</script>

<!--
	react-email renders the parsed markdown via `dangerouslySetInnerHTML`. The
	equivalent in Svelte is `{@html}`. The HTML is produced by `marked` from the
	`children` markdown string and the component's own style objects, mirroring
	react-email's intent, so the XSS rule is acknowledged and disabled here.
-->
<div
	{...rest}
	data-id="react-email-markdown"
	style={parseCssInJsToInlineCss(markdownContainerStyles) || undefined}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</div>
