import { render as svelteRender } from 'svelte/server';

/**
 * Options controlling the `render()` output.
 */
export interface RenderOptions {
	/** Passed through to `html-to-text` when producing the plain-text part. */
	htmlToTextOptions?: import('html-to-text').HtmlToTextOptions;
}

/** The `[html, text]` pair returned by {@link render}. */
export type RenderResult = [html: string, text: string];

/** XHTML 1.0 Transitional doctype prepended to every rendered email document. */
const DOCTYPE =
	'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" ' +
	'"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

/**
 * Strip Svelte 5 server-render artifacts that must not appear in email HTML.
 *
 * `svelte/server` always emits hydration comment markers and injects early
 * event-capture handlers (`this.__e=event`) on resource elements like `<body>`
 * and `<img>`. Email clients never hydrate, so these are dead weight at best and
 * non-standard markup at worst. We remove every Svelte hydration comment form:
 *
 * - the empty anchor `<!---->`;
 * - block markers `<!--[-->`, `<!--[!-->` (else), `<!--[?…-->` (failed snippet,
 *   carries escaped JSON), `<!--]-->` (close);
 * - indexed block-open markers `<!--[0-->`, `<!--[12-->`, … (emitted by
 *   `{#if}`/`{#each}` in production);
 * - dev-only `{@html}` hydration hashes `<!--1x4s7i4-->` (lowercase base-36).
 *
 * MSO/conditional comments (`<!--[if mso]>`, `<![endif]-->`, downlevel-revealed
 * variants) are provably preserved: their inner text begins with `[if`, `]>`, or
 * `<![`, none of which match the hydration grammar below.
 *
 * Also removes the injected `onload`/`onerror="this.__e=event"` handlers.
 */
export function cleanSvelteMarkup(html: string): string {
	return html
		.replace(/<!--(?:\[(?:!|\?[\s\S]*?|\d+)?|\]|[a-z0-9]+)?-->/g, '')
		.replace(/ on(?:load|error)="this\.__e=event"/g, '');
}

/**
 * Render a Svelte component to an email, returning `[html, text]`.
 *
 * - `html` — a complete `<!DOCTYPE …><html>…</html>` document built from the
 *   component's `body` output, stripped of Svelte's SSR hydration artifacts via
 *   {@link cleanSvelteMarkup}.
 * - `text` — a plain-text version via {@link toPlainText} (skips images and the
 *   hidden `<Preview>` node).
 *
 * @example
 * const [html, text] = await render(WelcomeEmail, { name: 'Ada' });
 */
export async function render<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	P extends Record<string, any>
>(
	component: import('svelte').Component<P>,
	props?: P,
	options: RenderOptions = {}
): Promise<RenderResult> {
	const { body } = await svelteRender(component, { props: (props ?? {}) as P });
	const markup = cleanSvelteMarkup(body);
	const html = `${DOCTYPE}${markup}`;
	const text = await toPlainText(markup, options.htmlToTextOptions);
	return [html, text];
}

/**
 * Convert an HTML email string to plain text with `html-to-text`.
 *
 * `html-to-text` is lazy-loaded via dynamic `import` so it is only pulled in
 * when plain-text output is requested. Email-friendly defaults are applied and
 * any caller `options` are merged on top (user options win). The default
 * selectors are always included — user selectors are appended after them — so
 * images and the hidden {@link import('./components/Preview.svelte')} node
 * (marked with `data-skip-in-text="true"`) are never emitted as text.
 */
export async function toPlainText(
	html: string,
	options?: import('html-to-text').HtmlToTextOptions
): Promise<string> {
	const { convert } = await import('html-to-text');
	const defaultSelectors: NonNullable<import('html-to-text').HtmlToTextOptions['selectors']> = [
		{ selector: 'img', format: 'skip' },
		{ selector: '[data-skip-in-text="true"]', format: 'skip' }
	];
	return convert(html, {
		// Off by default so long links/URLs aren't hard-wrapped at 80 cols; a caller
		// can re-enable via `htmlToTextOptions`.
		wordwrap: false,
		...options,
		selectors: [...defaultSelectors, ...(options?.selectors ?? [])]
	});
}
