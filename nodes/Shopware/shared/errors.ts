import type { IDataObject, IExecuteFunctions, INode, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

/** Single entry of a Shopware error response (`{ errors: [...] }`). */
export interface ShopwareErrorEntry {
	status?: string;
	code?: string;
	title?: string;
	detail?: string;
	source?: { pointer?: string };
	meta?: IDataObject;
	/** Fields used by Novastrix plugin routes. */
	message?: string;
	reason?: string;
	type?: string;
	field?: string;
	child_product_number?: string;
}

/**
 * Extracts every error from a Shopware error body and renders a readable description.
 *
 * Shopware returns a list of errors (e.g. one per invalid field in a write). Other nodes only
 * show the first one, which hides the actual cause in bulk writes. We keep all of them and add
 * the field from `source.pointer` (`/0/name` -> `name`).
 */
export function formatShopwareErrors(
	body: unknown,
): { message: string; description: string } | undefined {
	const parsed = parseBody(body);
	const errors = extractErrors(parsed);
	const pluginMessage = typeof parsed?.message === 'string' ? parsed.message : undefined;
	if (errors.length === 0) {
		// Plugin routes answer `{ success: false, message }` instead of Shopware's error list.
		return pluginMessage ? { message: pluginMessage, description: pluginMessage } : undefined;
	}

	const lines = errors.map((error) => {
		const field =
			pointerToField(error.source?.pointer) || error.child_product_number || error.field;
		const text =
			error.detail ||
			error.message ||
			error.reason ||
			error.title ||
			error.code ||
			error.type ||
			'Unknown error';
		const prefix = field ? `${field}: ` : '';
		const code = error.code || error.type ? ` [${error.code ?? error.type}]` : '';
		return `${prefix}${text}${code}`;
	});

	const conflictFields = errors
		.filter((error) => error.type === 'conflict')
		.map((error) => error.field);
	if (!pluginMessage && conflictFields.length === errors.length) {
		return {
			message: `The products differ in: ${conflictFields.join(', ')}`,
			description: lines.join('\n'),
		};
	}

	const first = errors[0];
	// Shopware titles are often generic ("Bad Request"), the detail carries the actual cause.
	const message =
		pluginMessage ||
		first.detail ||
		first.message ||
		first.reason ||
		first.title ||
		'Shopware API error';
	const suffix = !pluginMessage && errors.length > 1 ? ` (+${errors.length - 1} more)` : '';

	return {
		message: `${message}${suffix}`,
		description: lines.join('\n'),
	};
}

function parseBody(body: unknown): IDataObject | undefined {
	let parsed = body;
	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			return undefined;
		}
	}
	return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
		? (parsed as IDataObject)
		: undefined;
}

function extractErrors(parsed: IDataObject | undefined): ShopwareErrorEntry[] {
	if (!parsed) {
		return [];
	}
	// Plugin routes may report conflicts (e.g. differing field values) next to `errors`.
	const entries = [
		...(Array.isArray(parsed.errors) ? parsed.errors : []),
		...(Array.isArray(parsed.conflicts)
			? (parsed.conflicts as IDataObject[]).map((conflict) => ({
					field: conflict.field,
					message: `values differ between the products: ${JSON.stringify(conflict.distinct_values ?? [])}`,
					type: 'conflict',
				}))
			: []),
	];
	return entries.filter(
		(entry): entry is ShopwareErrorEntry => !!entry && typeof entry === 'object',
	);
}

function pointerToField(pointer: string | undefined): string {
	if (!pointer) {
		return '';
	}

	return pointer
		.split('/')
		.filter((segment) => segment !== '' && !/^\d+$/.test(segment))
		.join('.');
}

/**
 * Returns an n8n error for a failed item. Errors that are already n8n errors (e.g. the
 * NodeApiError built by the transport) are passed through with the item index attached,
 * everything else is wrapped in a NodeOperationError.
 */
export function toNodeError(
	context: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		if (error.context.itemIndex === undefined) {
			error.context.itemIndex = itemIndex;
		}
		return error;
	}

	return new NodeOperationError(context.getNode(), error as Error, { itemIndex });
}

/**
 * Builds a NodeApiError with the given message and description.
 *
 * `new NodeApiError(node, error, { message })` returns `error` unchanged when it already is a
 * NodeApiError, and drops the message. Since n8n 2, `httpRequestWithAuthentication` throws
 * NodeApiErrors itself, so the text has to be set on the existing error instead.
 */
export function apiError(
	node: INode,
	error: unknown,
	text: { message?: string; description?: string },
): NodeApiError {
	if (error instanceof NodeApiError) {
		if (text.message) {
			error.message = text.message;
		}
		if (text.description) {
			error.description = text.description;
		}
		return error;
	}
	return new NodeApiError(node, error as JsonObject, text);
}

/**
 * Response body of a failed request. Raw request errors carry it in `response`; NodeApiErrors
 * built by n8n keep it in `context.data` and the original error in `cause`.
 */
export function errorBody(error: unknown): unknown {
	const err = error as {
		response?: { body?: unknown; data?: unknown };
		error?: unknown;
		description?: unknown;
		context?: { data?: unknown };
		cause?: { response?: { body?: unknown; data?: unknown }; error?: unknown };
	};
	return (
		err.response?.body ??
		err.response?.data ??
		err.context?.data ??
		err.cause?.response?.data ??
		err.cause?.response?.body ??
		err.cause?.error ??
		err.error ??
		err.description
	);
}
