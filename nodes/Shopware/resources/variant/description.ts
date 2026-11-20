import type { INodeProperties } from 'n8n-workflow';

import { entityLocator } from '../../shared/locators';

const show = (operation: string[], extra: Record<string, unknown[]> = {}) => ({
	show: { resource: ['variant'], operation, ...extra },
});

export const variantOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['variant'] } },
		options: [
			{
				name: 'Add Configurator Option',
				value: 'addOption',
				description:
					'Add a property option (e.g. "Color: Red") to the variant configurator of a parent',
				action: 'Add a configurator option',
			},
			{
				name: 'Detach',
				value: 'detach',
				description:
					'Turn a variant into a standalone product, keeping every value it inherited from its parent',
				action: 'Detach a variant',
			},
			{
				name: 'Get Configurator Options',
				value: 'getOptions',
				description: 'Get the property options that span the variants of a parent',
				action: 'Get configurator options',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get the variants of a parent product',
				action: 'Get many variants',
			},
			{
				name: 'Merge',
				value: 'merge',
				description:
					'Combine standalone products into variants of an existing or a new (AI-generated) parent',
				action: 'Merge products into variants',
			},
			{
				name: 'Move',
				value: 'move',
				description: 'Move a variant to another parent',
				action: 'Move a variant',
			},
			{
				name: 'Remove Configurator Option',
				value: 'removeOption',
				description: 'Remove a property option from the variant configurator of a parent',
				action: 'Remove a configurator option',
			},
		],
		default: 'merge',
	},
];

const parentLocator = (operation: string[], extra: Record<string, unknown[]> = {}) =>
	entityLocator({
		displayName: 'Parent Product',
		name: 'parent',
		entity: 'product',
		required: true,
		description: 'The parent (main) product',
		displayOptions: show(operation, extra),
	});

const variantLocator = (operation: string[]) =>
	entityLocator({
		displayName: 'Variant',
		name: 'variant',
		entity: 'product',
		required: true,
		description: 'The variant product',
		displayOptions: show(operation),
	});

export const variantFields: INodeProperties[] = [
	/* --------------------------------- merge -------------------------------- */
	{
		displayName: 'Parent',
		name: 'parentMode',
		type: 'options',
		options: [
			{
				name: 'Existing Product',
				value: 'existing',
				description: 'Attach the products as variants of an existing parent',
			},
			{
				name: 'Create With AI',
				value: 'create',
				description:
					'Create a new parent from the products; name and texts are generated with OpenAI (API key configured in the plugin)',
			},
		],
		default: 'existing',
		displayOptions: show(['merge']),
	},
	parentLocator(['merge'], { parentMode: ['existing'] }),
	{
		displayName: 'Products',
		name: 'products',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. SW10001, SW10002, SW10003',
		description:
			'Comma-separated product numbers, names or IDs of the standalone products that become variants. An expression returning an array works too.',
		displayOptions: show(['merge']),
	},
	{
		displayName: 'Variant Properties',
		name: 'propertyGroups',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Color, Size',
		description:
			'Comma-separated property groups (names or IDs) the variants differ in. Every product must have exactly one option of each group.',
		displayOptions: show(['merge']),
	},
	{
		displayName: 'Options',
		name: 'mergeOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['merge']),
		options: [
			{
				displayName: 'AI Model',
				name: 'model',
				type: 'string',
				default: 'gpt-4.1-mini',
				description: 'OpenAI model used to generate the parent texts (Create With AI only)',
			},
			{
				displayName: 'Conflicting Values',
				name: 'autoResolve',
				type: 'options',
				options: [
					{
						name: 'Leave Empty',
						value: 'skip',
						description: 'Fields that differ between the products stay empty on the parent',
					},
					{
						name: 'Use First Product',
						value: 'first_child',
						description: 'The value of the first product wins',
					},
					{
						name: 'Fail',
						value: 'strict',
						description: 'Stop and list the differing fields; nothing is written',
					},
				],
				default: 'skip',
				description:
					'What to do when products differ in fields the new parent takes over, e.g. manufacturer or weight (Create With AI only)',
			},
			{
				displayName: 'Dry Run',
				name: 'dryRun',
				type: 'boolean',
				default: false,
				description:
					'Whether to only validate and return what would happen, without writing anything (no AI call)',
			},
			{
				displayName: 'Parent Fields (JSON)',
				name: 'fieldOverrides',
				type: 'json',
				default: '{}',
				description:
					'Fixed values for the new parent, e.g. {"manufacturerId": "..."}. Use "__null__" to force an empty value (Create With AI only).',
			},
		],
	},

	/* ---------------------------- detach / move ----------------------------- */
	variantLocator(['detach', 'move']),
	entityLocator({
		displayName: 'New Parent Product',
		name: 'newParent',
		entity: 'product',
		required: true,
		description:
			'The parent to move the variant to. Values inherited from the old parent are kept on the variant.',
		displayOptions: show(['move']),
	}),

	/* -------------------------- configurator options ------------------------ */
	parentLocator(['getAll', 'getOptions', 'addOption', 'removeOption']),
	entityLocator({
		displayName: 'Option',
		name: 'option',
		entity: 'propertyOption',
		required: true,
		description:
			'The property option, e.g. "Color: Red". Removing fails while a variant still uses it.',
		displayOptions: show(['addOption', 'removeOption']),
	}),

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
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return only ID, number, name, stock, price, active and the options ("Color: Red") instead of the full product',
		displayOptions: show(['getAll']),
	},
];
