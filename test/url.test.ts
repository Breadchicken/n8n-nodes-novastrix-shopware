import { describe, expect, it } from 'vitest';

import { normalizeShopUrl } from '../nodes/Shopware/shared/url';

describe('normalizeShopUrl', () => {
	it.each([
		['https://shop.example.com', 'https://shop.example.com'],
		['https://shop.example.com/', 'https://shop.example.com'],
		['https://shop.example.com/api', 'https://shop.example.com'],
		['https://shop.example.com/api/', 'https://shop.example.com'],
		['https://shop.example.com/admin', 'https://shop.example.com'],
		['  https://shop.example.com/de/  ', 'https://shop.example.com/de'],
		['shop.example.com', 'https://shop.example.com'],
		['http://localhost:8080/API', 'http://localhost:8080'],
	])('normalizes %s', (input, expected) => {
		expect(normalizeShopUrl(input)).toBe(expected);
	});

	it('throws on an empty URL', () => {
		expect(() => normalizeShopUrl('')).toThrow(/empty/);
		expect(() => normalizeShopUrl(undefined)).toThrow(/empty/);
	});
});
