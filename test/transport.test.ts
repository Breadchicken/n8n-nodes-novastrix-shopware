import { describe, expect, it } from 'vitest';

import type { IExecuteFunctions, INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { fileNameFromDisposition, shopwareApiRequest } from '../nodes/Shopware/shared/transport';

describe('fileNameFromDisposition', () => {
	it('reads plain and quoted file names', () => {
		expect(fileNameFromDisposition('attachment; filename="invoice_1000.pdf"')).toBe(
			'invoice_1000.pdf',
		);
		expect(fileNameFromDisposition('inline; filename=delivery_note.pdf')).toBe('delivery_note.pdf');
	});

	it('prefers the UTF-8 file name', () => {
		expect(
			fileNameFromDisposition(
				'attachment; filename="Rechnung_.pdf"; filename*=utf-8\'\'Rechnung_M%C3%BCller.pdf',
			),
		).toBe('Rechnung_Müller.pdf');
	});

	it('returns undefined without a header', () => {
		expect(fileNameFromDisposition(undefined)).toBeUndefined();
	});
});

describe('shopwareApiRequest errors', () => {
	const node: INode = {
		id: '1',
		name: 'Shopware Novastrix',
		type: 'shopware',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	const shopwareBody = {
		errors: [
			{
				status: '400',
				code: 'NOVASTRIX_CONFIGURATOR__DUPLICATE_POSITION',
				title: 'Bad Request',
				detail: 'A configurator already exists for this product and position.',
			},
		],
	};

	/** n8n 2 wraps a failed request in a NodeApiError before the node sees it. */
	function n8nError(status: number, data: object): NodeApiError {
		const axiosLike = Object.assign(new Error(`Request failed with status code ${status}`), {
			response: { status, data },
		});
		return new NodeApiError(node, axiosLike as unknown as JsonObject, {
			httpCode: String(status),
		});
	}

	function context(error: unknown): IExecuteFunctions {
		return {
			getNode: () => node,
			getCredentials: async () => ({ url: 'https://shop.example.com' }),
			helpers: {
				httpRequestWithAuthentication: async () => {
					throw error;
				},
			},
		} as unknown as IExecuteFunctions;
	}

	it('shows the Shopware detail when n8n already threw a NodeApiError', async () => {
		const call = shopwareApiRequest.call(context(n8nError(400, shopwareBody)), 'POST', '/x');
		await expect(call).rejects.toMatchObject({
			message: 'A configurator already exists for this product and position.',
			description:
				'A configurator already exists for this product and position. [NOVASTRIX_CONFIGURATOR__DUPLICATE_POSITION]',
			httpCode: '400',
		});
	});

	it('shows the Shopware detail for raw request errors', async () => {
		const raw = Object.assign(new Error('Request failed'), {
			response: { status: 400, data: shopwareBody },
		});
		const call = shopwareApiRequest.call(context(raw), 'POST', '/x');
		await expect(call).rejects.toBeInstanceOf(NodeApiError);
		await expect(call).rejects.toMatchObject({
			message: 'A configurator already exists for this product and position.',
		});
	});

	it('reports a missing plugin on 404 even when n8n already threw a NodeApiError', async () => {
		const call = shopwareApiRequest.call(context(n8nError(404, { errors: [] })), 'GET', '/x', {
			requiresPlugin: { name: 'Product Configurator', technicalName: 'NovastrixConfigurator' },
		});
		await expect(call).rejects.toMatchObject({
			message: 'This operation needs the Product Configurator plugin',
		});
	});
});
