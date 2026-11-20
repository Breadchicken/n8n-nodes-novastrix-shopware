import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type { NovastrixPlugin, PluginState } from './plugins';
import { pluginProblem } from './plugins';

import type { EntityResolver } from './resolver';
import { createResolver, httpStatus, shopwareApiRequest, shopwareSearchPage } from './transport';

/**
 * Per-execution state shared by all items of one node run: the name resolver and small caches.
 * Created once in `execute()`, so a loop over many items does each lookup only once.
 */
export interface ExecutionState {
	node: INode;
	resolver: EntityResolver;
	taxRate: (taxId: string) => Promise<number>;
	/** Whether the shop's schema has a field, e.g. native fields that only exist in newer versions. */
	hasField: (entity: string, field: string) => Promise<boolean>;
	/**
	 * Fails with a clear message (and a link to the plugin page) when a Novastrix plugin is not
	 * installed or not active. Needed because Shopware silently accepts custom fields of missing
	 * plugins. Skipped when the integration may not read the plugin list (403).
	 */
	requirePlugin: (plugin: NovastrixPlugin, itemIndex?: number) => Promise<void>;
}

export function createExecutionState(context: IExecuteFunctions): ExecutionState {
	const taxRates = new Map<string, Promise<number>>();
	let plugins: Promise<Map<string, boolean> | undefined> | undefined;
	let schema: Promise<Record<string, { properties?: IDataObject }>> | undefined;

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
		hasField: async (entity: string, field: string) => {
			if (!schema) {
				schema = shopwareApiRequest.call(context, 'GET', '/_info/entity-schema.json') as Promise<
					Record<string, { properties?: IDataObject }>
				>;
				schema.catch(() => (schema = undefined));
			}
			const properties = (await schema)[entity]?.properties ?? {};
			return field in properties;
		},
		requirePlugin: async (plugin: NovastrixPlugin, itemIndex?: number) => {
			if (!plugins) {
				plugins = loadNovastrixPlugins(context);
				plugins.catch(() => (plugins = undefined));
			}
			const installed = await plugins;
			if (!installed) {
				return;
			}
			const active = installed.get(plugin.technicalName);
			const pluginState: PluginState =
				active === undefined ? 'missing' : active ? 'active' : 'inactive';
			if (pluginState !== 'active') {
				throw new NodeOperationError(
					context.getNode(),
					pluginProblem(plugin, pluginState).message,
					{
						itemIndex,
						description: pluginProblem(plugin, pluginState).description,
					},
				);
			}
		},
	};
}

/**
 * Installed Novastrix plugins (technical name -> active). `undefined` when the integration lacks
 * the permission to read plugins; the 404 handling in the transport then remains the fallback.
 */
async function loadNovastrixPlugins(
	context: IExecuteFunctions,
): Promise<Map<string, boolean> | undefined> {
	let records: IDataObject[];
	try {
		records = await shopwareSearchPage.call(context, 'plugin', {
			filter: [{ type: 'prefix', field: 'name', value: 'Novastrix' }],
			includes: { plugin: ['name', 'active', 'installedAt'] },
			limit: 500,
		});
	} catch (error) {
		if (httpStatus(error) === 403) {
			return undefined;
		}
		// The transport already turned API failures into NodeApiErrors.
		throw error instanceof NodeApiError
			? error
			: new NodeOperationError(context.getNode(), error as Error);
	}
	return new Map(
		records
			.filter((record) => record.installedAt)
			.map((record) => [String(record.name), record.active === true]),
	);
}
