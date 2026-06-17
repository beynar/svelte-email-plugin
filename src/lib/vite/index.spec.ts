import { afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';
import { email } from './index.js';

/** A Vite root used to resolve `dir` into absolute paths in these tests. */
const ROOT = '/project';

/**
 * Normalize a Vite object-hook (`{ handler }`) or plain-function hook into a
 * callable. Vite plugin hooks may be declared either way; the runner accepts
 * both, so tests must too.
 */
function asFunction<Args extends unknown[], Result>(
	hook: ((...args: Args) => Result) | { handler: (...args: Args) => Result } | undefined
): (...args: Args) => Result {
	if (typeof hook === 'function') return hook;
	if (hook && typeof hook.handler === 'function') return hook.handler;
	throw new Error('hook is not callable');
}

/**
 * Drive `configResolved` then `transform` directly. The result is narrowed to
 * the `{ code }` shape our plugin returns (or a nullish skip).
 */
async function runTransform(
	plugin: Plugin,
	code: string,
	id: string
): Promise<{ code: string } | null | undefined> {
	asFunction(plugin.configResolved).call({}, { root: ROOT } as never);
	const transform = asFunction(plugin.transform);
	const result = await transform.call({} as never, code, id);
	return result as { code: string } | null | undefined;
}

/** An absolute id inside the default emails folder. */
function emailId(file: string, root = ROOT): string {
	return path.join(root, 'src/emails', file);
}

const STATIC_EMAIL = '<a class="text-red-500 bg-blue-500">x</a>';
const DYNAMIC_EMAIL = `<a class={cond ? 'bg-red-500' : 'bg-blue-500'}>x</a>`;

describe('email — plugin shape', () => {
	it('exposes name, enforce, and a transform hook', () => {
		const plugin = email();
		expect(plugin.name).toBe('svelte-plugin-mail');
		expect(plugin.enforce).toBe('pre');
		// `transform` may be a function or an object hook — either is valid.
		expect(asFunction(plugin.transform)).toBeTypeOf('function');
	});
});

describe('email — transform (bake)', () => {
	it('bakes a static-class email into resolved inline styles', async () => {
		const out = await runTransform(email(), STATIC_EMAIL, emailId('welcome.svelte'));
		expect(out).toBeTruthy();
		expect(out!.code).toContain(
			'style="color:rgb(251, 44, 54);background-color:rgb(43, 127, 255);"'
		);
		expect(out!.code).not.toContain('class=');
	});

	it('injects the __tw helper for a dynamic-class email', async () => {
		const out = await runTransform(email(), DYNAMIC_EMAIL, emailId('alert.svelte'));
		expect(out).toBeTruthy();
		expect(out!.code).toContain('const __twMap = {');
		expect(out!.code).toContain(`style={__twStyle((cond ? 'bg-red-500' : 'bg-blue-500'))}`);
		expect(out!.code).toContain(`class={__twClass((cond ? 'bg-red-500' : 'bg-blue-500'))}`);
	});

	it('forwards the tailwind.css option to the map generator', async () => {
		const plugin = email({ tailwind: { css: '@theme { --color-brand: #6d28d9; }' } });
		const out = await runTransform(plugin, '<a class="text-brand">x</a>', emailId('brand.svelte'));
		expect(out).toBeTruthy();
		// Without the forwarded `@theme`, `text-brand` is unknown and would be left
		// as a class; the resolved custom property proves the option reached the map.
		expect(out!.code).toContain('style="color:#6d28d9;"');
		expect(out!.code).not.toContain('class="text-brand"');
	});
});

describe('email — scoping', () => {
	it('ignores a .svelte file outside the emails folder', async () => {
		const out = await runTransform(
			email(),
			STATIC_EMAIL,
			path.join(ROOT, 'src/routes/+page.svelte')
		);
		expect(out).toBeFalsy();
	});

	it('ignores a non-.svelte file inside the emails folder', async () => {
		const out = await runTransform(email(), STATIC_EMAIL, emailId('index.ts'));
		expect(out).toBeFalsy();
	});

	it('ignores the emails folder path itself (dir is not its own child)', async () => {
		const out = await runTransform(email(), STATIC_EMAIL, path.join(ROOT, 'src/emails'));
		expect(out).toBeFalsy();
	});

	it('strips a query suffix before matching', async () => {
		const out = await runTransform(
			email(),
			STATIC_EMAIL,
			`${emailId('welcome.svelte')}?svelte&type=style`
		);
		expect(out).toBeTruthy();
		expect(out!.code).toContain('background-color:rgb(43, 127, 255)');
	});

	it('respects a custom dir option', async () => {
		const plugin = email({ dir: 'lib/mail' });
		// A file in the custom dir is baked…
		const inside = await runTransform(plugin, STATIC_EMAIL, path.join(ROOT, 'lib/mail/x.svelte'));
		expect(inside).toBeTruthy();
		expect(inside!.code).toContain('color:rgb(251, 44, 54)');
		// …but the default dir is no longer matched.
		const outside = await runTransform(plugin, STATIC_EMAIL, emailId('welcome.svelte'));
		expect(outside).toBeFalsy();
	});

	it('returns nullish for a static email with no recognizable classes', async () => {
		// forgiving off so the bare element isn't remapped/wrapped (which would emit).
		const out = await runTransform(
			email({ forgiving: false }),
			'<a class="">x</a>',
			emailId('empty.svelte')
		);
		expect(out).toBeFalsy();
	});
});

describe('email — enforcement (dynamic classes)', () => {
	// forgiving off so reported line:column reflects the un-normalized source.
	it('throws on a composed class expression, naming the file, expression, and line:column', async () => {
		const code = `<a class={'bg-' + color}>x</a>`;
		const id = emailId('compose.svelte');
		let error: Error | undefined;
		try {
			await runTransform(email({ forgiving: false }), code, id);
		} catch (e) {
			error = e as Error;
		}
		expect(error).toBeInstanceOf(Error);
		expect(error!.message).toContain(id);
		expect(error!.message).toContain(`'bg-' + color`);
		// `'bg-' + color` starts at the `{` + 1 = column 11 on line 1.
		expect(error!.message).toMatch(/at 1:\d+/);
	});

	it('throws on a bare identifier class expression', async () => {
		await expect(
			runTransform(email(), '<a class={someClasses}>x</a>', emailId('bare.svelte'))
		).rejects.toThrow(/dynamic class expression/);
	});

	it('does NOT throw on a conditional-literal class (bakes via __twMap)', async () => {
		const out = await runTransform(email(), DYNAMIC_EMAIL, emailId('cond.svelte'));
		expect(out).toBeTruthy();
		expect(out!.code).toContain('const __twMap = {');
	});

	it('reports the correct line:column for a dynamic expression on a later line', async () => {
		const code = ['<div>', '  <span>hi</span>', `  <a class={dynClass}>x</a>`, '</div>'].join('\n');
		let error: Error | undefined;
		try {
			await runTransform(email({ forgiving: false }), code, emailId('multiline.svelte'));
		} catch (e) {
			error = e as Error;
		}
		expect(error).toBeInstanceOf(Error);
		// `dynClass` is on line 3; `  <a class={` is 12 chars, so column 13 (1-based).
		expect(error!.message).toContain('"dynClass" at 3:13');
	});
});

describe('email — forgiving', () => {
	it('wraps and remaps a bare email, then bakes (default on)', async () => {
		const out = await runTransform(
			email(),
			'<p class="text-red-500">x</p>',
			emailId('loose.svelte')
		);
		expect(out).toBeTruthy();
		// <p> → <Text>, class baked to inline style, full document + imports.
		expect(out!.code).toContain('<Text style="color:rgb(251, 44, 54);">x</Text>');
		expect(out!.code).toContain('<Html lang="en" dir="ltr">');
		expect(out!.code).toContain('<Head');
		expect(out!.code).toContain('<Body style="font-family:');
		expect(out!.code).toContain(`from 'svelte-plugin-mail';`);
	});

	it('auto-Head lets a variant class hoist with no authored <Head> (no throw)', async () => {
		// `sm:text-lg` previously threw "email has no <Head>"; the injected Head fixes it.
		const out = await runTransform(
			email(),
			'<div class="sm:text-lg">x</div>',
			emailId('variant.svelte')
		);
		expect(out).toBeTruthy();
		expect(out!.code).toContain('@media (min-width: 640px)');
		expect(out!.code).toContain('<Head');
		expect(out!.code).toContain('<Container');
	});

	it('forgiving:false is the un-normalized bake (no wrap, no remap)', async () => {
		const out = await runTransform(
			email({ forgiving: false }),
			STATIC_EMAIL,
			emailId('strict.svelte')
		);
		expect(out).toBeTruthy();
		expect(out!.code).toBe(
			'<a style="color:rgb(251, 44, 54);background-color:rgb(43, 127, 255);">x</a>'
		);
		expect(out!.code).not.toContain('<Html');
		expect(out!.code).not.toContain('<Link');
	});

	it('injects imports from a custom importSource', async () => {
		const out = await runTransform(
			email({ importSource: 'my-emails' }),
			'<p>x</p>',
			emailId('src.svelte')
		);
		expect(out).toBeTruthy();
		expect(out!.code).toContain(`from 'my-emails';`);
	});

	it('still throws on a dynamic class even on a remapped tag', async () => {
		await expect(
			runTransform(email(), '<p class={bad}>x</p>', emailId('dyn.svelte'))
		).rejects.toThrow(/dynamic class expression/);
	});

	it('remap:false wraps but keeps native tags', async () => {
		const out = await runTransform(
			email({ forgiving: { remap: false } }),
			'<p class="text-red-500">x</p>',
			emailId('nowrap.svelte')
		);
		expect(out).toBeTruthy();
		expect(out!.code).toContain('<Body style="font-family:');
		expect(out!.code).toContain('<p style="color:rgb(251, 44, 54);">x</p>'); // still native <p>
		expect(out!.code).not.toContain('<Text');
	});

	it('wrap:false remaps but does not inject Html/Head/Body', async () => {
		const out = await runTransform(
			email({ forgiving: { wrap: false } }),
			'<p class="text-red-500">x</p>',
			emailId('noremapwrap.svelte')
		);
		expect(out).toBeTruthy();
		expect(out!.code).toContain('<Text style="color:rgb(251, 44, 54);">x</Text>');
		expect(out!.code).not.toContain('<Html');
	});
});

describe('email — diagnostics (classesNotFound)', () => {
	it('does not warn when all static classes are valid Tailwind utilities', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const out = await runTransform(
				email(),
				'<a class="text-red-500 px-5">x</a>',
				emailId('valid.svelte')
			);
			expect(out).toBeTruthy();
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});

	it('warns on unrecognized class tokens but keeps them in the baked output', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const out = await runTransform(
				email(),
				'<a class="text-red-500 totally-not-tailwind">x</a>',
				emailId('mixed.svelte')
			);
			expect(out).toBeTruthy();
			// Warned, and the message names the offending token.
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0]![0]).toContain('totally-not-tailwind');
			// The unrecognized class survives baking; the recognized one is inlined.
			expect(out!.code).toContain('class="totally-not-tailwind"');
			expect(out!.code).toContain('color:rgb(251, 44, 54)');
		} finally {
			warn.mockRestore();
		}
	});
});

