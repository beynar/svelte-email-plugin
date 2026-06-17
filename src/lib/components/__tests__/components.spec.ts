import { describe, it, expect } from 'vitest';
import { renderToStaticString } from '../../../tests/render.js';
import Html from '../../../tests/fixtures/HtmlCase.svelte';
import Head from '../../../tests/fixtures/HeadCase.svelte';
import Body from '../../../tests/fixtures/BodyCase.svelte';
import Container from '../../../tests/fixtures/ContainerCase.svelte';
import Section from '../../../tests/fixtures/SectionCase.svelte';
import Row from '../../../tests/fixtures/RowCase.svelte';
import Column from '../../../tests/fixtures/ColumnCase.svelte';
import Text from '../../../tests/fixtures/TextCase.svelte';
import Heading from '../../../tests/fixtures/HeadingCase.svelte';
import Link from '../../../tests/fixtures/LinkCase.svelte';
import Img from '../../../tests/fixtures/ImgCase.svelte';
import Hr from '../../../tests/fixtures/HrCase.svelte';

describe('Html', () => {
	it('renders the default markup', async () => {
		expect(await renderToStaticString(Html)).toMatchInlineSnapshot(
			`"<html dir="ltr" lang="en">content</html>"`
		);
	});

	it('applies a style object', async () => {
		const html = await renderToStaticString(Html, { style: { backgroundColor: 'red' } });
		expect(html).toContain('style="background-color:red;"');
		expect(html).toMatchInlineSnapshot(
			`"<html dir="ltr" lang="en" style="background-color:red;">content</html>"`
		);
	});
});

describe('Head', () => {
	it('renders the default markup', async () => {
		expect(await renderToStaticString(Head)).toMatchInlineSnapshot(
			`"<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/> <meta name="x-apple-disable-message-reformatting"/> <title>Subject</title></head>"`
		);
	});
});

describe('Body', () => {
	it('renders the default markup', async () => {
		expect(await renderToStaticString(Body)).toMatchInlineSnapshot(
			`"<body dir="ltr" lang="en"><table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center"><tbody><tr><td dir="ltr" lang="en">content</td></tr></tbody></table></body>"`
		);
	});

	it('applies a style object', async () => {
		const html = await renderToStaticString(Body, { style: { backgroundColor: 'red' } });
		expect(html).toContain('style="background-color:red;"');
		expect(html).toMatchInlineSnapshot(
			`"<body dir="ltr" lang="en" style="background-color:red;"><table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center"><tbody><tr><td dir="ltr" lang="en" style="background-color:red;">content</td></tr></tbody></table></body>"`
		);
	});
});

describe('Container', () => {
	it('renders the default markup', async () => {
		expect(await renderToStaticString(Container)).toMatchInlineSnapshot(
			`"<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:37.5em;"><tbody><tr style="width:100%"><td>content</td></tr></tbody></table>"`
		);
	});

	it('merges a style object after the default max-width', async () => {
		const html = await renderToStaticString(Container, { style: { backgroundColor: 'red' } });
		expect(html).toContain('max-width:37.5em;background-color:red;');
		expect(html).toMatchInlineSnapshot(
			`"<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:37.5em;background-color:red;"><tbody><tr style="width:100%"><td>content</td></tr></tbody></table>"`
		);
	});
});

describe('Section', () => {
	it('renders the default markup', async () => {
		expect(await renderToStaticString(Section)).toMatchInlineSnapshot(
			`"<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"><tbody><tr><td>content</td></tr></tbody></table>"`
		);
	});

	it('applies a style object', async () => {
		const html = await renderToStaticString(Section, { style: { backgroundColor: 'red' } });
		expect(html).toContain('style="background-color:red;"');
		expect(html).toMatchInlineSnapshot(
			`"<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:red;"><tbody><tr><td>content</td></tr></tbody></table>"`
		);
	});
});

