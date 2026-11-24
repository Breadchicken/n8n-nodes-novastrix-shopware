import type { IDataObject, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { ExecutionState } from '../../shared/state';

/**
 * Durability guarantee (EU "GARAN" label). Shopware 6.7.14+ has the native product fields
 * `guaranteeMonths` and `guaranteeConfirmed`; older shops have no equivalent, so the node refuses
 * the fields there instead of storing them without effect.
 *
 * The month rule mirrors the core validator (30 to 600 in half-year steps), so users get a precise
 * message before the request instead of a generic 400.
 */
export async function applyGuarantee(
	node: INode,
	state: ExecutionState,
	data: IDataObject,
	payload: IDataObject,
): Promise<void> {
	if (data.guaranteeMonths === undefined && data.guaranteeConfirmed === undefined) {
		return;
	}

	if (data.guaranteeMonths !== undefined) {
		const months = Number(data.guaranteeMonths);
		if (!Number.isInteger(months) || months < 30 || months > 600 || months % 6 !== 0) {
			throw new NodeOperationError(
				node,
				`Invalid guarantee duration "${String(data.guaranteeMonths)}"`,
				{ description: 'Use 30 to 600 months in half-year steps (30, 36, 42, ...).' },
			);
		}
	}

	if (!(await state.hasField('product', 'guaranteeMonths'))) {
		throw new NodeOperationError(node, 'The guarantee fields need Shopware 6.7.14 or later', {
			description:
				'This shop has no native guarantee fields. Remove "Guarantee (Months)" and "Guarantee Confirmed" from the node, or update Shopware.',
		});
	}

	if (data.guaranteeMonths !== undefined) {
		payload.guaranteeMonths = Number(data.guaranteeMonths);
	}
	if (data.guaranteeConfirmed !== undefined) {
		payload.guaranteeConfirmed = data.guaranteeConfirmed === true;
	}
}
