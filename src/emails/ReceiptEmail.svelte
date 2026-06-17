<script lang="ts">
	import {
		Html,
		Head,
		Preview,
		Body,
		Container,
		Section,
		Row,
		Column,
		Heading,
		Text,
		Link,
		Hr
	} from '$lib/index.js';

	export interface LineItem {
		/** Product or service name. */
		name: string;
		/** Quantity ordered. */
		quantity: number;
		/** Unit price, formatted with a currency symbol (e.g. "$19.00"). */
		price: string;
	}

	interface Props {
		/** Human-readable order identifier. */
		orderId?: string;
		/** The purchased line items. */
		items?: LineItem[];
		/** Order total, formatted with a currency symbol. */
		total?: string;
	}

	let {
		orderId = 'AC-10428',
		items = [
			{ name: 'Acme Pro (annual)', quantity: 1, price: '$120.00' },
			{ name: 'Priority support add-on', quantity: 1, price: '$36.00' },
			{ name: 'Extra seats', quantity: 3, price: '$45.00' }
		],
		total = '$201.00'
	}: Props = $props();

	const main = { backgroundColor: '#f6f9fc', fontFamily: 'sans-serif', padding: '24px 0' };
	const container = {
		backgroundColor: '#ffffff',
		border: '1px solid #f0f0f0',
		borderRadius: '8px',
		padding: '32px',
		margin: '0 auto'
	};
	const heading = { fontSize: '22px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 4px' };
	const muted = { fontSize: '14px', color: '#8898aa', margin: '0 0 24px' };
	const tableHeader = {
		fontSize: '12px',
		fontWeight: '700',
		textTransform: 'uppercase' as const,
		color: '#8898aa',
		padding: '0 0 8px'
	};
	const cell = { fontSize: '14px', color: '#444444', padding: '8px 0' };
	const cellRight = { ...cell, textAlign: 'right' as const };
	const totalLabel = { fontSize: '15px', fontWeight: '700', color: '#1a1a1a', padding: '8px 0' };
	const totalValue = { ...totalLabel, textAlign: 'right' as const };
	const footer = { fontSize: '13px', lineHeight: '20px', color: '#8898aa' };
</script>

<Html lang="en" dir="ltr">
	<Head />
	<Body style={main}>
		<Preview children={`Your Acme receipt for order ${orderId}`} />
		<Container style={container}>
			<Section>
				<Heading as="h1" style={heading}>Thanks for your order</Heading>
				<Text style={muted}>Order <strong>{orderId}</strong> · Receipt</Text>
			</Section>

			<Section>
				<Row>
					<Column style={{ ...tableHeader, width: '50%' }}>Item</Column>
					<Column style={{ ...tableHeader, textAlign: 'center', width: '20%' }}>Qty</Column>
					<Column style={{ ...tableHeader, textAlign: 'right', width: '30%' }}>Price</Column>
				</Row>
			</Section>

			<Hr style={{ margin: '0 0 8px' }} />

			{#each items as item (item.name)}
				<Section>
					<Row>
						<Column style={{ ...cell, width: '50%' }}>{item.name}</Column>
						<Column style={{ ...cell, textAlign: 'center', width: '20%' }}>{item.quantity}</Column>
						<Column style={{ ...cellRight, width: '30%' }}>{item.price}</Column>
					</Row>
				</Section>
			{/each}

			<Hr style={{ margin: '8px 0' }} />

			<Section>
				<Row>
					<Column style={{ ...totalLabel, width: '70%' }}>Total</Column>
					<Column style={{ ...totalValue, width: '30%' }}>{total}</Column>
				</Row>
			</Section>

			<Hr style={{ margin: '24px 0' }} />

			<Section>
				<Text style={footer}>
					Questions about your order? <Link href="https://example.com/support">Contact support</Link
					> and reference order {orderId}.
				</Text>
				<Text style={footer}>Acme Inc. · 123 Market St · San Francisco, CA</Text>
			</Section>
		</Container>
	</Body>
</Html>
