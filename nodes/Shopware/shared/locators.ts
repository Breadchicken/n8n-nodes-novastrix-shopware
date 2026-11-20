import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

import type { EntityKey } from './entities';
import { getEntityConfig, SHOPWARE_ID_REGEX } from './entities';

export interface LocatorOptions {
	displayName: string;
	name: string;
	entity: EntityKey;
	required?: boolean;
	description?: string;
	displayOptions?: IDisplayOptions;
}

/** Name of the `listSearch` method generated for an entity (see `listSearch/index.ts`). */
export function searchMethodName(entity: EntityKey): string {
	return `search${entity.charAt(0).toUpperCase()}${entity.slice(1)}`;
}

/**
 * Builds a resource locator for a Shopware entity with three modes:
 * - `list`: searchable, paginated dropdown
 * - `id`: raw 32-char hex ID
 * - `name`: natural key (name, number, ISO code, path, ...) resolved at execution time
 *
 * Every field that references another Shopware entity must use this helper so that name
 * resolution works the same way everywhere.
 */
export function entityLocator(options: LocatorOptions): INodeProperties {
	const config = getEntityConfig(options.entity);

	const property: INodeProperties = {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: options.required ?? false,
		description:
			options.description ??
			`The ${config.label}. Pick it from the list, enter its ID or look it up by name.`,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: `Select a ${config.label}...`,
				typeOptions: {
					searchListMethod: searchMethodName(options.entity),
					searchable: true,
				},
			},
			{
				displayName: config.nameModeLabel ?? 'By Name',
				name: 'name',
				type: 'string',
				placeholder: config.namePlaceholder,
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 0189c3a1b2c34d5e8f9a0b1c2d3e4f50',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: SHOPWARE_ID_REGEX,
							errorMessage: 'Not a valid Shopware ID (32 hexadecimal characters)',
						},
					},
				],
			},
		],
	};

	if (options.displayOptions) {
		property.displayOptions = options.displayOptions;
	}

	return property;
}

/**
 * A repeatable list of entity locators, e.g. several categories or sales channels.
 * The values are read with `getLocatorList`.
 */
export function entityLocatorList(options: LocatorOptions & { itemName: string }): INodeProperties {
	const config = getEntityConfig(options.entity);

	return {
		displayName: options.displayName,
		name: options.name,
		type: 'fixedCollection',
		placeholder: `Add ${config.label.charAt(0).toUpperCase()}${config.label.slice(1)}`,
		default: {},
		typeOptions: {
			multipleValues: true,
		},
		description: options.description,
		...(options.displayOptions ? { displayOptions: options.displayOptions } : {}),
		options: [
			{
				displayName: options.itemName,
				name: 'items',
				values: [
					entityLocator({
						displayName: options.itemName,
						name: 'value',
						entity: options.entity,
					}),
				],
			},
		],
	};
}
