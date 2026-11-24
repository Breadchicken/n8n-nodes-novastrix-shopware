import type { INodeProperties } from 'n8n-workflow';

import { entityLocator } from '../../shared/locators';
import { languageOption } from '../../shared/options';
import { pluginNotice, PLUGINS } from '../../shared/plugins';

const RESOURCE = 'lexikonCategory';

const show = (operation: string[], extra: Record<string, unknown[]> = {}) => ({
	show: { resource: [RESOURCE], operation, ...extra },
});

export const lexikonCategoryOperations: INodeProperties[] = [
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
				description: 'Create a lexikon category',
				action: 'Create a lexikon category',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a lexikon category. Its entries are kept without a category.',
				action: 'Delete a lexikon category',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a lexikon category',
				action: 'Get a lexikon category',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many lexikon categories',
				action: 'Get many lexikon categories',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a lexikon category',
				action: 'Update a lexikon category',
			},
		],
		default: 'getAll',
	},
];

/** Columns shared by create (Additional Fields) and update (Update Fields). */
const categoryDataFields: INodeProperties[] = [
	{
		displayName: 'Active',
		name: 'active',
		type: 'boolean',
		default: true,
		description: 'Whether the category is shown in the storefront',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description: 'Description of the category (translated)',
	},
	{
		displayName: 'Position',
		name: 'position',
		type: 'number',
		default: 0,
		description: 'Sort order of the category, lowest first',
	},
];

export const lexikonCategoryFields: INodeProperties[] = [
	pluginNotice(PLUGINS.lexikon, { show: { resource: [RESOURCE] } }, 'lexikonCategoryNotice'),

	/* -------------------------------- create -------------------------------- */
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Materials',
		description: 'Name of the category (translated)',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create']),
		options: categoryDataFields,
	},

	/* ------------------------- get / update / delete ------------------------ */
	entityLocator({
		displayName: 'Category',
		name: 'lexikonCategory',
		entity: 'lexikonCategory',
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
					displayName: 'Name',
					name: 'name',
					type: 'string',
					default: '',
				},
				...categoryDataFields,
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
				description: 'Whether to return only active (true) or only inactive (false) categories',
			},
			{
				displayName: 'Name Contains',
				name: 'name',
				type: 'string',
				default: '',
			},
		],
	},

	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['create', 'get', 'getAll', 'update']),
		options: [languageOption],
	},
];
