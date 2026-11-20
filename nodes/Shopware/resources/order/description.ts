import type { INodeProperties } from 'n8n-workflow';

import { entityLocator } from '../../shared/locators';

const show = (operation: string[], extra: Record<string, unknown[]> = {}) => ({
	show: { resource: ['order'], operation, ...extra },
});

export const ORDER_STATUSES = [
	{ name: 'Cancelled', value: 'cancelled' },
	{ name: 'Done', value: 'completed' },
	{ name: 'In Progress', value: 'in_progress' },
	{ name: 'Open', value: 'open' },
];

export const PAYMENT_STATUSES = [
	{ name: 'Authorized', value: 'authorized' },
	{ name: 'Cancelled', value: 'cancelled' },
	{ name: 'Chargeback', value: 'chargeback' },
	{ name: 'Failed', value: 'failed' },
	{ name: 'In Progress', value: 'in_progress' },
	{ name: 'Open', value: 'open' },
	{ name: 'Paid', value: 'paid' },
	{ name: 'Paid (Partially)', value: 'paid_partially' },
	{ name: 'Refunded', value: 'refunded' },
	{ name: 'Refunded (Partially)', value: 'refunded_partially' },
	{ name: 'Reminded', value: 'reminded' },
	{ name: 'Unconfirmed', value: 'unconfirmed' },
];

export const DELIVERY_STATUSES = [
	{ name: 'Cancelled', value: 'cancelled' },
	{ name: 'Open', value: 'open' },
	{ name: 'Returned', value: 'returned' },
	{ name: 'Returned (Partially)', value: 'returned_partially' },
	{ name: 'Shipped', value: 'shipped' },
	{ name: 'Shipped (Partially)', value: 'shipped_partially' },
];

const DOCUMENT_TYPES = [
	{ name: 'Cancellation Invoice', value: 'storno' },
	{ name: 'Credit Note', value: 'credit_note' },
	{ name: 'Delivery Note', value: 'delivery_note' },
	{ name: 'Invoice', value: 'invoice' },
];

export const orderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['order'] } },
		options: [
			{
				name: 'Add Tracking Code',
				value: 'addTracking',
				description: 'Add tracking codes to the delivery and optionally mark it as shipped',
				action: 'Add a tracking code to an order',
			},
			{
				name: 'Change Status',
				value: 'setStatus',
				description: 'Set the order, payment or delivery status, like in the Administration',
				action: 'Change the status of an order',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get an order',
				action: 'Get an order',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many orders',
				action: 'Get many orders',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update comments, tags and custom fields of an order',
				action: 'Update an order',
			},
		],
		default: 'get',
	},
];

const mailOptions = (
	operation: string[],
	extra: Record<string, unknown[]> = {},
): INodeProperties => ({
	displayName: 'Options',
	name: 'statusOptions',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: show(operation, extra),
	options: [
		{
			displayName: 'Attach Documents',
			name: 'documentTypes',
			type: 'multiOptions',
			options: DOCUMENT_TYPES,
			default: [],
			description:
				'Attach the latest existing documents of these types to the status mail (they are not created here)',
		},
		{
			displayName: 'Send Mail',
			name: 'sendMail',
			type: 'boolean',
			default: true,
			description:
				'Whether to send the status mail that is configured for this status in the shop (Flow Builder)',
		},
	],
});

