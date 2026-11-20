import type { INodeProperties } from 'n8n-workflow';

import { entityLocator, entityLocatorList } from '../../shared/locators';
import { languageOption } from '../../shared/options';
import { novastrixProductFields } from './plugins';

const show = (operation: string[]) => ({ show: { resource: ['product'], operation } });

export const productOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['product'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a product',
				action: 'Create a product',
			},
			{
				name: 'Create or Update',
				value: 'upsert',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				action: 'Create or update a product',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a product',
				action: 'Delete a product',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a product',
				action: 'Get a product',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many products',
				action: 'Get many products',
			},
			{
				name: 'Get Quality Audit',
				value: 'getAudit',
				description:
					'Get the latest quality audit (requires the Novastrix Product Dashboard plugin)',
				action: 'Get the quality audit of a product',
			},
			{
				name: 'Run Quality Audit',
				value: 'runAudit',
				description: 'Re-audit a product now (requires the Novastrix Product Dashboard plugin)',
				action: 'Run a quality audit for a product',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a product',
				action: 'Update a product',
			},
		],
		default: 'get',
	},
];

/** Product fields shared by "Additional Fields" (create) and "Update Fields" (update). */
function productDataFields(): INodeProperties[] {
	return [
		{
			displayName: 'Active',
			name: 'active',
			type: 'boolean',
			default: true,
			description: 'Whether the product is active',
		},
		entityLocatorList({
			displayName: 'Categories',
			name: 'categories',
			itemName: 'Category',
			entity: 'category',
			description:
				'Categories to assign. Look them up by name or path, e.g. "Home > Shoes". Existing assignments are kept.',
		}),
		{
			displayName: 'Custom Fields (JSON)',
			name: 'customFields',
			type: 'json',
			default: '{}',
			description: 'Custom field values as a JSON object, e.g. {"my_field": "value"}',
		},
		entityLocator({
			displayName: 'Delivery Time',
			name: 'deliveryTime',
			entity: 'deliveryTime',
		}),
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			typeOptions: { rows: 4 },
			default: '',
			description: 'Product description (HTML allowed)',
		},
		{
			displayName: 'EAN',
			name: 'ean',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Height (Mm)',
			name: 'height',
			type: 'number',
			default: 0,
		},
		{
			displayName: 'Is Closeout',
			name: 'isCloseout',
			type: 'boolean',
			default: false,
			description: 'Whether the product can only be bought while in stock',
		},
		{
			displayName: 'Keywords',
			name: 'keywords',
			type: 'string',
			default: '',
			description: 'Search keywords',
		},
		{
			displayName: 'Length (Mm)',
			name: 'length',
			type: 'number',
			default: 0,
		},
		{
			displayName: 'List Price (Gross)',
			name: 'listPriceGross',
			type: 'number',
			typeOptions: { minValue: 0, numberPrecision: 2 },
			default: 0,
			description: 'Former/recommended price shown as strike-through price',
		},
		entityLocator({
			displayName: 'Manufacturer',
			name: 'manufacturer',
			entity: 'manufacturer',
		}),
		{
			displayName: 'Manufacturer Number',
			name: 'manufacturerNumber',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Mark as Topseller',
			name: 'markAsTopseller',
			type: 'boolean',
			default: false,
			description: 'Whether the product is highlighted as a topseller',
		},
		{
			displayName: 'Max Purchase',
			name: 'maxPurchase',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 1,
		},
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
		{
			displayName: 'Min Purchase',
			name: 'minPurchase',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 1,
		},
		{
			displayName: 'Net Price',
			name: 'netPrice',
			type: 'number',
			typeOptions: { minValue: 0, numberPrecision: 4 },
			default: 0,
			description: 'Net price. If not set, it is calculated from the gross price and the tax rate.',
		},
		entityLocatorList({
			displayName: 'Properties',
			name: 'properties',
			itemName: 'Property',
			entity: 'propertyOption',
			description: 'Property options to assign, e.g. "Color: Red". Existing assignments are kept.',
		}),
		{
			displayName: 'Purchase Price (Gross)',
			name: 'purchasePriceGross',
			type: 'number',
			typeOptions: { minValue: 0, numberPrecision: 2 },
			default: 0,
		},
		{
			displayName: 'Purchase Steps',
			name: 'purchaseSteps',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 1,
		},
		{
			displayName: 'Raw Fields (JSON)',
			name: 'rawFields',
			type: 'json',
			default: '{}',
			description:
				'Any additional product fields as a JSON object. Merged last, so it can override the fields above.',
		},
		{
			displayName: 'Release Date',
			name: 'releaseDate',
			type: 'dateTime',
			default: '',
		},
		entityLocatorList({
			displayName: 'Sales Channels',
			name: 'salesChannels',
			itemName: 'Sales Channel',
			entity: 'salesChannel',
			description:
				'Sales channels in which the product is visible (search and listing). Existing visibilities are kept.',
		}),
		{
			displayName: 'Shipping Free',
			name: 'shippingFree',
			type: 'boolean',
			default: false,
			description: 'Whether the product ships for free',
		},
		{
			displayName: 'Tags',
			name: 'tags',
			type: 'string',
			default: '',
			placeholder: 'e.g. Sale, New',
			description: 'Comma-separated tag names or IDs. Existing tags are kept.',
		},
		{
			displayName: 'Weight (Kg)',
			name: 'weight',
			type: 'number',
			typeOptions: { minValue: 0, numberPrecision: 3 },
			default: 0,
		},
		{
			displayName: 'Width (Mm)',
			name: 'width',
			type: 'number',
			default: 0,
		},
	];
}

const createTagsOption: INodeProperties = {
	displayName: 'Create Missing Tags',
	name: 'createMissingTags',
	type: 'boolean',
	default: false,
	description: 'Whether to create tags that do not exist yet instead of failing',
};

