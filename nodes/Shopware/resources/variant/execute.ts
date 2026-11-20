import type { IDataObject, IExecuteFunctions, INodeParameterResourceLocator } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { DEFAULT_CURRENCY_ID } from '../../shared/entities';
import type { ExecutionState } from '../../shared/state';
import { shopwareApiRequest, shopwareSearch } from '../../shared/transport';
import { parseJsonParameter, splitList } from '../../shared/utils';
import { PLUGINS } from '../product/plugins';

const PLUGIN = PLUGINS.variantCreator;
const BASE = '/_action/novastrix-variant-creator';

export async function executeVariant(
	this: IExecuteFunctions,
	state: ExecutionState,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	const post = async (path: string, body: IDataObject) =>
		(await shopwareApiRequest.call(this, 'POST', `${BASE}${path}`, {
			body,
			requiresPlugin: PLUGIN,
		})) as IDataObject;

	switch (operation) {
		case 'merge':
			return await merge.call(this, state, i);

		case 'detach': {
			const variantId = await resolveProduct.call(this, state, 'variant', i);
			return await post('/detach', { variantId });
		}

		case 'move': {
			const variantId = await resolveProduct.call(this, state, 'variant', i);
			const newParentId = await resolveProduct.call(this, state, 'newParent', i);
			return await post('/move', { variantId, newParentId });
		}

		case 'getOptions': {
			const parentId = await resolveProduct.call(this, state, 'parent', i);
			const response = (await shopwareApiRequest.call(
				this,
				'GET',
				`${BASE}/configurator/${parentId}`,
				{ requiresPlugin: PLUGIN },
			)) as IDataObject;
			return ((response.settings as IDataObject[] | undefined) ?? []).map((setting) => ({
				...setting,
				option: `${String(setting.groupName ?? '')}: ${String(setting.optionName ?? '')}`,
			}));
		}

		case 'addOption':
		case 'removeOption': {
			const parentId = await resolveProduct.call(this, state, 'parent', i);
			const optionId = await state.resolver.resolveLocator(
				'propertyOption',
				this.getNodeParameter('option', i) as INodeParameterResourceLocator,
			);
			if (!optionId) {
				throw new NodeOperationError(this.getNode(), 'No option given', { itemIndex: i });
			}
			const path = operation === 'addOption' ? '/configurator/add' : '/configurator/remove';
			return await post(path, { parentId, optionId });
		}

		case 'getAll':
			return await getVariants.call(this, state, i);

		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for variants`,
				{ itemIndex: i },
			);
	}
}

/** Uses the plugin's all-in-one `compose` route: it validates first and never writes partially. */
async function merge(
	this: IExecuteFunctions,
	state: ExecutionState,
	i: number,
): Promise<IDataObject> {
	const parentMode = this.getNodeParameter('parentMode', i, 'existing') as string;
	const options = this.getNodeParameter('mergeOptions', i, {}) as IDataObject;

	const productIds: string[] = [];
	for (const product of splitList(this.getNodeParameter('products', i))) {
		productIds.push(await state.resolver.resolve('product', product));
	}
	const groupIds: string[] = [];
	for (const group of splitList(this.getNodeParameter('propertyGroups', i))) {
		groupIds.push(await state.resolver.resolve('propertyGroup', group));
	}
	if (productIds.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Add at least one product to merge', {
			itemIndex: i,
		});
	}
	if (groupIds.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'Add at least one variant property (e.g. "Color")',
			{ itemIndex: i },
		);
	}

	const body: IDataObject = {
		property_group_ids: groupIds,
		children: productIds.map((id) => ({ product_id: id })),
		dry_run: options.dryRun === true,
	};

	if (parentMode === 'existing') {
		const parentId = await resolveProduct.call(this, state, 'parent', i);
		if (productIds.includes(parentId)) {
			throw new NodeOperationError(
				this.getNode(),
				'The parent product cannot be one of the products to merge',
				{ itemIndex: i },
			);
		}
		body.parent_id = parentId;
	} else {
		const overrides = parseJsonParameter<IDataObject>(
			options.fieldOverrides ?? '{}',
			'Parent Fields (JSON)',
		);
		body.parent_creation = {
			model: (options.model as string | undefined) || 'gpt-4.1-mini',
			field_overrides: overrides ?? {},
		};
		body.auto_resolve = (options.autoResolve as string | undefined) ?? 'skip';
	}

	return (await shopwareApiRequest.call(this, 'POST', `${BASE}/compose`, {
		body,
		requiresPlugin: PLUGIN,
	})) as IDataObject;
}

async function getVariants(
	this: IExecuteFunctions,
	state: ExecutionState,
	i: number,
): Promise<IDataObject[]> {
	const parentId = await resolveProduct.call(this, state, 'parent', i);
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
	const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);
	const simplify = this.getNodeParameter('simplify', i, true) as boolean;

	const variants = await shopwareSearch.call(
		this,
		'product',
		{
			filter: [{ type: 'equals', field: 'parentId', value: parentId }],
			associations: { options: { associations: { group: {} } } },
			sort: [{ field: 'productNumber', order: 'ASC' }],
		},
		limit,
		// Variants return null for inherited fields (name, price, ...) without this header.
		{ 'sw-inheritance': '1' },
	);

	if (!simplify) {
		return variants;
	}
	return variants.map((variant) => {
		const prices = (variant.price as IDataObject[] | null) ?? [];
		const price = prices.find((entry) => entry.currencyId === DEFAULT_CURRENCY_ID) ?? prices[0];
		const translated = (variant.translated as IDataObject | undefined) ?? {};
		return {
			id: variant.id,
			productNumber: variant.productNumber,
			name: translated.name ?? variant.name,
			active: variant.active,
			stock: variant.stock,
			availableStock: variant.availableStock,
			grossPrice: price?.gross,
			netPrice: price?.net,
			options: ((variant.options as IDataObject[] | null) ?? []).map((option) => {
				const group = (option.group as IDataObject | undefined) ?? {};
				const groupName = (group.translated as IDataObject | undefined)?.name ?? group.name;
				const optionName = (option.translated as IDataObject | undefined)?.name ?? option.name;
				return `${String(groupName)}: ${String(optionName)}`;
			}),
		};
	});
}

async function resolveProduct(
	this: IExecuteFunctions,
	state: ExecutionState,
	parameter: string,
	i: number,
): Promise<string> {
	const id = await state.resolver.resolveLocator(
		'product',
		this.getNodeParameter(parameter, i) as INodeParameterResourceLocator,
	);
	if (!id) {
		throw new NodeOperationError(this.getNode(), `No product given in "${parameter}"`, {
			itemIndex: i,
		});
	}
	return id;
}
