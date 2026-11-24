import type { IDataObject, IExecuteFunctions, INodeParameterResourceLocator } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { EntityKey } from '../../shared/entities';
import { contextHeaders } from '../../shared/options';
import { PLUGINS } from '../../shared/plugins';
import type { ExecutionState } from '../../shared/state';
import { shopwareApiRequest, shopwareSearch, shopwareSearchPage } from '../../shared/transport';
import {
	generateId,
	locatorListValues,
	parseJsonParameter,
	pick,
	splitList,
} from '../../shared/utils';

const ENTITY = 'novastrix_lexikon_entry';
const ROUTE = '/novastrix-lexikon-entry';
const PLUGIN = PLUGINS.lexikon;
const TEXT_COLUMNS = ['term', 'shortDefinition', 'description', 'metaTitle', 'metaDescription'];

/** Mapping entities of the many-to-many links (written through the sync API). */
export const MAPPINGS = {
	salesChannels: { entity: 'novastrix_lexikon_entry_sales_channel', field: 'salesChannelId' },
	relatedEntries: { entity: 'novastrix_lexikon_entry_related', field: 'relatedEntryId' },
} as const;
const GALLERY_ENTITY = 'novastrix_lexikon_entry_media';

/** Associations loaded with every entry, so the output can show names instead of IDs. */
const ENTRY_ASSOCIATIONS: IDataObject = {
	category: {},
	coverMedia: {},
	salesChannels: {},
	relatedEntries: {},
	media: { sort: [{ field: 'position', order: 'ASC' }], associations: { media: {} } },
};

/** What the form asks for, with references already resolved to IDs. */
export interface EntryInput {
	body: IDataObject;
	/** `undefined`: keep the current links; an array (also empty): replace them. */
	salesChannels?: string[];
	relatedEntries?: string[];
	gallery?: string[];
}

