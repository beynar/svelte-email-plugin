<script lang="ts">
	import { resolve } from '$app/paths';

	let { data }: { data: { html: string } } = $props();
</script>

<a href={resolve('/')}>&larr; All examples</a>
<h1>Forgiving email (plain HTML in, full email out)</h1>

<iframe srcdoc={data.html} title="Forgiving email preview" style="width:100%;height:90vh;border:0"
></iframe>
