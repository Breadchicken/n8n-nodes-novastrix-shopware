import type { IDataObject, IExecuteFunctions, INodeParameterResourceLocator } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { ExecutionState } from '../../shared/state';
import { shopwareApiRequest, shopwareSearch, shopwareSearchPage } from '../../shared/transport';
import { parseJsonParameter, splitList } from '../../shared/utils';
import { resolveTags } from '../product/execute';

/** Everything needed for the simplified output and for status changes. */
const ORDER_ASSOCIATIONS: IDataObject = {
	stateMachineState: {},
	currency: {},
	orderCustomer: {},
	lineItems: { sort: [{ field: 'position', order: 'ASC' }] },
	billingAddress: { associations: { country: {} } },
	transactions: {
		associations: { stateMachineState: {}, paymentMethod: {} },
		sort: [{ field: 'createdAt', order: 'DESC' }],
	},
	deliveries: {
		associations: {
			stateMachineState: {},
			shippingMethod: {},
			shippingOrderAddress: { associations: { country: {} } },
		},
	},
	tags: {},
};

type StatusType = 'order' | 'payment' | 'delivery';

const STATUS_TARGETS: Record<
	StatusType,
	{ machine: string; entity: string; route: string; parameter: string; label: string }
> = {
	order: {
		machine: 'order.state',
		entity: 'order',
		route: 'order',
		parameter: 'orderStatus',
		label: 'order',
	},
	payment: {
		machine: 'order_transaction.state',
		entity: 'order_transaction',
		route: 'order_transaction',
		parameter: 'paymentStatus',
		label: 'payment',
	},
	delivery: {
		machine: 'order_delivery.state',
		entity: 'order_delivery',
		route: 'order_delivery',
		parameter: 'deliveryStatus',
		label: 'delivery',
	},
};

interface Transition {
	action: string;
	from: string;
	to: string;
}

/** State machine transitions per run (they never change during an execution). */
const transitionCache = new WeakMap<ExecutionState, Map<string, Promise<Transition[]>>>();

