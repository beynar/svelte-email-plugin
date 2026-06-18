<script lang="ts">
	import { Html, Head, Body, Container, Section, Heading, Text, Button } from '$lib/index.js';

	interface Props {
		/** The recipient's display name. */
		name?: string;
	}

	let { name = 'there' }: Props = $props();
</script>

<Html lang="en" dir="ltr">
	<Head />
	<Body class="bg-slate-100 p-6">
		<Container class="bg-white rounded-2xl p-8">
			<Section>
				<Heading as="h1" class="text-2xl font-bold text-slate-900 sm:text-3xl">
					Built at compile time, {name}.
				</Heading>
				<Text class="text-base text-slate-600">
					These styles were authored as Tailwind utility classes and baked into inline styles by the <code
						>svelte-email-plugin/vite</code
					>
					plugin at build time — the runtime is plain
					<code>render()</code>, with no Tailwind in sight.
				</Text>
				<Section class="bg-blue-500/10 rounded-xl p-5 my-6">
					<Text class="text-sm text-slate-700">
						This callout uses an opacity modifier (<code>bg-blue-500/10</code>) that bakes to an
						<code>rgba()</code> background — no runtime color machinery required.
					</Text>
				</Section>
				<Button
					href="https://example.com/get-started"
					class="bg-blue-600 text-white rounded-lg px-6 py-3 hover:bg-blue-700"
				>
					Get started
				</Button>
			</Section>
		</Container>
	</Body>
</Html>
