import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { toNodeError } from './shared/errors';
import { shopwareApiRequest } from './shared/transport';

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
						name: 'System',
						value: 'system',
					},
				],
				default: 'system',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['system'],
					},
				},
				options: [
					{
						name: 'Get Version',
						value: 'getVersion',
						description: 'Get the Shopware version of the shop',
						action: 'Get the shopware version',
					},
				],
				default: 'getVersion',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let responseData: IDataObject | IDataObject[];

				if (resource === 'system' && operation === 'getVersion') {
					responseData = (await shopwareApiRequest.call(
						this,
						'GET',
						'/_info/version',
					)) as IDataObject;
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for resource "${resource}"`,
						{ itemIndex: i },
					);
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
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
