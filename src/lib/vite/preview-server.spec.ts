import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { email } from './index.js';
import { startPreviewServer } from './preview-server.js';

const root = process.cwd();
const emailsDir = resolve(root, 'src/emails');

let vite: ViteDevServer;
let server: Server;
let base: string;

beforeAll(async () => {
	vite = await createServer({
		root,
		logLevel: 'silent',
		configFile: false,
		resolve: { alias: { $lib: resolve(root, 'src/lib') } },
		server: { middlewareMode: true, hmr: false, watch: null },
		plugins: [email({ dir: 'src/emails' }), svelte()]
	});
	server = startPreviewServer(vite, 0, emailsDir);
	await new Promise<void>((r) => server.on('listening', () => r()));
	const addr = server.address();
	const port = addr && typeof addr === 'object' ? addr.port : 0;
	base = `http://localhost:${port}`;
});

afterAll(async () => {
	server?.close();
	await vite?.close();
});

describe('preview server', () => {
	it('serves an index listing every email in the folder', async () => {
		const html = await (await fetch(`${base}/`)).text();
		expect(html).toContain('email preview');
		expect(html).toContain('WelcomeEmail.svelte');
		expect(html).toContain('TailwindDemo.svelte');
		// live-reload wiring is present
		expect(html).toContain('/__events');
	});

	it('renders a baked email to a full HTML document', async () => {
		const res = await fetch(`${base}/email?file=TailwindDemo.svelte`);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html.startsWith('<!DOCTYPE html PUBLIC')).toBe(true);
		// Tailwind baked to inline styles + responsive rule hoisted into <head>.
		expect(html).toMatch(/style="[^"]*rgb\(/);
		expect(html).toContain('@media (min-width: 640px)');
		// no Svelte hydration markers leak into the preview
		expect(html).not.toContain('<!--[-->');
	});

	it('404s on an unknown email', async () => {
		const res = await fetch(`${base}/email?file=does-not-exist.svelte`);
		expect(res.status).toBe(404);
	});
});
