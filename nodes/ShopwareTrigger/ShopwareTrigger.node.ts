import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { httpStatus, shopwareApiRequest, shopwareSearch } from '../Shopware/shared/transport';
import { apiError } from '../Shopware/shared/errors';
import { changedValues, eventOptions, webhookItems } from './events';

/** Query parameter carrying the per-webhook secret. Shopware signs webhooks only for apps. */
const TOKEN_PARAMETER = 'n8nToken';

interface TriggerState extends IDataObject {
	token?: string;
	/** Shopware webhook ID per event. */
	webhooks?: Record<string, string>;
	url?: string;
}

export class ShopwareTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Shopware Novastrix Trigger',
		name: 'shopwareTrigger',
		icon: {
			light: 'file:../../icons/novastrix.svg',
			dark: 'file:../../icons/novastrix.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		// The nodes panel merges this trigger into the Shopware node's entry and shows the trigger's
		// description for both, so it has to describe the whole package.
		description:
			'Manage products, orders and Novastrix plugin data in Shopware 6, and start workflows on shop events',
		defaults: {
			name: 'Shopware Novastrix Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'shopwareAdminApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event Names or IDs',
				name: 'events',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getEvents' },
				required: true,
				default: [],
				description:
					'Shopware events that start the workflow. The list comes from your shop, including events of plugins. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName:
					'Shopware must reach n8n over HTTPS at a public address. For a local test shop, see the README.',
				name: 'reachabilityNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: true,
				description:
					'Whether to flatten orders in the event data (status, payment, delivery, customer, line items) like the Order resource does',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Webhook Base URL',
						name: 'baseUrl',
						type: 'string',
						default: '',
						placeholder: 'e.g. http://host.docker.internal:5678',
						description:
							"Replaces protocol, host and port of the webhook URL. Use it when Shopware cannot reach n8n's own address, e.g. a shop in Docker on the same machine.",
					},
					{
						displayName: 'Only Live Version',
						name: 'onlyLiveVersion',
						type: 'boolean',
						default: true,
						description:
							'Whether to ignore changes to draft versions, e.g. while an order is being edited in the Administration',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getEvents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const events = (await shopwareApiRequest.call(
					this,
					'GET',
					'/_info/events.json',
				)) as unknown as Array<{ name: string }>;
				return eventOptions(events.map((event) => event.name));
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node') as TriggerState;
				const expected = new Set(this.getNodeParameter('events', []) as string[]);
				const ids = Object.values(state.webhooks ?? {});
				if (!state.token || ids.length === 0 || state.url !== webhookUrl(this, state.token)) {
					return false;
				}
				const existing = await shopwareSearch.call(this, 'webhook', {
					ids,
					includes: { webhook: ['id', 'eventName', 'active', 'url'] },
				});
				const complete =
					existing.length === ids.length &&
					existing.length === expected.size &&
					existing.every(
						(webhook) =>
							webhook.active === true &&
							webhook.url === state.url &&
							expected.has(webhook.eventName as string),
					);
				return complete;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const events = this.getNodeParameter('events', []) as string[];
				if (events.length === 0) {
					throw new NodeOperationError(this.getNode(), 'Select at least one event');
				}
				const options = this.getNodeParameter('options', {}) as IDataObject;
				const state = this.getWorkflowStaticData('node') as TriggerState;

				// Leftovers of this node (lost state, changed events, deactivated after errors) go first.
				await deleteWebhooks(this, await ownWebhookIds(this));

				const token = randomBytes(24).toString('hex');
				const url = webhookUrl(this, token);
				const prefix = webhookNamePrefix(this);
				const webhooks: Record<string, string> = {};
				try {
					for (const event of events) {
						const id = randomUUID().replace(/-/g, '');
						await shopwareApiRequest.call(this, 'POST', '/webhook', {
							body: {
								id,
								name: `${prefix} ${event}`.slice(0, 255),
								eventName: event,
								url,
								onlyLiveVersion: options.onlyLiveVersion !== false,
								active: true,
							},
						});
						webhooks[event] = id;
					}
				} catch (error) {
					await deleteWebhooks(this, Object.values(webhooks));
					throw explainCreateError(this, error, url);
				}
				state.token = token;
				state.url = url;
				state.webhooks = webhooks;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node') as TriggerState;
				const ids = new Set([
					...Object.values(state.webhooks ?? {}),
					...(await ownWebhookIds(this)),
				]);
				await deleteWebhooks(this, Array.from(ids));
				delete state.token;
				delete state.url;
				delete state.webhooks;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const state = this.getWorkflowStaticData('node') as TriggerState;
		const token = this.getQueryData() as IDataObject;
		if (!state.token || !sameSecret(String(token[TOKEN_PARAMETER] ?? ''), state.token)) {
			this.getResponseObject().status(401).json({ message: 'Invalid or missing token' });
			return { noWebhookResponse: true };
		}
		const simplify = this.getNodeParameter('simplify', true) as boolean;
		const items = webhookItems(this.getBodyData(), simplify);
		const options = this.getNodeParameter('options', {}) as IDataObject;
		if (options.includeChangedValues !== false) {
			await addChangedValues(this, items);
		}
		return { workflowData: [this.helpers.returnJsonArray(items)] };
	}
}

