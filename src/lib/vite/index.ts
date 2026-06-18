import fs from 'node:fs';
import path from 'node:path';
import { extractClasses } from './extract-classes.js';
import { generateTailwindMap } from '../internal/tailwind/generate-map.js';
import { bakeTailwind } from './bake-tailwind.js';
import { generateIndex } from './generate-index.js';
import { normalizeEmail, DEFAULT_REMAP_TABLE, type NormalizeOptions } from './normalize.js';
import { detectTailwindConfig } from '../internal/tailwind/detect-config.js';
import { startPreviewServer } from './preview-server.js';
import { collectSvelteFiles } from './collect-emails.js';

/** The default module specifier for the generated registry + injected imports. */
const DEFAULT_IMPORT_SOURCE = 'svelte-email-plugin';

/**
 * Resolve the `forgiving` option (boolean | object | undefined) into a concrete
 * {@link NormalizeOptions}. Forgiveness is **on by default**; the object form
 * toggles `wrap`/`remap` and merges `remap.tags` over the built-in table.
 */
function resolveForgiving(
	forgiving: SvelteMailPluginOptions['forgiving'],
	importSource: string
): NormalizeOptions {
	if (forgiving === false) {
		return { wrap: false, remap: false, remapTable: DEFAULT_REMAP_TABLE, importSource };
	}
	if (forgiving === undefined || forgiving === true) {
		return { wrap: true, remap: true, remapTable: DEFAULT_REMAP_TABLE, importSource };
	}
	const wrap = forgiving.wrap ?? true;
	const remap = forgiving.remap !== false;
	const tags = typeof forgiving.remap === 'object' ? forgiving.remap.tags : undefined;
	const remapTable = tags ? { ...DEFAULT_REMAP_TABLE, ...tags } : DEFAULT_REMAP_TABLE;
	return { wrap, remap, remapTable, importSource };
}

/**
 * Options for {@link email}.
 */
export interface SvelteMailPluginOptions {
	/**
	 * Folder (relative to the Vite root) whose `.svelte` files are baked.
	 * Defaults to `'src/emails'`.
	 */
	dir?: string;
	/**
	 * Output path of the generated typed `index.ts` registry, resolved against
	 * the Vite root. Defaults to `<dir>/index.ts`.
	 */
	index?: string;
	/**
	 * Tailwind v4 theme/config. By default the plugin **auto-detects** the project's
	 * CSS entry (`src/app.css`-style, or a scan of `src/`) and feeds its `@theme` /
	 * `@config` / `@plugin` config to the baker, so custom colors/fonts/spacing
	 * resolve with no configuration.
	 *
	 * - omit it — auto-detect.
	 * - `false` — skip detection; use the default Tailwind theme only.
	 * - `{ entry }` — point detection at a specific CSS file.
	 * - `{ css }` — pass CSS-first config inline (`@theme { … }`), skipping detection.
	 */
	tailwind?: false | { entry?: string; css?: string };
	/**
	 * Module specifier the generated registry and any auto-injected component
	 * imports point at. Defaults to the package name (`'svelte-email-plugin'`). Set
	 * to `'$lib/index.js'` when dogfooding inside this repo so injected imports
	 * resolve through the `$lib` alias.
	 */
	importSource?: string;
	/**
	 * "Forgiveness" — let emails be authored loosely and fix them up at build time.
	 * On by default. Two parts, both toggleable:
	 *
	 * - **wrap**: inject missing `<Html>`/`<Head>`/`<Body>` so every email is a
	 *   complete document (and a `<Head>` always exists to hoist variant rules into).
	 * - **remap**: rewrite native tags (`section`, `p`, `hr`, `a`, `img`, `h1`–`h6`,
	 *   `div`→`Container`, …) into the library components, pulling in their
	 *   email-safe defaults and the needed imports automatically.
	 *
	 * `true` (or omitted) enables both; `false` disables both. The object form
	 * toggles each part; `remap.tags` overrides/extends the built-in table
	 * (`{ table: 'Section' }` to opt a tag in, `{ a: false }` to opt one out).
	 */
	forgiving?:
		| boolean
		| {
				wrap?: boolean;
				remap?: boolean | { tags?: Record<string, string | false> };
		  };
	/**
	 * In `vite dev`, also launch a standalone email preview server that lists and
	 * renders every email in `dir` (with live-reload on change).
	 */
	preview?: {
		/** Enable the preview server. Defaults to `false`. */
		enabled?: boolean;
		/** Port for the preview server. Defaults to the Vite dev server's port + 1. */
		port?: number;
	};
}

