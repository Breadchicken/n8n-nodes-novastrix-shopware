import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { listSearch } from './listSearch';
import { configuratorFields, configuratorOperations } from './resources/configurator/description';
import { executeConfigurator } from './resources/configurator/execute';
import { loadOptions } from './loadOptions';
import { productFields, productOperations } from './resources/product/description';
import { executeProduct } from './resources/product/execute';
import { systemOperations } from './resources/system/description';
import { executeSystem } from './resources/system/execute';
import { variantFields, variantOperations } from './resources/variant/description';
import { executeVariant } from './resources/variant/execute';
import { toNodeError } from './shared/errors';
import { createExecutionState } from './shared/state';

export class Shopware implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Shopware',
		name: 'shopware',
		icon: {
			light: 'file:../../icons/shopware.svg',
			dark: 'file:../../icons/shopware.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume the Shopware 6 Admin API',
		defaults: {
			name: 'Shopware',
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
						name: 'Configurator (Novastrix)',
						value: 'configurator',
						description: 'Product configurators of the Novastrix Product Configurator plugin',
					},
					{
						name: 'Product',
						value: 'product',
					},
					{
						name: 'System',
						value: 'system',
					},
					{
						name: 'Variant (Novastrix)',
						value: 'variant',
						description:
							'Merge, detach and move variants with the Novastrix Variant Creator plugin',
					},
				],
				default: 'product',
			},
			...configuratorOperations,
			...configuratorFields,
			...productOperations,
			...productFields,
			...systemOperations,
			...variantOperations,
			...variantFields,
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

				let responseData: IDataObject | IDataObject[];

				switch (resource) {
					case 'configurator':
						responseData = await executeConfigurator.call(this, state, operation, i);
						break;
					case 'product':
						responseData = await executeProduct.call(this, state, operation, i);
						break;
					case 'system':
						responseData = await executeSystem.call(this, operation, i);
						break;
					case 'variant':
						responseData = await executeVariant.call(this, state, operation, i);
						break;
					default:
						throw new NodeOperationError(this.getNode(), `Unknown resource "${resource}"`, {
							itemIndex: i,
						});
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
