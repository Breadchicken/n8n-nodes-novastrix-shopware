import type { IHttpRequestHelper, IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { ShopwareAdminApi } from '../credentials/ShopwareAdminApi.credentials';

function helperReturning(response: unknown) {
	const httpRequest = vi.fn<(options: IHttpRequestOptions) => Promise<unknown>>(
		async () => response,
	);
	const helper = { helpers: { httpRequest } } as unknown as IHttpRequestHelper;
	return { helper, httpRequest };
}

describe('ShopwareAdminApi credential', () => {
	const credential = new ShopwareAdminApi();

	it('marks the access token as expirable so n8n caches and refreshes it', () => {
		const tokenField = credential.properties.find((p) => p.name === 'accessToken');
		expect(tokenField?.type).toBe('hidden');
		expect(tokenField?.typeOptions?.expirable).toBe(true);
	});

	it('requests a client_credentials token from the normalized URL', async () => {
		const { helper, httpRequest } = helperReturning({ access_token: 'abc', expires_in: 600 });

		const result = await credential.preAuthentication.call(helper, {
			url: 'https://shop.example.com/api/',
			clientId: 'SWIA123',
			clientSecret: 'secret',
		});

		expect(result).toEqual({ accessToken: 'abc' });
		expect(httpRequest).toHaveBeenCalledTimes(1);
		const options = httpRequest.mock.calls[0][0];
		expect(options.method).toBe('POST');
		expect(options.url).toBe('https://shop.example.com/api/oauth/token');
		expect(options.body).toEqual({
			grant_type: 'client_credentials',
			client_id: 'SWIA123',
			client_secret: 'secret',
		});
	});

	it('fails loudly when Shopware returns no token', async () => {
		const { helper } = helperReturning({});
		await expect(
			credential.preAuthentication.call(helper, {
				url: 'https://shop.example.com',
				clientId: 'a',
				clientSecret: 'b',
			}),
		).rejects.toThrow(/did not return an access token/);
	});
});
