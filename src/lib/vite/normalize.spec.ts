import { describe, it, expect } from 'vitest';
import { parse } from 'svelte/compiler';
import { normalizeEmail, DEFAULT_REMAP_TABLE, type NormalizeOptions } from './normalize.js';

const SOURCE = 'svelte-email-plugin';

function opts(over: Partial<NormalizeOptions> = {}): NormalizeOptions {
	return {
		wrap: true,
		remap: true,
		remapTable: DEFAULT_REMAP_TABLE,
		importSource: SOURCE,
		...over
	};
}

/** Full forgiveness (remap + wrap). */
const full = (src: string) => normalizeEmail(src, 'Email.svelte', opts());
/** Remap only (no wrapper injection) — to isolate tag rewriting. */
const remapOnly = (src: string) => normalizeEmail(src, 'Email.svelte', opts({ wrap: false }));
/** Wrap only (no remapping) — to isolate structural injection. */
const wrapOnly = (src: string) => normalizeEmail(src, 'Email.svelte', opts({ remap: false }));

/** Assert the output still parses as valid Svelte. */
function expectParses(code: string) {
	expect(() => parse(code, { modern: true })).not.toThrow();
}

describe('normalizeEmail — remap', () => {
	it('renames a non-void element open + close tag', () => {
		const { code, changed } = remapOnly('<section>hi</section>');
		expect(changed).toBe(true);
		expect(code).toContain('<Section>hi</Section>');
		expect(code).not.toMatch(/<section|<\/section>/);
		expectParses(code);
	});

	it('remaps nested same-name elements independently', () => {
		const { code } = remapOnly('<section><section>x</section></section>');
		expect(code).toContain('<Section><Section>x</Section></Section>');
		expectParses(code);
	});

	it('maps p → Text, div → Container', () => {
		expect(remapOnly('<p>x</p>').code).toContain('<Text>x</Text>');
		expect(remapOnly('<div>x</div>').code).toContain('<Container>x</Container>');
	});

	it('self-closes a void element written without a slash (<hr> → <Hr/>)', () => {
		const { code } = remapOnly('<hr>');
		expect(code).toContain('<Hr/>');
		expect(code).not.toMatch(/<Hr>(?!\/)/);
		expectParses(code);
	});

	it('keeps the slash on a self-closing void element (<hr/> → <Hr/>)', () => {
		expect(remapOnly('<hr/>').code).toContain('<Hr/>');
		expect(remapOnly('<hr />').code).toContain('<Hr />');
	});

	it('self-closes <img> and preserves its attributes', () => {
		const { code } = remapOnly('<img src="logo.png" alt="Logo">');
		expect(code).toContain('<Img src="logo.png" alt="Logo"/>');
		expectParses(code);
	});

	it('maps h1–h6 to <Heading as="hN">', () => {
		for (const n of [1, 2, 3, 4, 5, 6]) {
			const { code } = remapOnly(`<h${n}>Title</h${n}>`);
			expect(code).toContain(`<Heading as="h${n}">Title</Heading>`);
			expectParses(code);
		}
	});

	it('carries the as attribute alongside existing attributes', () => {
		const { code } = remapOnly('<h2 class="big" id="t">Hi</h2>');
		expect(code).toContain('<Heading as="h2" class="big" id="t">Hi</Heading>');
	});

	it('maps <a> to Link, with and without href', () => {
		expect(remapOnly('<a href="https://x.com">x</a>').code).toContain(
			'<Link href="https://x.com">x</Link>'
		);
		expect(remapOnly('<a>x</a>').code).toContain('<Link>x</Link>');
	});

	it('leaves span and table native (not in the table)', () => {
		expect(remapOnly('<span>x</span>').changed).toBe(false);
		expect(remapOnly('<table><tr><td>x</td></tr></table>').code).toContain('<table>');
	});

	it('preserves class / style / event / spread attributes through a remap', () => {
		const { code } = remapOnly(
			'<p class="text-red-500" style="color:blue" onclick={go} {...rest}>x</p>'
		);
		expect(code).toContain(
			'<Text class="text-red-500" style="color:blue" onclick={go} {...rest}>x</Text>'
		);
	});

	it('does NOT remap native tags inside an {@html} string', () => {
		const { code } = remapOnly(`<div>{@html '<p>raw</p>'}</div>`);
		expect(code).toContain('<Container>');
		expect(code).toContain(`{@html '<p>raw</p>'}`); // inner <p> untouched
	});

	it('remaps tags inside {#if} / {#each} / {#snippet} fragments', () => {
		expect(remapOnly('{#if x}<p>a</p>{/if}').code).toContain('<Text>a</Text>');
		expect(remapOnly('{#each items as i}<hr>{/each}').code).toContain('<Hr/>');
	});

	it('honors a custom remap table (table → Section, a disabled)', () => {
		const res = normalizeEmail(
			'<table>x</table><a>y</a>',
			'E.svelte',
			opts({ wrap: false, remapTable: { ...DEFAULT_REMAP_TABLE, table: 'Section', a: false } })
		);
		expect(res.code).toContain('<Section>x</Section>');
		expect(res.code).toContain('<a>y</a>'); // a disabled → native
	});
});

