<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { mergeStyle, splitBodyStyle } from '../style.js';
	import type { Style } from '../types.js';

	interface Props extends Omit<HTMLAttributes<HTMLBodyElement>, 'style'> {
		lang?: HTMLAttributes<HTMLBodyElement>['lang'];
		dir?: HTMLAttributes<HTMLBodyElement>['dir'];
		style?: Style;
		children?: Snippet;
	}

	let { lang = 'en', dir = 'ltr', style, children, ...rest }: Props = $props();

	// Yahoo and AOL convert `<body>` to a `<div>` and drop its styles, so the real
	// styling lives on an inner `<td>` (`cell`); the `<body>` keeps only background
	// and zeroes any author margin/padding. See react-email#662.
	const merged = $derived(mergeStyle(style));
	const split = $derived(splitBodyStyle(merged));
</script>

<!--
	PLAN §2 (Document model): Html/Head/Body must be real elements in the rendered
	tree (not svelte:head/svelte:body), so render().body contains the whole
	<html>…</html> document. The svelte/no-raw-special-elements rule pushes toward
	svelte:body, which would hoist content out of the SSR body string and break
	the email document model — so it is disabled here intentionally.
-->
<!-- eslint-disable-next-line svelte/no-raw-special-elements -->
<body {...rest} {dir} {lang} style={split.body || undefined}>
	<table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center">
		<tbody>
			<tr>
				<td {dir} {lang} style={split.cell || undefined}>{@render children?.()}</td>
			</tr>
		</tbody>
	</table>
</body>
