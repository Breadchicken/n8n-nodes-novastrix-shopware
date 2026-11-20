import type { IDataObject, IExecuteFunctions, INodeParameterResourceLocator } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { isShopwareId } from '../../shared/entities';
import type { ExecutionState } from '../../shared/state';
import { shopwareApiRequest, shopwareSearch, shopwareSearchPage } from '../../shared/transport';
import { splitList } from '../../shared/utils';
import { PLUGINS } from '../product/plugins';

const PLUGIN = PLUGINS.backInStock;
const ENTITY = 'novastrix_bis_subscription';
const BASE = '/_action/novastrix-back-in-stock';
/** Variant names are inherited; without this header they are null. */
const INHERITANCE = { 'sw-inheritance': '1' };
/** Tokens allow unsubscribing or confirming in the customer's name, so they never leave the shop. */
const SECRET_FIELDS = ['optInToken', 'unsubscribeToken'];

export async function executeBackInStock(
	this: IExecuteFunctions,
	state: ExecutionState,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	const request = async (method: 'GET' | 'POST' | 'PATCH', path: string, body?: IDataObject) =>
		(await shopwareApiRequest.call(this, method, path, {
			body,
			requiresPlugin: PLUGIN,
		})) as IDataObject;

	await state.requirePlugin(PLUGIN, i);

	switch (operation) {
		case 'get': {
			const id = readId.call(this, 'subscriptionId', i);
			const records = await shopwareSearchPage.call(
				this,
				ENTITY,
				{ ids: [id], associations: { product: {} } },
				INHERITANCE,
				PLUGIN,
			);
			if (records.length === 0) {
				throw new NodeOperationError(this.getNode(), `Subscription ${id} not found`, {
					itemIndex: i,
				});
			}
			return output(records[0], this.getNodeParameter('simplify', i, true) as boolean);
		}

		case 'getAll': {
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);
			const simplify = this.getNodeParameter('simplify', i, true) as boolean;
			const filter = await buildFilter.call(
				this,
				state,
				this.getNodeParameter('filters', i, {}) as IDataObject,
			);
			const records = await shopwareSearch.call(
				this,
				ENTITY,
				{
					...(filter.length > 0 ? { filter } : {}),
					associations: { product: {} },
					sort: [{ field: 'createdAt', order: 'DESC' }],
				},
				limit,
				INHERITANCE,
				PLUGIN,
			);
			return records.map((record) => output(record, simplify));
		}

		case 'unsubscribe': {
			const by = this.getNodeParameter('unsubscribeBy', i, 'id') as string;
			let ids: string[];
			if (by === 'email') {
				const email = String(this.getNodeParameter('email', i)).trim().toLowerCase();
				if (!email) {
					throw new NodeOperationError(this.getNode(), 'No email given', { itemIndex: i });
				}
				const records = await shopwareSearch.call(
					this,
					ENTITY,
					{
						filter: [
							{ type: 'equals', field: 'email', value: email },
							{
								type: 'not',
								queries: [{ type: 'equals', field: 'status', value: 'unsubscribed' }],
							},
						],
						includes: { [ENTITY]: ['id'] },
					},
					undefined,
					undefined,
					PLUGIN,
				);
				ids = records.map((record) => record.id as string);
			} else {
				ids = [readId.call(this, 'subscriptionId', i)];
			}
			// Same write as the plugin's own unsubscribe link: status plus the opt-in token removed.
			for (const id of ids) {
				await request('PATCH', `/novastrix-bis-subscription/${id}`, {
					status: 'unsubscribed',
					optInToken: null,
				});
			}
			return { unsubscribed: ids.length, ids };
		}

		case 'resend': {
			const ids = splitList(this.getNodeParameter('subscriptionIds', i));
			const invalid = ids.filter((id) => !isShopwareId(id));
			if (ids.length === 0 || invalid.length > 0) {
				throw new NodeOperationError(
					this.getNode(),
					ids.length === 0 ? 'No subscription IDs given' : `Invalid subscription ID: ${invalid[0]}`,
					{ itemIndex: i },
				);
			}
			return await request('POST', `${BASE}/resend-bulk`, { ids });
		}

		case 'getFailed': {
			const response = await request('GET', `${BASE}/dlq`);
			return (response.data as IDataObject[] | undefined) ?? [];
		}

		case 'retryFailed': {
			const subscriptionId = readId.call(this, 'subscriptionId', i);
			const fields = this.getNodeParameter('retryFields', i, {}) as IDataObject;
			const body: IDataObject = { subscriptionId };
			if (Number(fields.messengerId) > 0) {
				body.messengerId = Number(fields.messengerId);
			}
			if (typeof fields.logId === 'string' && fields.logId.trim() !== '') {
				body.logId = fields.logId.trim();
			}
			return { subscriptionId, ...(await request('POST', `${BASE}/dlq/retry`, body)) };
		}

		case 'getDemand': {
			const response = await request('GET', `${BASE}/variant-matrix`);
			return ((response.data as IDataObject[] | undefined) ?? []).map((row) => ({
				...row,
				waiting: Number(row.waiting),
			}));
		}

		case 'getRevenue':
			return await request('GET', `${BASE}/revenue`);

		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for back in stock`,
				{ itemIndex: i },
			);
	}
}

async function buildFilter(
	this: IExecuteFunctions,
	state: ExecutionState,
	filters: IDataObject,
): Promise<IDataObject[]> {
	const filter: IDataObject[] = [];
	const statuses = filters.status as string[] | undefined;
	if (statuses && statuses.length > 0) {
		filter.push({ type: 'equalsAny', field: 'status', value: statuses });
	}
	if (typeof filters.email === 'string' && filters.email.trim() !== '') {
		filter.push({ type: 'equals', field: 'email', value: filters.email.trim().toLowerCase() });
	}
	const productId = await state.resolver.resolveLocator(
		'product',
		filters.product as INodeParameterResourceLocator | undefined,
	);
	if (productId) {
		filter.push(
			filters.includeVariants === false
				? { type: 'equals', field: 'productId', value: productId }
				: {
						type: 'multi',
						operator: 'or',
						queries: [
							{ type: 'equals', field: 'productId', value: productId },
							{ type: 'equals', field: 'product.parentId', value: productId },
						],
					},
		);
	}
	const salesChannelId = await state.resolver.resolveLocator(
		'salesChannel',
		filters.salesChannel as INodeParameterResourceLocator | undefined,
	);
	if (salesChannelId) {
		filter.push({ type: 'equals', field: 'salesChannelId', value: salesChannelId });
	}
	if (filters.vip !== undefined) {
		filter.push({ type: 'equals', field: 'isVip', value: filters.vip });
	}
	if (typeof filters.createdAfter === 'string' && filters.createdAfter !== '') {
		filter.push({
			type: 'range',
			field: 'createdAt',
			parameters: { gte: filters.createdAfter },
		});
	}
	return filter;
}

function output(record: IDataObject, simplify: boolean): IDataObject {
	const clean = Object.fromEntries(
		Object.entries(record).filter(([key]) => !SECRET_FIELDS.includes(key)),
	) as IDataObject;
	if (!simplify) {
		return clean;
	}
	const product = (record.product as IDataObject | null | undefined) ?? {};
	return {
		id: record.id,
		email: record.email,
		status: record.status,
		source: record.source,
		productId: record.productId,
		productNumber: product.productNumber,
		productName: (product.translated as IDataObject | undefined)?.name ?? product.name,
		stock: product.availableStock ?? product.stock,
		customerId: record.customerId,
		salesChannelId: record.salesChannelId,
		isVip: record.isVip,
		createdAt: record.createdAt,
		optInConfirmedAt: record.optInConfirmedAt,
		notifiedAt: record.notifiedAt,
		notifiedCount: record.notifiedCount,
		clickedAt: record.clickedAt,
		convertedAt: record.convertedAt,
		convertedOrderId: record.convertedOrderId,
		bounceReason: record.bounceReason,
	};
}

function readId(this: IExecuteFunctions, parameter: string, i: number): string {
	const id = String(this.getNodeParameter(parameter, i)).trim();
	if (!isShopwareId(id)) {
		throw new NodeOperationError(this.getNode(), `"${id}" is not a valid subscription ID`, {
			itemIndex: i,
			description: 'Subscription IDs are 32 hexadecimal characters, as returned by Get Many',
		});
	}
	return id;
}
