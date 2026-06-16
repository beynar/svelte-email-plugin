import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteMail } from './index.js';
import { generateTailwindMap } from '../internal/tailwind/generate-map.js';

/** Project root (two levels up from `src/lib/vite/`). */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EMAILS_DIR = path.join(ROOT, 'src/emails');

/**
 * A tiny Tailwind email exercising every baked code path: a static utility
 * (`text-red-500`), a responsive variant (`sm:text-lg`), spacing (`px-5`), an
 * opacity modifier (`bg-blue-500/50`), `rounded-full` (the `calc(infinity*1px)`
 * → `9999px` case), and a stateful variant (`hover:underline`). The `<Head/>`
 * hosts the hoisted media/stateful rules.
 */
const PROBE = (color: string) =>
	`<script lang="ts">\n` +
	`\timport { Html, Head, Body } from '$lib/index.js';\n` +
	`</script>\n\n` +
	`<Html>\n` +
	`\t<Head />\n` +
	`\t<Body>\n` +
	`\t\t<a class="${color} sm:text-lg px-5 bg-blue-500/50 rounded-full hover:underline">probe</a>\n` +
	`\t</Body>\n` +
	`</Html>\n`;

/**
 * Spin up a programmatic Vite server with the `svelteMail` plugin ordered
 * before `vite-plugin-svelte`, so `transformRequest` returns the compiled JS of
 * a *baked* email. Middleware mode + no HMR/watch keeps it headless and fast.
 */
async function makeServer(
	options: Parameters<typeof svelteMail>[0] = { dir: 'src/emails', forgiving: false }
): Promise<ViteDevServer> {
	return createServer({
		configFile: false,
		root: ROOT,
		logLevel: 'silent',
		server: { middlewareMode: true, hmr: false, watch: null },
		resolve: { alias: { $lib: path.join(ROOT, 'src/lib') } },
		plugins: [svelteMail(options), svelte()]
	});
}

describe('svelteMail — baked render through Vite', () => {
	const probePath = path.join(EMAILS_DIR, '_it_probe.svelte');
	const probeId = '/src/emails/_it_probe.svelte';

	afterEach(() => {
		fs.rmSync(probePath, { force: true });
	});

	it(
		'compiles a baked email with inline styles + head rules and no Tailwind imports',
		{ timeout: 60_000 },
		async () => {
			fs.writeFileSync(probePath, PROBE('text-red-500'));
			const server = await makeServer();
			try {
				const result = await server.transformRequest(probeId);
				expect(result).toBeTruthy();
				const code = result!.code;

				// Inlined static utilities and the opacity / rounded-full bakes.
				expect(code).toContain('rgb(251, 44, 54)'); // text-red-500
				expect(code).toContain('rgba(43, 127, 255, 0.5)'); // bg-blue-500/50
				expect(code).toContain('border-radius:9999px'); // rounded-full

				// Variant classes hoisted into the <Head> <style>.
				expect(code).toContain('@media (min-width: 640px)'); // sm:
				expect(code).toContain('sm_text-lg'); // sanitized responsive class
				expect(code).toContain('hover_underline'); // sanitized stateful class

				// Runtime purity: the compiled module pulls in none of the build-only
				// Tailwind machinery.
				expect(code).not.toContain('tailwindcss');
				expect(code).not.toContain('postcss');
				expect(code).not.toContain('node-html-parser');
			} finally {
				await server.close();
			}
		}
	);

	it(
		're-bakes on edit (HMR): a changed class produces new styles, old gone',
		{ timeout: 60_000 },
		async () => {
			fs.writeFileSync(probePath, PROBE('text-red-500'));
			const server = await makeServer();
			try {
				const first = await server.transformRequest(probeId);
				expect(first!.code).toContain('rgb(251, 44, 54)'); // red

				// Edit the email's color class, invalidate the module graph, re-transform.
				fs.writeFileSync(probePath, PROBE('text-green-500'));
				server.moduleGraph.invalidateAll();
				const second = await server.transformRequest(probeId);

				expect(second!.code).toContain('rgb(0, 201, 80)'); // green-500
				expect(second!.code).not.toContain('rgb(251, 44, 54)'); // old red gone
			} finally {
				await server.close();
			}
		}
	);
});

/**
 * A fully "loose" email: native tags only, no `<Html>/<Head>/<Body>`, no script,
 * no imports. Forgiveness must remap every tag, inject the wrappers, inject the
 * imports (from `$lib`), and the result must still compile through Svelte.
 */
const FORGIVING_PROBE =
	`<section class="text-red-500 sm:text-lg">\n` +
	`\t<h1 class="px-5">Hi</h1>\n` +
	`\t<p>body</p>\n` +
	`\t<hr>\n` +
	`</section>\n`;

