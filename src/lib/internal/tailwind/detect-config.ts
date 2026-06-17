import fs from 'node:fs';
import path from 'node:path';

/**
 * Common locations for a project's Tailwind v4 CSS entry (the file with
 * `@import "tailwindcss"` and/or a `@theme { … }` block), checked in order.
 */
const ENTRY_CANDIDATES = [
	'src/app.css',
	'src/app.pcss',
	'src/style.css',
	'src/styles.css',
	'src/index.css',
	'src/styles/app.css',
	'src/lib/styles/app.css',
	'src/routes/app.css',
	'app.css',
	'styles.css'
];

/** A file is a Tailwind entry if it imports tailwindcss or carries CSS-first config. */
const TAILWIND_MARKER =
	/@import\s+["']tailwindcss|@theme\b|@config\b|@plugin\b|@custom-variant\b|@utility\b/;

/** At-rules carrying CSS-first config we forward to the baker (`@theme` etc.). */
const CONFIG_AT_RULES = new Set([
	'theme',
	'config',
	'plugin',
	'custom-variant',
	'variant',
	'utility'
]);

/** Recursively find the first Tailwind-entry CSS under `dir` (bounded depth). */
function scanForEntry(dir: string, depth: number): string | undefined {
	if (depth > 4) return undefined;
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return undefined;
	}
	for (const entry of entries) {
		if (entry.isFile() && /\.(css|pcss)$/.test(entry.name)) {
			const file = path.join(dir, entry.name);
			if (TAILWIND_MARKER.test(safeRead(file))) return file;
		}
	}
	for (const entry of entries) {
		if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
			const found = scanForEntry(path.join(dir, entry.name), depth + 1);
			if (found) return found;
		}
	}
	return undefined;
}

function safeRead(file: string): string {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return '';
	}
}

/** Locate the Tailwind entry CSS: the common candidates first, then a scan of `src/`. */
function findEntry(root: string): string | undefined {
	for (const rel of ENTRY_CANDIDATES) {
		const file = path.join(root, rel);
		if (fs.existsSync(file) && TAILWIND_MARKER.test(safeRead(file))) return file;
	}
	const srcDir = path.join(root, 'src');
	if (fs.existsSync(srcDir)) return scanForEntry(srcDir, 0);
	return undefined;
}

/** Rewrite a relative quoted path in an at-rule's params to absolute, against `dir`. */
function absolutizeParams(params: string, dir: string): string {
	return params.replace(
		/(['"])(\.[^'"]*)\1/,
		(_whole, quote: string, rel: string) => `${quote}${path.resolve(dir, rel)}${quote}`
	);
}

/**
 * Auto-detect a project's Tailwind v4 CSS-first config so the baker resolves the
 * project's custom theme (custom colors/fonts/spacing, `@plugin`, `@config`, …).
 *
 * Finds the entry CSS (an explicit `entry`, else `src/app.css`-style candidates,
 * else a scan of `src/`), then extracts its config at-rules — `@theme`, `@config`,
 * `@plugin`, `@custom-variant`, `@utility`, and non-`tailwindcss` `@import`s — with
 * relative paths rewritten to absolute (so they resolve from any base). The result
 * is fed to {@link generateTailwindMap} as its `css`; `@import "tailwindcss"`,
 * `@tailwind`, `@source`, and ordinary rules are skipped (the baker supplies the
 * default theme + utilities itself, and provides its own candidate class list).
 *
 * @returns the extracted CSS-first config and the file it came from, or `undefined`
 *   when no Tailwind entry (or no custom config in it) is found.
 */
export async function detectTailwindConfig(
	root: string,
	entry?: string
): Promise<{ css: string; file: string } | undefined> {
	const file = entry ? path.resolve(root, entry) : findEntry(root);
	if (!file || !fs.existsSync(file)) return undefined;

	const source = safeRead(file);
	const dir = path.dirname(file);
	const { default: postcss } = await import('postcss');
	const ast = postcss.parse(source);

	const parts: string[] = [];
	for (const node of ast.nodes) {
		if (node.type !== 'atrule') continue;
		const name = node.name.toLowerCase();

		if (name === 'import') {
			const param = node.params.replace(/['"]/g, '').trim();
			if (/^tailwindcss(\/|$|\s)/.test(param)) continue; // the framework import — baker adds it
			const clone = node.clone({ params: absolutizeParams(node.params, dir) });
			parts.push(clone.toString());
			continue;
		}

		if (CONFIG_AT_RULES.has(name)) {
			if (name === 'theme') {
				parts.push(node.toString()); // inline block, no paths
			} else {
				const clone = node.clone({ params: absolutizeParams(node.params, dir) });
				parts.push(clone.toString());
			}
		}
	}

	const css = parts.join('\n').trim();
	return css.length > 0 ? { css, file } : undefined;
}
