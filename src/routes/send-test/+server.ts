import { json, type RequestHandler } from '@sveltejs/kit';
import type { Component } from 'svelte';
import { render } from '$lib/index.js';
import WelcomeEmail from '../../emails/WelcomeEmail.svelte';
import TailwindDemo from '../../emails/TailwindDemo.svelte';
import OtpEmail from '../../emails/OtpEmail.svelte';
import ReceiptEmail from '../../emails/ReceiptEmail.svelte';

// All example emails take fully-defaulted props, so each renders with `{}`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EMAILS: Record<string, Component<any>> = {
	welcome: WelcomeEmail,
	tailwind: TailwindDemo,
	otp: OtpEmail,
	receipt: ReceiptEmail
};

const DEFAULT_TO = 'arnaud@derbey.dev';
const FROM = { email: 'test@hello.beynar.dev', name: 'svelte-plugin-mail' };

/**
 * Public test endpoint: `GET /send-test?to=<addr>&email=<welcome|tailwind|otp|receipt>`.
 * Renders an svelte-plugin-mail email and sends it via the Cloudflare `EMAIL` binding,
 * returning JSON with the `messageId` on success or the error `code`/`message`.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const to = url.searchParams.get('to') ?? DEFAULT_TO;
	const which = url.searchParams.get('email') ?? 'welcome';
	const Email = EMAILS[which] ?? WelcomeEmail;

	if (!platform?.env?.EMAIL) {
		return json(
			{
				ok: false,
				error:
					'EMAIL binding not available — this route only works when deployed to Cloudflare (or `wrangler dev` with a remote binding).'
			},
			{ status: 500 }
		);
	}

	// `render()` returns `[html, text]`.
	let html: string;
	let text: string;
	try {
		[html, text] = await render(Email, {});
	} catch (e) {
		return json({ ok: false, stage: 'render', error: errorMessage(e) }, { status: 500 });
	}

	try {
		const res = await platform.env.EMAIL.send({
			to,
			from: FROM,
			subject: `svelte-plugin-mail test — ${which}`,
			html,
			text
		});
		return json({ ok: true, to, email: which, messageId: res.messageId });
	} catch (e) {
		const err = e as { code?: string; message?: string };
		return json(
			{ ok: false, stage: 'send', to, from: FROM.email, code: err.code, error: errorMessage(e) },
			{ status: 502 }
		);
	}
};

function errorMessage(e: unknown): string {
	if (e instanceof Error) return e.message;
	return String(e);
}