export async function executeOrder(
	this: IExecuteFunctions,
	state: ExecutionState,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	const simplify = this.getNodeParameter('simplify', i, true) as boolean;

	switch (operation) {
		case 'get': {
			const id = await resolveOrder.call(this, state, i);
			return output(await loadOrder.call(this, id, i), simplify);
		}

		case 'getAll': {
			const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i, 50) as number);
			const filter = await buildFilter.call(
				this,
				state,
				this.getNodeParameter('filters', i, {}) as IDataObject,
			);
			const orders = await shopwareSearch.call(
				this,
				'order',
				{
					...(filter.length > 0 ? { filter } : {}),
					associations: ORDER_ASSOCIATIONS,
					sort: [{ field: 'orderDateTime', order: this.getNodeParameter('sort', i, 'DESC') }],
				},
				limit,
			);
			return orders.map((order) => output(order, simplify));
		}

		case 'update': {
			const id = await resolveOrder.call(this, state, i);
			const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
			const options = this.getNodeParameter('writeOptions', i, {}) as IDataObject;
			const body: IDataObject = {};
			for (const key of ['affiliateCode', 'campaignCode', 'customerComment', 'internalComment']) {
				if (fields[key] !== undefined) {
					body[key] = fields[key];
				}
			}
			if (fields.customFields !== undefined) {
				const customFields = parseJsonParameter<IDataObject>(
					fields.customFields,
					'Custom Fields (JSON)',
				);
				if (customFields && Object.keys(customFields).length > 0) {
					body.customFields = customFields;
				}
			}
			const tagNames = splitList(fields.tags);
			if (tagNames.length > 0) {
				body.tags = await resolveTags(state, tagNames, options.createMissingTags === true);
			}
			if (Object.keys(body).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', {
					itemIndex: i,
				});
			}
			await shopwareApiRequest.call(this, 'PATCH', `/order/${id}`, { body });
			return output(await loadOrder.call(this, id, i), simplify);
		}

		case 'setStatus': {
			const id = await resolveOrder.call(this, state, i);
			const type = this.getNodeParameter('statusType', i, 'order') as StatusType;
			const target = this.getNodeParameter(STATUS_TARGETS[type].parameter, i) as string;
			const options = this.getNodeParameter('statusOptions', i, {}) as IDataObject;
			const order = await loadOrder.call(this, id, i);
			const change = await changeStatus.call(this, state, order, type, target, options, i);
			return { ...output(await loadOrder.call(this, id, i), simplify), statusChange: change };
		}

		case 'addTracking': {
			const id = await resolveOrder.call(this, state, i);
			const codes = splitList(this.getNodeParameter('trackingCodes', i));
			if (codes.length === 0) {
				throw new NodeOperationError(this.getNode(), 'No tracking code given', { itemIndex: i });
			}
			const order = await loadOrder.call(this, id, i);
			const delivery = primaryDelivery(order);
			if (!delivery) {
				throw new NodeOperationError(this.getNode(), 'The order has no delivery', {
					itemIndex: i,
				});
			}
			const existing = (delivery.trackingCodes as string[] | null) ?? [];
			const trackingCodes = Array.from(new Set([...existing, ...codes]));
			if (trackingCodes.length > existing.length) {
				await shopwareApiRequest.call(this, 'PATCH', `/order-delivery/${String(delivery.id)}`, {
					body: { trackingCodes },
				});
			}
			let statusChange: IDataObject | undefined;
			if (this.getNodeParameter('markShipped', i, false) as boolean) {
				const options = this.getNodeParameter('statusOptions', i, {}) as IDataObject;
				statusChange = await changeStatus.call(
					this,
					state,
					await loadOrder.call(this, id, i),
					'delivery',
					'shipped',
					options,
					i,
				);
			}
			return {
				...output(await loadOrder.call(this, id, i), simplify),
				...(statusChange ? { statusChange } : {}),
			};
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for orders`,
				{ itemIndex: i },
			);
	}
}

/**
 * Moves the order, its latest payment or its main delivery to the target state. Shopware only
 * allows defined transitions. For the order status the shortest path is computed from the state
 * machine and run step by step (Open -> In Progress -> Done); mails go out on the last step only.
 */
async function changeStatus(
	this: IExecuteFunctions,
	state: ExecutionState,
	order: IDataObject,
	type: StatusType,
	target: string,
	options: IDataObject,
	i: number,
): Promise<IDataObject> {
	const config = STATUS_TARGETS[type];
	const record =
		type === 'order'
			? order
			: type === 'payment'
				? primaryTransaction(order)
				: primaryDelivery(order);
	if (!record) {
		throw new NodeOperationError(this.getNode(), `The order has no ${config.label}`, {
			itemIndex: i,
		});
	}
	const from = technicalName(record);
	if (from === target) {
		return { type, from, to: target, changed: false, steps: [] };
	}

	const transitions = await loadTransitions.call(this, state, config.machine);
	const path = shortestPath(transitions, from, target);
	const reachable = Array.from(
		new Set(transitions.filter((t) => t.from === from).map((t) => t.to)),
	);
	// Intermediate steps fire flows and webhooks of their own. For the order status they are
	// the expected workflow (open -> in progress -> done); for payments and deliveries they
	// would fake events like "refunded", so only direct changes are allowed there.
	if (!path || (type !== 'order' && path.length > 1)) {
		throw new NodeOperationError(
			this.getNode(),
			`The ${config.label} status cannot change from "${from}" to "${target}"`,
			{
				itemIndex: i,
				description: `Shopware allows these next states from "${from}": ${reachable.join(', ') || 'none'}${
					path
						? `. "${target}" needs several steps (${[from, ...path.map((s) => s.to)].join(' -> ')}); set them one after another if that is intended.`
						: ''
				}`,
			},
		);
	}

	const sendMail = options.sendMail !== false;
	const documentTypes = (options.documentTypes as string[] | undefined) ?? [];
	for (const [index, step] of path.entries()) {
		const last = index === path.length - 1;
		await shopwareApiRequest.call(
			this,
			'POST',
			`/_action/${config.route}/${String(record.id)}/state/${step.action}`,
			{
				body: {
					sendMail: last && sendMail,
					...(last && documentTypes.length > 0 ? { documentTypes } : {}),
				},
			},
		);
	}
	return { type, from, to: target, changed: true, steps: path.map((step) => step.action) };
}

async function loadTransitions(
	this: IExecuteFunctions,
	state: ExecutionState,
	machine: string,
): Promise<Transition[]> {
	let cache = transitionCache.get(state);
	if (!cache) {
		cache = new Map();
		transitionCache.set(state, cache);
	}
	let transitions = cache.get(machine);
	if (!transitions) {
		transitions = shopwareSearch
			.call(this, 'state_machine_transition', {
				filter: [{ type: 'equals', field: 'stateMachine.technicalName', value: machine }],
				associations: { fromStateMachineState: {}, toStateMachineState: {} },
			})
			.then((records) =>
				records.map((record) => ({
					action: String(record.actionName),
					from: technicalName({ stateMachineState: record.fromStateMachineState }),
					to: technicalName({ stateMachineState: record.toStateMachineState }),
				})),
			);
		cache.set(machine, transitions);
		transitions.catch(() => cache?.delete(machine));
	}
	return await transitions;
}

/** Breadth-first search over the transitions; exported for tests. */
export function shortestPath(
	transitions: Transition[],
	from: string,
	to: string,
): Transition[] | undefined {
	const queue: Array<{ state: string; path: Transition[] }> = [{ state: from, path: [] }];
	const seen = new Set([from]);
	while (queue.length > 0) {
		const current = queue.shift() as { state: string; path: Transition[] };
		for (const transition of transitions.filter((t) => t.from === current.state)) {
			if (seen.has(transition.to)) {
				continue;
			}
			const path = [...current.path, transition];
			if (transition.to === to) {
				return path;
			}
			seen.add(transition.to);
			queue.push({ state: transition.to, path });
		}
	}
	return undefined;
}

async function buildFilter(
	this: IExecuteFunctions,
	state: ExecutionState,
	filters: IDataObject,
): Promise<IDataObject[]> {
	const filter: IDataObject[] = [];
	const any = (field: string, values: unknown) => {
		if (Array.isArray(values) && values.length > 0) {
			filter.push({ type: 'equalsAny', field, value: values });
		}
	};
	// 6.7 knows the primary payment/delivery; older shops match any payment/delivery.
	const primary = await state.hasField('order', 'primaryOrderTransactionId');
	any('stateMachineState.technicalName', filters.orderStatus);
	any(
		primary
			? 'primaryOrderTransaction.stateMachineState.technicalName'
			: 'transactions.stateMachineState.technicalName',
		filters.paymentStatus,
	);
	any(
		primary
			? 'primaryOrderDelivery.stateMachineState.technicalName'
			: 'deliveries.stateMachineState.technicalName',
		filters.deliveryStatus,
	);

	const customerId = await state.resolver.resolveLocator(
		'customer',
		filters.customer as INodeParameterResourceLocator | undefined,
	);
	if (customerId) {
		filter.push({ type: 'equals', field: 'orderCustomer.customerId', value: customerId });
	}
	const salesChannelId = await state.resolver.resolveLocator(
		'salesChannel',
		filters.salesChannel as INodeParameterResourceLocator | undefined,
	);
	if (salesChannelId) {
		filter.push({ type: 'equals', field: 'salesChannelId', value: salesChannelId });
	}
	if (typeof filters.email === 'string' && filters.email.trim() !== '') {
		filter.push({ type: 'equals', field: 'orderCustomer.email', value: filters.email.trim() });
	}
	if (typeof filters.orderNumber === 'string' && filters.orderNumber.trim() !== '') {
		filter.push({ type: 'contains', field: 'orderNumber', value: filters.orderNumber.trim() });
	}
	if (typeof filters.tag === 'string' && filters.tag.trim() !== '') {
		filter.push({ type: 'equals', field: 'tags.name', value: filters.tag.trim() });
	}
	const range: IDataObject = {};
	if (filters.orderedAfter) range.gte = filters.orderedAfter;
	if (filters.orderedBefore) range.lte = filters.orderedBefore;
	if (Object.keys(range).length > 0) {
		filter.push({ type: 'range', field: 'orderDateTime', parameters: range });
	}
	if (filters.updatedAfter) {
		filter.push({
			type: 'multi',
			operator: 'or',
			queries: [
				{ type: 'range', field: 'updatedAt', parameters: { gte: filters.updatedAfter } },
				{ type: 'range', field: 'createdAt', parameters: { gte: filters.updatedAfter } },
			],
		});
	}
	return filter;
}

async function resolveOrder(
	this: IExecuteFunctions,
	state: ExecutionState,
	i: number,
): Promise<string> {
	const id = await state.resolver.resolveLocator(
		'order',
		this.getNodeParameter('order', i) as INodeParameterResourceLocator,
	);
	if (!id) {
		throw new NodeOperationError(this.getNode(), 'No order given', { itemIndex: i });
	}
	return id;
}

async function loadOrder(this: IExecuteFunctions, id: string, i: number): Promise<IDataObject> {
	const records = await shopwareSearchPage.call(this, 'order', {
		ids: [id],
		associations: ORDER_ASSOCIATIONS,
	});
	if (records.length === 0) {
		throw new NodeOperationError(this.getNode(), `Order ${id} not found`, { itemIndex: i });
	}
	return records[0];
}

function technicalName(record: IDataObject | undefined): string {
	return String(((record?.stateMachineState as IDataObject | undefined) ?? {}).technicalName ?? '');
}

/** The payment Shopware treats as current: the primary one (6.7) or the latest. */
function primaryTransaction(order: IDataObject): IDataObject | undefined {
	const transactions = (order.transactions as IDataObject[] | undefined) ?? [];
	return (
		transactions.find((t) => t.id === order.primaryOrderTransactionId) ??
		[...transactions].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]
	);
}

/** The main delivery: the primary one (6.7) or the first. */
function primaryDelivery(order: IDataObject): IDataObject | undefined {
	const deliveries = (order.deliveries as IDataObject[] | undefined) ?? [];
	return deliveries.find((d) => d.id === order.primaryOrderDeliveryId) ?? deliveries[0];
}

function translatedName(value: unknown): string | undefined {
	const record = value as IDataObject | undefined | null;
	const name = (record?.translated as IDataObject | undefined)?.name ?? record?.name;
	return name === undefined || name === null ? undefined : String(name);
}

function address(value: unknown): IDataObject | undefined {
	const a = value as IDataObject | undefined | null;
	if (!a) {
		return undefined;
	}
	return {
		company: a.company,
		firstName: a.firstName,
		lastName: a.lastName,
		street: a.street,
		additionalAddressLine1: a.additionalAddressLine1,
		zipcode: a.zipcode,
		city: a.city,
		country: ((a.country as IDataObject | undefined) ?? {}).iso,
		phoneNumber: a.phoneNumber,
	};
}

/** Flat order for workflows; `simplify: false` returns Shopware's structure unchanged. */
export function output(order: IDataObject, simplify: boolean): IDataObject {
	if (!simplify) {
		return order;
	}
	const customer = (order.orderCustomer as IDataObject | undefined) ?? {};
	const transaction = primaryTransaction(order);
	const delivery = primaryDelivery(order);
	const price = (order.price as IDataObject | undefined) ?? {};
	return {
		id: order.id,
		orderNumber: order.orderNumber,
		orderDate: order.orderDateTime,
		status: technicalName(order),
		paymentStatus: transaction ? technicalName(transaction) : undefined,
		deliveryStatus: delivery ? technicalName(delivery) : undefined,
		amountTotal: order.amountTotal,
		amountNet: order.amountNet,
		shippingTotal: order.shippingTotal,
		taxStatus: price.taxStatus ?? order.taxStatus,
		currency: ((order.currency as IDataObject | undefined) ?? {}).isoCode,
		salesChannelId: order.salesChannelId,
		customer: {
			customerId: customer.customerId,
			customerNumber: customer.customerNumber,
			email: customer.email,
			firstName: customer.firstName,
			lastName: customer.lastName,
			company: customer.company,
		},
		billingAddress: address(order.billingAddress),
		shippingAddress: address(delivery?.shippingOrderAddress),
		paymentMethod: translatedName(transaction?.paymentMethod),
		shippingMethod: translatedName(delivery?.shippingMethod),
		trackingCodes: (delivery?.trackingCodes as string[] | undefined) ?? [],
		lineItems: ((order.lineItems as IDataObject[] | undefined) ?? []).map((item) => ({
			type: item.type,
			productId: item.productId,
			productNumber: ((item.payload as IDataObject | undefined) ?? {}).productNumber,
			label: item.label,
			quantity: item.quantity,
			unitPrice: item.unitPrice,
			totalPrice: item.totalPrice,
		})),
		tags: ((order.tags as IDataObject[] | undefined) ?? []).map((tag) => tag.name),
		customerComment: order.customerComment,
		internalComment: order.internalComment,
		customFields: order.customFields,
	};
}
