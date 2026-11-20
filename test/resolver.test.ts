import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import { parseRate } from '../nodes/Shopware/shared/entities';
import type { SearchFn } from '../nodes/Shopware/shared/resolver';
import { EntityResolver, ResolutionError } from '../nodes/Shopware/shared/resolver';

const ID_A = 'a'.repeat(32);
const ID_B = 'b'.repeat(32);

/** Fake DAL: returns records whose `field` equals the filter value (case-insensitive). */
function fakeSearch(tables: Record<string, IDataObject[]>) {
	const fn = vi.fn<SearchFn>(async (entity, criteria) => {
		const rows = tables[entity] ?? [];
		const [filter] = (criteria.filter as IDataObject[]) ?? [];
		const matches = (row: IDataObject, f: IDataObject): boolean => {
			if (f.type === 'multi') {
				return (f.queries as IDataObject[]).every((q) => matches(row, q));
			}
			const value = String(f.field)
				.split('.')
				.reduce<unknown>((obj, key) => (obj as IDataObject | undefined)?.[key], row);
			return String(value).toLowerCase() === String(f.value).toLowerCase();
		};
		return filter ? rows.filter((row) => matches(row, filter)) : rows;
	});
	return fn;
}

describe('parseRate', () => {
	it.each([
		['19', 19],
		['19%', 19],
		[' 7 % ', 7],
		['19,5', 19.5],
		['Standard rate', undefined],
	])('parses %s', (input, expected) => {
		expect(parseRate(input)).toBe(expected);
	});
});

describe('EntityResolver', () => {
	it('returns IDs unchanged without a request', async () => {
		const search = fakeSearch({});
		const resolver = new EntityResolver(search);
		expect(await resolver.resolve('manufacturer', ID_A.toUpperCase())).toBe(ID_A);
		expect(search).not.toHaveBeenCalled();
	});

	it('resolves tax by rate before name', async () => {
		const search = fakeSearch({
			tax: [
				{ id: ID_A, name: 'Standard rate', taxRate: 19 },
				{ id: ID_B, name: 'Reduced rate', taxRate: 7 },
			],
		});
		const resolver = new EntityResolver(search);
		expect(await resolver.resolve('tax', '19%')).toBe(ID_A);
		expect(await resolver.resolve('tax', 'reduced rate')).toBe(ID_B);
	});

	it('falls back from product number to name', async () => {
		const search = fakeSearch({
			product: [{ id: ID_A, productNumber: 'SW1', name: 'Shirt' }],
		});
		const resolver = new EntityResolver(search);
		expect(await resolver.resolve('product', 'SW1')).toBe(ID_A);
		expect(await resolver.resolve('product', 'shirt')).toBe(ID_A);
	});

	it('caches results per value', async () => {
		const search = fakeSearch({ currency: [{ id: ID_A, isoCode: 'EUR', name: 'Euro' }] });
		const resolver = new EntityResolver(search);
		await resolver.resolve('currency', 'EUR');
		await resolver.resolve('currency', 'eur');
		await resolver.resolve('currency', ' EUR ');
		expect(search).toHaveBeenCalledTimes(1);
	});

	it('fails on ambiguous values and lists the candidates', async () => {
		const search = fakeSearch({
			product_manufacturer: [
				{ id: ID_A, name: 'Acme' },
				{ id: ID_B, name: 'ACME' },
			],
		});
		const resolver = new EntityResolver(search);
		await expect(resolver.resolve('manufacturer', 'acme')).rejects.toThrow(ResolutionError);
		await expect(resolver.resolve('manufacturer', 'acme')).rejects.toThrow(
			new RegExp(`more than one manufacturer.*${ID_A}.*${ID_B}`),
		);
	});

	it('fails with a clear message when nothing matches', async () => {
		const resolver = new EntityResolver(fakeSearch({}));
		await expect(resolver.resolve('salesChannel', 'Nope')).rejects.toThrow(
			'No sales channel found for "Nope"',
		);
		expect(await resolver.find('salesChannel', 'Nope')).toBeUndefined();
	});

	it('resolves property options as "Group: Option"', async () => {
		const search = fakeSearch({
			property_group_option: [
				{ id: ID_A, name: 'Red', group: { name: 'Color' } },
				{ id: ID_B, name: 'Red', group: { name: 'Shade' } },
			],
		});
		const resolver = new EntityResolver(search);
		expect(await resolver.resolve('propertyOption', 'Color: Red')).toBe(ID_A);
		await expect(resolver.resolve('propertyOption', 'Red')).rejects.toThrow(/more than one/);
	});

	it('resolves full and partial category paths via the breadcrumb', async () => {
		const search = fakeSearch({
			category: [
				{ id: ID_A, name: 'Sneakers', translated: { breadcrumb: ['Home', 'Men', 'Sneakers'] } },
				{ id: ID_B, name: 'Sneakers', translated: { breadcrumb: ['Home', 'Women', 'Sneakers'] } },
			],
		});
		const resolver = new EntityResolver(search);
		expect(await resolver.resolve('category', 'Home > Men > Sneakers')).toBe(ID_A);
		expect(await resolver.resolve('category', 'women > sneakers')).toBe(ID_B);
		await expect(resolver.resolve('category', 'Sneakers')).rejects.toThrow(/more than one/);
	});

	it('handles resource locator modes', async () => {
		const search = fakeSearch({ unit: [{ id: ID_A, name: 'Kilogram' }] });
		const resolver = new EntityResolver(search);
		expect(await resolver.resolveLocator('unit', { __rl: true, mode: 'list', value: ID_B })).toBe(
			ID_B,
		);
		expect(
			await resolver.resolveLocator('unit', { __rl: true, mode: 'name', value: 'kilogram' }),
		).toBe(ID_A);
		expect(await resolver.resolveLocator('unit', { __rl: true, mode: 'name', value: '' })).toBe(
			undefined,
		);
		await expect(
			resolver.resolveLocator('unit', { __rl: true, mode: 'id', value: 'Kilogram' }),
		).rejects.toThrow(/not a valid Shopware ID/);
	});
});
