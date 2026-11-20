import type { IDataObject, IExecuteFunctions, INodeParameterResourceLocator } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { DEFAULT_CURRENCY_ID } from '../../shared/entities';
import { contextHeaders } from '../../shared/options';
import type { ExecutionState } from '../../shared/state';
import { shopwareApiRequest, shopwareSearch, shopwareSearchPage } from '../../shared/transport';
import {
	generateId,
	grossToNet,
	locatorListValues,
	parseJsonParameter,
	splitList,
} from '../../shared/utils';

/** Product fields copied 1:1 from the UI into the payload. */
const SCALAR_FIELDS = [
	'active',
	'description',
	'ean',
	'height',
	'isCloseout',
	'keywords',
	'length',
	'manufacturerNumber',
	'markAsTopseller',
	'maxPurchase',
	'metaDescription',
	'metaTitle',
	'minPurchase',
	'name',
	'productNumber',
	'purchaseSteps',
	'releaseDate',
	'shippingFree',
	'stock',
	'weight',
	'width',
];

const VISIBILITY_ALL = 30;

interface ExistingProduct {
	id: string;
	taxId?: string;
	price?: IDataObject[];
}

export async function executeProduct(
	this: IExecuteFunctions,
	state: ExecutionState,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	const { resolver } = state;

	switch (operation) {
		case 'get': {
			const id = await resolveProduct.call(this, state, i);
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const product = await getProduct.call(this, state, id, options);
			if (!product) {
				throw new NodeOperationError(this.getNode(), `Product ${id} not found`, { itemIndex: i });
			}
			return product;
		}

		case 'getAll': {
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;

			const criteria = readCriteria(options);
			const filter: IDataObject[] = [];

			if (filters.term) {
				criteria.term = filters.term;
			}
			if (filters.active !== undefined) {
				filter.push({ type: 'equals', field: 'active', value: filters.active });
			}
			if (filters.onlyMainProducts) {
				filter.push({ type: 'equals', field: 'parentId', value: null });
			}
			if (filters.stockBelow !== undefined) {
				filter.push({ type: 'range', field: 'stock', parameters: { lt: filters.stockBelow } });
			}
			if (filters.updatedAfter) {
				filter.push({
					type: 'multi',
					operator: 'or',
					queries: [
						{ type: 'range', field: 'updatedAt', parameters: { gte: filters.updatedAfter } },
						{ type: 'range', field: 'createdAt', parameters: { gte: filters.updatedAfter } },
					],
				});
			}
			const manufacturerId = await resolver.resolveLocator(
				'manufacturer',
				filters.manufacturer as INodeParameterResourceLocator | undefined,
			);
			if (manufacturerId) {
				filter.push({ type: 'equals', field: 'manufacturerId', value: manufacturerId });
			}
			const categoryId = await resolver.resolveLocator(
				'category',
				filters.category as INodeParameterResourceLocator | undefined,
			);
			if (categoryId) {
				filter.push({ type: 'equals', field: 'categoriesRo.id', value: categoryId });
			}
			const rawFilter = parseJsonParameter<IDataObject[]>(
				filters.criteriaFilter,
				'Criteria Filter (JSON)',
			);
			if (Array.isArray(rawFilter)) {
				filter.push(...rawFilter);
			}
			if (filter.length > 0) {
				criteria.filter = filter;
			}

			return await shopwareSearch.call(
				this,
				'product',
				criteria,
				limit,
				await readHeaders(state, options),
			);
		}

		case 'create': {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const data = {
				...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
				...readRequiredFields(this, i),
			};
			return await createProduct.call(this, state, data, options);
		}

		case 'update': {
			const id = await resolveProduct.call(this, state, i);
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const data = this.getNodeParameter('updateFields', i, {}) as IDataObject;
			if (Object.keys(data).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', {
					itemIndex: i,
				});
			}
			return await updateProduct.call(this, state, id, data, options);
		}

		case 'upsert': {
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const data = {
				...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
				...readRequiredFields(this, i),
			};
			const existing = await shopwareSearchPage.call(this, 'product', {
				filter: [{ type: 'equals', field: 'productNumber', value: data.productNumber }],
				includes: { product: ['id'] },
				limit: 1,
			});
			if (existing.length > 0) {
				return await updateProduct.call(this, state, String(existing[0].id), data, options);
			}
			return await createProduct.call(this, state, data, options);
		}

		case 'delete': {
			const id = await resolveProduct.call(this, state, i);
			await shopwareApiRequest.call(this, 'DELETE', `/product/${id}`);
			return { id, deleted: true };
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for products`,
				{ itemIndex: i },
			);
	}
}

async function resolveProduct(
	this: IExecuteFunctions,
	state: ExecutionState,
	i: number,
): Promise<string> {
	const locator = this.getNodeParameter('product', i) as INodeParameterResourceLocator;
	const id = await state.resolver.resolveLocator('product', locator);
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'No product given', { itemIndex: i });
	}
	return id;
}

function readRequiredFields(context: IExecuteFunctions, i: number): IDataObject {
	return {
		productNumber: context.getNodeParameter('productNumber', i) as string,
		name: context.getNodeParameter('name', i) as string,
		tax: context.getNodeParameter('tax', i) as INodeParameterResourceLocator,
		grossPrice: context.getNodeParameter('grossPrice', i) as number,
		stock: context.getNodeParameter('stock', i) as number,
	};
}

async function readHeaders(
	state: ExecutionState,
	options: IDataObject,
): Promise<Record<string, string>> {
	const headers = await contextHeaders(state.resolver, options);
	if (options.inheritance !== false) {
		headers['sw-inheritance'] = '1';
	}
	return headers;
}

function readCriteria(options: IDataObject): IDataObject {
	const criteria: IDataObject = {};

	const associations = options.associations as string[] | undefined;
	if (associations?.length) {
		criteria.associations = Object.fromEntries(associations.map((name) => [name, {}]));
	}

	const fields = splitList(options.fields);
	if (fields.length > 0) {
		criteria.includes = { product: Array.from(new Set(['id', ...fields])) };
	}

	const sort = (options.sort as { items?: IDataObject[] } | undefined)?.items;
	if (sort?.length) {
		criteria.sort = sort.map((entry) => ({
			field: entry.field,
			order: entry.order ?? 'ASC',
			naturalSorting: true,
		}));
	}

	return criteria;
}

async function getProduct(
	this: IExecuteFunctions,
	state: ExecutionState,
	id: string,
	options: IDataObject,
): Promise<IDataObject | undefined> {
	const criteria = { ...readCriteria(options), ids: [id], limit: 1 };
	const records = await shopwareSearchPage.call(
		this,
		'product',
		criteria,
		await readHeaders(state, options),
	);
	return records[0];
}

async function createProduct(
	this: IExecuteFunctions,
	state: ExecutionState,
	data: IDataObject,
	options: IDataObject,
): Promise<IDataObject> {
	const id = generateId();
	const payload = await buildPayload.call(this, state, data, options);
	payload.id = id;

	if (!payload.price) {
		throw new NodeOperationError(this.getNode(), 'A gross price is required to create a product');
	}

	await shopwareApiRequest.call(this, 'POST', '/product', {
		body: payload,
		headers: await contextHeaders(state.resolver, options),
	});

	return (await getProduct.call(this, state, id, options)) ?? { id };
}

async function updateProduct(
	this: IExecuteFunctions,
	state: ExecutionState,
	id: string,
	data: IDataObject,
	options: IDataObject,
): Promise<IDataObject> {
	const payload = await buildPayload.call(this, state, data, options, { id });

	await shopwareApiRequest.call(this, 'PATCH', `/product/${id}`, {
		body: payload,
		headers: await contextHeaders(state.resolver, options),
	});

	return (await getProduct.call(this, state, id, options)) ?? { id };
}

/**
 * Turns the UI fields into a Shopware product payload. All references (tax, manufacturer,
 * categories, ...) are resolved by name here, prices are converted to Shopware's price structure.
 */
async function buildPayload(
	this: IExecuteFunctions,
	state: ExecutionState,
	data: IDataObject,
	options: IDataObject,
	existing?: ExistingProduct,
): Promise<IDataObject> {
	const { resolver } = state;
	const payload: IDataObject = {};

	for (const field of SCALAR_FIELDS) {
		if (data[field] !== undefined && data[field] !== '') {
			payload[field] = data[field];
		}
	}

	const references: Array<[string, Parameters<typeof resolver.resolveLocator>[0], string]> = [
		['tax', 'tax', 'taxId'],
		['manufacturer', 'manufacturer', 'manufacturerId'],
		['deliveryTime', 'deliveryTime', 'deliveryTimeId'],
	];
	for (const [field, entity, target] of references) {
		const id = await resolver.resolveLocator(
			entity,
			data[field] as INodeParameterResourceLocator | undefined,
		);
		if (id) {
			payload[target] = id;
		}
	}

	await applyPrices.call(this, state, data, payload, existing);

	const categoryIds = await resolveList(state, 'category', data.categories);
	if (categoryIds.length > 0) {
		payload.categories = categoryIds.map((id) => ({ id }));
	}

	const propertyIds = await resolveList(state, 'propertyOption', data.properties);
	if (propertyIds.length > 0) {
		payload.properties = propertyIds.map((id) => ({ id }));
	}

	const salesChannelIds = await resolveList(state, 'salesChannel', data.salesChannels);
	if (salesChannelIds.length > 0) {
		const alreadyVisible = existing
			? await existingVisibilities.call(this, existing.id, salesChannelIds)
			: new Set<string>();
		const visibilities = salesChannelIds
			.filter((salesChannelId) => !alreadyVisible.has(salesChannelId))
			.map((salesChannelId) => ({ salesChannelId, visibility: VISIBILITY_ALL }));
		if (visibilities.length > 0) {
			payload.visibilities = visibilities;
		}
	}

	const tagNames = splitList(data.tags);
	if (tagNames.length > 0) {
		payload.tags = await resolveTags(state, tagNames, options.createMissingTags === true);
	}

	const customFields = parseJsonParameter(data.customFields, 'Custom Fields (JSON)');
	if (customFields && Object.keys(customFields).length > 0) {
		payload.customFields = customFields;
	}

	const rawFields = parseJsonParameter(data.rawFields, 'Raw Fields (JSON)');
	if (rawFields) {
		Object.assign(payload, rawFields);
	}

	return payload;
}

async function applyPrices(
	this: IExecuteFunctions,
	state: ExecutionState,
	data: IDataObject,
	payload: IDataObject,
	existing?: ExistingProduct,
): Promise<void> {
	const hasGross = typeof data.grossPrice === 'number';
	const hasPriceChange =
		hasGross || data.netPrice !== undefined || data.listPriceGross !== undefined;
	const hasPurchasePrice = typeof data.purchasePriceGross === 'number';

	if (!hasPriceChange && !hasPurchasePrice && !payload.taxId) {
		return;
	}

	// The tax rate is needed for every net price. Prefer the new tax, fall back to the current one.
	let current: ExistingProduct | undefined;
	if (existing && (!payload.taxId || !hasGross)) {
		current = await loadPricing.call(this, existing.id);
	}
	const taxId = (payload.taxId as string | undefined) ?? current?.taxId;
	if (!taxId) {
		return;
	}
	const taxRate = await state.taxRate(taxId);

	let price: IDataObject | undefined;
	if (hasGross) {
		const gross = data.grossPrice as number;
		price = {
			currencyId: DEFAULT_CURRENCY_ID,
			gross,
			net: typeof data.netPrice === 'number' ? data.netPrice : grossToNet(gross, taxRate),
			linked: data.netPrice === undefined,
		};
	} else if (hasPriceChange || payload.taxId) {
		// Partial price change or tax change: rebuild from the current default-currency price.
		const base = current?.price?.find((entry) => entry.currencyId === DEFAULT_CURRENCY_ID);
		if (base) {
			const gross = Number(base.gross);
			price = {
				...base,
				net: typeof data.netPrice === 'number' ? data.netPrice : grossToNet(gross, taxRate),
			};
			const listPrice = base.listPrice as IDataObject | undefined;
			if (listPrice) {
				price.listPrice = {
					...listPrice,
					net: grossToNet(Number(listPrice.gross), taxRate),
				};
			}
		}
	}

	if (price && typeof data.listPriceGross === 'number') {
		price.listPrice = {
			currencyId: DEFAULT_CURRENCY_ID,
			gross: data.listPriceGross,
			net: grossToNet(data.listPriceGross, taxRate),
			linked: true,
		};
	}
	if (price) {
		payload.price = [price];
	}

	if (hasPurchasePrice) {
		const gross = data.purchasePriceGross as number;
		payload.purchasePrices = [
			{
				currencyId: DEFAULT_CURRENCY_ID,
				gross,
				net: grossToNet(gross, taxRate),
				linked: true,
			},
		];
	}
}

async function loadPricing(this: IExecuteFunctions, id: string): Promise<ExistingProduct> {
	const records = await shopwareSearchPage.call(
		this,
		'product',
		{ ids: [id], includes: { product: ['id', 'taxId', 'price'] } },
		{ 'sw-inheritance': '1' },
	);
	const record = records[0] ?? {};
	return {
		id,
		taxId: record.taxId as string | undefined,
		price: record.price as IDataObject[] | undefined,
	};
}

async function existingVisibilities(
	this: IExecuteFunctions,
	productId: string,
	salesChannelIds: string[],
): Promise<Set<string>> {
	const records = await shopwareSearchPage.call(this, 'product_visibility', {
		filter: [
			{ type: 'equals', field: 'productId', value: productId },
			{ type: 'equalsAny', field: 'salesChannelId', value: salesChannelIds },
		],
		includes: { product_visibility: ['salesChannelId'] },
	});
	return new Set(records.map((record) => String(record.salesChannelId)));
}

async function resolveList(
	state: ExecutionState,
	entity: Parameters<ExecutionState['resolver']['resolveLocator']>[0],
	value: unknown,
): Promise<string[]> {
	const ids: string[] = [];
	for (const locator of locatorListValues(value)) {
		const id = await state.resolver.resolveLocator(entity, locator);
		if (id) {
			ids.push(id);
		}
	}
	return Array.from(new Set(ids));
}

async function resolveTags(
	state: ExecutionState,
	names: string[],
	createMissing: boolean,
): Promise<IDataObject[]> {
	const tags: IDataObject[] = [];
	for (const name of names) {
		const id = await state.resolver.find('tag', name);
		if (id) {
			tags.push({ id });
		} else if (createMissing) {
			const newId = generateId();
			state.resolver.remember('tag', name, newId);
			tags.push({ id: newId, name });
		} else {
			throw new NodeOperationError(
				state.node,
				`No tag found for "${name}". Enable "Create Missing Tags" to create it.`,
			);
		}
	}
	return tags;
}