describe('Row', () => {
	it('renders the default markup', async () => {
		expect(await renderToStaticString(Row)).toMatchInlineSnapshot(
			`"<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"><tbody style="width:100%"><tr style="width:100%"><td>content</td></tr></tbody></table>"`
		);
	});

	it('applies a style object', async () => {
		const html = await renderToStaticString(Row, { style: { backgroundColor: 'red' } });
		expect(html).toContain('style="background-color:red;"');
		expect(html).toMatchInlineSnapshot(
			`"<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:red;"><tbody style="width:100%"><tr style="width:100%"><td>content</td></tr></tbody></table>"`
		);
	});
});

describe('Column', () => {
	it('renders the default markup', async () => {
		expect(await renderToStaticString(Column)).toMatchInlineSnapshot(
			`"<td align="center" valign="top">content</td>"`
		);
	});

	it('applies a style object', async () => {
		const html = await renderToStaticString(Column, { style: { backgroundColor: 'red' } });
		expect(html).toContain('style="background-color:red;"');
		expect(html).toMatchInlineSnapshot(
			`"<td align="center" valign="top" style="background-color:red;">content</td>"`
		);
	});
});

describe('Text', () => {
	it('renders the default markup', async () => {
		expect(await renderToStaticString(Text)).toMatchInlineSnapshot(
			`"<p style="font-size:14px;line-height:24px;margin:16px 0;">content</p>"`
		);
	});

	it('merges a style object after the defaults', async () => {
		const html = await renderToStaticString(Text, { style: { color: 'blue' } });
		expect(html).toContain('font-size:14px;line-height:24px;margin:16px 0;color:blue;');
		expect(html).toMatchInlineSnapshot(
			`"<p style="font-size:14px;line-height:24px;margin:16px 0;color:blue;">content</p>"`
		);
	});
});

describe('Heading', () => {
	it('renders an h1 with no default styles', async () => {
		expect(await renderToStaticString(Heading)).toMatchInlineSnapshot(`"<h1>content</h1>"`);
	});

	it('selects the tag via `as` and applies a margin shorthand', async () => {
		const html = await renderToStaticString(Heading, { as: 'h2', m: 16 });
		expect(html).toContain('style="margin:16px;"');
		expect(html).toMatchInlineSnapshot(`"<h2 style="margin:16px;">content</h2>"`);
	});
});

describe('Link', () => {
	it('renders with the default link colors and target', async () => {
		expect(await renderToStaticString(Link, { href: 'https://example.com' })).toMatchInlineSnapshot(
			`"<a href="https://example.com" target="_blank" style="color:#067df7;text-decoration-line:none;">content</a>"`
		);
	});

	it('merges a style object after the defaults', async () => {
		const html = await renderToStaticString(Link, {
			href: 'https://example.com',
			style: { color: 'red' }
		});
		expect(html).toContain('color:#067df7;text-decoration-line:none;color:red;');
		expect(html).toMatchInlineSnapshot(
			`"<a href="https://example.com" target="_blank" style="color:#067df7;text-decoration-line:none;color:red;">content</a>"`
		);
	});
});

describe('Img', () => {
	it('renders with the default styles', async () => {
		const html = await renderToStaticString(Img, {
			src: 'https://example.com/cat.png',
			alt: 'A cat',
			width: 120,
			height: 80
		});
		expect(html).toContain('display:block;outline:none;border:none;text-decoration:none;');
		expect(html).toMatchInlineSnapshot(
			`"<img src="https://example.com/cat.png" alt="A cat" width="120" height="80" style="display:block;outline:none;border:none;text-decoration:none;"/>"`
		);
	});
});

describe('Hr', () => {
	it('renders with the default styles', async () => {
		expect(await renderToStaticString(Hr)).toMatchInlineSnapshot(
			`"<hr style="width:100%;border:none;border-top:1px solid #eaeaea;margin:26px 0;"/>"`
		);
	});

	it('merges a style object after the defaults', async () => {
		const html = await renderToStaticString(Hr, { style: { borderTop: '2px solid #000' } });
		expect(html).toContain('border-top:1px solid #eaeaea;margin:26px 0;border-top:2px solid #000;');
		expect(html).toMatchInlineSnapshot(
			`"<hr style="width:100%;border:none;border-top:1px solid #eaeaea;margin:26px 0;border-top:2px solid #000;"/>"`
		);
	});
});