export const orderFields: INodeProperties[] = [
	entityLocator({
		displayName: 'Order',
		name: 'order',
		entity: 'order',
		required: true,
		displayOptions: show(['get', 'update', 'setStatus', 'addTracking']),
	}),

	/* ------------------------------ setStatus ------------------------------- */
	{
		displayName: 'Status Of',
		name: 'statusType',
		type: 'options',
		options: [
			{ name: 'Order', value: 'order' },
			{ name: 'Payment', value: 'payment' },
			{ name: 'Delivery', value: 'delivery' },
		],
		default: 'order',
		displayOptions: show(['setStatus']),
	},
	{
		displayName: 'New Status',
		name: 'orderStatus',
		type: 'options',
		options: ORDER_STATUSES,
		default: 'in_progress',
		description:
			'If the status cannot be reached directly (e.g. Open → Done), the node goes through the required steps',
		displayOptions: show(['setStatus'], { statusType: ['order'] }),
	},
	{
		displayName: 'New Status',
		name: 'paymentStatus',
		type: 'options',
		options: PAYMENT_STATUSES,
		default: 'paid',
		description:
			'Status of the current payment. Only direct changes are made; otherwise the node lists the possible next states.',
		displayOptions: show(['setStatus'], { statusType: ['payment'] }),
	},
	{
		displayName: 'New Status',
		name: 'deliveryStatus',
		type: 'options',
		options: DELIVERY_STATUSES,
		default: 'shipped',
		description:
			'Status of the main delivery. Only direct changes are made; otherwise the node lists the possible next states.',
		displayOptions: show(['setStatus'], { statusType: ['delivery'] }),
	},
	mailOptions(['setStatus']),

	/* ----------------------------- addTracking ------------------------------ */
	{
		displayName: 'Tracking Codes',
		name: 'trackingCodes',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 00340434161094042557',
		description: 'Comma-separated tracking codes. Existing codes are kept, duplicates ignored.',
		displayOptions: show(['addTracking']),
	},
	{
		displayName: 'Mark as Shipped',
		name: 'markShipped',
		type: 'boolean',
		default: false,
		description: 'Whether to also set the delivery status to Shipped (sends the shipping mail)',
		displayOptions: show(['addTracking']),
	},
	mailOptions(['addTracking'], { markShipped: [true] }),

	/* -------------------------------- update -------------------------------- */
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['update']),
		options: [
			{
				displayName: 'Affiliate Code',
				name: 'affiliateCode',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Campaign Code',
				name: 'campaignCode',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Custom Fields (JSON)',
				name: 'customFields',
				type: 'json',
				default: '{}',
				description: 'Merged into the existing custom fields',
			},
			{
				displayName: 'Customer Comment',
				name: 'customerComment',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
			},
			{
				displayName: 'Internal Comment',
				name: 'internalComment',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Comment only visible in the Administration',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				placeholder: 'e.g. priority, wholesale',
				description: 'Comma-separated tag names. They are added; existing tags are kept.',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'writeOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['update']),
		options: [
			{
				displayName: 'Create Missing Tags',
				name: 'createMissingTags',
				type: 'boolean',
				default: false,
				description: 'Whether to create tags that do not exist yet instead of failing',
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
			entityLocator({
				displayName: 'Customer',
				name: 'customer',
				entity: 'customer',
				description: 'Orders of this customer account (by customer number or email)',
			}),
			{
				displayName: 'Customer Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Email stored on the order, also matches guest orders',
			},
			{
				displayName: 'Delivery Status',
				name: 'deliveryStatus',
				type: 'multiOptions',
				options: DELIVERY_STATUSES,
				default: [],
			},
			{
				displayName: 'Order Number',
				name: 'orderNumber',
				type: 'string',
				default: '',
				description: 'Orders whose number contains this value',
			},
			{
				displayName: 'Order Status',
				name: 'orderStatus',
				type: 'multiOptions',
				options: ORDER_STATUSES,
				default: [],
			},
			{
				displayName: 'Ordered After',
				name: 'orderedAfter',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Ordered Before',
				name: 'orderedBefore',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Payment Status',
				name: 'paymentStatus',
				type: 'multiOptions',
				options: PAYMENT_STATUSES,
				default: [],
			},
			entityLocator({
				displayName: 'Sales Channel',
				name: 'salesChannel',
				entity: 'salesChannel',
			}),
			{
				displayName: 'Tag',
				name: 'tag',
				type: 'string',
				default: '',
				description: 'Only orders with this tag (name)',
			},
			{
				displayName: 'Updated After',
				name: 'updatedAfter',
				type: 'dateTime',
				default: '',
				description: 'Orders created or changed after this date, e.g. for a sync',
			},
		],
	},
	{
		displayName: 'Sort',
		name: 'sort',
		type: 'options',
		options: [
			{ name: 'Newest First', value: 'DESC' },
			{ name: 'Oldest First', value: 'ASC' },
		],
		default: 'DESC',
		displayOptions: show(['getAll']),
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return a flat order with statuses, customer, addresses and line items instead of the raw Shopware structure',
		displayOptions: show(['get', 'getAll', 'update', 'setStatus', 'addTracking']),
	},
];
