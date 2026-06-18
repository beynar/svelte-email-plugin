import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
// Dogfood the build-time Tailwind plugin. Imported relatively (this *is* the
// `svelte-email-plugin` package) — `enforce: 'pre'` orders it before vite-plugin-svelte
// regardless of array position, so it bakes `src/emails/*.svelte` first.
import { email } from './src/lib/vite/index.js';

export default defineConfig({
	plugins: [
		// Real Tailwind v4 for the app (drives `src/app.css`). The email plugin below
		// auto-detects that same `@theme` so emails resolve our custom `--color-brand`.
		tailwindcss(),
		// Dogfood: `importSource: '$lib/index.js'` so auto-injected component imports
		// (and the generated registry) resolve through the repo's own `$lib` alias.
		email({ dir: 'src/emails', importSource: '$lib/index.js', preview: { enabled: true } }),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
