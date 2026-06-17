<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { mergeStyle } from '../style.js';
	import type { Style } from '../types.js';

	interface Props extends Omit<HTMLAttributes<HTMLAnchorElement>, 'style'> {
		href?: string;
		target?: string;
		style?: Style;
		children?: Snippet;
	}

	let { href, target = '_blank', style, children, ...rest }: Props = $props();

	// `textDecorationLine` (not the `textDecoration` shorthand) so the reset only
	// clears the underline — not the decoration color/style/thickness too.
	const s = $derived(mergeStyle({ color: '#067df7', textDecorationLine: 'none' }, style));
</script>

<!--
	`svelte/no-navigation-without-resolve` targets SvelteKit in-app navigation;
	Link emits a plain email anchor to an arbitrary external `href`, so resolving
	against the app's route table is neither possible nor desired.
-->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a {...rest} {href} {target} style={s || undefined}>{@render children?.()}</a>
