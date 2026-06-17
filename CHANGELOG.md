# Changelog

All notable changes to `svelte-plugin-mail` are documented here. This project adheres to [Semantic Versioning](https://semver.org/).

## 0.3.1 — 2026-06-17

Verification release — confirms CI trusted publishing under the renamed package. No code changes.

## 0.3.0 — 2026-06-17

### Changed

- **Renamed to `svelte-plugin-mail`** (was `svelte-email-kit`). Update install + imports: `svelte-plugin-mail`, `svelte-plugin-mail/vite`, `svelte-plugin-mail/render`.
- Internal cleanup only — **no public API or rendered-output changes**. Removed over-engineering surfaced by a repo audit:
  - Replaced two hand-rolled order-preserving dedupe helpers with `[...new Set()]` (`Set` iteration is already insertion-ordered).
  - Consolidated the duplicated recursive email-folder walker into one shared `collectSvelteFiles`, and the duplicated `tokenize` / `escapeHtml` helpers into single shared copies.
  - Dropped 14 dead empty-style entries from the `Markdown` defaults (the renderer already omits empty styles, so behavior is identical).
  - Trimmed the wrapper-injection void-tag set to the tags actually remappable (`hr`, `img`).

## 0.2.0 — 2026-06-17

### Changed

- **`render()` now returns `[html, text]`** instead of a single HTML string — the plain-text alternative comes for free. Destructure at call sites: `const [html, text] = await render(…)`.
- **The Vite plugin export is `email`** (was `svelteMail`): `import { email } from 'svelte-plugin-mail/vite'`.
- `tailwindcss` and `postcss` are now **optional peer dependencies** (only needed when baking Tailwind classes), not direct deps.

### Added

- **Forgiveness mode** (on by default): inside the plugin's folder you can omit `<Html>`/`<Head>`/`<Body>` (they're injected) and author with native HTML tags (`<section>`, `<p>`, `<a>`, `<h1>`, …) that are remapped to components, with the needed imports added automatically.
- **Nested email folders** mirror into a nested registry — `emails/auth/password/reset-password.svelte` → `emails.auth.password.resetPassword(props)`.
- **Tailwind auto-detection**: the plugin finds your CSS entry and feeds its `@theme`/`@config` to the baker, so custom colors/fonts/spacing resolve with no extra config.

### Fixed

- Ported outstanding react-email fixes: `Body` Yahoo/AOL inner-`<td>` wrapper + margin/padding reset, `Link`/`Button` `text-decoration-line` (narrowed reset), `withMargin` merges all margin shorthands, numeric-guarded margin units, `Button` non-`px` padding via `convertToPx`, and `toPlainText` defaulting `wordwrap: false`.
- Tailwind baker: hoisted variant rules emit `!important` (so `sm:`/`hover:` reliably override the inlined base); `@property`-registered defaults are resolved (`border`/`divide-x` no longer leak `var(--tw-*)`); `shadow-*`/`ring-*` resolve from their rule-local custom properties; and `rgb(r g b / a)` alpha is preserved.

## 0.1.1 — 2026-06-17

### Changed

- First release published via GitHub Actions **trusted publishing** (npm OIDC) with build **provenance**. No functional changes from `0.1.0`.

## 0.1.0 — 2026-06-17

Initial release: a Svelte 5 port of [react-email](https://github.com/resend/react-email) for building and rendering email-safe HTML emails.

### Added

- **19 components**, importable from `svelte-plugin-mail`, matching react-email's names and behavior:
  - Layout: `Html`, `Head`, `Body`, `Container`, `Section`, `Row`, `Column`.
  - Content: `Text`, `Heading`, `Link`, `Button` (with the Outlook MSO padding hack), `Img`, `Hr`, `Preview`.
  - Head/metadata: `Font` (emits an `@font-face` + global fallback rule for use inside `<Head>`).
  - Rich content: `Markdown`, `CodeInline`, `CodeBlock` (Prism-based syntax highlighting) plus the exported `xonokai` theme.
- **`render(component, props?, options?)`** — returns an `[html, text]` tuple: a complete XHTML 1.0 Transitional email document (Svelte 5 SSR hydration markers stripped, MSO conditional comments preserved) and a plain-text alternative (via `html-to-text`, skipping images and the hidden `<Preview>` node), in one call. Option: `htmlToTextOptions`.
- **`toPlainText()`** (`html-to-text`, skipping images and the hidden `<Preview>` node) standalone helper, plus `cleanSvelteMarkup()`.
- **Typed style API** via `csstype` (`style={{ color: 'red' }}` or a raw string), margin/padding shorthands, and the `styleToString`/`mergeStyle`/`withMargin`/`parsePadding`/`pxToPt` helpers.
- A dedicated **`svelte-plugin-mail/render` subpath export** for the render pipeline.
- **`svelte-plugin-mail/vite` plugin** — build-time Tailwind support. An `enforce: 'pre'` Vite transform bakes Tailwind v4 utility classes into inline styles (and hoists responsive/stateful rules into a `<Head>` `<style>`) before the Svelte compiler runs, so the runtime stays plain `render()` with no Tailwind, PostCSS, or HTML parser. It also generates a typed `emails` registry (`emails.welcome(props)`, props derived via `ComponentProps`), re-bakes with working HMR in dev, and **fails the build** on dynamic/composed class names (only static and conditional-literal classes are allowed), pointing at the offending file and `line:column`.
- Example templates (welcome, receipt, OTP, plus a Tailwind demo dogfooding the plugin) and a SvelteKit preview playground.

### Changed

- **Tailwind moves to build time.** The Tailwind v4 value resolvers and class→style map generation now live in build-only internal modules; Tailwind support is becoming a build-time Vite plugin (`svelte-plugin-mail/vite`) rather than a runtime transform. See `PRECOMPILE-PLAN.md`.

### Removed

- **Runtime Tailwind path.** Removed the `{ tailwind: true }` render option, the standalone `tailwindToInlineStyles()` helper, and the `TailwindOptions` type. The runtime `render()` no longer processes Tailwind, and `svelte-plugin-mail`'s runtime no longer depends on `tailwindcss`, `postcss`, or `node-html-parser` (those `tailwindcss`/`postcss`/`node-html-parser` peer dependencies are dropped; `tailwindcss`/`postcss` move to the upcoming Vite plugin's build-time deps).
