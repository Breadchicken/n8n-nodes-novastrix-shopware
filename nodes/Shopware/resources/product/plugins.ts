import type {
	IDataObject,
	IExecuteFunctions,
	INodeParameterResourceLocator,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { entityLocator } from '../../shared/locators';
import type { NovastrixPlugin } from '../../shared/plugins';
import { PLUGINS } from '../../shared/plugins';
import type { ExecutionState } from '../../shared/state';
import { shopwareApiRequest } from '../../shared/transport';

/**
 * Product data of the Novastrix plugins. Everything here is optional and only has an effect when
 * the corresponding plugin is installed:
 *
 * - Back in Stock, Deficiency Description (Mängelbeschreibung) and SEO store their product data in
 *   `product.customFields`.
 * - Supplier Management keeps suppliers in its own entities; we use the plugin's upsert routes,
 *   which match by (product, supplier) and therefore never create duplicates.
 */

export { PLUGINS };

/** Custom field names, as defined by the plugins. */
const CUSTOM_FIELDS = {
	bisDisabled: 'novastrixBis_disabled',
	bisPrelaunch: 'novastrixBis_prelaunch',
	defectConsent: 'novastrix_defect_consent',
	defectText: 'novastrix_defect_consent_text',
	seoSchemaDisabled: 'novastrix_seo_product_schema_disabled',
	seoFaqHtml: 'novastrix_seo_product_faq_html',
	seoPriceValidUntil: 'novastrix_seo_price_valid_until',
} as const;

/** Plugin behind each field of the collection. */
const FIELD_PLUGINS: Record<string, NovastrixPlugin | undefined> = {
	bisDisabled: PLUGINS.backInStock,
	bisPrelaunch: PLUGINS.backInStock,
	defectConsent: PLUGINS.defect,
	defectText: PLUGINS.defect,
	seoSchemaDisabled: PLUGINS.seo,
	seoFaq: PLUGINS.seo,
	seoPriceValidUntil: PLUGINS.seo,
	suppliers: PLUGINS.supplier,
	supplierStrategy: PLUGINS.supplier,
	fixedSupplier: PLUGINS.supplier,
};

export const SUPPLIER_STRATEGIES = [
	{ name: 'Use Global Default', value: 'default' },
	{ name: 'Cheapest', value: 'cheapest' },
	{ name: 'Cheapest With Stock', value: 'cheapest_with_stock' },
	{ name: 'Fastest Delivery', value: 'fastest_delivery' },
	{ name: 'Fixed Supplier', value: 'fixed_supplier' },
	{ name: 'Only With Stock', value: 'only_with_stock' },
	{ name: 'Preferred Supplier', value: 'preferred' },
	{ name: 'Priority', value: 'priority' },
];

export const novastrixProductFields: INodeProperties = {
	displayName: 'Novastrix Plugin Fields',
	name: 'novastrixFields',
	type: 'collection',
	placeholder: 'Add Plugin Field',
	default: {},
	description:
		'Product data of the Novastrix plugins. Each field needs its plugin in the shop; the node checks this before writing. <a href="https://novastrix.com/shopware" target="_blank">Learn more about the plugins</a>',
	options: [
		{
			displayName: 'Back in Stock: Disable Alerts',
			name: 'bisDisabled',
			type: 'boolean',
			default: true,
			description: 'Whether to hide the back-in-stock subscription for this product',
		},
		{
			displayName: 'Back in Stock: Pre-Launch',
			name: 'bisPrelaunch',
			type: 'boolean',
			default: true,
			description:
				'Whether the product is not released yet, so customers can join a waitlist before launch',
		},
		{
			displayName: 'Deficiency: Description',
			name: 'defectText',
			type: 'string',
			typeOptions: { rows: 4 },
			default: '',
			description:
				'Description of the defects (HTML allowed). Shown only if "Deficiency: Is Defective Item" is enabled.',
		},
		{
			displayName: 'Deficiency: Is Defective Item',
			name: 'defectConsent',
			type: 'boolean',
			default: true,
			description:
				'Whether the product is sold with defects. Customers must accept the description at checkout.',
		},
		{
			displayName: 'SEO: Disable Product Schema',
			name: 'seoSchemaDisabled',
			type: 'boolean',
			default: true,
			description: 'Whether to suppress the schema.org product data and FAQ for this product',
		},
		{
			displayName: 'SEO: FAQ',
			name: 'seoFaq',
			type: 'fixedCollection',
			placeholder: 'Add Question',
			default: {},
			typeOptions: { multipleValues: true },
			description: 'Questions and answers for the FAQ schema. Replaces the existing FAQ.',
			options: [
				{
					displayName: 'Question',
					name: 'items',
					values: [
						{
							displayName: 'Question',
							name: 'question',
							type: 'string',
							default: '',
						},
						{
							displayName: 'Answer',
							name: 'answer',
							type: 'string',
							typeOptions: { rows: 2 },
							default: '',
							description: 'Plain text or HTML',
						},
					],
				},
			],
		},
		{
			displayName: 'SEO: Price Valid Until',
			name: 'seoPriceValidUntil',
			type: 'dateTime',
			default: '',
			description: 'Date until which the price is valid (schema.org priceValidUntil)',
		},
		entityLocator({
			displayName: 'Supplier: Fixed Supplier',
			name: 'fixedSupplier',
			entity: 'supplier',
			description: 'Supplier to use when the selection strategy is "Fixed Supplier"',
		}),
		{
			displayName: 'Supplier: Selection Strategy',
			name: 'supplierStrategy',
			type: 'options',
			options: SUPPLIER_STRATEGIES,
			default: 'default',
			description: 'How the supplier for this product is chosen',
		},
		{
			displayName: 'Suppliers',
			name: 'suppliers',
			type: 'fixedCollection',
			placeholder: 'Add Supplier',
			default: {},
			typeOptions: { multipleValues: true },
			description:
				'Suppliers of this product. Existing entries for the same supplier are updated, others are kept.',
			options: [
				{
					displayName: 'Supplier',
					name: 'items',
					values: [
						entityLocator({
							displayName: 'Supplier',
							name: 'supplier',
							entity: 'supplier',
							required: true,
						}),
						{
							displayName: 'Active',
							name: 'active',
							type: 'boolean',
							default: true,
							description: 'Whether this supplier is considered when choosing a supplier',
						},
						{
							displayName: 'Delivery Time (Days)',
							name: 'deliveryTimeDays',
							type: 'number',
							typeOptions: { minValue: 0 },
							default: 0,
						},
						{
							displayName: 'Min Order Quantity',
							name: 'minOrderQuantity',
							type: 'number',
							typeOptions: { minValue: 0 },
							default: 0,
						},
						{
							displayName: 'Preferred',
							name: 'isPreferred',
							type: 'boolean',
							default: false,
							description: 'Whether this is the preferred supplier',
						},
						{
							displayName: 'Priority',
							name: 'priority',
							type: 'number',
							default: 0,
							description: 'Higher values win with the "Priority" strategy',
						},
						{
							displayName: 'Purchase Price (Net)',
							name: 'price',
							type: 'number',
							typeOptions: { minValue: 0, numberPrecision: 2 },
							default: 0,
						},
						{
							displayName: 'Shipping Costs',
							name: 'shippingCosts',
							type: 'number',
							typeOptions: { minValue: 0, numberPrecision: 2 },
							default: 0,
						},
						{
							displayName: 'Stock',
							name: 'stock',
							type: 'number',
							default: 0,
							description: 'Stock at the supplier',
						},
						{
							displayName: 'Supplier Article Number',
							name: 'supplierArticleNumber',
							type: 'string',
							default: '',
						},
					],
				},
			],
		},
	],
};

export interface PluginWrite {
	/** Merged into `product.customFields`. */
	customFields: IDataObject;
	/** Merged into the product payload (native fields). */
	fields: IDataObject;
	/** Writes that need the product to exist (own entities of plugins). */
	afterWrite?: (productId: string) => Promise<IDataObject>;
}

/** Turns the "Novastrix Plugin Fields" collection into product data and follow-up writes. */
export async function buildPluginWrite(
	this: IExecuteFunctions,
	state: ExecutionState,
	input: IDataObject | undefined,
): Promise<PluginWrite> {
	const result: PluginWrite = { customFields: {}, fields: {} };
	if (!input || Object.keys(input).length === 0) {
		return result;
	}

	// Shopware stores custom fields of missing plugins without complaint, so check up front.
	for (const plugin of new Set(Object.keys(input).map((key) => FIELD_PLUGINS[key]))) {
		if (plugin) {
			await state.requirePlugin(plugin);
		}
	}

	const copy = (key: keyof typeof CUSTOM_FIELDS) => {
		if (input[key] !== undefined) {
			result.customFields[CUSTOM_FIELDS[key]] = input[key];
		}
	};
	copy('bisDisabled');
	copy('bisPrelaunch');
	copy('defectConsent');
	copy('defectText');
	copy('seoSchemaDisabled');

	if (input.seoPriceValidUntil) {
		result.customFields[CUSTOM_FIELDS.seoPriceValidUntil] = String(input.seoPriceValidUntil).slice(
			0,
			10,
		);
	}

	const faq = (input.seoFaq as { items?: IDataObject[] } | undefined)?.items;
	if (faq) {
		result.customFields[CUSTOM_FIELDS.seoFaqHtml] = buildFaqHtml(faq);
	}

	const supplierItems = (input.suppliers as { items?: IDataObject[] } | undefined)?.items ?? [];
	const strategy = input.supplierStrategy as string | undefined;
	if (supplierItems.length > 0 || strategy !== undefined) {
		const suppliers = await resolveSuppliers(state, supplierItems);
		const fixedSupplierId = await state.resolver.resolveLocator(
			'supplier',
			input.fixedSupplier as INodeParameterResourceLocator | undefined,
		);
		if (strategy === 'fixed_supplier' && !fixedSupplierId) {
			throw new NodeOperationError(
				this.getNode(),
				'The strategy "Fixed Supplier" needs "Supplier: Fixed Supplier" to be set',
			);
		}

		result.afterWrite = async (productId: string) =>
			await writeSuppliers.call(this, productId, suppliers, strategy, fixedSupplierId);
	}

	return result;
}

/** Builds the `<h3>Question</h3><p>Answer</p>` markup the SEO plugin parses. */
export function buildFaqHtml(items: IDataObject[]): string {
	return items
		.filter((item) => String(item.question ?? '').trim() !== '')
		.map((item) => {
			const question = escapeHtml(String(item.question).trim());
			const answer = String(item.answer ?? '').trim();
			const answerHtml = /<[a-z][\s\S]*>/i.test(answer) ? answer : `<p>${escapeHtml(answer)}</p>`;
			return `<h3>${question}</h3>${answerHtml}`;
		})
		.join('');
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

async function resolveSuppliers(
	state: ExecutionState,
	items: IDataObject[],
): Promise<IDataObject[]> {
	const rows: IDataObject[] = [];
	for (const item of items) {
		const supplierId = await state.resolver.resolveLocator(
			'supplier',
			item.supplier as INodeParameterResourceLocator | undefined,
		);
		if (!supplierId) {
			continue;
		}
		const row: IDataObject = { supplierId };
		for (const key of [
			'supplierArticleNumber',
			'price',
			'stock',
			'deliveryTimeDays',
			'shippingCosts',
			'minOrderQuantity',
			'priority',
			'isPreferred',
			'active',
		]) {
			if (item[key] !== undefined && item[key] !== '') {
				row[key] = item[key];
			}
		}
		rows.push(row);
	}
	return rows;
}

async function writeSuppliers(
	this: IExecuteFunctions,
	productId: string,
	suppliers: IDataObject[],
	strategy: string | undefined,
	fixedSupplierId: string | undefined,
): Promise<IDataObject> {
	const summary: IDataObject = {};

	if (suppliers.length > 0) {
		const response = (await shopwareApiRequest.call(
			this,
			'POST',
			'/_action/pflaum-supplier/import-product-suppliers',
			{
				body: { productSuppliers: suppliers.map((row) => ({ ...row, productId })) },
				requiresPlugin: PLUGINS.supplier,
			},
		)) as IDataObject;
		assertNoPluginErrors(this, response, 'Saving the suppliers failed');
		summary.suppliersSaved = response.imported;
	}

	if (strategy !== undefined) {
		const body: IDataObject = {
			productId,
			selectionStrategy: strategy === 'default' ? null : strategy,
		};
		if (strategy === 'fixed_supplier') {
			body.fixedSupplierId = fixedSupplierId;
		}
		const response = (await shopwareApiRequest.call(
			this,
			'POST',
			'/_action/pflaum-supplier/product-strategy',
			{ body, requiresPlugin: PLUGINS.supplier },
		)) as IDataObject;
		assertNoPluginErrors(this, response, 'Saving the supplier strategy failed');
	}

	return summary;
}

function assertNoPluginErrors(
	context: IExecuteFunctions,
	response: IDataObject,
	message: string,
): void {
	const errors = response.errors as unknown[] | undefined;
	if (response.success === false || (Array.isArray(errors) && errors.length > 0)) {
		throw new NodeOperationError(context.getNode(), message, {
			description: Array.isArray(errors) ? errors.map(String).join('\n') : undefined,
		});
	}
}
