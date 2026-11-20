import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { shopwareApiRequest, shopwareSearch } from '../shared/transport';

type LoadOptionsMethod = (this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>;

interface SchemaField {
	type?: string;
	relation?: string;
	entity?: string;
	flags?: Record<string, unknown>;
}

type EntitySchema = Record<string, { properties?: Record<string, SchemaField> }>;

async function loadSchemaFields(
	this: ILoadOptionsFunctions,
	entity: string,
): Promise<Array<[string, SchemaField]>> {
	const schema = (await shopwareApiRequest.call(
		this,
		'GET',
		'/_info/entity-schema.json',
	)) as EntitySchema;
	return Object.entries(schema[entity]?.properties ?? {});
}

const RELATION_LABELS: Record<string, string> = {
	many_to_one: 'single',
	one_to_one: 'single',
	one_to_many: 'list',
	many_to_many: 'list',
};

/**
 * Lists the fields of an entity from the shop's own schema (`/_info/entity-schema.json`), so
 * custom fields of plugins show up too. Associations are excluded; they are selected separately.
 */
export function createFieldLoader(entity: string): LoadOptionsMethod {
	return async function (this: ILoadOptionsFunctions) {
		const properties = await loadSchemaFields.call(this, entity);

		return properties
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

/**
 * Lists the associations of an entity from the shop's schema, including those added by plugins.
 * The description names the target entity and whether it is a single record or a list.
 */
export function createAssociationLoader(entity: string): LoadOptionsMethod {
	return async function (this: ILoadOptionsFunctions) {
		const properties = await loadSchemaFields.call(this, entity);

		return properties
			.filter(([, field]) => field.type === 'association')
			.map(([name, field]) => ({
				name,
				value: name,
				description: [field.entity, RELATION_LABELS[field.relation ?? ''] ?? field.relation]
					.filter(Boolean)
					.join(', '),
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	};
}

/** Document types of the shop (invoice, delivery note, ZUGFeRD, app-provided, ...). */
async function getDocumentTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const types = await shopwareSearch.call(this, 'document_type', {
		sort: [{ field: 'name', order: 'ASC' }],
	});
	return types.map((type) => ({
		name: String((type.translated as { name?: string } | undefined)?.name ?? type.name),
		value: String(type.technicalName),
		description: String(type.technicalName),
	}));
}

export const loadOptions: Record<string, LoadOptionsMethod> = {
	getDocumentTypes,
	getProductAssociations: createAssociationLoader('product'),
	getProductFields: createFieldLoader('product'),
};
