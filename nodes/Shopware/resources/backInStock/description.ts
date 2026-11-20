import type { INodeProperties } from 'n8n-workflow';

import { entityLocator } from '../../shared/locators';
import { pluginNotice, PLUGINS } from '../../shared/plugins';

const show = (operation: string[], extra: Record<string, unknown[]> = {}) => ({
	show: { resource: ['backInStock'], operation, ...extra },
});

export const SUBSCRIPTION_STATUSES = [
	{ name: 'Active', value: 'active', description: 'Waiting for the product' },
	{ name: 'Bounced', value: 'bounced' },
	{ name: 'Converted', value: 'converted', description: 'Bought after the notification' },
	{ name: 'Expired', value: 'expired' },
	{ name: 'Notified', value: 'notified' },
	{ name: 'Pending Opt-In', value: 'pending_optin', description: 'Not confirmed yet' },
	{ name: 'Unsubscribed', value: 'unsubscribed' },
];

export const backInStockOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['backInStock'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a back-in-stock subscription',
				action: 'Get a subscription',
			},
			{
				name: 'Get Demand',
				value: 'getDemand',
				description: 'Get the number of waiting customers per product and variant',
				action: 'Get the back in stock demand',
			},
			{
				name: 'Get Failed Notifications',
				value: 'getFailed',
				description: 'Get notifications that could not be sent (dead letter queue)',
				action: 'Get failed notifications',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many back-in-stock subscriptions',
				action: 'Get many subscriptions',
			},
			{
				name: 'Get Recovered Revenue',
				value: 'getRevenue',
				description: 'Get the revenue of orders that followed a back-in-stock notification',
				action: 'Get recovered revenue',
			},
			{
				name: 'Resend Notification',
				value: 'resend',
				description: 'Queue the back-in-stock mail again for one or more subscriptions',
				action: 'Resend a notification',
			},
			{
				name: 'Retry Failed Notification',
				value: 'retryFailed',
				description: 'Send a failed notification again and remove it from the failed list',
				action: 'Retry a failed notification',
			},
			{
				name: 'Unsubscribe',
				value: 'unsubscribe',
				description: 'Unsubscribe one subscription or every subscription of an email address',
				action: 'Unsubscribe a subscription',
			},
		],
		default: 'getAll',
	},
];

const subscriptionIdField = (operation: string[], extra: Record<string, unknown[]> = {}) =>
	({
		displayName: 'Subscription ID',
		name: 'subscriptionId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 0189c3a1b2c34d5e8f9a0b1c2d3e4f50',
		displayOptions: show(operation, extra),
	}) satisfies INodeProperties;

export const backInStockFields: INodeProperties[] = [
	pluginNotice(PLUGINS.backInStock, { show: { resource: ['backInStock'] } }, 'backInStockNotice'),
	subscriptionIdField(['get', 'retryFailed']),

	/* ------------------------------ unsubscribe ----------------------------- */
	{
		displayName: 'Unsubscribe By',
		name: 'unsubscribeBy',
		type: 'options',
		options: [
			{ name: 'Subscription ID', value: 'id' },
			{
				name: 'Email',
				value: 'email',
				description: 'All open subscriptions of this address, e.g. for a deletion request',
			},
		],
		default: 'id',
		displayOptions: show(['unsubscribe']),
	},
	subscriptionIdField(['unsubscribe'], { unsubscribeBy: ['id'] }),
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		required: true,
		default: '',
		displayOptions: show(['unsubscribe'], { unsubscribeBy: ['email'] }),
	},

	/* -------------------------------- resend -------------------------------- */
	{
		displayName: 'Subscription IDs',
		name: 'subscriptionIds',
		type: 'string',
		required: true,
		default: '',
		description:
			"Comma-separated subscription IDs. An expression returning an array works too. Mails are queued and sent by the shop's message queue.",
		displayOptions: show(['resend']),
	},

	/* ----------------------------- retry failed ----------------------------- */
	{
		displayName: 'Additional Fields',
		name: 'retryFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		description: 'Pass the values from "Get Failed Notifications" to clear the failed entry',
		displayOptions: show(['retryFailed']),
		options: [
			{
				displayName: 'Log ID',
				name: 'logId',
				type: 'string',
				default: '',
				description: 'The "logId" of the failed entry (source "audit")',
			},
			{
				displayName: 'Messenger ID',
				name: 'messengerId',
				type: 'number',
				default: 0,
				description: 'The "messengerId" of the failed entry (source "messenger")',
			},
		],
	},

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
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Created After',
				name: 'createdAfter',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
			},
			{
				displayName: 'Include Variants',
				name: 'includeVariants',
				type: 'boolean',
				default: true,
				description:
					'Whether a parent product in the Product filter also matches subscriptions to its variants',
			},
			entityLocator({
				displayName: 'Product',
				name: 'product',
				entity: 'product',
				description: 'Only subscriptions for this product',
			}),
			entityLocator({
				displayName: 'Sales Channel',
				name: 'salesChannel',
				entity: 'salesChannel',
			}),
			{
				displayName: 'Status',
				name: 'status',
				type: 'multiOptions',
				options: SUBSCRIPTION_STATUSES,
				default: [],
			},
			{
				displayName: 'VIP Only',
				name: 'vip',
				type: 'boolean',
				default: true,
				description: 'Whether to return only subscriptions of VIP customers',
			},
		],
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return a flat record with product number and name instead of the raw subscription (tokens are never returned)',
		displayOptions: show(['getAll', 'get']),
	},
];
