import type { INodeProperties } from 'n8n-workflow';

/** Where users learn about (and get) the Novastrix Shopware plugins. */
export const PLUGIN_INFO_URL = 'https://novastrix.com/shopware';

export interface NovastrixPlugin {
	/** Display name used in messages. */
	name: string;
	/** Shopware plugin name (`plugin.name`, the bundle class), used to check installation. */
	technicalName: string;
}

/** Every Novastrix plugin the node supports. */
export const PLUGINS = {
	backInStock: { name: 'Novastrix Back in Stock', technicalName: 'NovastrixBackInStock' },
	defect: {
		name: 'Novastrix Deficiency Description',
		technicalName: 'NovastrixMaengelbeschreibung',
	},
	seo: { name: 'Novastrix SEO', technicalName: 'NovastrixSEO' },
	supplier: { name: 'Novastrix Supplier Management', technicalName: 'NovastrixSupplier' },
	dashboard: { name: 'Novastrix Product Dashboard', technicalName: 'NovastrixProductDashboard' },
	configurator: {
		name: 'Novastrix Product Configurator',
		technicalName: 'NovastrixConfigurator',
	},
	lexikon: { name: 'Novastrix Lexikon', technicalName: 'NovastrixLexikon' },
} as const satisfies Record<string, NovastrixPlugin>;

export type PluginState = 'active' | 'inactive' | 'missing';

/** Message and description for a plugin that is not usable in the shop. */
export function pluginProblem(
	plugin: NovastrixPlugin,
	state: Exclude<PluginState, 'active'>,
): { message: string; description: string } {
	return {
		message:
			state === 'inactive'
				? `The ${plugin.name} plugin is installed but not active in this shop`
				: `This needs the ${plugin.name} plugin, which is not installed in this shop`,
		description: `Install and activate the plugin, or remove the fields or operation that need it. Learn more about the Novastrix plugins: ${PLUGIN_INFO_URL}`,
	};
}

/** UI hint shown on resources and fields that need a plugin. */
export function pluginNotice(
	plugin: NovastrixPlugin,
	displayOptions: INodeProperties['displayOptions'],
	name = 'pluginNotice',
): INodeProperties {
	return {
		displayName: `Needs the ${plugin.name} plugin in your shop. <a href="${PLUGIN_INFO_URL}" target="_blank">Learn more</a>`,
		name,
		type: 'notice',
		default: '',
		displayOptions,
	};
}
