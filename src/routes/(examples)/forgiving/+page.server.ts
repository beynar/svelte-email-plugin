import { render } from '$lib/index.js';
import ForgivingDemo from '../../../emails/ForgivingDemo.svelte';

// Rendered on the server: `render()` (from `svelte/server`) needs the
// server-compiled component. ForgivingDemo is authored as plain HTML — the
// `svelte-plugin-mail/vite` plugin's forgiveness pass remaps the native tags,
// injects the Html/Head/Body wrappers, and adds the imports at build time.
export const load = async (): Promise<{ html: string }> => {
	const [html] = await render(ForgivingDemo, {});
	return { html };
};
