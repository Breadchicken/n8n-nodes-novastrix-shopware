import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import type { EntityKey } from '../shared/entities';
import { ENTITY_KEYS, getEntityConfig } from '../shared/entities';
import { searchMethodName } from '../shared/locators';
import { buildCriteria } from '../shared/resolver';
import { adminUrl, shopwareSearchPage } from '../shared/transport';

const PAGE_SIZE = 50;

type ListSearchMethod = (
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
) => Promise<INodeListSearchResult>;

/**
 * Builds the searchable, paginated dropdown for an entity. Unlike capped `loadOptions` lists,
 * this pages through the whole table (`paginationToken` is the next page number).
 */
export function createListSearch(key: EntityKey): ListSearchMethod {
	const config = getEntityConfig(key);

	return async function (this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		const page = Number(paginationToken) > 0 ? Number(paginationToken) : 1;
		const term = filter?.trim() ?? '';

		const filters: IDataObject[] = term
			? [
					{
						type: 'multi',
						operator: 'or',
						queries: config.searchFields.map((field) => ({
							type: 'contains',
							field,
							value: term,
						})),
					},
				]
			: [];

		const criteria = buildCriteria(config, filters, PAGE_SIZE);
		criteria.page = page;
		if (config.sortField) {
			criteria.sort = [{ field: config.sortField, order: 'ASC', naturalSorting: true }];
		}

		const records = await shopwareSearchPage.call(this, config.entity, criteria, config.headers);

		const results = await Promise.all(
			records.map(async (record) => ({
				name: config.display(record),
				value: String(record.id),
				url: await adminUrl.call(this, config.adminPath, String(record.id)),
			})),
		);

		return {
			results,
			paginationToken: records.length === PAGE_SIZE ? String(page + 1) : undefined,
		};
	};
}

export const listSearch: Record<string, ListSearchMethod> = Object.fromEntries(
	ENTITY_KEYS.map((key) => [searchMethodName(key), createListSearch(key)]),
);
