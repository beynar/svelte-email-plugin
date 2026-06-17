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
		/** The recipient's display name. */
		name?: string;
	}

	let { name = 'there' }: Props = $props();

	const main = { backgroundColor: '#f6f9fc', fontFamily: 'sans-serif', padding: '24px 0' };
	const container = {
		backgroundColor: '#ffffff',
		border: '1px solid #f0f0f0',
		borderRadius: '8px',
		padding: '32px',
		margin: '0 auto'
	};
	const heading = { fontSize: '24px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 8px' };
	const paragraph = { fontSize: '15px', lineHeight: '24px', color: '#444444' };
	const button = {
		backgroundColor: '#067df7',
		borderRadius: '6px',
		color: '#ffffff',
		fontSize: '15px',
		fontWeight: '600',
		textAlign: 'center' as const,
		padding: '12px 24px'
	};
	const footer = { fontSize: '13px', lineHeight: '20px', color: '#8898aa' };
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
	<Body style={main}>
		<Preview children="Welcome to Acme — let's get you set up." />
		<Container style={container}>
			<Section>
				<Img
					src="https://svelte.dev/favicon.png"
					alt="Acme"
					width={48}
					height={48}
					style={{ margin: '0 0 16px' }}
				/>
				<Heading as="h1" style={heading}>Welcome, {name}!</Heading>
				<Text style={paragraph}>
					Thanks for signing up for Acme. We're thrilled to have you on board. Click the button
					below to verify your email and start exploring your new account.
				</Text>
				<Section style={{ textAlign: 'center', margin: '24px 0' }}>
					<Button href="https://example.com/get-started" style={button}>Get started</Button>
				</Section>
				<Text style={paragraph}>
					If the button doesn't work, copy and paste this link into your browser:
					<br />
					<Link href="https://example.com/get-started">https://example.com/get-started</Link>
				</Text>
			</Section>
			<Hr style={{ margin: '24px 0' }} />
			<Section>
				<Row>
					<Column>
						<Text style={footer}>
							You're receiving this email because you created an Acme account. If this wasn't you,
							you can safely ignore this message or
							<Link href="https://example.com/unsubscribe">unsubscribe</Link>.
						</Text>
						<Text style={footer}>Acme Inc. · 123 Market St · San Francisco, CA</Text>
					</Column>
				</Row>
			</Section>
		</Container>
	</Body>
</Html>