describe('normalizeEmail — import injection', () => {
	it('injects one combined import for introduced components (no script)', () => {
		const { code } = remapOnly('<section><p>x</p></section>');
		expect(code).toMatch(
			/<script>\s*import \{ Section, Text \} from 'svelte-email-plugin';\s*<\/script>/
		);
	});

	it('prepends into an existing instance <script>', () => {
		const { code } = remapOnly(`<script lang="ts">\n\tconst x = 1;\n</script>\n<p>{x}</p>`);
		expect(code).toContain(`import { Text } from 'svelte-email-plugin';`);
		expect(code).toContain('const x = 1;');
		// only one <script> in the output
		expect(code.match(/<script/g)?.length).toBe(1);
	});

	it('does not re-import a component already imported by its own name', () => {
		const src = `<script>\n\timport { Text } from 'svelte-email-plugin';\n</script>\n<p>x</p>`;
		const { code } = remapOnly(src);
		expect(code.match(/import \{ Text \}/g)?.length).toBe(1);
	});

	it('adds the canonical name even when the user aliased it', () => {
		const src = `<script>\n\timport { Text as T } from 'svelte-email-plugin';\n</script>\n<p>x</p>`;
		const { code } = remapOnly(src);
		// <p> → <Text>, and Text must be imported under its own name to resolve
		expect(code).toContain('<Text>x</Text>');
		expect(code).toContain(`import { Text } from 'svelte-email-plugin';`);
	});

	it('recognizes $lib/index.js as the library source', () => {
		const src = `<script>\n\timport { Section } from '$lib/index.js';\n</script>\n<section><p>x</p></section>`;
		const { code } = remapOnly(src);
		// Section already imported (via $lib) → not re-imported; only Text added
		expect(code).toContain(`import { Text } from 'svelte-email-plugin';`);
		expect(code.match(/import \{ Section \}/g)?.length).toBe(1);
	});

	it('leaves a user import of a non-introduced component intact', () => {
		const src = `<script>\n\timport { Button } from 'svelte-email-plugin';\n</script>\n<p>x</p>`;
		const { code } = remapOnly(src);
		expect(code).toContain(`import { Button } from 'svelte-email-plugin';`);
	});
});

describe('normalizeEmail — wrapping', () => {
	it('wraps a bare template in Html/Head/Body', () => {
		const { code, changed } = wrapOnly('<p>hi</p>');
		expect(changed).toBe(true);
		expect(code).toContain('<Html lang="en" dir="ltr">');
		expect(code).toContain('<Head />');
		expect(code).toMatch(/<Body style="font-family:[^"]+sans-serif"><p>hi<\/p><\/Body>/);
		expect(code).toContain('</Html>');
		expect(code).toContain(`import { Body, Head, Html } from 'svelte-email-plugin';`);
		expectParses(code);
	});

	it('injects only Head when Html present but Head missing', () => {
		const src = `<script>\n\timport { Html, Body } from 'svelte-email-plugin';\n</script>\n<Html>\n\t<Body>x</Body>\n</Html>`;
		const { code } = wrapOnly(src);
		expect(code).toContain('<Head />');
		expect(code).toContain(`import { Head } from 'svelte-email-plugin';`);
		expectParses(code);
	});

	it('wraps non-Head children in Body when Html+Head present but Body missing', () => {
		const src = `<script>\n\timport { Html, Head } from 'svelte-email-plugin';\n</script>\n<Html>\n\t<Head />\n\t<p>x</p>\n</Html>`;
		const { code } = wrapOnly(src);
		expect(code).toContain('<Body style="font-family:');
		expect(code).toContain('</Body>');
		expect(code).toContain('<Head />'); // not double-injected
		expect(code.match(/<Head/g)?.length).toBe(1);
		expectParses(code);
	});

	it('wraps an authored <Body> (no Html) in Html and injects a Head before it', () => {
		const src = `<script>\n\timport { Body } from 'svelte-email-plugin';\n</script>\n<Body>x</Body>`;
		const { code } = wrapOnly(src);
		expect(code).toContain('<Html lang="en" dir="ltr">');
		expect(code).toContain('<Head />');
		expect(code.match(/<Body/g)?.length).toBe(1); // existing Body kept, none added
		expect(code).not.toContain('font-family'); // an authored <Body> is never restyled
		expectParses(code);
	});

	it('keeps an authored top-level Head as an Html-level sibling (no duplicate)', () => {
		const src = `<script>\n\timport { Head } from 'svelte-email-plugin';\n</script>\n<Head />\n<p>x</p>`;
		const { code } = wrapOnly(src);
		expect(code).toContain('<Html lang="en" dir="ltr">');
		expect(code.match(/<Head/g)?.length).toBe(1); // not duplicated
		expect(code).toContain('<Body style="font-family:');
		expectParses(code);
	});

	it('is a no-op when Html/Head/Body are all present', () => {
		const src = `<script>\n\timport { Html, Head, Body } from '$lib/index.js';\n</script>\n<Html>\n\t<Head />\n\t<Body>x</Body>\n</Html>`;
		const res = full(src);
		expect(res.changed).toBe(false);
		expect(res.code).toBe(src);
	});
});

describe('normalizeEmail — combined', () => {
	it('remaps native tags and wraps a fully loose email end-to-end', () => {
		const { code } = full('<section><h1>Hi</h1><p>body</p><hr></section>');
		expect(code).toContain('<Section>');
		expect(code).toContain('<Heading as="h1">Hi</Heading>');
		expect(code).toContain('<Text>body</Text>');
		expect(code).toContain('<Hr/>');
		expect(code).toContain('<Html lang="en" dir="ltr">');
		expect(code).toContain('<Head />');
		expect(code).toContain('<Body style="font-family:');
		expect(code).toContain(
			`import { Body, Head, Heading, Hr, Html, Section, Text } from 'svelte-email-plugin';`
		);
		expectParses(code);
	});

	it('returns the original string unchanged when nothing applies (disabled)', () => {
		const res = normalizeEmail('<p>x</p>', 'E.svelte', opts({ wrap: false, remap: false }));
		expect(res.changed).toBe(false);
		expect(res.code).toBe('<p>x</p>');
	});
});
