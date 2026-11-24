import type { INodeProperties } from 'n8n-workflow';

export const systemOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['system'] } },
		options: [
			{
				name: 'Get Version',
				value: 'getVersion',
				description: 'Get the Shopware version of the shop',
				action: 'Get the shop version',
			},
		],
		default: 'getVersion',
	},
];