const productLocator = (operation: string[]) =>
	entityLocator({
		displayName: 'Product',
		name: 'product',
		entity: 'product',
		required: true,
		displayOptions: show(operation),
	});

export const productFields: INodeProperties[] = [
	/* -------------------------------------------------------------------------- */
	/*                         product:create / product:upsert                    */
	/* -------------------------------------------------------------------------- */
	{
		displayName: 'Product Number',
		name: 'productNumber',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. SW10001',
		description:
			'Unique product number (SKU). For "Create or Update" it decides whether the product exists.',
		displayOptions: show(['create', 'upsert']),
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['create', 'upsert']),
	},
	entityLocator({
		displayName: 'Tax Rate',
		name: 'tax',
		entity: 'tax',
		required: true,
		description: 'Tax rate of the product. Look it up by rate ("19%") or by name.',
		displayOptions: show(['create', 'upsert']),
	}),
	{
		displayName: 'Gross Price',
		name: 'grossPrice',
		type: 'number',
		required: true,
		typeOptions: { minValue: 0, numberPrecision: 2 },
		default: 0,
		description: "Gross price in the shop's default currency",
		displayOptions: show(['create', 'upsert']),
	},
	{
		displayName: 'Stock',
		name: 'stock',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: show(['create', 'upsert']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create', 'upsert']),
		options: productDataFields(),
	},

	/* -------------------------------------------------------------------------- */
	/*                   product:get / product:update / product:delete            */
	/* -------------------------------------------------------------------------- */
	productLocator(['get', 'update', 'delete', 'getAudit', 'runAudit']),
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
					displayName: 'Gross Price',
					name: 'grossPrice',
					type: 'number',
					typeOptions: { minValue: 0, numberPrecision: 2 },
					default: 0,
					description: "Gross price in the shop's default currency",
				},
				{
					displayName: 'Name',
					name: 'name',
					type: 'string',
					default: '',
				},
				{
					displayName: 'Product Number',
					name: 'productNumber',
					type: 'string',
					default: '',
				},
				{
					displayName: 'Stock',
					name: 'stock',
					type: 'number',
					default: 0,
				},
				entityLocator({
					displayName: 'Tax Rate',
					name: 'tax',
					entity: 'tax',
				}),
				...productDataFields(),
			] as INodeProperties[]
		).sort((a, b) => a.displayName.localeCompare(b.displayName)),
	},

	{
		...novastrixProductFields,
		displayOptions: show(['create', 'upsert', 'update']),
	},

	/* -------------------------------------------------------------------------- */
	/*                                product:getAll                              */
	/* -------------------------------------------------------------------------- */
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
		displayOptions: { show: { resource: ['product'], operation: ['getAll'], returnAll: [false] } },
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
				description: 'Whether to return only active (true) or only inactive (false) products',
			},
			entityLocator({
				displayName: 'Category',
				name: 'category',
				entity: 'category',
				description: 'Only products assigned to this category',
			}),
			{
				displayName: 'Criteria Filter (JSON)',
				name: 'criteriaFilter',
				type: 'json',
				default: '[]',
				description:
					'Additional Shopware DAL filters as a JSON array, e.g. [{"type": "range", "field": "stock", "parameters": {"lt": 5}}]',
			},
			entityLocator({
				displayName: 'Manufacturer',
				name: 'manufacturer',
				entity: 'manufacturer',
				description: 'Only products of this manufacturer',
			}),
			{
				displayName: 'Only Main Products',
				name: 'onlyMainProducts',
				type: 'boolean',
				default: true,
				description: 'Whether to exclude variants and return only main products',
			},
			{
				displayName: 'Search Term',
				name: 'term',
				type: 'string',
				default: '',
				description: 'Full-text search over name, product number, EAN and more',
			},
			{
				displayName: 'Stock Below',
				name: 'stockBelow',
				type: 'number',
				default: 1,
				description: 'Only products with stock lower than this value',
			},
			{
				displayName: 'Updated After',
				name: 'updatedAfter',
				type: 'dateTime',
				default: '',
				description: 'Only products created or changed after this date',
			},
		],
	},

	/* -------------------------------------------------------------------------- */
	/*                                 shared options                             */
	/* -------------------------------------------------------------------------- */
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['get', 'getAll']),
		options: [
			{
				displayName: 'Association Names or IDs',
				name: 'associations',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getProductAssociations',
				},
				default: [],
				description:
					'Related data to load with each product, e.g. manufacturer or categories. List associations (such as orderLineItems) can be large. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Field Names or IDs',
				name: 'fields',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getProductFields',
				},
				default: [],
				description:
					'Product fields to return. The ID and selected associations are always included. Leave empty to return all fields. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Inherit From Parent',
				name: 'inheritance',
				type: 'boolean',
				default: true,
				description:
					'Whether variants return the values inherited from their parent (e.g. name, price) instead of null',
			},
			languageOption,
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'fixedCollection',
				placeholder: 'Add Sort',
				default: {},
				typeOptions: { multipleValues: true },
				options: [
					{
						displayName: 'Sort',
						name: 'items',
						values: [
							{
								displayName: 'Field',
								name: 'field',
								type: 'string',
								default: 'productNumber',
								placeholder: 'e.g. productNumber, name, stock, updatedAt',
							},
							{
								displayName: 'Direction',
								name: 'order',
								type: 'options',
								options: [
									{ name: 'Ascending', value: 'ASC' },
									{ name: 'Descending', value: 'DESC' },
								],
								default: 'ASC',
							},
						],
					},
				],
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['create', 'upsert', 'update']),
		options: [createTagsOption, languageOption],
	},
];
