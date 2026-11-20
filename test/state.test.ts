import type { IExecuteFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { PLUGINS } from '../nodes/Shopware/shared/plugins';
import { createExecutionState } from '../nodes/Shopware/shared/state';

function context(request: (options: { url: string }) => Promise<unknown>) {
	const httpRequestWithAuthentication = vi.fn(async (_name: string, options: { url: string }) =>
		request(options),
	);
	const ctx = {
		getNode: () => ({ name: 'Shopware', type: 'shopware', typeVersion: 1, parameters: {} }),
		getCredentials: async () => ({ url: 'https://shop.example.com' }),
		helpers: { httpRequestWithAuthentication },
	} as unknown as IExecuteFunctions;
	return { ctx, httpRequestWithAuthentication };
}

const pluginList = (data: unknown[]) => async () => ({ data });

describe('requirePlugin', () => {
	it('passes for an active plugin and loads the plugin list once', async () => {
		const { ctx, httpRequestWithAuthentication } = context(
			pluginList([{ name: 'NovastrixSEO', active: true, installedAt: '2026-01-01' }]),
		);
		const state = createExecutionState(ctx);
		await state.requirePlugin(PLUGINS.seo);
		await state.requirePlugin(PLUGINS.seo);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
	});

	it('reports missing, uninstalled and inactive plugins with the info link', async () => {
		const { ctx } = context(
			pluginList([
				{ name: 'NovastrixBackInStock', active: false, installedAt: '2026-01-01' },
				{ name: 'NovastrixSupplier', active: false, installedAt: null },
			]),
		);
		const state = createExecutionState(ctx);
		await expect(state.requirePlugin(PLUGINS.backInStock)).rejects.toThrow(
			'installed but not active',
		);
		await expect(state.requirePlugin(PLUGINS.supplier)).rejects.toThrow('not installed');
		await expect(state.requirePlugin(PLUGINS.seo)).rejects.toMatchObject({
			description: expect.stringContaining('https://novastrix.com/shopware'),
		});
	});

	it('skips the check when the integration may not read plugins', async () => {
		const { ctx } = context(async () => {
			const error = new Error('Forbidden') as Error & { httpCode: string };
			error.httpCode = '403';
			throw error;
		});
		await expect(createExecutionState(ctx).requirePlugin(PLUGINS.seo)).resolves.toBeUndefined();
	});
});
