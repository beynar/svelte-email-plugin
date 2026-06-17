<script lang="ts">
	import {
		Html,
		Head,
		Font,
		Preview,
		Body,
		Container,
		Section,
		Row,
		Column,
		Heading,
		Text,
		Link,
		Button,
		Img,
		Hr
	} from '$lib/index.js';

	interface Props {
		name: string;
	}

	let { name }: Props = $props();
</script>

<Html lang="en" dir="ltr">
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
	<Body style={{ backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}>
		<Preview children="HIDDEN_PREVIEW_TEXT — welcome to svelte-email-kit." />
		<Container>
			<Section>
				<Row>
					<Column>
						<Img
							src="https://svelte.dev/favicon.png"
							alt="svelte-email-kit"
							width={48}
							height={48}
						/>
						<Heading as="h1">Welcome, {name}!</Heading>
						<Text>Thanks for joining svelte-email-kit. We're glad you're here.</Text>
						<Button
							href="https://example.com/get-started"
							style={{
								padding: '12px 20px',
								backgroundColor: '#067df7',
								color: '#fff',
								borderRadius: '4px'
							}}
						>
							Get started
						</Button>
						<Hr />
						<Text>
							Questions? <Link href="https://example.com/help">Visit our help center</Link>.
						</Text>
					</Column>
				</Row>
			</Section>
		</Container>
	</Body>
</Html>
