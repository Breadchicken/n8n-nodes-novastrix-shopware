import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHookFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { formatShopwareErrors } from './errors';
import type { NovastrixPlugin } from './plugins';
import { PLUGIN_INFO_URL } from './plugins';
import { EntityResolver } from './resolver';
import { normalizeShopUrl } from './url';

export const CREDENTIAL_NAME = 'shopwareAdminApi';

type ShopwareContext =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IHookFunctions
	| IWebhookFunctions;

export interface ShopwareRequestOptions {
	body?: IDataObject | IDataObject[];
	qs?: IDataObject;
	headers?: Record<string, string>;
	/**
	 * Plugin that provides this route or entity. A 404 is then reported as
	 * "plugin not installed" instead of a generic "Not Found".
	 */
	requiresPlugin?: NovastrixPlugin;
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
		if (options.requiresPlugin && httpStatus(error) === 404) {
			throw new NodeApiError(this.getNode(), error as JsonObject, {
				message: `This operation needs the ${options.requiresPlugin.name} plugin`,
				description: `Shopware answered 404 for ${method} /api${path}. Make sure the ${options.requiresPlugin.name} plugin is installed and active in the shop. Learn more about the Novastrix plugins: ${PLUGIN_INFO_URL}`,
			});
		}
		throw toNodeApiError(this, error);
	}
}

export interface ShopwareFile {
	data: Buffer;
	fileName?: string;
	mimeType?: string;
}

/**
 * Downloads a file (e.g. a document PDF). Same token handling as `shopwareApiRequest`; the body is
 * returned as a Buffer together with the file name from `Content-Disposition`.
 */
export async function shopwareFileRequest(
	this: ShopwareContext,
	path: string,
	qs?: IDataObject,
): Promise<ShopwareFile | undefined> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const requestOptions: IHttpRequestOptions = {
		method: 'GET',
		url: `${normalizeShopUrl(credentials.url)}/api${path}`,
		qs,
		encoding: 'arraybuffer',
		returnFullResponse: true,
		json: false,
	};
	let response: {
		body?: ArrayBuffer | Buffer;
		headers?: Record<string, string>;
		statusCode?: number;
	};
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			requestOptions,
		)) as typeof response;
	} catch (error) {
		throw toNodeApiError(this, error);
	}
	const body = response.body;
	if (response.statusCode === 204 || !body || body.byteLength === 0) {
		return undefined;
	}
	const headers = Object.fromEntries(
		Object.entries(response.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
	);
	return {
		data: Buffer.isBuffer(body) ? body : Buffer.from(body),
		fileName: fileNameFromDisposition(headers['content-disposition']),
		mimeType: headers['content-type']?.split(';')[0],
	};
}

/** `attachment; filename="a.pdf"; filename*=utf-8''%C3%A4.pdf` -> the (decoded) file name. */
export function fileNameFromDisposition(header: string | undefined): string | undefined {
	if (!header) {
		return undefined;
	}
	const extended = /filename\*=(?:utf-8|UTF-8)''([^;]+)/.exec(header);
	if (extended) {
		try {
			return decodeURIComponent(extended[1].trim());
		} catch {
			// fall through to the plain name
		}
	}
	const plain = /filename="?([^";]+)"?/.exec(header);
	return plain?.[1].trim();
}

/** HTTP status of a failed request, wherever the n8n request helper put it. */
export function httpStatus(error: unknown): number | undefined {
	const err = error as {
		httpCode?: string;
		status?: number;
		statusCode?: number;
		response?: { status?: number; statusCode?: number };
		cause?: { status?: number; response?: { status?: number } };
	};
	const candidates = [
		err.httpCode,
		err.statusCode,
		err.status,
		err.response?.status,
		err.response?.statusCode,
		err.cause?.status,
		err.cause?.response?.status,
	];
	for (const candidate of candidates) {
		const status = Number(candidate);
		if (Number.isInteger(status) && status >= 100) {
			return status;
		}
	}
	return undefined;
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

/** DAL entity names use underscores, API routes use dashes (`product_manufacturer`). */
export function entityPath(entity: string): string {
	return entity.replace(/_/g, '-');
}

/** Admin URL of a record, used for "open in Shopware" links. */
export async function adminUrl(
	this: ShopwareContext,
	adminPath: string | undefined,
	id: string,
): Promise<string | undefined> {
	if (!adminPath) {
		return undefined;
	}
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	return `${normalizeShopUrl(credentials.url)}/admin#/${adminPath.replace('{id}', id)}`;
}

/** Single search request without paging; returns the records. */
export async function shopwareSearchPage(
	this: ShopwareContext,
	entity: string,
	criteria: IDataObject,
	headers?: Record<string, string>,
	requiresPlugin?: NovastrixPlugin,
): Promise<IDataObject[]> {
	const response = (await shopwareApiRequest.call(this, 'POST', `/search/${entityPath(entity)}`, {
		body: criteria,
		headers,
		requiresPlugin,
	})) as ShopwareSearchResponse;
	return response.data ?? [];
}

/** Creates a name resolver bound to this execution context. */
export function createResolver(this: ShopwareContext): EntityResolver {
	return new EntityResolver(
		async (entity, criteria, headers) =>
			await shopwareSearchPage.call(this, entity, criteria, headers),
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
	requiresPlugin?: NovastrixPlugin,
): Promise<IDataObject[]> {
	const pageSize = Math.min(maxItems ?? 500, 500);
	const results: IDataObject[] = [];
	let page = 1;

	while (true) {
		const response = (await shopwareApiRequest.call(this, 'POST', `/search/${entityPath(entity)}`, {
			body: { ...criteria, page, limit: pageSize, 'total-count-mode': 'none' },
			headers,
			requiresPlugin,
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