/**
 * Adds `changes` (new values of `changedFields`) to record-change items, one search per entity.
 * Never throws: a failing webhook would make Shopware retry and finally deactivate it, so an error
 * is reported on the items instead.
 */
async function addChangedValues(context: IWebhookFunctions, items: IDataObject[]): Promise<void> {
	const byEntity = new Map<string, IDataObject[]>();
	for (const item of items) {
		const fields = item.changedFields as string[] | undefined;
		if (item.operation === 'delete' || typeof item.id !== 'string' || !fields?.length) {
			continue;
		}
		const entity = String(item.entity);
		byEntity.set(entity, [...(byEntity.get(entity) ?? []), item]);
	}
	for (const [entity, group] of byEntity) {
		const fields = Array.from(new Set(group.flatMap((item) => item.changedFields as string[])));
		try {
			const records = await shopwareSearch.call(context, entity, {
				ids: group.map((item) => item.id as string),
				includes: { [entity]: ['id', 'translated', ...fields] },
			});
			const byId = new Map(records.map((record) => [record.id as string, record]));
			for (const item of group) {
				const record = byId.get(item.id as string);
				if (record) {
					item.changes = changedValues(record, item.changedFields as string[]);
				}
			}
		} catch (error) {
			for (const item of group) {
				item.changesError = (error as Error).message;
			}
		}
	}
}

function webhookUrl(context: IHookFunctions, token: string): string {
	const options = context.getNodeParameter('options', {}) as IDataObject;
	let url = context.getNodeWebhookUrl('default') ?? '';
	const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl.trim() : '';
	if (baseUrl) {
		url = url.replace(/^https?:\/\/[^/]+/, baseUrl.replace(/\/+$/, ''));
	}
	return `${url}${url.includes('?') ? '&' : '?'}${TOKEN_PARAMETER}=${token}`;
}

/** Name prefix that identifies this node's webhooks; test and production URLs are kept apart. */
function webhookNamePrefix(context: IHookFunctions): string {
	const workflowId = context.getWorkflow().id ?? 'unsaved';
	const kind = (context.getNodeWebhookUrl('default') ?? '').includes('/webhook-test/')
		? 'test'
		: 'live';
	return `n8n ${workflowId} ${context.getNode().id} ${kind}`;
}

async function ownWebhookIds(context: IHookFunctions): Promise<string[]> {
	const records = await shopwareSearch.call(context, 'webhook', {
		filter: [{ type: 'prefix', field: 'name', value: `${webhookNamePrefix(context)} ` }],
		includes: { webhook: ['id'] },
	});
	return records.map((record) => record.id as string);
}

async function deleteWebhooks(context: IHookFunctions, ids: string[]): Promise<void> {
	for (const id of ids) {
		try {
			await shopwareApiRequest.call(context, 'DELETE', `/webhook/${id}`);
		} catch (error) {
			if (httpStatus(error) !== 404) {
				throw error instanceof NodeApiError
					? error
					: new NodeApiError(context.getNode(), error as JsonObject);
			}
		}
	}
}

function explainCreateError(context: IHookFunctions, error: unknown, url: string): Error {
	const { message, description } = error as { message?: string; description?: string };
	const text = `${message ?? ''} ${description ?? ''}`;
	if (text.includes('network policy') || text.includes('not allowed')) {
		return apiError(context.getNode(), error, {
			message: 'Shopware does not accept the webhook URL',
			description: `Shopware 6.7 sends webhooks only to public HTTPS addresses, and the URL ${url.split('?')[0]} is not one. Run n8n under a public HTTPS URL (n8n setting WEBHOOK_URL), or for a local test shop allow it with "shopware.app_system.enable_url_validation: false".`,
		});
	}
	return error as Error;
}

function sameSecret(given: string, expected: string): boolean {
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}
