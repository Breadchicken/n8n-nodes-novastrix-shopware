import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import {
	buildLinkOperations,
	executeLexikonEntry,
	parseSynonyms,
	simplifyEntry,
} from '../nodes/Shopware/resources/lexikon/entryExecute';
import { createExecutionState } from '../nodes/Shopware/shared/state';

const ENTRY = 'e'.repeat(32);
const SC_A = 'a'.repeat(32);
const SC_B = 'b'.repeat(32);
const SC_C = 'c'.repeat(32);
const MEDIA_1 = '1'.repeat(32);
const MEDIA_2 = '2'.repeat(32);
const ROW_1 = 'f'.repeat(32);

describe('parseSynonyms', () => {
	it('splits, trims and drops duplicates', () => {
		expect(parseSynonyms('PES,  polyester fibre, pes,,')).toEqual(['PES', 'polyester fibre']);
		expect(parseSynonyms(['a', ' b '])).toEqual(['a', 'b']);
		expect(parseSynonyms('')).toEqual([]);
	});
});

describe('buildLinkOperations', () => {
	const current: IDataObject = {
		salesChannels: [{ id: SC_A }, { id: SC_B }],
		relatedEntries: [],
		media: [{ id: ROW_1, mediaId: MEDIA_1, position: 0 }],
	};

	it('replaces sales channels: adds the new ones and deletes the dropped ones', () => {
		const operations = buildLinkOperations(ENTRY, current, {
			body: {},
			salesChannels: [SC_B, SC_C],
		});
		expect(operations).toEqual({
			'add-salesChannels': {
				entity: 'novastrix_lexikon_entry_sales_channel',
				action: 'upsert',
				payload: [{ entryId: ENTRY, salesChannelId: SC_C }],
			},
			'delete-salesChannels': {
				entity: 'novastrix_lexikon_entry_sales_channel',
				action: 'delete',
				payload: [{ entryId: ENTRY, salesChannelId: SC_A }],
			},
		});
	});

	it('leaves lists alone that are not given', () => {
		expect(buildLinkOperations(ENTRY, current, { body: {} })).toEqual({});
	});

	it('clears a list given empty', () => {
		const operations = buildLinkOperations(ENTRY, current, { body: {}, salesChannels: [] });
		expect(Object.keys(operations)).toEqual(['delete-salesChannels']);
	});

	it('reorders the gallery, keeps existing rows and removes dropped images', () => {
		const operations = buildLinkOperations(ENTRY, current, { body: {}, gallery: [MEDIA_2] });
		const upsert = (operations['upsert-gallery'] as IDataObject).payload as IDataObject[];
		expect(upsert).toHaveLength(1);
		expect(upsert[0]).toMatchObject({ entryId: ENTRY, mediaId: MEDIA_2, position: 0 });
		expect(upsert[0].id).not.toBe(ROW_1);
		expect(operations['delete-gallery']).toEqual({
			entity: 'novastrix_lexikon_entry_media',
			action: 'delete',
			payload: [{ id: ROW_1 }],
		});

		const kept = buildLinkOperations(ENTRY, current, { body: {}, gallery: [MEDIA_2, MEDIA_1] });
		const rows = (kept['upsert-gallery'] as IDataObject).payload as IDataObject[];
		expect(rows[1]).toEqual({ id: ROW_1, entryId: ENTRY, mediaId: MEDIA_1, position: 1 });
		expect(kept['delete-gallery']).toBeUndefined();
	});
});

describe('simplifyEntry', () => {
	it('returns names instead of IDs and sorts the gallery', () => {
		const simple = simplifyEntry({
			id: ENTRY,
			term: 'Polyester',
			translated: { term: 'Polyester', shortDefinition: 'A synthetic fibre', synonyms: ['PES'] },
			active: true,
			initialLetter: 'P',
			categoryId: 'x',
			category: { translated: { name: 'Materials' } },
			salesChannels: [{ translated: { name: 'Storefront' } }],
			relatedEntries: [{ translated: { term: 'Cotton' } }],
			media: [
				{ mediaId: MEDIA_2, position: 1, media: { fileName: 'b', fileExtension: 'jpg' } },
				{ mediaId: MEDIA_1, position: 0, media: { fileName: 'a', fileExtension: 'png' } },
			],
		});
		expect(simple).toMatchObject({
			term: 'Polyester',
			shortDefinition: 'A synthetic fibre',
			synonyms: ['PES'],
			category: 'Materials',
			salesChannels: ['Storefront'],
			relatedEntries: ['Cotton'],
		});
		expect((simple.gallery as IDataObject[]).map((image) => image.fileName)).toEqual([
			'a.png',
			'b.jpg',
		]);
	});
});

describe('Create or Update', () => {
	it('refuses to guess when several entries have the term', async () => {
		const request = vi.fn(async (_name: string, options: { url: string }) => {
			if (options.url.endsWith('/search/plugin')) {
				return { data: [{ name: 'NovastrixLexikon', active: true, installedAt: '2026-01-01' }] };
			}
			if (options.url.endsWith('/search/novastrix-lexikon-entry')) {
				return { data: [{ id: SC_A }, { id: SC_B }] };
			}
			throw new Error(`unexpected request ${options.url}`);
		});
		const params: IDataObject = { term: 'Polyester', additionalFields: {}, options: {} };
		const ctx = {
			getNode: () => ({ name: 'Shopware Novastrix', type: 'shopware', typeVersion: 1 }),
			getCredentials: async () => ({ url: 'https://shop.example.com' }),
			getNodeParameter: (name: string, _i: number, fallback?: unknown) => params[name] ?? fallback,
			helpers: { httpRequestWithAuthentication: request },
		} as unknown as IExecuteFunctions;

		await expect(
			executeLexikonEntry.call(ctx, createExecutionState(ctx), 'upsert', 0),
		).rejects.toThrow('"Polyester" matches 2 lexikon entries');
		const urls = request.mock.calls.map(([, options]) => (options as { url: string }).url);
		expect(urls.every((url) => url.includes('/search/'))).toBe(true);
	});
});