describe('email — index codegen', () => {
	const tmpDirs: string[] = [];

	afterEach(() => {
		for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
	});

	/** Invoke `buildStart` (which our plugin ignores the options arg of). */
	function runBuildStart(plugin: Plugin): void {
		asFunction(plugin.buildStart).call({} as never, undefined as never);
	}

	/** Create a temp project root with an `emails` folder holding the given files. */
	function makeProject(files: Record<string, string>): { root: string; dir: string } {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svelte-plugin-mail-'));
		tmpDirs.push(root);
		const dir = path.join(root, 'src/emails');
		fs.mkdirSync(dir, { recursive: true });
		for (const [name, content] of Object.entries(files)) {
			const file = path.join(dir, name);
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, content);
		}
		return { root, dir };
	}

	it('discovers emails in nested folders and mirrors them in the registry', () => {
		const { root, dir } = makeProject({
			'welcome.svelte': '<a>x</a>',
			'auth/password/reset-password.svelte': '<a>r</a>',
			'auth/password/password-change.svelte': '<a>c</a>'
		});
		const plugin = email();
		asFunction(plugin.configResolved).call({}, { root } as never);
		runBuildStart(plugin);

		const source = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8');
		expect(source).toContain(`import ResetPassword from './auth/password/reset-password.svelte';`);
		expect(source).toContain('auth: {');
		expect(source).toContain('password: {');
		expect(source).toContain(
			`resetPassword: (props: ComponentProps<typeof ResetPassword>) => render(ResetPassword, props)`
		);
		expect(source).toContain(`welcome: (props: ComponentProps<typeof Welcome>)`);
	});

	it('writes <dir>/index.ts with all emails on buildStart', () => {
		const { root, dir } = makeProject({
			'WelcomeEmail.svelte': '<a>x</a>',
			'order-receipt.svelte': '<a>y</a>'
		});

		const plugin = email();
		asFunction(plugin.configResolved).call({}, { root } as never);
		runBuildStart(plugin);

		const indexPath = path.join(dir, 'index.ts');
		expect(fs.existsSync(indexPath)).toBe(true);
		const source = fs.readFileSync(indexPath, 'utf8');
		expect(source).toContain(`import WelcomeEmail from './WelcomeEmail.svelte';`);
		expect(source).toContain(`import OrderReceipt from './order-receipt.svelte';`);
		expect(source).toContain(`welcomeEmail: (props: ComponentProps<typeof WelcomeEmail>)`);
		expect(source).toContain(`orderReceipt: (props: ComponentProps<typeof OrderReceipt>)`);
	});

	it('does not rewrite the index file when content is unchanged', () => {
		const { root, dir } = makeProject({ 'welcome.svelte': '<a>x</a>' });
		const indexPath = path.join(dir, 'index.ts');

		const plugin = email();
		asFunction(plugin.configResolved).call({}, { root } as never);
		runBuildStart(plugin);

		const firstContent = fs.readFileSync(indexPath, 'utf8');
		const firstMtime = fs.statSync(indexPath).mtimeMs;

		// Re-run with no file-list change: content and mtime stay stable.
		runBuildStart(plugin);
		expect(fs.readFileSync(indexPath, 'utf8')).toBe(firstContent);
		expect(fs.statSync(indexPath).mtimeMs).toBe(firstMtime);
	});

	it('excludes the generated index file from its own registry', () => {
		const { root, dir } = makeProject({ 'welcome.svelte': '<a>x</a>' });
		const plugin = email();
		asFunction(plugin.configResolved).call({}, { root } as never);
		runBuildStart(plugin);

		const source = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8');
		expect(source).not.toContain(`from './index.ts'`);
		expect(source).not.toContain('index:');
	});

	it('no-ops when the emails folder does not exist', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svelte-plugin-mail-'));
		tmpDirs.push(root);
		const plugin = email();
		asFunction(plugin.configResolved).call({}, { root } as never);
		// Should not throw despite the missing `src/emails` folder.
		expect(() => runBuildStart(plugin)).not.toThrow();
		expect(fs.existsSync(path.join(root, 'src/emails/index.ts'))).toBe(false);
	});

	it('honors a custom index output path', () => {
		const { root } = makeProject({ 'welcome.svelte': '<a>x</a>' });
		const plugin = email({ index: 'src/generated/emails.ts' });
		asFunction(plugin.configResolved).call({}, { root } as never);
		runBuildStart(plugin);

		const customPath = path.join(root, 'src/generated/emails.ts');
		expect(fs.existsSync(customPath)).toBe(true);
		expect(fs.readFileSync(customPath, 'utf8')).toContain(
			`welcome: (props: ComponentProps<typeof Welcome>)`
		);
	});
});