/**
 * The `svelte-email-plugin` Vite plugin.
 *
 * An `enforce: 'pre'` `transform` that runs the bake pipeline
 * (extract → {@link generateTailwindMap} → {@link bakeTailwind}) on every
 * `.svelte` file under {@link SvelteMailPluginOptions.dir}, **before**
 * `@sveltejs/vite-plugin-svelte` compiles it. The downstream Svelte compiler
 * therefore only ever sees baked source — Tailwind classes already resolved to
 * inline styles (+ a `<Head>` `<style>` for responsive/stateful rules) — so the
 * runtime stays plain `render(Component, props)` with zero Tailwind machinery.
 *
 * Works identically in `vite dev` and `vite build`: Vite re-invokes `transform`
 * on every saved `.svelte` from the original source, so editing a class re-bakes
 * and HMR updates the preview live with no restart.
 *
 * It also generates a typed registry file (`<dir>/index.ts`, configurable via
 * {@link SvelteMailPluginOptions.index}) exporting `emails` — regenerated once on
 * `buildStart` and, in dev, whenever a `.svelte` file is added to or removed from
 * the emails folder. `emails.welcome(props)` is fully typed from the component
 * via `ComponentProps`.
 *
 * The transform always bakes the **original** source Vite hands it, so bake
 * idempotency is not required.
 */
/**
 * Compute the 1-based `line`/`column` of a byte `offset` into `source`.
 *
 * Counts newlines up to `offset`; the column is the count of characters since
 * the last line break (also 1-based). Used to point diagnostics at the exact
 * spot of an offending class expression.
 */
function locate(source: string, offset: number): { line: number; column: number } {
	let line = 1;
	let lineStart = 0;
	for (let i = 0; i < offset && i < source.length; i++) {
		if (source.charCodeAt(i) === 10 /* \n */) {
			line++;
			lineStart = i + 1;
		}
	}
	return { line, column: offset - lineStart + 1 };
}

