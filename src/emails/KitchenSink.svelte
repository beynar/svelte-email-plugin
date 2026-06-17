<script lang="ts">
	import {
		Html,
		Head,
		Body,
		Container,
		Section,
		Row,
		Column,
		Heading,
		Text,
		Hr,
		Button
	} from '$lib/index.js';
</script>

<Html lang="en">
	<Head />
	<Body class="bg-slate-100 p-0 font-sans">
		<Container class="my-6 rounded-2xl bg-white p-0">
			<!-- Header -->
			<Section class="rounded-t-2xl bg-brand px-8 py-7">
				<Heading as="h1" class="m-0 text-3xl font-bold text-white">Tailwind kitchen sink ✨</Heading
				>
				<Text class="m-0 mt-1 text-base text-brand-foreground"
					>Every box below is a baked Tailwind utility.</Text
				>
			</Section>

			<!-- Colors + opacity modifiers -->
			<Section class="px-8 pt-6">
				<Heading as="h2" class="m-0 text-xs font-semibold uppercase tracking-widest text-slate-400"
					>Colors &amp; opacity</Heading
				>
			</Section>
			<Section class="px-8 pb-4 pt-3">
				<Row>
					<Column class="h-14 rounded-l-lg bg-red-500 text-center align-middle text-xs text-white"
						>red-500</Column
					>
					<Column class="h-14 bg-blue-600 text-center align-middle text-xs text-white"
						>blue-600</Column
					>
					<Column class="h-14 bg-emerald-500 text-center align-middle text-xs text-white"
						>emerald-500</Column
					>
					<Column class="h-14 bg-brand text-center align-middle text-xs text-white">brand</Column>
					<Column
						class="h-14 rounded-r-lg bg-blue-600/40 text-center align-middle text-xs text-slate-900"
						>blue-600/40</Column
					>
				</Row>
			</Section>

			<!-- Borders + radii (the @property fix: `border` used to leak var(--tw-border-style)) -->
			<Section class="px-8 pt-4">
				<Heading as="h2" class="m-0 text-xs font-semibold uppercase tracking-widest text-slate-400"
					>Borders &amp; radii</Heading
				>
			</Section>
			<Section class="px-8 pb-4 pt-3">
				<Row>
					<Column class="px-1 align-middle">
						<Section
							class="rounded-md border border-slate-300 p-3 text-center text-xs text-slate-600"
							>border</Section
						>
					</Column>
					<Column class="px-1 align-middle">
						<Section
							class="rounded-md border-2 border-blue-600 p-3 text-center text-xs text-blue-700"
							>border-2</Section
						>
					</Column>
					<Column class="px-1 align-middle">
						<Section
							class="rounded-md border border-dashed border-emerald-500 p-3 text-center text-xs text-emerald-700"
							>dashed</Section
						>
					</Column>
					<Column class="px-1 align-middle">
						<Section class="rounded-full bg-slate-900 p-3 text-center text-xs text-white"
							>rounded-full</Section
						>
					</Column>
				</Row>
			</Section>
			<Section class="px-8 pt-4">
				<Heading as="h2" class="m-0 text-xs font-semibold uppercase tracking-widest text-slate-400"
					>Shadows &amp; rings</Heading
				>
				<Text class="m-0 mt-1 text-xs text-slate-400"
					>(box-shadow: shows in Apple/iOS/Gmail, not Outlook. A <code>ring</code> takes the
					element's text color — Tailwind's separate <code>ring-&lt;color&gt;</code> /
					<code>ring-offset-*</code> classes only set CSS vars and can't be inlined at build time.)</Text
				>
			</Section>
			<Section class="px-8 pb-4 pt-3">
				<Row>
					<Column class="px-2 align-middle">
						<Section class="rounded-lg bg-white p-4 text-center text-xs text-slate-600 shadow-md"
							>shadow-md</Section
						>
					</Column>
					<Column class="px-2 align-middle">
						<Section class="rounded-lg bg-white p-4 text-center text-xs text-slate-600 shadow-xl"
							>shadow-xl</Section
						>
					</Column>
					<Column class="px-2 align-middle">
						<Section class="rounded-lg bg-white p-4 text-center text-xs text-blue-600 ring-2"
							>ring-2 (text-blue-600)</Section
						>
					</Column>
				</Row>
			</Section>

			<Hr class="mx-8 my-2 border-slate-200" />

			<!-- Typography scale + styles -->
			<Section class="px-8 pt-4">
				<Heading as="h2" class="m-0 text-xs font-semibold uppercase tracking-widest text-slate-400"
					>Typography</Heading
				>
				<Text class="mb-0 mt-3 text-xs text-slate-500">text-xs · the smallest</Text>
				<Text class="my-1 text-base text-slate-700">text-base · body copy</Text>
				<Text class="my-1 text-2xl font-bold text-slate-900">text-2xl · bold heading</Text>
				<Text class="my-1 text-base italic text-slate-700">italic</Text>
				<Text class="my-1 text-base font-semibold uppercase tracking-[0.25em] text-slate-700"
					>arbitrary tracking</Text
				>
				<Text class="my-1 text-base text-black/60">text-black/60 (opacity)</Text>
			</Section>

			<Hr class="mx-8 my-2 border-slate-200" />

			<!-- Responsive override — proves hoisted variants beat the inlined base (!important fix) -->
			<Section class="px-8 pb-2 pt-4">
				<Heading as="h2" class="m-0 text-xs font-semibold uppercase tracking-widest text-slate-400"
					>Responsive override (resize me)</Heading
				>
			</Section>
			<Section class="px-8 pb-6 pt-2">
				<Section class="rounded-xl bg-red-500 p-6 text-center sm:bg-emerald-600">
					<Heading as="h3" class="m-0 text-xl font-bold text-white sm:text-3xl"
						>Red on mobile → Green on desktop</Heading
					>
					<Text class="m-0 mt-1 text-sm text-white/90"
						>If this turns green &amp; grows at ≥640px, hoisted <code>sm:</code> variants win.</Text
					>
				</Section>
			</Section>

			<!-- Button -->
			<Section class="px-8 pb-8 pt-0 text-center">
				<Button
					href="https://example.com"
					class="rounded-lg bg-brand px-6 py-3 text-base font-semibold text-white"
				>
					A Tailwind-styled button →
				</Button>
			</Section>
		</Container>
	</Body>
</Html>
