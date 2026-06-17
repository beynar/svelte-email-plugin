import { render } from '$lib/index.js';
import KitchenSink from '../../../emails/KitchenSink.svelte';

export const load = async (): Promise<{ html: string }> => {
	const [html] = await render(KitchenSink, {});
	return { html };
};
