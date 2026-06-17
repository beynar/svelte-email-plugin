<section class="bg-brand-foreground py-10">
	<div class="bg-white p-8 rounded-xl">
		<h1 class="text-brand m-0 text-2xl font-bold">Forgiveness works ✨</h1>
		<p class="text-slate-600">
			This entire email was authored in plain HTML — no <code>&lt;Html&gt;</code>,
			<code>&lt;Head&gt;</code> or <code>&lt;Body&gt;</code>, and not a single import. At build time
			the <code>svelte-plugin-mail</code> plugin remapped every native tag to its component, wrapped
			the document, and injected the imports. The heading and button use the custom
			<code>brand</code> Tailwind token, auto-detected from <code>src/app.css</code>.
		</p>
		<hr />
		<a
			href="https://example.com"
			class="bg-brand inline-block rounded-lg px-5 py-3 font-medium text-white"
		>
			Visit the site &rarr;
		</a>
	</div>
</section>
