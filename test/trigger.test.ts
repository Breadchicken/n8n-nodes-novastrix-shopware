import { describe, expect, it } from 'vitest';

import {
	changedValues,
	eventLabel,
	eventOptions,
	isTechnicalField,
	webhookItems,
} from '../nodes/ShopwareTrigger/events';

describe('eventLabel', () => {
	it('names state changes after the state machine', () => {
		expect(eventLabel('state_enter.order_transaction.state.paid')).toBe(
			'Payment Status Changed to Paid',
		);
		expect(eventLabel('state_leave.order_delivery.state.shipped_partially')).toBe(
			'Delivery Status Changed From Shipped Partially',
		);
		expect(eventLabel('state_enter.order.state.cancelled')).toBe(
			'Order Status Changed to Cancelled',
		);
	});

	it('names entity and known business events', () => {
		expect(eventLabel('product.written')).toBe('Product Created or Updated');
		expect(eventLabel('customer_address.deleted')).toBe('Customer Address Deleted');
		expect(eventLabel('checkout.order.placed')).toBe('Order Placed');
		expect(eventLabel('checkout.something.new')).toBe('Something New');
	});
});

describe('eventOptions', () => {
	it('adds entity events, drops non-hookable ones and sorts by name', () => {
		const options = eventOptions(['checkout.order.placed', 'mail.before.send']);
		const values = options.map((option) => option.value);
		expect(values).toContain('checkout.order.placed');
		expect(values).toContain('product.written');
		expect(values).toContain('order.deleted');
		expect(values).not.toContain('mail.before.send');
		const names = options.map((option) => option.name);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});
});

describe('changed fields', () => {
	const fields = [
		'versionId',
		'parentVersionId',
		'productManufacturerVersionId',
		'stock',
		'updatedAt',
		'availableStock',
		'id',
		'name',
		'createdAt',
	];

	it('drops technical fields', () => {
		expect(fields.filter((field) => !isTechnicalField(field))).toEqual([
			'stock',
			'availableStock',
			'name',
		]);
	});

	it('keeps raw fields without simplify', () => {
		const [item] = webhookItems(
			{
				data: {
					event: 'product.written',
					payload: [{ primaryKey: 'a', updatedFields: fields, versionId: 'v' }],
				},
			},
			false,
		);
		expect(item.changedFields).toEqual(['stock', 'availableStock', 'name']);
		expect(item.updatedFields).toEqual(fields);
		expect(item.versionId).toBe('v');
	});

	it('reads new values, translated ones as fallback', () => {
		expect(
			changedValues({ id: 'a', stock: 13, name: null, translated: { name: 'Shirt' } }, [
				'stock',
				'name',
				'ean',
			]),
		).toEqual({ stock: 13, name: 'Shirt', ean: null });
	});
});

describe('webhookItems', () => {
	const source = { url: 'https://shop.example', eventId: 'e1' };

	it('returns one item per written record', () => {
		const items = webhookItems(
			{
				data: {
					event: 'product.written',
					payload: [
						{
							entity: 'product',
							operation: 'update',
							primaryKey: 'a'.repeat(32),
							updatedFields: ['stock'],
						},
						{ entity: 'product', operation: 'insert', primaryKey: 'b'.repeat(32) },
					],
				},
				source,
			},
			true,
		);
		expect(items).toEqual([
			{
				event: 'product.written',
				eventId: 'e1',
				shopUrl: 'https://shop.example',
				entity: 'product',
				operation: 'update',
				id: 'a'.repeat(32),
				changedFields: ['stock'],
			},
			expect.objectContaining({ operation: 'insert', id: 'b'.repeat(32), changedFields: [] }),
		]);
	});

	it('keeps composite primary keys', () => {
		const [item] = webhookItems(
			{
				data: {
					event: 'x.written',
					payload: [{ primaryKey: { productId: 'p', categoryId: 'c' } }],
				},
				source,
			},
			true,
		);
		expect(item.primaryKey).toEqual({ productId: 'p', categoryId: 'c' });
		expect(item.id).toBeUndefined();
	});

	it('simplifies an order in business events', () => {
		const order = {
			id: 'o1',
			orderNumber: '10001',
			deepLinkCode: 'secret',
			stateMachineState: { technicalName: 'open' },
		};
		const [simple] = webhookItems(
			{ data: { event: 'checkout.order.placed', payload: { order } }, source },
			true,
		);
		expect(simple.event).toBe('checkout.order.placed');
		expect(simple.order).toMatchObject({ id: 'o1', orderNumber: '10001', status: 'open' });
		expect(simple.order).not.toHaveProperty('deepLinkCode');

		const [raw] = webhookItems(
			{ data: { event: 'checkout.order.placed', payload: { order } }, source },
			false,
		);
		expect(raw.order).toEqual(order);
	});
});
