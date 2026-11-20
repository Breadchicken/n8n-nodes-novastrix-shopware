import { describe, expect, it } from 'vitest';

import { formatShopwareErrors } from '../nodes/Shopware/shared/errors';

describe('formatShopwareErrors', () => {
	it('keeps every error and maps the source pointer to a field', () => {
		const result = formatShopwareErrors({
			errors: [
				{
					code: 'c1d1b5c3',
					title: 'Constraint violation error',
					detail: 'This value should not be blank.',
					source: { pointer: '/0/name' },
				},
				{
					code: 'c1d1b5c3',
					title: 'Constraint violation error',
					detail: 'This value should not be blank.',
					source: { pointer: '/0/taxId' },
				},
			],
		});

		expect(result?.message).toBe('This value should not be blank. (+1 more)');
		expect(result?.description).toBe(
			'name: This value should not be blank. [c1d1b5c3]\ntaxId: This value should not be blank. [c1d1b5c3]',
		);
	});

	it('parses string bodies', () => {
		const result = formatShopwareErrors(
			JSON.stringify({ errors: [{ title: 'Unauthorized', detail: 'Access token is invalid' }] }),
		);
		expect(result?.message).toBe('Access token is invalid');
		expect(result?.description).toBe('Access token is invalid');
	});

	it('returns undefined for bodies without errors', () => {
		expect(formatShopwareErrors({ data: [] })).toBeUndefined();
		expect(formatShopwareErrors('not json')).toBeUndefined();
		expect(formatShopwareErrors(undefined)).toBeUndefined();
	});

	it('reads plugin responses with a top-level message', () => {
		const result = formatShopwareErrors({ success: false, message: 'Product is not a variant' });
		expect(result?.message).toBe('Product is not a variant');
	});

	it('reads plugin validation errors and conflicts', () => {
		const result = formatShopwareErrors({
			success: false,
			phase: 'validation',
			errors: [
				{
					type: 'missing',
					child_product_number: 'SW1',
					message: 'Property "Color" is missing',
				},
			],
			conflicts: [{ field: 'manufacturerId', distinct_values: ['a', 'b'] }],
		});
		expect(result?.message).toBe('Property "Color" is missing (+1 more)');
		expect(result?.description).toBe(
			'SW1: Property "Color" is missing [missing]\n' +
				'manufacturerId: values differ between the products: ["a","b"] [conflict]',
		);
	});

	it('names the differing fields when only conflicts are reported', () => {
		const result = formatShopwareErrors({
			success: false,
			errors: [],
			conflicts: [{ field: 'weight', distinct_values: [1, 2] }],
		});
		expect(result?.message).toBe('The products differ in: weight');
	});
});
