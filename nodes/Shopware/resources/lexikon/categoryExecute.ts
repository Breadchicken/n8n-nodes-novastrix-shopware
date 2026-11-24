import type { IDataObject, IExecuteFunctions, INodeParameterResourceLocator } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { contextHeaders } from '../../shared/options';
import { PLUGINS } from '../../shared/plugins';
import type { ExecutionState } from '../../shared/state';
import { shopwareApiRequest, shopwareSearch, shopwareSearchPage } from '../../shared/transport';
import { generateId, pick } from '../../shared/utils';

const ENTITY = 'novastrix_lexikon_category';
const ROUTE = '/novastrix-lexikon-category';
const PLUGIN = PLUGINS.lexikon;
const COLUMNS = ['name', 'description', 'active', 'position'];

export async function executeLexikonCategory(
	this: IExecuteFunctions,
	state: ExecutionState,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	await state.requirePlugin(PLUGIN, i);
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const headers = await contextHeaders(state.resolver, options);

	switch (operation) {
		case 'get': {
			const id = await resolveCategory.call(this, state, i);
			return await loadCategory.call(this, id, headers, i);
		}

		case 'getAll': {
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

			const filter: IDataObject[] = [];
			if (filters.active !== undefined) {
				filter.push({ type: 'equals', field: 'active', value: filters.active });
			}
			if (filters.name) {
				filter.push({ type: 'contains', field: 'name', value: filters.name });
			}
			return await shopwareSearch.call(
				this,
				ENTITY,
				{ filter, sort: [{ field: 'position', order: 'ASC' }] },
				limit,
				headers,
				PLUGIN,
			);
		}

		case 'create': {
			const fields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const id = generateId();
			await shopwareApiRequest.call(this, 'POST', ROUTE, {
				body: { id, ...pick(fields, COLUMNS), name: this.getNodeParameter('name', i) as string },
				headers,
				requiresPlugin: PLUGIN,
			});
			return await loadCategory.call(this, id, headers, i);
		}

		case 'update': {
			const id = await resolveCategory.call(this, state, i);
			const body = pick(this.getNodeParameter('updateFields', i, {}) as IDataObject, COLUMNS);
			if (Object.keys(body).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', {
					itemIndex: i,
				});
			}
			await shopwareApiRequest.call(this, 'PATCH', `${ROUTE}/${id}`, {
				body,
				headers,
				requiresPlugin: PLUGIN,
			});
			return await loadCategory.call(this, id, headers, i);
		}

		case 'delete': {
			const id = await resolveCategory.call(this, state, i);
			await shopwareApiRequest.call(this, 'DELETE', `${ROUTE}/${id}`, { requiresPlugin: PLUGIN });
			return { id, deleted: true };
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for lexikon categories`,
				{ itemIndex: i },
			);
	}
}

async function resolveCategory(
	this: IExecuteFunctions,
	state: ExecutionState,
	i: number,
): Promise<string> {
	const id = await state.resolver.resolveLocator(
		'lexikonCategory',
		this.getNodeParameter('lexikonCategory', i) as INodeParameterResourceLocator,
	);
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'No lexikon category given', { itemIndex: i });
	}
	return id;
}

async function loadCategory(
	this: IExecuteFunctions,
	id: string,
	headers: Record<string, string>,
	i: number,
): Promise<IDataObject> {
	const records = await shopwareSearchPage.call(
		this,
		ENTITY,
		{ ids: [id], limit: 1 },
		headers,
		PLUGIN,
	);
	if (records.length === 0) {
		throw new NodeOperationError(this.getNode(), `Lexikon category ${id} not found`, {
			itemIndex: i,
		});
	}
	return records[0];
}
