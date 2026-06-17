<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { Prism } from './prism.js';
	import type { Theme } from './themes.js';
	import { parseCssInJsToInlineCss } from '../cssInJs.js';
	import { mergeStyle } from '../style.js';
	import type { CSSProperties, Style } from '../types.js';

	interface Props extends Omit<HTMLAttributes<HTMLPreElement>, 'style'> {
		code: string;
		language: string;
		theme: Theme;
		lineNumbers?: boolean;
		/**
		 * Applies a font family to every element this component renders; mostly
		 * meant to override a global font already set with `<Font>`.
		 */
		fontFamily?: string;
		style?: Style;
	}

	let { code, language, theme, lineNumbers, fontFamily, style, ...rest }: Props = $props();

	type PrismToken = InstanceType<typeof Prism.Token>;

	const grammar = $derived.by(() => {
		const g = Prism.languages[language];
		if (!g) {
			throw new Error(`CodeBlock: There is no language defined on Prism called ${language}`);
		}
		return g;
	});

	/** HTML-escape token text content (`&`, `<`, `>`) so it is safe inside `{@html}`. */
	function escapeHtml(value: string): string {
		return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	// NBSP + ZWJ + ZWSP (U+00A0 U+200D U+200B): keeps collapsed/leading spaces
	// visible across email clients, matching react-email's `'\xA0\u200D\u200B'`.
	// Spark Mail collapses runs of literal spaces even inside `<pre>`; the NBSP is a
	// space Spark won't eat and the zero-width joiner/space keep wrapping sane.
	const SPACE_REPLACEMENT = '\u00A0\u200D\u200B';

	/**
	 * Escape code text for `{@html}` and apply the Spark Mail space fix. Used for
	 * **all** code text \u2014 both whitespace between tokens and the inside of
	 * highlighted tokens (string literals, comments) \u2014 so no run of spaces survives.
	 */
	function escapeCode(value: string): string {
		return escapeHtml(value).replaceAll(' ', SPACE_REPLACEMENT);
	}

	/** Merge the theme styles for a token's type and any aliases. */
	function stylesForToken(token: PrismToken): CSSProperties {
		let merged: CSSProperties = { ...theme[token.type] };
		const aliases = Array.isArray(token.alias) ? token.alias : [token.alias];
		for (const alias of aliases) {
			merged = { ...merged, ...theme[alias as string] };
		}
		return merged;
	}

	/**
	 * Recursively serialize a Prism token (or raw string) to an inline-styled
	 * HTML string, mirroring react-email's `CodeBlockLine`. Strings get the
	 * zero-width spacing trick so leading/collapsed spaces survive email clients.
	 */
	function tokenToHtml(token: string | PrismToken, inheritedStyles: CSSProperties): string {
		if (token instanceof Prism.Token) {
			const styleForToken: CSSProperties = { ...inheritedStyles, ...stylesForToken(token) };
			const styleAttr = parseCssInJsToInlineCss(styleForToken);
			const content = token.content;

			if (content instanceof Prism.Token) {
				return `<span style="${styleAttr}">${tokenToHtml(content, styleForToken)}</span>`;
			}
			if (typeof content === 'string') {
				return `<span style="${styleAttr}">${escapeCode(content)}</span>`;
			}
			return (content as Array<string | PrismToken>)
				.map((subToken) => tokenToHtml(subToken, styleForToken))
				.join('');
		}

		const styleAttr = parseCssInJsToInlineCss(inheritedStyles);
		return `<span style="${styleAttr}">${escapeCode(token)}</span>`;
	}

	// React strips `undefined` style values before they reach the DOM; our
	// serializer does not, so only carry `fontFamily` when it is actually set —
	// this keeps the output free of `font-family:undefined`.
	const inheritedStyles = $derived<CSSProperties>(fontFamily !== undefined ? { fontFamily } : {});
	const lineNumberStyle = $derived(
		parseCssInJsToInlineCss({
			width: '2em',
			height: '1em',
			display: 'inline-block',
			...(fontFamily !== undefined ? { fontFamily } : {})
		})
	);

	const innerHtml = $derived.by(() => {
		const lines = code.split(/\r\n|\r|\n/gm);
		const tokensPerLine = lines.map((line) => Prism.tokenize(line, grammar));

		return tokensPerLine
			.map((tokensForLine, lineIndex) => {
				const numberSpan = lineNumbers
					? `<span style="${lineNumberStyle}">${lineIndex + 1}</span>`
					: '';
				const lineHtml = tokensForLine.map((token) => tokenToHtml(token, inheritedStyles)).join('');
				return `${numberSpan}${lineHtml}<br/>`;
			})
			.join('');
	});

	// Pre style: theme.base + full width, then the user's `style` wins last.
	// `escapeQuotes: false` because this feeds a Svelte-bound `style={…}` attribute
	// — Svelte escapes it once; pre-escaping would double-encode font-family quotes.
	const preStyle = $derived(
		mergeStyle(
			parseCssInJsToInlineCss({ ...theme.base, width: '100%' }, { escapeQuotes: false }),
			style
		)
	);
</script>

<!--
	react-email renders the highlighted tree as nested React elements. We build
	the equivalent HTML string from the Prism tokenization + the supplied theme
	and emit it with `{@html}`. The content is internally generated (token text is
	HTML-escaped via `escapeHtml`), so the XSS rule is acknowledged and disabled.
-->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<pre {...rest} style={preStyle || undefined}><code>{@html innerHtml}</code></pre>
