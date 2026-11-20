import { describe, expect, it } from 'vitest';

import { buildFaqHtml } from '../nodes/Shopware/resources/product/plugins';

describe('buildFaqHtml', () => {
	it('builds the markup the SEO plugin parses and escapes plain text', () => {
		expect(
			buildFaqHtml([
				{ question: 'Is it waterproof?', answer: 'Yes & dustproof.' },
				{ question: 'Warranty?', answer: '<p>36 <strong>months</strong></p>' },
				{ question: '  ', answer: 'skipped' },
			]),
		).toBe(
			'<h3>Is it waterproof?</h3><p>Yes &amp; dustproof.</p><h3>Warranty?</h3><p>36 <strong>months</strong></p>',
		);
	});

	it('returns an empty string for no questions (clears the FAQ)', () => {
		expect(buildFaqHtml([])).toBe('');
	});
});
