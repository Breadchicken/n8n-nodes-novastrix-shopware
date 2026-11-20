import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { formatShopwareErrors } from './errors';
import { normalizeShopUrl } from './url';

export const CREDENTIAL_NAME = 'shopwareAdminApi';

type ShopwareContext = IExecuteFunctions | ILoadOptionsFunctions;

export interface ShopwareRequestOptions {
	body?: IDataObject | IDataObject[];
	qs?: IDataObject;
	headers?: Record<string, string>;
}

/**
 * Single entry point for every Admin API call.
 *
 * All requests MUST go through `httpRequestWithAuthentication`: only that helper triggers the
 * credential's `preAuthentication` (token caching and refresh on 401). Calling
 * `helpers.httpRequest` directly would bypass the token handling.
 *
 * @param path API path below `/api`, e.g. `/search/product` or `/_info/version`
 */
export async function shopwareApiRequest<T = IDataObject>(
	this: ShopwareContext,
	method: IHttpRequestMethods,
	path: string,
	options: ShopwareRequestOptions = {},
): Promise<T> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = normalizeShopUrl(credentials.url);

	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${baseUrl}/api${path.startsWith('/') ? path : `/${path}`}`,
		headers: {
			Accept: 'application/json',
			...options.headers,
		},
		json: true,
	};

	if (options.body !== undefined) {
		requestOptions.body = options.body;
	}
	if (options.qs !== undefined && Object.keys(options.qs).length > 0) {
		requestOptions.qs = options.qs;
	}

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			requestOptions,
		)) as T;
	} catch (error) {
		throw toNodeApiError(this, error);
	}
}

function toNodeApiError(context: ShopwareContext, error: unknown): NodeApiError {
	if (error instanceof NodeApiError) {
		return error;
	}

	const err = error as {
		response?: { body?: unknown; data?: unknown };
		error?: unknown;
		description?: unknown;
		httpCode?: string;
	};
	const body = err.response?.body ?? err.response?.data ?? err.error ?? err.description;
	const formatted = formatShopwareErrors(body);

	return new NodeApiError(
		context.getNode(),
		error as JsonObject,
		formatted ? { message: formatted.message, description: formatted.description } : {},
	);
}

export interface ShopwareSearchResponse {
	total?: number;
	data: IDataObject[];
}

/**
 * Runs a DAL search (`POST /api/search/{entity}`) and pages through the result.
 *
 * @param maxItems stop after this many records; `undefined` returns everything
 */
export async function shopwareSearch(
	this: ShopwareContext,
	entity: string,
	criteria: IDataObject = {},
	maxItems?: number,
	headers?: Record<string, string>,
): Promise<IDataObject[]> {
	const pageSize = Math.min(maxItems ?? 500, 500);
	const results: IDataObject[] = [];
	let page = 1;

	while (true) {
		const response = (await shopwareApiRequest.call(this, 'POST', `/search/${entity}`, {
			body: { ...criteria, page, limit: pageSize, 'total-count-mode': 'none' },
			headers,
		})) as ShopwareSearchResponse;

		const data = response.data ?? [];
		results.push(...data);

		if (data.length < pageSize || (maxItems !== undefined && results.length >= maxItems)) {
			break;
		}
		page++;
	}

	return maxItems !== undefined ? results.slice(0, maxItems) : results;
}
