import type {
	IAuthenticateGeneric,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IDataObject,
	IHttpRequestHelper,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

import { normalizeShopUrl } from '../nodes/Shopware/shared/url';

interface ShopwareTokenResponse {
	access_token: string;
	expires_in?: number;
	token_type?: string;
}

/**
 * Shopware 6 Admin API credential based on an integration (client_credentials grant).
 *
 * Token lifecycle:
 * - `accessToken` is a hidden, `expirable` field. n8n calls `preAuthentication` only when the
 *   field is empty, when the credential is tested, or when a request made through
 *   `httpRequestWithAuthentication` returns 401. The returned token is persisted (encrypted)
 *   in the credential, so it is reused across items, executions and workers until it expires.
 * - Shopware access tokens live for 10 minutes. After expiry the next request gets a 401,
 *   n8n refreshes once and resends the request.
 * - The client_credentials grant issues no refresh token, and Shopware does not persist access
 *   tokens, so minting a new token costs one HTTP request and leaves nothing behind in the shop.
 */
export class ShopwareAdminApi implements ICredentialType {
	name = 'shopwareAdminApi';

	displayName = 'Shopware Admin API';

	icon: Icon = {
		light: 'file:../icons/novastrix.svg',
		dark: 'file:../icons/novastrix.dark.svg',
	};

	documentationUrl =
		'https://github.com/Breadchicken/n8n-nodes-novastrix-shopware?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'hidden',
			typeOptions: {
				expirable: true,
				password: true,
			},
			default: '',
		},
		{
			displayName: 'Shop URL',
			name: 'url',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. https://shop.example.com',
			description: 'Base URL of the Shopware shop, without "/api" or "/admin"',
		},
		{
			displayName: 'Access Key ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description: 'Access key ID of a Shopware integration (Settings > System > Integrations)',
		},
		{
			displayName: 'Secret Access Key',
			name: 'clientSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Secret access key of the Shopware integration',
		},
	];

	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
	): Promise<IDataObject> {
		const baseUrl = normalizeShopUrl(credentials.url);

		const response = (await this.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/api/oauth/token`,
			headers: {
				Accept: 'application/json',
			},
			body: {
				grant_type: 'client_credentials',
				client_id: credentials.clientId,
				client_secret: credentials.clientSecret,
			},
			json: true,
		})) as ShopwareTokenResponse;

		if (!response?.access_token) {
			throw new Error('Shopware did not return an access token. Check the integration keys.');
		}

		return { accessToken: response.access_token };
	}

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.accessToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url.trim().replace(/\\/+$/, "").replace(/\\/(api|admin)$/i, "")}}',
			url: '/api/_info/version',
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
		},
	};
}
