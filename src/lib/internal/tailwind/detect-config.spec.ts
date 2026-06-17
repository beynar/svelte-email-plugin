import { afterEach, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectTailwindConfig } from './detect-config.js';

const tmpDirs: string[] = [];

afterEach(() => {
	for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Create a temp project root with the given files (paths relative to the root). */
function makeRoot(files: Record<string, string>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sek-tw-'));
	tmpDirs.push(root);
	for (const [rel, content] of Object.entries(files)) {
		const file = path.join(root, rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	}
	return root;
}

describe('detectTailwindConfig', () => {
	it('extracts @theme from src/app.css and drops the tailwindcss import', async () => {
		const root = makeRoot({
			'src/app.css': `@import "tailwindcss";\n@theme {\n  --color-brand: #6d28d9;\n}\n`
		});
		const result = await detectTailwindConfig(root);
		expect(result).toBeTruthy();
		expect(result!.file).toBe(path.join(root, 'src/app.css'));
		expect(result!.css).toContain('@theme');
		expect(result!.css).toContain('--color-brand: #6d28d9');
		expect(result!.css).not.toContain('tailwindcss');
	});

	it('rewrites relative @plugin / @config / @import paths to absolute', async () => {
		const root = makeRoot({
			'src/app.css':
				`@import "tailwindcss";\n` +
				`@plugin "./plugins/typography.js";\n` +
				`@config "../tailwind.config.js";\n` +
				`@import "./tokens.css";\n` +
				`@theme { --spacing-gutter: 24px; }\n`
		});
		const { css } = (await detectTailwindConfig(root))!;
		expect(css).toContain(`@plugin "${path.join(root, 'src/plugins/typography.js')}"`);
		expect(css).toContain(`@config "${path.join(root, 'tailwind.config.js')}"`);
		expect(css).toContain(`@import "${path.join(root, 'src/tokens.css')}"`);
		expect(css).toContain('@theme');
	});

	it('honors an explicit entry path', async () => {
		const root = makeRoot({
			'styles/email.css': `@import "tailwindcss";\n@theme { --color-accent: #0ea5e9; }\n`
		});
		const result = await detectTailwindConfig(root, 'styles/email.css');
		expect(result!.css).toContain('--color-accent: #0ea5e9');
	});

	it('scans src/ recursively when no common candidate exists', async () => {
		const root = makeRoot({
			'src/lib/theme/email.css': `@theme { --color-brand: #111827; }\n`
		});
		const result = await detectTailwindConfig(root);
		expect(result!.file).toBe(path.join(root, 'src/lib/theme/email.css'));
		expect(result!.css).toContain('--color-brand: #111827');
	});

	it('returns undefined when there is no Tailwind entry', async () => {
		const root = makeRoot({ 'src/main.ts': 'export const x = 1;' });
		expect(await detectTailwindConfig(root)).toBeUndefined();
	});

	it('returns undefined when the entry has only the framework import (no custom config)', async () => {
		const root = makeRoot({ 'src/app.css': `@import "tailwindcss";\n` });
		expect(await detectTailwindConfig(root)).toBeUndefined();
	});
});