describe('email — tailwind auto-detect', () => {
	const tmpDirs: string[] = [];

	afterEach(() => {
		for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
	});

	/** Temp root with a Tailwind entry and an emails folder; returns the root. */
	function makeRoot(appCss: string | null): string {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sek-detect-'));
		tmpDirs.push(root);
		fs.mkdirSync(path.join(root, 'src/emails'), { recursive: true });
		if (appCss !== null) fs.writeFileSync(path.join(root, 'src/app.css'), appCss);
		return root;
	}

	async function transformAt(root: string, plugin: Plugin, code: string) {
		asFunction(plugin.configResolved).call({}, { root } as never);
		const transform = asFunction(plugin.transform);
		return (await transform.call({} as never, code, path.join(root, 'src/emails/brand.svelte'))) as
			| { code: string }
			| null
			| undefined;
	}

	it('bakes a custom-theme class by detecting src/app.css', async () => {
		const root = makeRoot(`@import "tailwindcss";\n@theme { --color-brand: #6d28d9; }\n`);
		const out = await transformAt(root, email({ forgiving: false }), '<a class="text-brand">x</a>');
		expect(out!.code).toContain('style="color:#6d28d9;"');
	});

	it('skips detection (default theme only) when tailwind:false', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const root = makeRoot(`@import "tailwindcss";\n@theme { --color-brand: #6d28d9; }\n`);
			const out = await transformAt(
				root,
				email({ forgiving: false, tailwind: false }),
				'<a class="text-brand">x</a>'
			);
			// Unknown utility → not inlined, left as a class.
			expect(out!.code).not.toContain('#6d28d9');
			expect(out!.code).toContain('class="text-brand"');
		} finally {
			warn.mockRestore();
		}
	});
});
