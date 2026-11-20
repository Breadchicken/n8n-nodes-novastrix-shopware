import { describe, expect, it } from 'vitest';

import { output, shortestPath } from '../nodes/Shopware/resources/order/execute';

const transitions = [
	{ action: 'process', from: 'open', to: 'in_progress' },
	{ action: 'cancel', from: 'open', to: 'cancelled' },
	{ action: 'complete', from: 'in_progress', to: 'completed' },
	{ action: 'cancel', from: 'in_progress', to: 'cancelled' },
	{ action: 'reopen', from: 'completed', to: 'open' },
	{ action: 'reopen', from: 'cancelled', to: 'open' },
];

describe('shortestPath', () => {
	it('finds direct and multi-step transitions', () => {
		expect(shortestPath(transitions, 'open', 'cancelled')?.map((t) => t.action)).toEqual([
			'cancel',
		]);
		expect(shortestPath(transitions, 'open', 'completed')?.map((t) => t.action)).toEqual([
			'process',
			'complete',
		]);
		expect(shortestPath(transitions, 'completed', 'in_progress')?.map((t) => t.action)).toEqual([
			'reopen',
			'process',
		]);
	});

	it('returns undefined for unreachable states', () => {
		expect(shortestPath(transitions, 'open', 'shipped')).toBeUndefined();
	});
});

describe('order output', () => {
	const order = {
		id: 'o1',
		orderNumber: '10000',
		stateMachineState: { technicalName: 'open' },
		primaryOrderTransactionId: 't2',
		transactions: [
			{ id: 't1', createdAt: '2026-01-02', stateMachineState: { technicalName: 'failed' } },
			{
				id: 't2',
				createdAt: '2026-01-01',
				stateMachineState: { technicalName: 'paid' },
				paymentMethod: { name: 'Invoice', translated: { name: 'Rechnung' } },
			},
		],
		deliveries: [
			{ id: 'd1', stateMachineState: { technicalName: 'shipped' }, trackingCodes: ['X'] },
		],
		lineItems: [{ label: 'Shirt', quantity: 2, payload: { productNumber: 'SW1' } }],
		tags: [{ name: 'vip' }],
	};

	it('uses the primary payment and flattens the order', () => {
		const result = output(order, true);
		expect(result).toMatchObject({
			status: 'open',
			paymentStatus: 'paid',
			paymentMethod: 'Rechnung',
			deliveryStatus: 'shipped',
			trackingCodes: ['X'],
			tags: ['vip'],
		});
		expect(result.lineItems).toEqual([
			expect.objectContaining({ productNumber: 'SW1', quantity: 2 }),
		]);
	});

	it('falls back to the latest payment without a primary one', () => {
		const result = output({ ...order, primaryOrderTransactionId: undefined }, true);
		expect(result.paymentStatus).toBe('failed');
	});

	it('returns the raw order without simplify', () => {
		expect(output(order, false)).toBe(order);
	});
});
