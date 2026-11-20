import type { INodeProperties } from 'n8n-workflow';

import { entityLocator } from '../../shared/locators';

const show = (operation: string[], extra: Record<string, unknown[]> = {}) => ({
	show: { resource: ['configurator'], operation, ...extra },
});

export const CONFIGURATOR_POSITIONS = [
	{
		name: 'Above Description Tabs',
		value: 'above-description-tabs',
		description: 'Below the buy box, above the description tabs (default)',
	},
	{ name: 'Below Description', value: 'below-description' },
	{ name: 'In Buy Box', value: 'in-buybox' },
];

export const configuratorOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['configurator'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a product configurator',
				action: 'Create a configurator',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a product configurator',
				action: 'Delete a configurator',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a product configurator',
				action: 'Get a configurator',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many product configurators',
				action: 'Get many configurators',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a product configurator',
				action: 'Update a configurator',
			},
		],
		default: 'getAll',
	},
];

/** One configurator step as form fields (mirrors the plugin's admin step editor). */
const stepValues: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		placeholder: 'e.g. Memory',
		description: 'Title of the step shown to customers',
	},
	{
		displayName: 'Step ID',
		name: 'id',
		type: 'string',
		default: '',
		placeholder: 'e.g. ram',
		description:
			'Stable ID used by dependencies. Leave empty to use "step_1", "step_2", ... by position.',
	},
	{
		displayName: 'Source',
		name: 'sourceType',
		type: 'options',
		options: [
			{ name: 'Selected Products', value: 'static' },
			{ name: 'Dynamic Product Group', value: 'product_stream' },
		],
		default: 'static',
		description: 'Where the selectable products come from',
	},
	{
		displayName: 'Products',
		name: 'products',
		type: 'string',
		default: '',
		placeholder: 'e.g. SW10001, SW10002',
		description:
			'Comma-separated product numbers, names or IDs. Used when Source is "Selected Products".',
	},
	entityLocator({
		displayName: 'Dynamic Product Group',
		name: 'productStream',
		entity: 'productStream',
		description: 'Used when Source is "Dynamic Product Group"',
	}),
	{
		displayName: 'Required',
		name: 'required',
		type: 'boolean',
		default: false,
		description: 'Whether customers must choose a product in this step',
	},
	{
		displayName: 'Allow Multiple',
		name: 'multiple',
		type: 'boolean',
		default: false,
		description: 'Whether customers can choose more than one product',
	},
	{
		displayName: 'Collapsed',
		name: 'accordionCollapsed',
		type: 'boolean',
		default: false,
		description: 'Whether the step is collapsed initially',
	},
	{
		displayName: 'Quantity Selectable',
		name: 'quantityEnabled',
		type: 'boolean',
		default: false,
		description: 'Whether customers can choose a quantity',
	},
	{
		displayName: 'Min Quantity',
		name: 'minQuantity',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 1,
	},
	{
		displayName: 'Max Quantity',
		name: 'maxQuantity',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 10,
	},
	{
		displayName: 'Sort',
		name: 'sort',
		type: 'options',
		options: [
			{ name: 'Name (A-Z)', value: 'name:asc' },
			{ name: 'Name (Z-A)', value: 'name:desc' },
			{ name: 'Price (Highest First)', value: 'price:desc' },
			{ name: 'Price (Lowest First)', value: 'price:asc' },
			{ name: 'Product Number (Ascending)', value: 'number:asc' },
			{ name: 'Product Number (Descending)', value: 'number:desc' },
		],
		default: 'name:asc',
	},
	{
		displayName: 'Pricing',
		name: 'pricingStrategy',
		type: 'options',
		options: [
			{ name: 'Regular Price', value: 'default' },
			{ name: 'Free', value: 'free' },
			{ name: 'Fixed Discount', value: 'absolute', description: 'Subtract an amount' },
			{ name: 'Percentage Discount', value: 'percent' },
		],
		default: 'default',
		description: 'Price of the products in this step',
	},
	{
		displayName: 'Pricing Value',
		name: 'pricingValue',
		type: 'number',
		typeOptions: { minValue: 0, numberPrecision: 2 },
		default: 0,
		description: 'Amount or percentage for the discount strategies',
	},
	{
		displayName: 'Preselected Products',
		name: 'defaultProducts',
		type: 'string',
		default: '',
		placeholder: 'e.g. SW10001',
		description: 'Comma-separated product numbers, names or IDs that are preselected',
	},
	{
		displayName: 'Excluded Products',
		name: 'excludedProducts',
		type: 'string',
		default: '',
		description:
			'Comma-separated product numbers, names or IDs that are never offered (useful with dynamic product groups)',
	},
	{
		displayName: 'Max Products Shown',
		name: 'maxProducts',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
		description: 'Max number of products shown in this step (0 = no limit)',
	},
	{
		displayName: 'Dependencies',
		name: 'dependencies',
		type: 'fixedCollection',
		placeholder: 'Add Dependency',
		default: {},
		typeOptions: { multipleValues: true },
		description: 'Show this step only if an earlier step has a certain selection',
		options: [
			{
				displayName: 'Dependency',
				name: 'items',
				values: [
					{
						displayName: 'Step',
						name: 'stepId',
						type: 'string',
						default: '',
						description: 'ID or name of the step this step depends on',
					},
					{
						displayName: 'Condition',
						name: 'operator',
						type: 'options',
						options: [
							{ name: 'All Of', value: 'all_of' },
							{ name: 'Equals', value: 'equals' },
							{ name: 'None Of', value: 'none_of' },
							{ name: 'Not Equals', value: 'not_equals' },
							{ name: 'One Of', value: 'one_of' },
						],
						default: 'one_of',
					},
					{
						displayName: 'Products',
						name: 'products',
						type: 'string',
						default: '',
						description: 'Comma-separated product numbers, names or IDs',
					},
				],
			},
		],
	},
];

