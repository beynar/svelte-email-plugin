import { render } from '$lib/index.js';
import TailwindDemo from '../../../emails/TailwindDemo.svelte';

// Rendered on the server: `render()` (from `svelte/server`) needs the
// server-compiled component, so it cannot run in the browser. The Tailwind
// classes on this email are baked to inline styles at build time by the
// `svelte-email-plugin/vite` plugin — nothing Tailwind runs here.
export const load = async (): Promise<{ html: string }> => {
	const [html] = await render(TailwindDemo, { name: 'Ada' });
	return { html };
};
