<script lang="ts">
	import {
		Html,
		Head,
		Preview,
		Body,
		Container,
		Section,
		Heading,
		Text,
		Link,
		Hr
	} from '$lib/index.js';

	interface Props {
		/** The one-time passcode to display. */
		code?: string;
	}

	let { code = '328 914' }: Props = $props();

	const main = { backgroundColor: '#f6f9fc', fontFamily: 'sans-serif', padding: '24px 0' };
	const container = {
		backgroundColor: '#ffffff',
		border: '1px solid #f0f0f0',
		borderRadius: '8px',
		padding: '32px',
		margin: '0 auto',
		textAlign: 'center' as const
	};
	const heading = { fontSize: '22px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 8px' };
	const paragraph = { fontSize: '15px', lineHeight: '24px', color: '#444444' };
	const codeBox = {
		backgroundColor: '#f4f7fa',
		borderRadius: '8px',
		margin: '24px 0',
		padding: '20px 0'
	};
	const codeText = {
		fontSize: '36px',
		fontWeight: '700',
		letterSpacing: '8px',
		color: '#067df7',
		margin: '0',
		fontFamily: 'SFMono-Regular,Menlo,Monaco,Consolas,monospace'
	};
	const footer = { fontSize: '13px', lineHeight: '20px', color: '#8898aa' };
</script>

<Html lang="en" dir="ltr">
	<Head />
	<Body style={main}>
		<Preview children="Your Acme verification code" />
		<Container style={container}>
			<Section>
				<Heading as="h1" style={heading}>Verify your sign-in</Heading>
				<Text style={paragraph}>
					Enter this code to finish signing in. It expires in 10 minutes.
				</Text>
				<Section style={codeBox}>
					<Heading as="h2" style={codeText}>{code}</Heading>
				</Section>
				<Text style={paragraph}>
					If you didn't request this code, you can safely ignore this email — someone may have typed
					your address by mistake.
				</Text>
			</Section>
			<Hr style={{ margin: '24px 0' }} />
			<Section>
				<Text style={footer}>
					Need help? <Link href="https://example.com/support">Contact support</Link>.
				</Text>
				<Text style={footer}>Acme Inc. · 123 Market St · San Francisco, CA</Text>
			</Section>
		</Container>
	</Body>
</Html>