export function email(options: SvelteMailPluginOptions = {}): import('vite').Plugin {
	/** Vite root, resolved in `configResolved`. */
	let root = '';
	/** Absolute path of the emails folder, resolved in `configResolved`. */
	let resolvedDir = '';
	/** Absolute path of the generated registry file, resolved in `configResolved`. */
	let resolvedIndex = '';

	const importSource = options.importSource ?? DEFAULT_IMPORT_SOURCE;
	/** Resolved forgiveness behavior (static for the plugin's lifetime). */
	const forgive = resolveForgiving(options.forgiving, importSource);
	const forgivenessEnabled = forgive.wrap || forgive.remap;

	/**
	 * The Tailwind CSS-first config to compile against, resolved once and cached.
	 * `false` disables it; an explicit `css` wins; otherwise the project's CSS entry
	 * is auto-detected (see {@link detectTailwindConfig}).
	 */
	let tailwindCssPromise: Promise<string | undefined> | undefined;
	function resolveTailwindCss(): Promise<string | undefined> {
		if (!tailwindCssPromise) {
			tailwindCssPromise = (async () => {
				const t = options.tailwind;
				if (t === false) return undefined;
				if (t && t.css !== undefined) return t.css;
				try {
					const detected = await detectTailwindConfig(root, t?.entry);
					if (detected) return detected.css;
				} catch {
					// Detection is best-effort: fall back to the default Tailwind theme.
				}
				return undefined;
			})();
		}
		return tailwindCssPromise;
	}

	/**
	 * Regenerate `<dir>/index.ts` from the current `.svelte` files in the folder.
	 *
	 * Reads the directory, lists `*.svelte` (ignoring the generated index and any
	 * non-`.svelte` entries), builds the typed source via {@link generateIndex},
	 * and writes it **only if the content changed** — comparing against the file
	 * on disk first. Skipping identical writes avoids needless watcher churn and
	 * self-triggered regeneration loops. No-ops if `resolvedDir` doesn't exist.
	 */
	function writeIndex(): void {
		if (!resolvedDir || !fs.existsSync(resolvedDir)) return;

		// Collect every `.svelte` email under `dir`, recursing into sub-folders, as
		// paths relative to `dir` (POSIX separators). Nesting is mirrored in the
		// generated registry (`emails.auth.password.resetPassword`).
		const paths = collectSvelteFiles(resolvedDir, resolvedDir);

		const source = generateIndex(paths, { importSource });

		// Compare with the existing file; skip the write when unchanged so the
		// watcher isn't woken by our own output.
		const existing = fs.existsSync(resolvedIndex)
			? fs.readFileSync(resolvedIndex, 'utf8')
			: undefined;
		if (existing === source) return;

		fs.mkdirSync(path.dirname(resolvedIndex), { recursive: true });
		fs.writeFileSync(resolvedIndex, source);
	}

	return {
		name: 'svelte-email-plugin',
		enforce: 'pre',

		configResolved(config) {
			root = config.root;
			resolvedDir = path.resolve(config.root, options.dir ?? 'src/emails');
			resolvedIndex = options.index
				? path.resolve(config.root, options.index)
				: path.join(resolvedDir, 'index.ts');
		},

		buildStart() {
			// Generate the registry once at build start (covers both dev and build).
			writeIndex();
		},

		configureServer(server) {
			// Ensure new/edited files inside the emails folder are watched in dev.
			// Per-file re-transform on save is automatic in Vite; this just widens
			// watcher coverage so additions under `dir` are observed.
			if (resolvedDir) server.watcher.add(resolvedDir);

			/**
			 * Regenerate the registry when a `.svelte` file is added to or removed
			 * from the emails folder. A class edit (`change`) doesn't alter the file
			 * list and flows through `ComponentProps` automatically, so it's ignored.
			 * The generated index file is never reacted to — guarding against the
			 * self-trigger loop our own write would otherwise cause.
			 */
			const onFileListChange = (changedPath: string): void => {
				if (!resolvedDir) return;
				const filename = path.resolve(changedPath);
				if (filename === resolvedIndex) return;
				if (!filename.endsWith('.svelte')) return;
				const relative = path.relative(resolvedDir, filename);
				const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
				if (!inside) return;
				writeIndex();
			};
			server.watcher.on('add', onFileListChange);
			server.watcher.on('unlink', onFileListChange);

			// Optional standalone email preview server, on `preview.port` (default the
			// Vite dev port + 1). Only for a real `vite dev` — `server.httpServer` is
			// null in middleware mode (SSR, programmatic), so the preview is skipped
			// there (no port to derive, and nothing to preview against). Vitest is
			// excluded explicitly: it loads this config once per project (root + each
			// `test.projects` entry), and each load would race to bind the same port.
			// It's started once the dev server is listening (so the real port is known)
			// and closed when the dev server closes.
			if (options.preview?.enabled && server.httpServer && !process.env.VITEST) {
				const httpServer = server.httpServer;
				const launch = (): void => {
					const addr = httpServer.address();
					const basePort =
						addr && typeof addr === 'object' ? addr.port : (server.config.server.port ?? 5173);
					const previewPort = options.preview?.port ?? basePort + 1;
					const previewServer = startPreviewServer(server, previewPort, resolvedDir);
					server.config.logger.info(
						`  \x1b[32m➜\x1b[39m  \x1b[1msvelte-email-plugin\x1b[22m preview: \x1b[36mhttp://localhost:${previewPort}/\x1b[39m`
					);
					httpServer.once('close', () => previewServer.close());
				};
				// On a fresh start `listening` fires after `configureServer`; on a Vite
				// restart the server may already be listening, so launch immediately then.
				if (httpServer.listening) launch();
				else httpServer.once('listening', launch);
			}
		},

		async transform(code, id) {
			// Strip any query suffix (`?import`, `?raw`, `?v=…`) before path checks.
			const filename = id.split('?', 1)[0];
			if (!filename.endsWith('.svelte')) return;

			// Only handle files inside the resolved emails folder.
			const relative = path.relative(resolvedDir, filename);
			const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
			if (!inside) return;

			// Forgiveness pass: remap native tags → components and inject missing
			// Html/Head/Body (+ the imports they need) before anything else sees the
			// source. The Tailwind bake then runs on this normalized string.
			let source = code;
			let normalized = false;
			if (forgivenessEnabled) {
				const result = normalizeEmail(code, filename, forgive);
				source = result.code;
				normalized = result.changed;
			}

			const { classes, dynamic } = extractClasses(source, filename);

			// Enforcement: a non-literal/dynamic class expression can't be statically
			// analyzed, so its tokens aren't in the precomputed map and would silently
			// produce no styles. Fail the build, naming the file and each offending
			// expression with a 1-based `line:column`. Throwing from `transform` fails
			// the Vite build/dev with this file in context — the desired behavior.
			if (dynamic.length > 0) {
				const lines = dynamic.map((d) => {
					const where = typeof d.start === 'number' ? locate(source, d.start) : undefined;
					const at = where ? ` at ${where.line}:${where.column}` : '';
					return `  - "${d.expression}"${at}`;
				});
				throw new Error(
					`svelte-email-plugin: ${filename} uses dynamic class expression(s) that can't be statically analyzed:\n` +
						`${lines.join('\n')}\n` +
						`Only static and conditional-literal classes are supported ` +
						`(e.g. class="bg-blue-500" or class={cond ? 'bg-red-500' : 'bg-blue-500'}). ` +
						`Build a class name from a literal instead of composing it at runtime.`
				);
			}

			// No literal classes → the Tailwind bake would be a no-op. Still emit the
			// forgiveness-normalized source when it changed; otherwise skip entirely.
			if (classes.length === 0) return normalized ? { code: source } : undefined;

			const map = await generateTailwindMap(classes, { css: await resolveTailwindCss() });

			// Diagnostics: class tokens recognized as neither an inlinable utility
			// (`map.inline`) nor a variant utility (`map.rename`) weren't resolved as
			// Tailwind. They're left as-is in the baked output; warn informationally in
			// case they're typos (intentional non-Tailwind classes can be ignored).
			const classesNotFound = classes.filter((cls) => !(cls in map.inline) && !(cls in map.rename));
			if (classesNotFound.length > 0) {
				console.warn(
					`svelte-email-plugin: ${filename} has class token(s) not recognized as Tailwind utilities ` +
						`(left as-is): ${classesNotFound.join(', ')}. ` +
						`Ignore this if they're intentional non-Tailwind classes; otherwise check for typos.`
				);
			}

			const baked = bakeTailwind(source, map, filename);

			// `bakeTailwind` returns a baked string only (no sourcemap). Returning just
			// `code` is acceptable per the plan; vite-plugin-svelte regenerates the map
			// from the baked source it receives next.
			return { code: baked };
		}
	};
}

export default email;
