import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { cleanSvelteMarkup } from '../render.js';

const DOCTYPE =
	'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" ' +
	'"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

/** One previewable email file. */
interface EmailEntry {
	/** Path relative to `dir` (POSIX), e.g. `auth/password/reset-password.svelte`. */
	file: string;
	/** Display label, e.g. `auth/password/reset-password`. */
	label: string;
}

/** Recursively list the `.svelte` emails under `dir` as relative paths, sorted. */
function listEmails(dir: string, baseDir: string = dir): EmailEntry[] {
	if (!fs.existsSync(dir)) return [];
	const out: EmailEntry[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
			out.push(...listEmails(path.join(dir, entry.name), baseDir));
		} else if (entry.isFile() && entry.name.endsWith('.svelte')) {
			const file = path.relative(baseDir, path.join(dir, entry.name)).split(path.sep).join('/');
			out.push({ file, label: file.replace(/\.svelte$/, '') });
		}
	}
	return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Start the svelte-email-kit email preview server.
 *
 * Serves a small UI listing every email in `dir` and rendering each one (baked
 * by the plugin's pre-transform, then `render`ed via Vite's SSR module graph so
 * it shares the running app's Svelte instance). Live-reloads via SSE whenever a
 * `.svelte` file under `dir` changes.
 *
 * @returns the HTTP server (call `.close()` to stop it).
 */
export function startPreviewServer(vite: ViteDevServer, port: number, dir: string): http.Server {
	const root = vite.config.root;
	/** Root-relative id Vite's `ssrLoadModule` resolves (e.g. `/src/emails/X.svelte`). */
	const idFor = (file: string) =>
		'/' + path.relative(root, path.join(dir, file)).split(path.sep).join('/');

	/** Render one email to a full, marker-stripped HTML document. */
	async function renderEmail(file: string): Promise<string> {
		const { render } = (await vite.ssrLoadModule('svelte/server')) as {
			render: (component: unknown, options: { props: Record<string, unknown> }) => { body: string };
		};
		const mod = (await vite.ssrLoadModule(idFor(file))) as { default: unknown };
		const { body } = render(mod.default, { props: {} });
		return DOCTYPE + cleanSvelteMarkup(body);
	}

	// --- SSE live-reload: notify clients when an email under `dir` changes. ---
	const clients = new Set<http.ServerResponse>();
	// The module graph `ssrLoadModule` (above) renders from. We invalidate the
	// changed module here so the next render re-transforms (re-bakes) it.
	const ssrGraph = vite.environments.ssr.moduleGraph;
	const notify = (file: string) => {
		const inside = !path.relative(dir, file).startsWith('..');
		if (!inside || !file.endsWith('.svelte')) return;
		// Drop the changed email's cached SSR module *before* telling clients to
		// reload. The raw watcher event can outrun Vite's own invalidation, so a
		// browser that refetches the instant it sees the SSE ping would otherwise
		// re-render the stale module — making the file appear not to update until a
		// second save. Forcing the invalidation here closes that race.
		const mods = ssrGraph.getModulesByFile(file);
		if (mods) for (const mod of mods) ssrGraph.invalidateModule(mod);
		for (const res of clients) res.write('data: reload\n\n');
	};
	vite.watcher.on('change', notify);
	vite.watcher.on('add', notify);
	vite.watcher.on('unlink', notify);

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url ?? '/', 'http://localhost');

			if (url.pathname === '/__events') {
				res.writeHead(200, {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					Connection: 'keep-alive'
				});
				res.write('retry: 1000\n\n');
				clients.add(res);
				req.on('close', () => clients.delete(res));
				return;
			}

			if (url.pathname === '/email') {
				const file = url.searchParams.get('file') ?? '';
				const exists = listEmails(dir).some((e) => e.file === file);
				if (!exists) {
					res.writeHead(404, { 'Content-Type': 'text/html' });
					res.end('<p>Unknown email.</p>');
					return;
				}
				try {
					const html = await renderEmail(file);
					res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
					res.end(html);
				} catch (e) {
					res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
					res.end(errorFrame(file, e));
				}
				return;
			}

			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(indexPage(listEmails(dir)));
		} catch (e) {
			res.writeHead(500, { 'Content-Type': 'text/plain' });
			res.end(String(e instanceof Error ? e.stack : e));
		}
	});

	server.on('close', () => {
		vite.watcher.off('change', notify);
		vite.watcher.off('add', notify);
		vite.watcher.off('unlink', notify);
		for (const res of clients) res.end();
		clients.clear();
	});

	server.listen(port);
	return server;
}

