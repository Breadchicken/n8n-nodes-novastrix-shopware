import type { IExecuteFunctions, INode } from 'n8n-workflow';

import type { EntityResolver } from './resolver';
import { createResolver, shopwareSearchPage } from './transport';

/**
 * Per-execution state shared by all items of one node run: the name resolver and small caches.
 * Created once in `execute()`, so a loop over many items does each lookup only once.
 */
export interface ExecutionState {
	node: INode;
	resolver: EntityResolver;
	taxRate: (taxId: string) => Promise<number>;
}

export function createExecutionState(context: IExecuteFunctions): ExecutionState {
	const taxRates = new Map<string, Promise<number>>();

	return {
		node: context.getNode(),
		resolver: createResolver.call(context),
		taxRate: async (taxId: string) => {
			let rate = taxRates.get(taxId);
			if (!rate) {
				rate = shopwareSearchPage
					.call(context, 'tax', { ids: [taxId], includes: { tax: ['id', 'taxRate'] } })
					.then((records) => {
						if (records.length === 0) {
							throw new Error(`Tax ${taxId} not found`);
						}
						return Number(records[0].taxRate);
					});
				taxRates.set(taxId, rate);
				rate.catch(() => taxRates.delete(taxId));
			}
			return await rate;
		},
	};
}
