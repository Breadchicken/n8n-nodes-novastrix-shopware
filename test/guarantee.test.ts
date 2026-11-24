import type { IDataObject, INode } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { applyGuarantee } from '../nodes/Shopware/resources/product/guarantee';
import type { ExecutionState } from '../nodes/Shopware/shared/state';

const node = { name: 'Shopware Novastrix', type: 'shopware', typeVersion: 1 } as INode;

function state(native: boolean): ExecutionState {
	return { hasField: async () => native } as unknown as ExecutionState;
}

describe('applyGuarantee', () => {
	it('writes the native fields on shops that have them', async () => {
		const payload: IDataObject = {};
		await applyGuarantee(
			node,
			state(true),
			{ guaranteeMonths: 36, guaranteeConfirmed: true },
			payload,
		);
		expect(payload).toEqual({ guaranteeMonths: 36, guaranteeConfirmed: true });
	});

	it('does nothing without guarantee fields', async () => {
		const payload: IDataObject = {};
		await applyGuarantee(node, state(false), { name: 'x' }, payload);
		expect(payload).toEqual({});
	});

	it.each([24, 31, 606, 36.5])('rejects %s months', async (months) => {
		await expect(
			applyGuarantee(node, state(true), { guaranteeMonths: months }, {}),
		).rejects.toThrow('Invalid guarantee duration');
	});

	it('refuses the fields on shops before 6.7.14 instead of storing them without effect', async () => {
		await expect(
			applyGuarantee(node, state(false), { guaranteeConfirmed: true }, {}),
		).rejects.toThrow('need Shopware 6.7.14 or later');
	});
});
