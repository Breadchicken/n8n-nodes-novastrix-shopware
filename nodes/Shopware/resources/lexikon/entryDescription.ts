import type { INodeProperties } from 'n8n-workflow';

import { entityLocator, entityLocatorList } from '../../shared/locators';
import { languageOption } from '../../shared/options';
import { pluginNotice, PLUGINS } from '../../shared/plugins';

const RESOURCE = 'lexikonEntry';

const show = (operation: string[], extra: Record<string, unknown[]> = {}) => ({
	show: { resource: [RESOURCE], operation, ...extra },
});

export const lexikonEntryOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a lexikon entry',
				action: 'Create a lexikon entry',
			},
			{
				name: 'Create or Update',
				value: 'upsert',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				action: 'Create or update a lexikon entry',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a lexikon entry',
				action: 'Delete a lexikon entry',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a lexikon entry',
				action: 'Get a lexikon entry',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many lexikon entries',
				action: 'Get many lexikon entries',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a lexikon entry',
				action: 'Update a lexikon entry',
			},
		],
		default: 'getAll',
	},
];

/** Fields shared by create/upsert (Additional Fields) and update (Update Fields). */
const entryDataFields: INodeProperties[] = [
	{
		displayName: 'Active',
		name: 'active',
		type: 'boolean',
		default: true,
		description: 'Whether the entry is shown in the storefront',
	},
	entityLocator({
		displayName: 'Category',
		name: 'category',
		entity: 'lexikonCategory',
		description: 'Lexikon category of the entry',
	}),
	entityLocator({
		displayName: 'Cover Image',
		name: 'coverMedia',
		entity: 'media',
		description:
			'Image shown on the entry page. Pick an existing media file; upload new images in Shopware first.',
	}),
	{
		displayName: 'Custom Fields (JSON)',
		name: 'customFields',
		type: 'json',
		default: '{}',
		description: 'Custom field values as a JSON object (translated)',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 6 },
		default: '',
		description: 'Full explanation of the term (HTML allowed)',
	},
	entityLocatorList({
		displayName: 'Gallery',
		name: 'gallery',
		itemName: 'Image',
		entity: 'media',
		description:
			'Images of the entry in this order. Replaces the existing gallery on update; add the field without images to clear it.',
	}),
	{
		displayName: 'Meta Description',
		name: 'metaDescription',
		type: 'string',
		default: '',
	},
	{
		displayName: 'Meta Title',
		name: 'metaTitle',
		type: 'string',
		default: '',
	},
	entityLocatorList({
		displayName: 'Related Entries',
		name: 'relatedEntries',
		itemName: 'Entry',
		entity: 'lexikonEntry',
		description:
			'Entries linked as "related". Replaces the existing links on update; add the field without entries to clear them.',
	}),
	entityLocatorList({
		displayName: 'Sales Channels',
		name: 'salesChannels',
		itemName: 'Sales Channel',
		entity: 'salesChannel',
		description:
			'Sales channels that show the entry. No sales channel means all of them. Replaces the existing selection on update.',
	}),
	{
		displayName: 'Short Definition',
		name: 'shortDefinition',
		type: 'string',
		default: '',
		description: 'One-line definition, used in tooltips and the overview (max. 255 characters).',
	},
	{
		displayName: 'Synonyms',
		name: 'synonyms',
		type: 'string',
		default: '',
		placeholder: 'e.g. PES, polyester fibre',
		description:
			'Comma-separated alternative terms. The storefront links them like the term itself.',
	},
];

export const lexikonEntryFields: INodeProperties[] = [
	pluginNotice(PLUGINS.lexikon, { show: { resource: [RESOURCE] } }, 'lexikonEntryNotice'),

	/* ---------------------------- create / upsert --------------------------- */
	{
		displayName: 'Term',
		name: 'term',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Polyester',
		description:
			'The glossary term (translated). Create or Update looks the entry up by this term in the selected language.',
		displayOptions: show(['create', 'upsert']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create', 'upsert']),
		options: entryDataFields,
	},

	/* ------------------------- get / update / delete ------------------------ */
	entityLocator({
		displayName: 'Entry',
		name: 'lexikonEntry',
		entity: 'lexikonEntry',
		required: true,
		displayOptions: show(['get', 'update', 'delete']),
	}),
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['update']),
		options: (
			[
				{
					displayName: 'Term',
					name: 'term',
					type: 'string',
					default: '',
				},
				...entryDataFields,
			] as INodeProperties[]
		).sort((a, b) => a.displayName.localeCompare(b.displayName)),
	},

	/* -------------------------------- getAll -------------------------------- */
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: show(['getAll']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: show(['getAll'], { returnAll: [false] }),
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Active',
				name: 'active',
				type: 'boolean',
				default: true,
				description: 'Whether to return only active (true) or only inactive (false) entries',
			},
			entityLocator({
				displayName: 'Category',
				name: 'category',
				entity: 'lexikonCategory',
				description: 'Only entries of this category',
			}),
			{
				displayName: 'Initial Letter',
				name: 'initialLetter',
				type: 'string',
				default: '',
				placeholder: 'e.g. P',
				description: 'Only entries filed under this letter of the A-Z index',
			},
			{
				displayName: 'Term Contains',
				name: 'term',
				type: 'string',
				default: '',
			},
		],
	},

	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return a simplified version of the response instead of the raw data, with names instead of IDs for category, sales channels, related entries and images',
		displayOptions: show(['create', 'upsert', 'update', 'get', 'getAll']),
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['create', 'upsert', 'update', 'get', 'getAll']),
		options: [languageOption],
	},
];
