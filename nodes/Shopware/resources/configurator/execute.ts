import type { IDataObject, IExecuteFunctions, INodeParameterResourceLocator } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { ExecutionState } from '../../shared/state';
import { shopwareApiRequest, shopwareSearch, shopwareSearchPage } from '../../shared/transport';
import { generateId, parseJsonParameter, splitList } from '../../shared/utils';
import { PLUGINS } from '../product/plugins';

const ENTITY = 'novastrix_configurator';
const PLUGIN = PLUGINS.configurator;

/** Settings stored inside `configuration` (the rest are entity columns). */
const CONFIGURATION_KEYS = ['label', 'position', 'stepLayout'];
const COLUMN_KEYS = ['name', 'active', 'lazyBatchSize', 'cacheTtl'];

export async function executeConfigurator(
	this: IExecuteFunctions,
	state: ExecutionState,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'get': {
			const id = await resolveConfigurator.call(this, state, i);
			return await loadConfigurator.call(this, id, i);
		}

		case 'getAll': {
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

			const filter: IDataObject[] = [];
			if (filters.active !== undefined) {
				filter.push({ type: 'equals', field: 'active', value: filters.active });
			}
			const productId = await state.resolver.resolveLocator(
				'product',
				filters.product as INodeParameterResourceLocator | undefined,
			);
			if (productId) {
				filter.push({ type: 'equals', field: 'productId', value: productId });
			}

			return await shopwareSearch.call(
				this,
				ENTITY,
				filter.length > 0 ? { filter } : {},
				limit,
				undefined,
				PLUGIN,
			);
		}

		case 'create': {
			const productId = await state.resolver.resolveLocator(
				'product',
				this.getNodeParameter('product', i) as INodeParameterResourceLocator,
			);
			if (!productId) {
				throw new NodeOperationError(this.getNode(), 'No product given', { itemIndex: i });
			}
			const settings = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const steps = await readSteps.call(this, state, i);

			const id = generateId();
			const configuration: IDataObject = {
				position: 'above-description-tabs',
				stepLayout: 'rows',
				...pick(settings, CONFIGURATION_KEYS),
				steps: steps ?? [],
			};
			await shopwareApiRequest.call(this, 'POST', '/novastrix-configurator', {
				body: {
					id,
					productId,
					name: this.getNodeParameter('name', i) as string,
					active: true,
					lazyBatchSize: 24,
					cacheTtl: 300,
					...pick(settings, COLUMN_KEYS),
					configuration,
				},
				requiresPlugin: PLUGIN,
			});
			return await loadConfigurator.call(this, id, i);
		}

		case 'update': {
			const id = await resolveConfigurator.call(this, state, i);
			const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
			const steps = await readSteps.call(this, state, i);

			const body: IDataObject = pick(fields, COLUMN_KEYS);
			const productId = await state.resolver.resolveLocator(
				'product',
				fields.product as INodeParameterResourceLocator | undefined,
			);
			if (productId) {
				body.productId = productId;
			}

			const configurationChanges = pick(fields, CONFIGURATION_KEYS);
			if (steps !== undefined || Object.keys(configurationChanges).length > 0) {
				// `configuration` is one JSON column: merge into the stored one to keep other keys.
				const current = await loadConfigurator.call(this, id, i);
				body.configuration = {
					...((current.configuration as IDataObject | undefined) ?? {}),
					...configurationChanges,
					...(steps !== undefined ? { steps } : {}),
				};
			}

			if (Object.keys(body).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', {
					itemIndex: i,
				});
			}

			await shopwareApiRequest.call(this, 'PATCH', `/novastrix-configurator/${id}`, {
				body,
				requiresPlugin: PLUGIN,
			});
			return await loadConfigurator.call(this, id, i);
		}

		case 'delete': {
			const id = await resolveConfigurator.call(this, state, i);
			await shopwareApiRequest.call(this, 'DELETE', `/novastrix-configurator/${id}`, {
				requiresPlugin: PLUGIN,
			});
			return { id, deleted: true };
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for configurators`,
				{ itemIndex: i },
			);
	}
}

async function resolveConfigurator(
	this: IExecuteFunctions,
	state: ExecutionState,
	i: number,
): Promise<string> {
	const id = await state.resolver.resolveLocator(
		'configurator',
		this.getNodeParameter('configurator', i) as INodeParameterResourceLocator,
	);
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'No configurator given', { itemIndex: i });
	}
	return id;
}

async function loadConfigurator(
	this: IExecuteFunctions,
	id: string,
	i: number,
): Promise<IDataObject> {
	const records = await shopwareSearchPage.call(
		this,
		ENTITY,
		{ ids: [id], limit: 1 },
		undefined,
		PLUGIN,
	);
	if (records.length === 0) {
		throw new NodeOperationError(this.getNode(), `Configurator ${id} not found`, { itemIndex: i });
	}
	return records[0];
}

/**
 * Reads the steps from the form (resolving product numbers/names) or from JSON.
 * Returns undefined when the existing steps should be kept (update only).
 */
async function readSteps(
	this: IExecuteFunctions,
	state: ExecutionState,
	i: number,
): Promise<IDataObject[] | undefined> {
	const mode = this.getNodeParameter('stepInput', i, 'fields') as string;
	if (mode === 'keep') {
		return undefined;
	}
	if (mode === 'json') {
		const steps = parseJsonParameter<IDataObject[]>(
			this.getNodeParameter('stepsJson', i),
			'Steps (JSON)',
		);
		if (!Array.isArray(steps)) {
			throw new NodeOperationError(this.getNode(), '"Steps (JSON)" must be an array', {
				itemIndex: i,
			});
		}
		return steps;
	}

	const items = (this.getNodeParameter('steps', i, {}) as { items?: IDataObject[] }).items ?? [];
	const ids = items.map((item, index) => String(item.id ?? '').trim() || `step_${index + 1}`);
	const idByName = new Map(
		items.map((item, index) => [
			String(item.name ?? '')
				.trim()
				.toLowerCase(),
			ids[index],
		]),
	);

	const resolveProducts = async (value: unknown): Promise<string[]> => {
		const result: string[] = [];
		for (const entry of splitList(value)) {
			result.push(await state.resolver.resolve('product', entry));
		}
		return result;
	};

	const steps: IDataObject[] = [];
	for (const [index, item] of items.entries()) {
		const sourceType = (item.sourceType as string) ?? 'static';
		const streamId =
			sourceType === 'product_stream'
				? await state.resolver.resolveLocator(
						'productStream',
						item.productStream as INodeParameterResourceLocator | undefined,
					)
				: undefined;
		if (sourceType === 'product_stream' && !streamId) {
			throw new NodeOperationError(
				this.getNode(),
				`Step "${String(item.name ?? index + 1)}" uses a dynamic product group but none is set`,
				{ itemIndex: i },
			);
		}

		const dependencies: IDataObject[] = [];
		for (const dependency of (item.dependencies as { items?: IDataObject[] } | undefined)?.items ??
			[]) {
			const reference = String(dependency.stepId ?? '').trim();
			const stepId = ids.includes(reference) ? reference : idByName.get(reference.toLowerCase());
			if (!stepId) {
				throw new NodeOperationError(
					this.getNode(),
					`Dependency of step "${String(item.name)}" refers to unknown step "${reference}"`,
					{ itemIndex: i, description: `Known step IDs: ${ids.join(', ')}` },
				);
			}
			dependencies.push({
				stepId,
				operator: dependency.operator ?? 'one_of',
				productIds: await resolveProducts(dependency.products),
			});
		}

		const step: IDataObject = {
			id: ids[index],
			name: String(item.name ?? '').trim() || `Step ${index + 1}`,
			required: item.required === true,
			multiple: item.multiple === true,
			accordionCollapsed: item.accordionCollapsed === true,
			quantityEnabled: item.quantityEnabled === true,
			minQuantity: Math.max(1, Number(item.minQuantity ?? 1)),
			maxQuantity: Math.max(1, Number(item.maxQuantity ?? 10)),
			sort: item.sort ?? 'name:asc',
			source: {
				type: sourceType,
				id: streamId ?? '',
				productIds: sourceType === 'static' ? await resolveProducts(item.products) : [],
			},
			defaultProductIds: await resolveProducts(item.defaultProducts),
			filters: { blacklistProductIds: await resolveProducts(item.excludedProducts) },
			pricing: {
				strategy: item.pricingStrategy ?? 'default',
				value: Number(item.pricingValue ?? 0),
			},
			dependencies,
		};
		if (Number(item.limit) > 0) {
			step.limit = Number(item.limit);
		}
		steps.push(step);
	}
	return steps;
}

function pick(source: IDataObject, keys: string[]): IDataObject {
	const result: IDataObject = {};
	for (const key of keys) {
		if (source[key] !== undefined && source[key] !== '') {
			result[key] = source[key];
		}
	}
	return result;
}
