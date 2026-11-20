import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

/** Single entry of a Shopware error response (`{ errors: [...] }`). */
export interface ShopwareErrorEntry {
	status?: string;
	code?: string;
	title?: string;
	detail?: string;
	source?: { pointer?: string };
	meta?: IDataObject;
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
	const errors = extractErrors(body);
	if (errors.length === 0) {
		return undefined;
	}

	const lines = errors.map((error) => {
		const field = pointerToField(error.source?.pointer);
		const text = error.detail || error.title || error.code || 'Unknown error';
		const prefix = field ? `${field}: ` : '';
		const code = error.code ? ` [${error.code}]` : '';
		return `${prefix}${text}${code}`;
	});

	const first = errors[0];
	const message = first.title || first.detail || 'Shopware API error';
	const suffix = errors.length > 1 ? ` (+${errors.length - 1} more)` : '';

	return {
		message: `${message}${suffix}`,
		description: lines.join('\n'),
	};
}

function extractErrors(body: unknown): ShopwareErrorEntry[] {
	let parsed = body;
	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			return [];
		}
	}

	if (!parsed || typeof parsed !== 'object') {
		return [];
	}

	const errors = (parsed as { errors?: unknown }).errors;
	if (!Array.isArray(errors)) {
		return [];
	}

	return errors.filter(
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
