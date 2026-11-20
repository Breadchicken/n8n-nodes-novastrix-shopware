import type { IDataObject, INodePropertyOptions } from 'n8n-workflow';

import { output as orderOutput } from '../Shopware/resources/order/execute';

/**
 * Entities whose writes Shopware sends as `<entity>.written` / `<entity>.deleted` webhooks
 * (services tagged `shopware.entity.hookable`, Shopware 6.7). Not exposed by the API, so listed here.
 */
export const HOOKABLE_ENTITIES = [
	'category',
	'customer',
	'customer_address',
	'document',
	'media',
	'order',
	'order_address',
	'product',
	'product_price',
	'sales_channel',
	'sales_channel_domain',
];

/** Business events marked `#[NotHookable]`: Shopware never delivers them to webhooks. */
const NOT_HOOKABLE = new Set([
	'customer.recovery.request',
	'mail.before.send',
	'mail.after.create.message',
	'user.recovery.request',
]);

const STATE_MACHINES: Record<string, string> = {
	order: 'Order Status',
	order_delivery: 'Delivery Status',
	order_transaction: 'Payment Status',
	order_transaction_capture: 'Payment Capture Status',
	order_transaction_capture_refund: 'Refund Status',
};

const KNOWN_EVENTS: Record<string, string> = {
	'checkout.customer.deleted': 'Customer Deleted (Storefront)',
	'checkout.customer.double_opt_in_guest_order': 'Guest Order Opt-In Requested',
	'checkout.customer.double_opt_in_registration': 'Registration Opt-In Requested',
	'checkout.customer.guest_register': 'Guest Registered',
	'checkout.customer.login': 'Customer Logged In',
	'checkout.customer.logout': 'Customer Logged Out',
	'checkout.customer.register': 'Customer Registered',
	'checkout.order.payment_method.changed': 'Order Payment Method Changed',
	'checkout.order.placed': 'Order Placed',
	'contact_form.send': 'Contact Form Sent',
	'newsletter.confirm': 'Newsletter Confirmed',
	'newsletter.register': 'Newsletter Registered',
	'newsletter.unsubscribe': 'Newsletter Unsubscribed',
	'review_form.send': 'Review Submitted',
};

const titleCase = (value: string) =>
	value
		.split(/[._\s]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

/** Readable name for a Shopware event, e.g. `state_enter.order_transaction.state.paid` -> "Payment Status Changed to Paid". */
export function eventLabel(event: string): string {
	if (KNOWN_EVENTS[event]) {
		return KNOWN_EVENTS[event];
	}
	const state = /^state_(enter|leave)\.([a-z_]+)\.state\.([a-z_]+)$/.exec(event);
	if (state) {
		const machine = STATE_MACHINES[state[2]] ?? titleCase(state[2]);
		return `${machine} ${state[1] === 'enter' ? 'Changed to' : 'Changed From'} ${titleCase(state[3])}`;
	}
	const entity = /^([a-z_]+)\.(written|deleted)$/.exec(event);
	if (entity && HOOKABLE_ENTITIES.includes(entity[1])) {
		return `${titleCase(entity[1])} ${entity[2] === 'written' ? 'Created or Updated' : 'Deleted'}`;
	}
	return titleCase(event.replace(/^checkout\./, ''));
}

/** Options for the event picker: business events of the shop plus the entity write events. */
export function eventOptions(businessEvents: string[]): INodePropertyOptions[] {
	const names = new Set(businessEvents.filter((name) => !NOT_HOOKABLE.has(name)));
	for (const entity of HOOKABLE_ENTITIES) {
		names.add(`${entity}.written`);
		names.add(`${entity}.deleted`);
	}
	return Array.from(names)
		.map((name) => ({ name: eventLabel(name), value: name, description: name }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

interface WriteResult extends IDataObject {
	entity?: string;
	operation?: string;
	primaryKey?: string | IDataObject;
	updatedFields?: string[];
	versionId?: string;
}

/**
 * Turns a Shopware webhook body into output items.
 * - Entity events (`product.written`): one item per changed record.
 * - Business events (`checkout.order.placed`, state changes): one item with the event data;
 *   with `simplify`, an order is flattened like the Order resource does.
 */
export function webhookItems(body: IDataObject, simplify: boolean): IDataObject[] {
	const data = (body.data as IDataObject | undefined) ?? {};
	const source = (body.source as IDataObject | undefined) ?? {};
	const meta = {
		event: data.event as string | undefined,
		eventId: source.eventId as string | undefined,
		shopUrl: source.url as string | undefined,
	};
	const payload = data.payload;

	if (Array.isArray(payload)) {
		return (payload as WriteResult[]).map((write) => ({
			...meta,
			entity: write.entity,
			operation: write.operation,
			...(typeof write.primaryKey === 'string'
				? { id: write.primaryKey }
				: { primaryKey: write.primaryKey }),
			updatedFields: write.updatedFields ?? [],
			versionId: write.versionId,
		}));
	}

	const values = { ...((payload as IDataObject | undefined) ?? {}) };
	if (simplify && values.order && typeof values.order === 'object') {
		values.order = orderOutput(values.order as IDataObject, true);
	}
	return [{ ...meta, ...values }];
}
