# svelte-plugin-mail

Build and send email-client-safe HTML emails with Svelte 5 components. A Vite plugin compiles a folder of `.svelte` emails — baking Tailwind classes to inline styles and generating a typed registry — so sending is one call returning `[html, text]`.

![Svelte 5](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![Tailwind v4](<https://img.shields.io/badge/Tailwind-v4_(build--time)-38BDF8?logo=tailwindcss&logoColor=white>)
![License MIT](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- **Build-time Vite plugin** — point it at a folder; Tailwind classes bake to inline styles, variants hoist into `<Head>`. No Tailwind/PostCSS/HTML-parser at runtime.
- **Typed registry** — the plugin writes `<dir>/index.ts`; `const [html, text] = await emails.welcome({ name })`, props inferred per component, sub-folders mirrored as nested objects.
- **Forgiving authoring** — write plain HTML (`<section>`, `<p>`, `<a>`, `<h1>`…); native tags are remapped to components and `<Html>`/`<Head>`/`<Body>` + imports are injected.
- **18 components** — Html, Head, Body, Container, Section, Row, Column, Text, Heading, Link, Button, Img, Hr, Preview, Font, Markdown, CodeInline, CodeBlock.
- **Outlook-ready** — Button MSO padding hack, Preview inbox padding, Font `@font-face` + fallback.
- **`render()` → `[html, text]`** — complete XHTML document + plain-text alternative, in one call.
- **Typed CSS-in-JS** — `style={{ color: 'red' }}` checked via `csstype`, plus `m`/`mx`/`my`… margin shorthands.

---

## Install

```sh
pnpm add svelte-plugin-mail            # peer: svelte@^5
pnpm add -D tailwindcss@^4 postcss   # build-time only (Tailwind baking)
```

`marked` (Markdown) and `prismjs` (CodeBlock) are bundled.

## Setup

Add the plugin. It's `enforce: 'pre'`, so it bakes before vite-plugin-svelte regardless of array position.

```ts
// vite.config.ts
import { email } from 'svelte-plugin-mail/vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default {
	plugins: [email({ dir: 'src/emails' }), sveltekit()]
};
```

Options:

| Option         | Default          | Description                                                                                                                                                                  |
| -------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dir`          | `'src/emails'`   | Folder whose `.svelte` files are compiled.                                                                                                                                   |
| `index`        | `<dir>/index.ts` | Generated registry path.                                                                                                                                                     |
| `importSource` | package name     | Module the registry + injected imports point at. Use `'$lib/index.js'` inside this repo.                                                                                     |
| `tailwind`     | auto-detect      | Your `@theme`/`@config` is auto-detected from the project's CSS entry. `false` for the default theme only; `{ entry }` or `{ css }` to override (see [Tailwind](#tailwind)). |
| `forgiving`    | `true`           | Native-tag remapping + wrapper injection (see [Forgiveness](#forgiveness)).                                                                                                  |
| `preview`      | off              | `{ enabled, port }` — a dev preview server listing every email in `dir`.                                                                                                     |

## Write an email

Everything under `dir` is compiled. Use the components:

```svelte
<!-- src/emails/welcome.svelte -->
<script lang="ts">
	import { Html, Head, Preview, Body, Container, Heading, Text, Button } from 'svelte-plugin-mail';

	let { name = 'there' }: { name?: string } = $props();
</script>

<Html lang="en">
	<Head />
	<Body class="bg-slate-100 font-sans">
		<Preview children="Welcome to Acme — let's get you set up." />
		<Container class="bg-white rounded-2xl p-8">
			<Heading as="h1" class="text-2xl font-bold text-slate-900">Welcome, {name}!</Heading>
			<Text class="text-slate-600">Thanks for signing up.</Text>
			<Button href="https://example.com/start" class="bg-blue-600 text-white rounded-lg px-6 py-3">
				Get started
			</Button>
		</Container>
	</Body>
</Html>
```

Or write plain HTML and let [forgiveness](#forgiveness) wrap it and remap the tags:

```svelte
<!-- src/emails/welcome.svelte — no wrappers, no imports -->
<section class="bg-slate-100 p-6">
	<h1 class="text-2xl font-bold">Welcome, Ada!</h1>
	<p class="text-slate-600">Thanks for signing up.</p>
	<a href="https://example.com/start" class="text-blue-600">Get started</a>
</section>
```

Tailwind classes only bake inside the plugin's `dir`. Elsewhere, use inline `style={{ … }}`.

## Send

The plugin writes a typed `src/emails/index.ts` (gitignore it). Call by name — props are type-checked, and you get back `[html, text]`:

```ts
import { emails } from './emails';

const [html, text] = await emails.welcome({ name: 'Ada' });
```

File names become camelCase keys, and **sub-folders are mirrored as nested objects** — the folder layout _is_ the API:

```
src/emails/
├─ welcome.svelte                 → emails.welcome(props)
├─ order-receipt.svelte           → emails.orderReceipt(props)
└─ auth/
   └─ password/
      └─ reset-password.svelte    → emails.auth.password.resetPassword(props)
```

Each call returns `[html, text]` — hand them to any provider:

<details open>
<summary><b>Resend</b></summary>

```ts
import { Resend } from 'resend';
import { emails } from './emails';

const resend = new Resend(process.env.RESEND_API_KEY);
const [html, text] = await emails.welcome({ name: 'Ada' });
await resend.emails.send({
	from: 'Acme <hello@acme.com>',
	to: 'ada@example.com',
	subject: 'Welcome',
	html,
	text
});
```

</details>

<details>
<summary><b>Cloudflare Workers (Email Sending binding)</b></summary>

`wrangler.jsonc`: `{ "send_email": [{ "name": "EMAIL" }] }`, with a domain onboarded via `wrangler email sending enable yourdomain.com`.

```ts
// SvelteKit +server.ts on Cloudflare Workers
import { emails } from '../emails';

export const GET = async ({ platform }) => {
	const [html, text] = await emails.welcome({ name: 'Ada' });
	await platform.env.EMAIL.send({
		to: 'ada@example.com',
		from: { email: 'hello@yourdomain.com', name: 'Acme' },
		subject: 'Welcome',
		html,
		text
	});
	return new Response('sent');
};
```

</details>

<details>
<summary><b>Nodemailer / SMTP</b></summary>

```ts
import nodemailer from 'nodemailer';
import { emails } from './emails';

const transporter = nodemailer.createTransport({
	host: 'smtp.example.com',
	port: 587,
	auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
const [html, text] = await emails.welcome({ name: 'Ada' });
await transporter.sendMail({
	from: 'Acme <hello@acme.com>',
	to: 'ada@example.com',
	subject: 'Welcome',
	html,
	text
});
```

</details>

## Forgiveness

On by default, inside the plugin's `dir`. It lets you author emails loosely:

- **Missing `<Html>`/`<Head>`/`<Body>` are injected** (so every email is a complete document, and variant classes always have a `<Head>` to hoist into).
- **Native tags are remapped to components:** `html`/`head`/`body`, `section`→`Section`, `div`→`Container`, `p`→`Text`, `hr`→`Hr`, `a`→`Link`, `img`→`Img`, `h1`–`h6`→`Heading`. `span` and `table` stay native. Components that need props (`Button`, `Font`, `CodeBlock`, `Markdown`, `Preview`) are never auto-mapped — use them explicitly.
- **Imports for remapped/injected components are added** to the email's `<script>`.

Tune it via the `forgiving` option:

```ts
email({ dir: 'src/emails', forgiving: false }); // off
email({ dir: 'src/emails', forgiving: { wrap: false } }); // remap only, no wrapper injection
email({ dir: 'src/emails', forgiving: { remap: { tags: { table: 'Section', a: false } } } }); // override the table
```

## `render(component, props?, options?)`

The registry is sugar over `render()`. Call it directly on any component:

```ts
import { render } from 'svelte-plugin-mail';
import Welcome from './emails/welcome.svelte';

const [html, text] = await render(Welcome, { name: 'Ada' }); // RenderResult = [html: string, text: string]
```

- `html` — full XHTML document (`<!DOCTYPE …>` + `<html>…</html>`), SSR hydration markers stripped, MSO comments preserved.
- `text` — plain-text alternative (`html-to-text`); skips `<img>` and the hidden `<Preview>`.

Destructure what you need: `const [html] = …` or `const [, text] = …`. The only option is `htmlToTextOptions`, forwarded to `html-to-text` for the text part.

Helpers: `toPlainText(html, options?)`, `cleanSvelteMarkup(html)`, `styleToString`, `mergeStyle`, `withMargin`, `parsePadding`, `pxToPt`. The `svelte-plugin-mail/render` subpath imports only the render pipeline (no components).

## Components

Every component takes a `style` prop (a `CSSProperties` object or raw string) and passes extra attributes (`id`, `data-*`, `align`, …) through to the element.

| Component    | Renders                  | Notes                                                                                                                                                                                          |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Html`       | `<html>`                 | `lang` (`"en"`), `dir` (`"ltr"`).                                                                                                                                                              |
| `Head`       | `<head>`                 | Real `<head>` (not `<svelte:head>`). Emits `Content-Type` + `x-apple-disable-message-reformatting` meta; hosts `<Font>` and hoisted Tailwind `<style>`.                                        |
| `Body`       | `<body>`                 | Passthrough + `style`.                                                                                                                                                                         |
| `Container`  | `<table>`                | Centered table, `max-width:37.5em`.                                                                                                                                                            |
| `Section`    | `<table>`                | Full-width table.                                                                                                                                                                              |
| `Row`        | `<table>`/`<tr>`         | Children are the row's cells (use `Column`).                                                                                                                                                   |
| `Column`     | `<td>`                   | `align`, `valign`; width via `style`.                                                                                                                                                          |
| `Text`       | `<p>`                    | Defaults `font-size:14px; line-height:24px; margin:16px 0`. Margin shorthands `m`/`mx`/`my`/`mt`/`mr`/`mb`/`ml`.                                                                               |
| `Heading`    | `<h1>`–`<h6>`            | `as` selects the level (`"h1"`). Margin shorthands.                                                                                                                                            |
| `Link`       | `<a>`                    | `href`, `target` (`"_blank"`). Defaults `color:#067df7; text-decoration:none`.                                                                                                                 |
| `Button`     | `<a>`                    | MSO padding hack via `style.padding` (hidden `<i>` in `<!--[if mso]>…<![endif]-->`). `target` `"_blank"`.                                                                                      |
| `Img`        | `<img>`                  | `src`, `alt`, `width`, `height`. Defaults `display:block; outline:none; border:none`.                                                                                                          |
| `Hr`         | `<hr>`                   | Defaults `border-top:1px solid #eaeaea; margin:26px 0`.                                                                                                                                        |
| `Preview`    | hidden `<div>`           | Place as the **first child of `<Body>`**. `children` is a **string**. Truncated to ~150 chars, padded with invisible Unicode. Skipped in plain text.                                           |
| `Font`       | `<style>` (`@font-face`) | `fontFamily`, `fallbackFontFamily`, `webFont` (`{ url, format }`), `fontStyle`, `fontWeight`. Place inside `<Head>`.                                                                           |
| `Markdown`   | many elements            | `children` is a **Markdown source string**. `markdownCustomStyles` / `markdownContainerStyles`.                                                                                                |
| `CodeInline` | `<code>` + `<span>`      | Inline code with the Orange.fr fallback (needs a `<Head>` with `<meta>`).                                                                                                                      |
| `CodeBlock`  | `<pre>`/`<code>`         | Prism syntax highlighting. `code`, `language`, `theme` (use the exported `xonokai`), `lineNumbers`, `fontFamily`. Languages beyond Prism's defaults must be loaded via `prismjs/components/*`. |

```svelte
<Head>
	<Font
		fontFamily="Roboto"
		fallbackFontFamily="Verdana"
		webFont={{
			url: 'https://fonts.gstatic.com/s/roboto/v30/Roboto-Regular.woff2',
			format: 'woff2'
		}}
	/>
</Head>

<CodeBlock code={`const x = 1;`} language="javascript" theme={xonokai} lineNumbers />
```

## Tailwind

Classes resolve to email-safe values at build (`oklch()`→`rgb()`, opacity modifiers→`rgba()`, `calc()`/`rem`→`px`, logical→physical, `rounded-full`→`9999px`) and inline; variants (`sm:`, `hover:`, …) hoist into `<Head>` as a `<style>`.

Your custom theme is picked up automatically: the plugin finds your CSS entry (`src/app.css`-style, or a scan of `src/`) and feeds its `@theme` / `@config` / `@plugin` to the baker, so `text-brand`, custom fonts, and custom spacing resolve with no config. Override with `tailwind: { entry: 'src/email.css' }` or `tailwind: { css: '@theme { … }' }`; disable with `tailwind: false`.

Class names must be statically extractable — static or conditional-literal:

```svelte
<Section class="bg-blue-500 px-4 rounded-lg" />
<!-- ok: static -->
<Text class={isError ? 'text-red-500' : 'text-slate-600'} />
<!-- ok: conditional literal -->
<Text class="px-4 {compact ? 'py-1' : 'py-3'}" />
<!-- ok: literal branches -->
<Text class={'bg-' + color} />
<!-- build error: names file + line:column -->
```

Variant classes need a `<Head>` to hoist into (forgiveness injects one). Hoisted rules are emitted `!important` so a variant reliably overrides the base utility it was inlined from (e.g. `text-2xl sm:text-3xl` resizes as expected).

## Svelte 5 notes

- Components use `$props()` and `{@render children?.()}` — no slots.
- `render()` strips `svelte/server` hydration markers (`<!--[-->`, `<!---->`, `onload="this.__e=event"`, …) while preserving Outlook MSO comments. It returns a `Promise` and awaits Svelte's `PromiseLike` server output, so async components work.

## License

MIT