/** A standalone error document shown inside the preview iframe when a render fails. */
function errorFrame(file: string, e: unknown): string {
	const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
	return `<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px/1.5 ui-monospace,monospace;background:#1e1e1e;color:#f87171;padding:24px">
<strong style="color:#fca5a5">Failed to render ${escapeHtml(file)}</strong>
<pre style="white-space:pre-wrap;color:#fda4af;margin-top:12px">${escapeHtml(message)}</pre></body>`;
}

/** The preview shell: sidebar list + iframe + viewport toggle + SSE auto-reload. */
function indexPage(emails: EmailEntry[]): string {
	const first = emails[0]?.file ?? '';
	const items = emails
		.map(
			(e) =>
				`<button class="item" data-file="${escapeHtml(e.file)}">${escapeHtml(e.label)}</button>`
		)
		.join('');
	const empty = emails.length === 0;

	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>svelte-email-kit preview</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; display: grid; grid-template-columns: 240px 1fr; height: 100vh; background: #0b0b0c; color: #e5e7eb; }
  aside { border-right: 1px solid #232327; overflow-y: auto; padding: 12px; }
  .brand { font-weight: 700; padding: 8px 10px 14px; color: #fff; letter-spacing: -0.01em; }
  .brand small { display:block; font-weight:400; color:#8b8b93; font-size:11px; letter-spacing:0; }
  .item { display: block; width: 100%; text-align: left; background: transparent; border: 0; color: #c7c7cf; padding: 8px 10px; border-radius: 8px; cursor: pointer; font: inherit; }
  .item:hover { background: #1a1a1d; color: #fff; }
  .item[aria-current="true"] { background: #2563eb; color: #fff; }
  main { display: flex; flex-direction: column; min-width: 0; }
  header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid #232327; }
  header .name { font-weight: 600; color: #fff; }
  header .spacer { flex: 1; }
  .seg { display: inline-flex; border: 1px solid #2c2c31; border-radius: 8px; overflow: hidden; }
  .seg button { background: #151517; color: #c7c7cf; border: 0; padding: 6px 12px; cursor: pointer; font: inherit; }
  .seg button[aria-pressed="true"] { background: #e5e7eb; color: #111; }
  .stage { flex: 1; display: grid; place-items: start center; padding: 24px; overflow: auto; background: #141416; }
  iframe { width: 100%; max-width: 800px; height: 100%; border: 0; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.4); transition: max-width .15s ease; }
  .empty { padding: 40px; color: #8b8b93; }
</style></head>
<body>
  <aside>
    <div class="brand">svelte-email-kit<small>email preview</small></div>
    ${empty ? '<div class="empty">No .svelte emails found.</div>' : items}
  </aside>
  <main>
    <header>
      <span class="name" id="name">${escapeHtml(emails[0]?.label ?? '')}</span>
      <span class="spacer"></span>
      <div class="seg">
        <button data-w="full" aria-pressed="true">Desktop</button>
        <button data-w="375">Mobile</button>
      </div>
    </header>
    <div class="stage">
      <iframe id="frame" src="${first ? `/email?file=${encodeURIComponent(first)}` : 'about:blank'}" title="email preview"></iframe>
    </div>
  </main>
<script>
  const frame = document.getElementById('frame');
  const name = document.getElementById('name');
  let current = ${JSON.stringify(first)};
  function select(file, label) {
    current = file;
    frame.src = '/email?file=' + encodeURIComponent(file) + '&t=' + Date.now();
    if (label != null) name.textContent = label;
    document.querySelectorAll('.item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.file === file)));
  }
  document.querySelectorAll('.item').forEach((b) => b.addEventListener('click', () => select(b.dataset.file, b.textContent)));
  document.querySelector('.item')?.setAttribute('aria-current', 'true');
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    frame.style.maxWidth = b.dataset.w === 'full' ? '800px' : b.dataset.w + 'px';
  }));
  // live reload on email change
  try {
    new EventSource('/__events').onmessage = () => { if (current) frame.src = '/email?file=' + encodeURIComponent(current) + '&t=' + Date.now(); };
  } catch {}
</script>
</body></html>`;
}