const stepsProperty = (operation: string[]): INodeProperties => ({
	displayName: 'Steps',
	name: 'steps',
	type: 'fixedCollection',
	placeholder: 'Add Step',
	default: {},
	typeOptions: { multipleValues: true, sortable: true },
	description:
		operation[0] === 'update'
			? 'Steps of the configurator. If set, they replace all existing steps.'
			: 'Steps of the configurator, in order',
	displayOptions: show(operation, { stepInput: ['fields'] }),
	options: [{ displayName: 'Step', name: 'items', values: stepValues }],
});

const stepInputOptions = [
	{ name: 'Using Fields', value: 'fields' },
	{ name: 'Using JSON', value: 'json' },
];

const stepInputProperties: INodeProperties[] = [
	{
		displayName: 'Define Steps',
		name: 'stepInput',
		type: 'options',
		options: stepInputOptions,
		default: 'fields',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Define Steps',
		name: 'stepInput',
		type: 'options',
		options: [{ name: 'Keep Existing Steps', value: 'keep' }, ...stepInputOptions],
		default: 'keep',
		displayOptions: show(['update']),
	},
];

const stepsJsonProperty = (operation: string[]): INodeProperties => ({
	displayName: 'Steps (JSON)',
	name: 'stepsJson',
	type: 'json',
	default: '[]',
	description:
		"Steps in the plugin's own format, as returned by Get in configuration.steps. Products are not resolved by number or name here.",
	displayOptions: show(operation, { stepInput: ['json'] }),
});

const settingsOptions: INodeProperties[] = [
	{
		displayName: 'Active',
		name: 'active',
		type: 'boolean',
		default: true,
		description: 'Whether the configurator is shown in the storefront',
	},
	{
		displayName: 'Cache TTL (Seconds)',
		name: 'cacheTtl',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 300,
	},
	{
		displayName: 'Label',
		name: 'label',
		type: 'string',
		default: '',
		description: 'Heading shown above the configurator',
	},
	{
		displayName: 'Lazy Load Batch Size',
		name: 'lazyBatchSize',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 24,
		description: 'Number of products loaded at once per step',
	},
	{
		displayName: 'Position',
		name: 'position',
		type: 'options',
		options: CONFIGURATOR_POSITIONS,
		default: 'above-description-tabs',
		description:
			'Where the configurator appears on the product page. One configurator per position.',
	},
	{
		displayName: 'Step Layout',
		name: 'stepLayout',
		type: 'options',
		options: [
			{ name: 'Rows', value: 'rows' },
			{ name: 'Columns', value: 'columns' },
		],
		default: 'rows',
	},
];

const configuratorLocator = (operation: string[]) =>
	entityLocator({
		displayName: 'Configurator',
		name: 'configurator',
		entity: 'configurator',
		required: true,
		displayOptions: show(operation),
	});

export const configuratorFields: INodeProperties[] = [
	/* -------------------------------- create -------------------------------- */
	entityLocator({
		displayName: 'Product',
		name: 'product',
		entity: 'product',
		required: true,
		description: 'Product page that shows the configurator',
		displayOptions: show(['create']),
	}),
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Notebook Bundle',
		description: 'Internal name of the configurator',
		displayOptions: show(['create']),
	},
	stepInputProperties[0],
	stepsProperty(['create']),
	stepsJsonProperty(['create']),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create']),
		options: settingsOptions,
	},

	/* ------------------------- get / update / delete ------------------------ */
	configuratorLocator(['get', 'update', 'delete']),
	stepInputProperties[1],
	stepsProperty(['update']),
	stepsJsonProperty(['update']),
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
				entityLocator({
					displayName: 'Product',
					name: 'product',
					entity: 'product',
				}),
				...settingsOptions,
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
				description: 'Whether to return only active (true) or only inactive (false) configurators',
			},
			entityLocator({
				displayName: 'Product',
				name: 'product',
				entity: 'product',
				description: 'Only configurators of this product',
			}),
		],
	},
];
