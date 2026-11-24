import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { listSearch } from './listSearch';
import { backInStockFields, backInStockOperations } from './resources/backInStock/description';
import { executeBackInStock } from './resources/backInStock/execute';
import { configuratorFields, configuratorOperations } from './resources/configurator/description';
import { executeConfigurator } from './resources/configurator/execute';
import {
	lexikonCategoryFields,
	lexikonCategoryOperations,
} from './resources/lexikon/categoryDescription';
import { executeLexikonCategory } from './resources/lexikon/categoryExecute';
import { lexikonEntryFields, lexikonEntryOperations } from './resources/lexikon/entryDescription';
import { executeLexikonEntry } from './resources/lexikon/entryExecute';
import { loadOptions } from './loadOptions';
import { orderFields, orderOperations } from './resources/order/description';
import { executeOrder } from './resources/order/execute';
import { productFields, productOperations } from './resources/product/description';
import { executeProduct } from './resources/product/execute';
import { systemOperations } from './resources/system/description';
import { executeSystem } from './resources/system/execute';
import { toNodeError } from './shared/errors';
import { OutputItems } from './shared/output';
import { createExecutionState } from './shared/state';

export class Shopware implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Shopware Novastrix',
		name: 'shopware',
		icon: {
			light: 'file:../../icons/novastrix.svg',
			dark: 'file:../../icons/novastrix.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Manage products, orders and Novastrix plugin data in Shopware 6',
		defaults: {
			name: 'Shopware Novastrix',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'shopwareAdminApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Back in Stock (Novastrix)',
						value: 'backInStock',
						description: 'Subscriptions and notifications of the Novastrix Back in Stock plugin',
					},
					{
						name: 'Configurator (Novastrix)',
						value: 'configurator',
						description: 'Product configurators of the Novastrix Product Configurator plugin',
					},
					{
						name: 'Lexikon Category (Novastrix)',
						value: 'lexikonCategory',
						description: 'Categories of the Novastrix Lexikon (glossary) plugin',
					},
					{
						name: 'Lexikon Entry (Novastrix)',
						value: 'lexikonEntry',
						description:
							'Glossary terms of the Novastrix Lexikon plugin, with synonyms, images and links',
					},
					{
						name: 'Order',
						value: 'order',
					},
					{
						name: 'Product',
						value: 'product',
					},
					{
						name: 'System',
						value: 'system',
					},
				],
				default: 'product',
			},
			...backInStockOperations,
			...backInStockFields,
			...configuratorOperations,
			...configuratorFields,
			...lexikonCategoryOperations,
			...lexikonCategoryFields,
			...lexikonEntryOperations,
			...lexikonEntryFields,
			...orderOperations,
			...orderFields,
			...productOperations,
			...productFields,
			...systemOperations,
		],
	};

	methods = {
		listSearch,
		loadOptions,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const state = createExecutionState(this);

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let responseData: IDataObject | IDataObject[] | OutputItems;

				switch (resource) {
					case 'backInStock':
						responseData = await executeBackInStock.call(this, state, operation, i);
						break;
					case 'configurator':
						responseData = await executeConfigurator.call(this, state, operation, i);
						break;
					case 'lexikonCategory':
						responseData = await executeLexikonCategory.call(this, state, operation, i);
						break;
					case 'lexikonEntry':
						responseData = await executeLexikonEntry.call(this, state, operation, i);
						break;
					case 'order':
						responseData = await executeOrder.call(this, state, operation, i);
						break;
					case 'product':
						responseData = await executeProduct.call(this, state, operation, i);
						break;
					case 'system':
						responseData = await executeSystem.call(this, operation, i);
						break;
					default:
						throw new NodeOperationError(this.getNode(), `Unknown resource "${resource}"`, {
							itemIndex: i,
						});
				}

				if (responseData instanceof OutputItems) {
					returnData.push(
						...responseData.items.map((item) => ({ ...item, pairedItem: { item: i } })),
					);
					continue;
				}
				returnData.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(responseData), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}

				throw toNodeError(this, error, i);
			}
		}

		return [returnData];
	}
}