export async function executeLexikonEntry(
	this: IExecuteFunctions,
	state: ExecutionState,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	await state.requirePlugin(PLUGIN, i);
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const headers = await contextHeaders(state.resolver, options);
	const simplify = this.getNodeParameter('simplify', i, true) as boolean;
	const output = (record: IDataObject) => (simplify ? simplifyEntry(record) : record);

	switch (operation) {
		case 'get': {
			const id = await resolveEntry.call(this, state, i);
			return output(await loadEntry.call(this, id, headers, i));
		}

		case 'getAll': {
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

			const filter: IDataObject[] = [];
			if (filters.active !== undefined) {
				filter.push({ type: 'equals', field: 'active', value: filters.active });
			}
			if (filters.term) {
				filter.push({ type: 'contains', field: 'term', value: filters.term });
			}
			if (filters.initialLetter) {
				filter.push({
					type: 'equals',
					field: 'initialLetter',
					value: String(filters.initialLetter).trim().charAt(0).toUpperCase(),
				});
			}
			const categoryId = await state.resolver.resolveLocator(
				'lexikonCategory',
				filters.category as INodeParameterResourceLocator | undefined,
			);
			if (categoryId) {
				filter.push({ type: 'equals', field: 'categoryId', value: categoryId });
			}

			const records = await shopwareSearch.call(
				this,
				ENTITY,
				{ filter, sort: [{ field: 'term', order: 'ASC' }], associations: ENTRY_ASSOCIATIONS },
				limit,
				headers,
				PLUGIN,
			);
			return records.map(output);
		}

		case 'create': {
			const input = await readInput.call(this, state, 'additionalFields', i);
			input.body.term = this.getNodeParameter('term', i) as string;
			const id = await createEntry.call(this, input, headers);
			return output(await loadEntry.call(this, id, headers, i));
		}

		case 'upsert': {
			const term = (this.getNodeParameter('term', i) as string).trim();
			const input = await readInput.call(this, state, 'additionalFields', i);
			input.body.term = term;
			let id = await findByTerm.call(this, term, headers, i);
			if (id) {
				await updateEntry.call(this, id, input, headers, i);
			} else {
				id = await createEntry.call(this, input, headers);
			}
			return output(await loadEntry.call(this, id, headers, i));
		}

		case 'update': {
			const id = await resolveEntry.call(this, state, i);
			const input = await readInput.call(this, state, 'updateFields', i);
			const hasChanges =
				Object.keys(input.body).length > 0 ||
				input.salesChannels !== undefined ||
				input.relatedEntries !== undefined ||
				input.gallery !== undefined;
			if (!hasChanges) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', {
					itemIndex: i,
				});
			}
			await updateEntry.call(this, id, input, headers, i);
			return output(await loadEntry.call(this, id, headers, i));
		}

		case 'delete': {
			const id = await resolveEntry.call(this, state, i);
			await shopwareApiRequest.call(this, 'DELETE', `${ROUTE}/${id}`, { requiresPlugin: PLUGIN });
			return { id, deleted: true };
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for lexikon entries`,
				{ itemIndex: i },
			);
	}
}

/** Reads Additional/Update Fields and resolves every reference by name. */
async function readInput(
	this: IExecuteFunctions,
	state: ExecutionState,
	parameter: 'additionalFields' | 'updateFields',
	i: number,
): Promise<EntryInput> {
	const fields = this.getNodeParameter(parameter, i, {}) as IDataObject;
	const body = pick(fields, TEXT_COLUMNS);
	if (fields.active !== undefined) {
		body.active = fields.active;
	}
	if (fields.synonyms !== undefined) {
		body.synonyms = parseSynonyms(fields.synonyms);
	}
	const customFields = parseJsonParameter(fields.customFields, 'Custom Fields (JSON)');
	if (customFields && Object.keys(customFields).length > 0) {
		body.customFields = customFields;
	}

	const categoryId = await state.resolver.resolveLocator(
		'lexikonCategory',
		fields.category as INodeParameterResourceLocator | undefined,
	);
	if (categoryId) {
		body.categoryId = categoryId;
	}
	const coverMediaId = await state.resolver.resolveLocator(
		'media',
		fields.coverMedia as INodeParameterResourceLocator | undefined,
	);
	if (coverMediaId) {
		body.coverMediaId = coverMediaId;
	}

	const list = async (key: string, entity: EntityKey): Promise<string[] | undefined> => {
		if (fields[key] === undefined) {
			return undefined;
		}
		const ids: string[] = [];
		for (const locator of locatorListValues(fields[key])) {
			const id = await state.resolver.resolveLocator(entity, locator);
			if (id && !ids.includes(id)) {
				ids.push(id);
			}
		}
		return ids;
	};

	return {
		body,
		salesChannels: await list('salesChannels', 'salesChannel'),
		relatedEntries: await list('relatedEntries', 'lexikonEntry'),
		gallery: await list('gallery', 'media'),
	};
}

/** "PES, polyester fibre" or an array -> ["PES", "polyester fibre"], without duplicates. */
export function parseSynonyms(value: unknown): string[] {
	const seen = new Set<string>();
	return splitList(value).filter((synonym) => {
		const key = synonym.toLowerCase();
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

async function createEntry(
	this: IExecuteFunctions,
	input: EntryInput,
	headers: Record<string, string>,
): Promise<string> {
	const id = generateId();
	const body: IDataObject = { id, active: true, ...input.body };
	if (input.salesChannels?.length) {
		body.salesChannels = input.salesChannels.map((salesChannelId) => ({ id: salesChannelId }));
	}
	if (input.relatedEntries?.length) {
		body.relatedEntries = input.relatedEntries.map((relatedId) => ({ id: relatedId }));
	}
	if (input.gallery?.length) {
		body.media = input.gallery.map((mediaId, position) => ({ mediaId, position }));
	}
	await shopwareApiRequest.call(this, 'POST', ROUTE, { body, headers, requiresPlugin: PLUGIN });
	return id;
}

/**
 * Writes the columns with PATCH and replaces the given link lists through one sync request, like
 * the plugin's admin: nested many-to-many writes only add links, they never remove any.
 */
async function updateEntry(
	this: IExecuteFunctions,
	id: string,
	input: EntryInput,
	headers: Record<string, string>,
	i: number,
): Promise<void> {
	if (Object.keys(input.body).length > 0) {
		await shopwareApiRequest.call(this, 'PATCH', `${ROUTE}/${id}`, {
			body: input.body,
			headers,
			requiresPlugin: PLUGIN,
		});
	}

	if (
		input.salesChannels === undefined &&
		input.relatedEntries === undefined &&
		input.gallery === undefined
	) {
		return;
	}
	const current = await loadEntry.call(this, id, headers, i);
	const operations = buildLinkOperations(id, current, input);
	if (Object.keys(operations).length > 0) {
		await shopwareApiRequest.call(this, 'POST', '/_action/sync', {
			body: operations,
			headers: { 'single-operation': '1' },
		});
	}
}

/** Sync operations that turn the current links of `entry` into the desired ones. */
export function buildLinkOperations(
	entryId: string,
	entry: IDataObject,
	input: EntryInput,
): IDataObject {
	const operations: IDataObject = {};

	for (const key of ['salesChannels', 'relatedEntries'] as const) {
		const desired = input[key];
		if (desired === undefined) {
			continue;
		}
		const { entity, field } = MAPPINGS[key];
		const currentIds = ((entry[key] as IDataObject[] | undefined) ?? []).map((r) => String(r.id));
		const toAdd = desired.filter((id) => !currentIds.includes(id));
		const toDelete = currentIds.filter((id) => !desired.includes(id));
		if (toAdd.length > 0) {
			operations[`add-${key}`] = {
				entity,
				action: 'upsert',
				payload: toAdd.map((id) => ({ entryId, [field]: id })),
			};
		}
		if (toDelete.length > 0) {
			operations[`delete-${key}`] = {
				entity,
				action: 'delete',
				payload: toDelete.map((id) => ({ entryId, [field]: id })),
			};
		}
	}

	if (input.gallery !== undefined) {
		const rows = (entry.media as IDataObject[] | undefined) ?? [];
		const rowByMedia = new Map(rows.map((row) => [String(row.mediaId), String(row.id)]));
		const upserts = input.gallery.map((mediaId, position) => ({
			id: rowByMedia.get(mediaId) ?? generateId(),
			entryId,
			mediaId,
			position,
		}));
		const removed = rows
			.filter((row) => !input.gallery?.includes(String(row.mediaId)))
			.map((row) => ({ id: String(row.id) }));
		if (upserts.length > 0) {
			operations['upsert-gallery'] = { entity: GALLERY_ENTITY, action: 'upsert', payload: upserts };
		}
		if (removed.length > 0) {
			operations['delete-gallery'] = { entity: GALLERY_ENTITY, action: 'delete', payload: removed };
		}
	}

	return operations;
}

/** The single entry with exactly this term, undefined if none; several are an error. */
async function findByTerm(
	this: IExecuteFunctions,
	term: string,
	headers: Record<string, string>,
	i: number,
): Promise<string | undefined> {
	const records = await shopwareSearchPage.call(
		this,
		ENTITY,
		{ filter: [{ type: 'equals', field: 'term', value: term }], limit: 6 },
		headers,
		PLUGIN,
	);
	if (records.length > 1) {
		throw new NodeOperationError(
			this.getNode(),
			`"${term}" matches ${records.length > 5 ? 'more than 5' : records.length} lexikon entries`,
			{
				itemIndex: i,
				description: `Use Update with the entry's ID instead. Candidates: ${records
					.slice(0, 5)
					.map((record) => String(record.id))
					.join(', ')}`,
			},
		);
	}
	return records[0] ? String(records[0].id) : undefined;
}

async function resolveEntry(
	this: IExecuteFunctions,
	state: ExecutionState,
	i: number,
): Promise<string> {
	const id = await state.resolver.resolveLocator(
		'lexikonEntry',
		this.getNodeParameter('lexikonEntry', i) as INodeParameterResourceLocator,
	);
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'No lexikon entry given', { itemIndex: i });
	}
	return id;
}

async function loadEntry(
	this: IExecuteFunctions,
	id: string,
	headers: Record<string, string>,
	i: number,
): Promise<IDataObject> {
	const records = await shopwareSearchPage.call(
		this,
		ENTITY,
		{ ids: [id], limit: 1, associations: ENTRY_ASSOCIATIONS },
		headers,
		PLUGIN,
	);
	if (records.length === 0) {
		throw new NodeOperationError(this.getNode(), `Lexikon entry ${id} not found`, {
			itemIndex: i,
		});
	}
	return records[0];
}

const translated = (record: IDataObject | undefined, field: string): IDataObject[string] =>
	(record?.translated as IDataObject | undefined)?.[field] ?? record?.[field];

/** Flat entry with names instead of IDs, as shown in the plugin's admin. */
export function simplifyEntry(record: IDataObject): IDataObject {
	const category = record.category as IDataObject | undefined;
	const cover = record.coverMedia as IDataObject | undefined;
	const fileName = (media: IDataObject | undefined) =>
		media?.fileName ? `${String(media.fileName)}.${String(media.fileExtension ?? '')}` : undefined;

	return {
		id: record.id,
		term: translated(record, 'term'),
		shortDefinition: translated(record, 'shortDefinition'),
		description: translated(record, 'description'),
		synonyms: translated(record, 'synonyms') ?? [],
		active: record.active,
		initialLetter: record.initialLetter,
		category: category ? translated(category, 'name') : null,
		categoryId: record.categoryId ?? null,
		coverImage: fileName(cover) ?? null,
		coverMediaId: record.coverMediaId ?? null,
		gallery: ((record.media as IDataObject[] | undefined) ?? [])
			.slice()
			.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
			.map((row) => ({
				mediaId: row.mediaId,
				fileName: fileName(row.media as IDataObject | undefined) ?? null,
				url: (row.media as IDataObject | undefined)?.url ?? null,
			})),
		salesChannels: ((record.salesChannels as IDataObject[] | undefined) ?? []).map((channel) =>
			translated(channel, 'name'),
		),
		relatedEntries: ((record.relatedEntries as IDataObject[] | undefined) ?? []).map((entry) =>
			translated(entry, 'term'),
		),
		metaTitle: translated(record, 'metaTitle'),
		metaDescription: translated(record, 'metaDescription'),
		viewCount: record.viewCount,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}