describe('svelteMail — forgiving baked render through Vite', () => {
	const probePath = path.join(EMAILS_DIR, '_it_forgiving.svelte');
	const probeId = '/src/emails/_it_forgiving.svelte';

	afterEach(() => {
		fs.rmSync(probePath, { force: true });
	});

	it(
		'remaps native tags, injects wrappers + imports, and compiles',
		{ timeout: 60_000 },
		async () => {
			fs.writeFileSync(probePath, FORGIVING_PROBE);
			const server = await makeServer({
				dir: 'src/emails',
				forgiving: true,
				importSource: '$lib/index.js'
			});
			try {
				const result = await server.transformRequest(probeId);
				// A truthy result proves slash-injection (<hr> → <Hr/>) + import injection
				// produced compilable Svelte (the real compiler ran).
				expect(result).toBeTruthy();
				const code = result!.code;

				expect(code).toContain('rgb(251, 44, 54)'); // text-red-500 inlined
				expect(code).toContain('padding-left:20px'); // px-5 inlined
				expect(code).toContain('@media (min-width: 640px)'); // sm: hoisted into injected <Head>

				// Runtime purity preserved.
				expect(code).not.toContain('tailwindcss');
				expect(code).not.toContain('postcss');
			} finally {
				await server.close();
			}
		}
	);
});

describe('svelteMail — equivalence to the legacy resolver oracle', () => {
	/**
	 * The pre-Phase-0 oracle: the legacy `{ tailwind: true }` runtime output for
	 * representative class sets. Proves the build-time resolver reproduces the
	 * exact inline declarations the runtime path used to emit.
	 */
	const reference: Record<string, string> = JSON.parse(
		fs.readFileSync(path.join(ROOT, 'src/tests/fixtures/tailwind-reference.json'), 'utf8')
	);

	it('reproduces the `colors` oracle declarations', async () => {
		// Oracle: <a style="color:rgb(251, 44, 54);background-color:rgb(43, 127, 255);">
		expect(reference.colors).toContain(
			'color:rgb(251, 44, 54);background-color:rgb(43, 127, 255);'
		);
		const map = await generateTailwindMap(['text-red-500', 'bg-blue-500']);
		expect(map.inline['text-red-500']).toBe('color:rgb(251, 44, 54);');
		expect(map.inline['bg-blue-500']).toBe('background-color:rgb(43, 127, 255);');
		// The concatenation matches the oracle's inline style string exactly.
		expect(map.inline['text-red-500'] + map.inline['bg-blue-500']).toBe(
			'color:rgb(251, 44, 54);background-color:rgb(43, 127, 255);'
		);
	});

	it('reproduces the `opacity` oracle declarations (color-mix → rgba)', async () => {
		// Oracle: background-color:rgba(43, 127, 255, 0.5);color:rgba(0, 0, 0, 0.7);
		expect(reference.opacity).toContain('background-color:rgba(43, 127, 255, 0.5);');
		expect(reference.opacity).toContain('color:rgba(0, 0, 0, 0.7);');
		const map = await generateTailwindMap(['bg-blue-500/50', 'text-black/70']);
		expect(map.inline['bg-blue-500/50']).toBe('background-color:rgba(43, 127, 255, 0.5);');
		expect(map.inline['text-black/70']).toBe('color:rgba(0, 0, 0, 0.7);');
	});

	it('reproduces the `spacing` oracle declarations (px, %, rounded-full)', async () => {
		// Oracle includes: padding-left:20px;...;border-radius:8px;border-radius:9999px;
		expect(reference.spacing).toContain('padding-left:20px;padding-right:20px;');
		expect(reference.spacing).toContain('border-radius:9999px;');
		const map = await generateTailwindMap(['px-5', 'rounded-lg', 'rounded-full']);
		expect(map.inline['px-5']).toBe('padding-left:20px;padding-right:20px;');
		expect(map.inline['rounded-lg']).toBe('border-radius:8px;');
		expect(map.inline['rounded-full']).toBe('border-radius:9999px;');
	});

	it('reproduces the `variants` oracle (sanitized class names + hoisted rules)', async () => {
		// Oracle keeps `sm_text-lg hover_underline focus_bg-red-500` on the element
		// with their rules in a <style>.
		expect(reference.variants).toContain('sm_text-lg');
		expect(reference.variants).toContain('hover_underline');
		const map = await generateTailwindMap(['sm:text-lg', 'hover:underline']);
		expect(map.rename['sm:text-lg']).toBe('sm_text-lg');
		expect(map.rename['hover:underline']).toBe('hover_underline');
		expect(map.hoist['sm_text-lg']).toContain('@media (min-width: 640px)');
		expect(map.hoist['hover_underline']).toContain(':hover');
	});
});
