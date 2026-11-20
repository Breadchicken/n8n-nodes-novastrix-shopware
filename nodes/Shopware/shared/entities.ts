import type { IDataObject } from 'n8n-workflow';

/** A DAL filter as accepted by `POST /api/search/{entity}`. */
export type DalFilter = IDataObject;

/**
 * How an entity can be looked up by a human-readable value.
 *
 * `lookups` are tried in order. The first lookup that returns at least one record decides:
 * exactly one hit resolves, several hits are reported as ambiguous. Lookups that return
 * `undefined` for a value are skipped (e.g. the tax-rate lookup for a non-numeric value).
 *
 * Note: DAL `equals` filters on string fields are case-insensitive on MySQL/MariaDB
 * (`utf8mb4_unicode_ci`), so "eur" matches "EUR" without extra work.
 */
export interface EntityConfig {
	/** DAL entity name, e.g. `product_manufacturer`. */
	entity: string;
	/** Singular label used in UI texts and error messages. */
	label: string;
	/** Fields loaded for display; `id` is always included. */
	displayFields: string[];
	/** Formats a record for dropdowns and error messages. */
	display: (record: IDataObject) => string;
	/** Natural-key lookups, tried in order. */
	lookups: Array<(value: string) => DalFilter | undefined>;
	/** Fields searched (OR, contains) by the searchable dropdown. */
	searchFields: string[];
	/** Sorting of the dropdown. */
	sortField?: string;
	/** Admin route for "open in Shopware" links, `{id}` is replaced. */
	adminPath?: string;
	/** Associations loaded for display (disables `includes`). */
	associations?: IDataObject;
	/** Plugin that provides the entity; used for a clear error when it is missing. */
	plugin?: string;
	/** Extra headers for lookups, e.g. inheritance for variants. */
	headers?: Record<string, string>;
	/** Placeholder of the "By Name" mode. */
	namePlaceholder: string;
	/** Display name of the natural-key mode. */
	nameModeLabel?: string;
}

const equals =
	(field: string) =>
	(value: string): DalFilter => ({
		type: 'equals',
		field,
		value,
	});

const translatedName = (record: IDataObject): string => {
	const translated = record.translated as IDataObject | undefined;
	return String(translated?.name ?? record.name ?? record.id);
};

const withSuffix = (name: string, suffix: unknown): string =>
	suffix ? `${name} (${String(suffix)})` : name;

/** Parses "19", "19%", "19,5 %" into a number; returns undefined for anything else. */
export function parseRate(value: string): number | undefined {
	const match = /^\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/.exec(value);
	return match ? Number(match[1].replace(',', '.')) : undefined;
}

const simpleNamed = (
	entity: string,
	label: string,
	adminPath: string | undefined,
	namePlaceholder: string,
): EntityConfig => ({
	entity,
	label,
	displayFields: ['name'],
	display: translatedName,
	lookups: [equals('name')],
	searchFields: ['name'],
	sortField: 'name',
	adminPath,
	namePlaceholder,
});

