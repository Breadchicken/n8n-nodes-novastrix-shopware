import { describe, expect, it } from 'vitest';

import { fileNameFromDisposition } from '../nodes/Shopware/shared/transport';

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
