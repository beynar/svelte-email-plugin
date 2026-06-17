<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { mergeStyle } from '../style.js';
	import type { Style } from '../types.js';

	/**
	 * Inline code. Faithful port of react-email's `CodeInline`, including the
	 * Orange.fr fallback: that client flattens the document so `<meta>` becomes a
	 * sibling of body content, and the `meta ~ .cino` / `meta ~ .cio` rules then
	 * swap which element is shown. As react-email notes, this only works when the
	 * email has a `<Head>` containing `<meta>` tags (svelte-plugin-mail's `<Head>` does).
	 */
	interface Props extends Omit<HTMLAttributes<HTMLElement>, 'style'> {
		style?: Style;
		class?: string;
		children?: Snippet;
	}

	let { style, class: className, children, ...rest }: Props = $props();

	const prefix = $derived(className ? `${className} ` : '');
	const codeStyle = $derived(style ? mergeStyle(style) : '');
	const spanStyle = $derived(mergeStyle({ display: 'none' }, style));
</script>

<!--
	The `<style>` must be raw HTML — a literal Svelte `<style>` would be hijacked as
	the component stylesheet. Content is a fixed string, so the XSS rule is disabled.
-->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html '<style>meta ~ .cino { display: none !important; opacity: 0 !important; } meta ~ .cio { display: block !important; }</style>'}
<!-- Hidden on Orange.fr, shown everywhere else. -->
<code {...rest} class={`${prefix}cino`} style={codeStyle || undefined}>{@render children?.()}</code>
<!-- Shown only on Orange.fr. -->
<span {...rest} class={`${prefix}cio`} style={spanStyle}>{@render children?.()}</span>