export const ENTITIES = {
	product: {
		entity: 'product',
		label: 'product',
		displayFields: ['name', 'productNumber'],
		display: (r: IDataObject) => withSuffix(translatedName(r), r.productNumber),
		lookups: [equals('productNumber'), equals('name')],
		searchFields: ['productNumber', 'name', 'ean'],
		sortField: 'productNumber',
		adminPath: 'sw/product/detail/{id}',
		headers: { 'sw-inheritance': '1' },
		namePlaceholder: 'e.g. SW10001 or product name',
		nameModeLabel: 'By Number or Name',
	},
	customer: {
		entity: 'customer',
		label: 'customer',
		displayFields: ['firstName', 'lastName', 'email', 'customerNumber'],
		display: (r: IDataObject) =>
			withSuffix(`${String(r.firstName ?? '')} ${String(r.lastName ?? '')}`.trim(), r.email),
		lookups: [equals('customerNumber'), equals('email')],
		searchFields: ['customerNumber', 'email', 'lastName', 'firstName', 'company'],
		sortField: 'lastName',
		adminPath: 'sw/customer/detail/{id}',
		namePlaceholder: 'e.g. 10001 or jane@example.com',
		nameModeLabel: 'By Number or Email',
	},
	order: {
		entity: 'order',
		label: 'order',
		displayFields: ['orderNumber', 'amountTotal', 'orderDateTime'],
		display: (r: IDataObject) => withSuffix(String(r.orderNumber), r.amountTotal),
		lookups: [equals('orderNumber')],
		searchFields: ['orderNumber'],
		sortField: 'orderNumber',
		adminPath: 'sw/order/detail/{id}',
		namePlaceholder: 'e.g. 10001',
		nameModeLabel: 'By Order Number',
	},
	category: {
		...simpleNamed('category', 'category', 'sw/category/index/{id}', 'e.g. Shoes or Home > Shoes'),
		displayFields: ['name', 'breadcrumb'],
		display: (r: IDataObject) => {
			const translated = r.translated as IDataObject | undefined;
			const breadcrumb = (translated?.breadcrumb ?? r.breadcrumb) as string[] | undefined;
			return Array.isArray(breadcrumb) && breadcrumb.length > 0
				? breadcrumb.join(' > ')
				: translatedName(r);
		},
		nameModeLabel: 'By Name or Path',
	},
	tax: {
		entity: 'tax',
		label: 'tax rate',
		displayFields: ['name', 'taxRate'],
		display: (r: IDataObject) => `${String(r.name)} (${String(r.taxRate)}%)`,
		lookups: [
			(value: string) => {
				const rate = parseRate(value);
				return rate === undefined ? undefined : { type: 'equals', field: 'taxRate', value: rate };
			},
			equals('name'),
		],
		searchFields: ['name'],
		sortField: 'taxRate',
		adminPath: 'sw/settings/tax/detail/{id}',
		namePlaceholder: 'e.g. 19% or Standard rate',
		nameModeLabel: 'By Rate or Name',
	},
	currency: {
		entity: 'currency',
		label: 'currency',
		displayFields: ['name', 'isoCode'],
		display: (r: IDataObject) => withSuffix(translatedName(r), r.isoCode),
		lookups: [equals('isoCode'), equals('name')],
		searchFields: ['isoCode', 'name'],
		sortField: 'isoCode',
		adminPath: 'sw/settings/currency/detail/{id}',
		namePlaceholder: 'e.g. EUR',
		nameModeLabel: 'By ISO Code or Name',
	},
	country: {
		entity: 'country',
		label: 'country',
		displayFields: ['name', 'iso'],
		display: (r: IDataObject) => withSuffix(translatedName(r), r.iso),
		lookups: [equals('iso'), equals('iso3'), equals('name')],
		searchFields: ['iso', 'name'],
		sortField: 'name',
		adminPath: 'sw/settings/country/detail/{id}',
		namePlaceholder: 'e.g. DE or Germany',
		nameModeLabel: 'By ISO Code or Name',
	},
	language: {
		entity: 'language',
		label: 'language',
		displayFields: ['name'],
		display: (r: IDataObject) => String(r.name),
		lookups: [equals('locale.code'), equals('name')],
		searchFields: ['name'],
		sortField: 'name',
		adminPath: 'sw/settings/language/detail/{id}',
		namePlaceholder: 'e.g. de-DE or Deutsch',
		nameModeLabel: 'By Locale or Name',
	},
	salesChannel: simpleNamed(
		'sales_channel',
		'sales channel',
		'sw/sales/channel/detail/{id}',
		'e.g. Storefront',
	),
	manufacturer: simpleNamed(
		'product_manufacturer',
		'manufacturer',
		'sw/manufacturer/detail/{id}',
		'e.g. shopware AG',
	),
	customerGroup: simpleNamed(
		'customer_group',
		'customer group',
		'sw/settings/customer/group/detail/{id}',
		'e.g. Standard customer group',
	),
	paymentMethod: {
		...simpleNamed(
			'payment_method',
			'payment method',
			'sw/settings/payment/detail/{id}',
			'e.g. Invoice',
		),
		displayFields: ['name', 'technicalName'],
		lookups: [equals('technicalName'), equals('name')],
	},
	shippingMethod: {
		...simpleNamed(
			'shipping_method',
			'shipping method',
			'sw/settings/shipping/detail/{id}',
			'e.g. Standard',
		),
		displayFields: ['name', 'technicalName'],
		lookups: [equals('technicalName'), equals('name')],
	},
	deliveryTime: simpleNamed(
		'delivery_time',
		'delivery time',
		'sw/settings/delivery/time/detail/{id}',
		'e.g. 1-3 days',
	),
	unit: simpleNamed('unit', 'unit', 'sw/settings/units/detail/{id}', 'e.g. Kilogram'),
	tag: simpleNamed('tag', 'tag', undefined, 'e.g. Sale'),
	propertyGroup: simpleNamed(
		'property_group',
		'property group',
		'sw/property/detail/{id}',
		'e.g. Color',
	),
	propertyOption: {
		entity: 'property_group_option',
		label: 'property option',
		displayFields: ['name'],
		associations: { group: {} },
		display: (r: IDataObject) => {
			const group = r.group as IDataObject | undefined;
			return group ? `${translatedName(group)}: ${translatedName(r)}` : translatedName(r);
		},
		lookups: [
			(value: string) => {
				const separator = value.indexOf(':');
				if (separator === -1) {
					return undefined;
				}
				return {
					type: 'multi',
					operator: 'and',
					queries: [
						{ type: 'equals', field: 'group.name', value: value.slice(0, separator).trim() },
						{ type: 'equals', field: 'name', value: value.slice(separator + 1).trim() },
					],
				};
			},
			equals('name'),
		],
		searchFields: ['name', 'group.name'],
		sortField: 'name',
		namePlaceholder: 'e.g. Color: Red',
		nameModeLabel: 'By Group: Option',
	},
	salutation: {
		entity: 'salutation',
		label: 'salutation',
		displayFields: ['displayName', 'salutationKey'],
		display: (r: IDataObject) => {
			const translated = r.translated as IDataObject | undefined;
			return withSuffix(String(translated?.displayName ?? r.displayName ?? r.id), r.salutationKey);
		},
		lookups: [equals('salutationKey'), equals('displayName')],
		searchFields: ['salutationKey', 'displayName'],
		sortField: 'salutationKey',
		namePlaceholder: 'e.g. mr, mrs or not_specified',
		nameModeLabel: 'By Key or Name',
	},
	productStream: simpleNamed(
		'product_stream',
		'dynamic product group',
		'sw/product/stream/detail/{id}',
		'e.g. Sale items',
	),

	/* ------------------------------ Novastrix plugins ----------------------------- */
	supplier: {
		entity: 'pflaum_supplier',
		label: 'supplier',
		displayFields: ['name', 'number'],
		display: (r: IDataObject) => withSuffix(String(r.name), r.number),
		lookups: [equals('number'), equals('name')],
		searchFields: ['number', 'name'],
		sortField: 'name',
		plugin: 'Novastrix Supplier Management',
		namePlaceholder: 'e.g. SUP-1001 or supplier name',
		nameModeLabel: 'By Number or Name',
	},
	configurator: {
		entity: 'novastrix_configurator',
		label: 'configurator',
		displayFields: ['name', 'productId', 'active'],
		display: (r: IDataObject) => String(r.name),
		lookups: [equals('name')],
		searchFields: ['name'],
		sortField: 'name',
		plugin: 'Novastrix Product Configurator',
		namePlaceholder: 'e.g. PC Bundle',
	},
} satisfies Record<string, EntityConfig>;

export type EntityKey = keyof typeof ENTITIES;

export const ENTITY_KEYS = Object.keys(ENTITIES) as EntityKey[];

export function getEntityConfig(key: EntityKey): EntityConfig {
	return ENTITIES[key];
}

/** Category paths use " > " like the Shopware breadcrumb. */
export const CATEGORY_PATH_SEPARATOR = '>';

/** Shopware's system default currency ID (`Defaults::CURRENCY`), identical in every shop. */
export const DEFAULT_CURRENCY_ID = 'b7d2554b0ce847cd82f3ac9bd1c0dfca';

export const SHOPWARE_ID_REGEX = '^[0-9a-fA-F]{32}$';

export function isShopwareId(value: unknown): boolean {
	return typeof value === 'string' && /^[0-9a-fA-F]{32}$/.test(value);
}
