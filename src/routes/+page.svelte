<script lang="ts">
	import { resolve } from '$app/paths';

	const examples = [
		{
			href: resolve('/(examples)/welcome'),
			title: 'Welcome',
			desc: 'Onboarding email with a hero image and CTA button.'
		},
		{
			href: resolve('/(examples)/receipt'),
			title: 'Receipt',
			desc: 'Order receipt with a Row/Column line-item table.'
		},
		{
			href: resolve('/(examples)/otp'),
			title: 'OTP',
			desc: 'One-time passcode email with a large code.'
		},
		{
			href: resolve('/(examples)/tailwind'),
			title: 'Tailwind',
			desc: 'Tailwind classes baked to inline styles at build time by the Vite plugin.'
		}
	];
</script>

<main>
	<h1>svelte-email-plugin playground</h1>
	<p>Live previews of the example email templates rendered with <code>render()</code>.</p>
	<ul>
		{#each examples as example (example.href)}
			<li>
				<a href={example.href}>{example.title}</a>
				<span>{example.desc}</span>
			</li>
		{/each}
	</ul>
</main>

<style>
	main {
		max-width: 640px;
		margin: 3rem auto;
		padding: 0 1rem;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
	}
	h1 {
		font-size: 1.75rem;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem 0;
		border-top: 1px solid #eee;
	}
	a {
		font-weight: 600;
		color: #067df7;
		text-decoration: none;
		width: fit-content;
	}
	a:hover {
		text-decoration: underline;
	}
	span {
		color: #666;
		font-size: 0.9rem;
	}
</style>
