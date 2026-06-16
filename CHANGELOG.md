# Changelog

All notable changes to `svelte-email-kit` are documented here. This project adheres to [Semantic Versioning](https://semver.org/).

## 0.1.1 — 2026-06-17

### Changed

- First release published via GitHub Actions **trusted publishing** (npm OIDC) with build **provenance**. No functional changes from `0.1.0`.

## 0.1.0 — 2026-06-17

Initial release: a Svelte 5 port of [react-email](https://github.com/resend/react-email) for building and rendering email-safe HTML emails.

### Added

- **19 components**, importable from `svelte-email-kit`, matching react-email's names and behavior:
  - Layout: `Html`, `Head`, `Body`, `Container`, `Section`, `Row`, `Column`.
  - Content: `Text`, `Heading`, `Link`, `Button` (with the Outlook MSO padding hack), `Img`, `Hr`, `Preview`.
  - Head/metadata: `Font` (emits an `@font-face` + global fallback rule for use inside `<Head>`).
  - Rich content: `Markdown`, `CodeInline`, `CodeBlock` (Prism-based syntax highlighting) plus the exported `xonokai` theme.
- **`render(component, props?, options?)`** — returns an `[html, text]` tuple: a complete XHTML 1.0 Transitional email document (Svelte 5 SSR hydration markers stripped, MSO conditional comments preserved) and a plain-text alternative (via `html-to-text`, skipping images and the hidden `<Preview>` node), in one call. Option: `htmlToTextOptions`.
- **`toPlainText()`** (`html-to-text`, skipping images and the hidden `<Preview>` node) standalone helper, plus `cleanSvelteMarkup()`.
- **Typed style API** via `csstype` (`style={{ color: 'red' }}` or a raw string), margin/padding shorthands, and the `styleToString`/`mergeStyle`/`withMargin`/`parsePadding`/`pxToPt` helpers.
- A dedicated **`svelte-email-kit/render` subpath export** for the render pipeline.
- **`svelte-email-kit/vite` plugin** — build-time Tailwind support. An `enforce: 'pre'` Vite transform bakes Tailwind v4 utility classes into inline styles (and hoists responsive/stateful rules into a `<Head>` `<style>`) before the Svelte compiler runs, so the runtime stays plain `render()` with no Tailwind, PostCSS, or HTML parser. It also generates a typed `emails` registry (`emails.welcome(props)`, props derived via `ComponentProps`), re-bakes with working HMR in dev, and **fails the build** on dynamic/composed class names (only static and conditional-literal classes are allowed), pointing at the offending file and `line:column`.
- Example templates (welcome, receipt, OTP, plus a Tailwind demo dogfooding the plugin) and a SvelteKit preview playground.

### Changed

- **Tailwind moves to build time.** The Tailwind v4 value resolvers and class→style map generation now live in build-only internal modules; Tailwind support is becoming a build-time Vite plugin (`svelte-email-kit/vite`) rather than a runtime transform. See `PRECOMPILE-PLAN.md`.

### Removed

- **Runtime Tailwind path.** Removed the `{ tailwind: true }` render option, the standalone `tailwindToInlineStyles()` helper, and the `TailwindOptions` type. The runtime `render()` no longer processes Tailwind, and `svelte-email-kit`'s runtime no longer depends on `tailwindcss`, `postcss`, or `node-html-parser` (those `tailwindcss`/`postcss`/`node-html-parser` peer dependencies are dropped; `tailwindcss`/`postcss` move to the upcoming Vite plugin's build-time deps).
