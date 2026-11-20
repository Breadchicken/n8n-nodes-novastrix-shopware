import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { shopwareApiRequest } from '../shared/transport';

type LoadOptionsMethod = (this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>;

interface SchemaField {
	type?: string;
	relation?: string;
	flags?: Record<string, unknown>;
}

/**
 * Lists the fields of an entity from the shop's own schema (`/_info/entity-schema.json`), so
 * custom fields of plugins show up too. Associations are excluded; they are selected separately.
 */
export function createFieldLoader(entity: string): LoadOptionsMethod {
	return async function (this: ILoadOptionsFunctions) {
		const schema = (await shopwareApiRequest.call(
			this,
			'GET',
			'/_info/entity-schema.json',
		)) as Record<string, { properties?: Record<string, SchemaField> }>;

		const properties = schema[entity]?.properties ?? {};

		return Object.entries(properties)
			.filter(([, field]) => field.type !== 'association')
			.map(([name, field]) => {
				const flags = Object.keys(field.flags ?? {});
				const hints = [
					field.type,
					flags.includes('translatable') ? 'translatable' : undefined,
					flags.includes('write_protected') ? 'read-only' : undefined,
				].filter(Boolean);
				return {
					name,
					value: name,
					description: hints.join(', '),
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	};
}

export const loadOptions: Record<string, LoadOptionsMethod> = {
	getProductFields: createFieldLoader('product'),
};
