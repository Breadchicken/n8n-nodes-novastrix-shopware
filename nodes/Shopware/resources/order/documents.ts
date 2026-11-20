import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { OutputItems } from '../../shared/output';
import { shopwareApiRequest, shopwareFileRequest, shopwareSearch } from '../../shared/transport';

/** Document types that correct an invoice and therefore need a referenced invoice. */
const REFERENCING_TYPES = new Set([
	'storno',
	'credit_note',
	'zugferd_cancellation_invoice',
	'zugferd_credit_note',
	'zugferd_embedded_cancellation_invoice',
	'zugferd_embedded_credit_note',
]);
const INVOICE_TYPES = ['invoice', 'zugferd_invoice', 'zugferd_embedded_invoice'];

export async function createDocument(
	this: IExecuteFunctions,
	order: IDataObject,
	i: number,
): Promise<OutputItems> {
	const orderId = String(order.id);
	const type = this.getNodeParameter('documentType', i) as string;
	const ifExists = this.getNodeParameter('ifExists', i, 'useExisting') as string;
	const fields = this.getNodeParameter('documentFields', i, {}) as IDataObject;

	if (ifExists === 'useExisting') {
		const [existing] = await searchDocuments.call(this, orderId, [type], 1);
		if (existing) {
			return await toOutput.call(this, [existing], order, i, { created: false });
		}
	}

	const config: IDataObject = {};
	if (typeof fields.documentNumber === 'string' && fields.documentNumber.trim() !== '') {
		config.documentNumber = fields.documentNumber.trim();
	}
	if (fields.documentDate) {
		config.documentDate = new Date(String(fields.documentDate)).toISOString();
	}
	if (typeof fields.documentComment === 'string' && fields.documentComment !== '') {
		config.documentComment = fields.documentComment;
	}

	const operation: IDataObject = { orderId, fileType: 'pdf', static: false, config };
	if (REFERENCING_TYPES.has(type)) {
		operation.referencedDocumentId = await findInvoice.call(
			this,
			orderId,
			String(fields.referencedNumber ?? '').trim(),
			type,
			i,
		);
	}

	const result = (await shopwareApiRequest.call(
		this,
		'POST',
		`/_action/order/document/${encodeURIComponent(type)}/create`,
		{ body: [operation] },
	)) as { data?: IDataObject[]; errors?: Record<string, unknown> };

	const errors = Object.values(result.errors ?? {}).flat() as IDataObject[];
	const documentId = result.data?.[0]?.documentId as string | undefined;
	if (errors.length > 0 || !documentId) {
		throw new NodeOperationError(this.getNode(), `Creating the ${type} document failed`, {
			itemIndex: i,
			description: errors
				.map((error) =>
					String(error.detail ?? error.message ?? error.code ?? JSON.stringify(error)),
				)
				.join('\n'),
		});
	}

	const records = await shopwareSearch.call(this, 'document', {
		ids: [documentId],
		associations: { documentType: {} },
	});
	return await toOutput.call(this, records, order, i, { created: true });
}

export async function getDocuments(
	this: IExecuteFunctions,
	order: IDataObject,
	i: number,
): Promise<OutputItems> {
	const types = this.getNodeParameter('documentTypes', i, []) as string[];
	let documents = await searchDocuments.call(this, String(order.id), types);
	if (this.getNodeParameter('latestOnly', i, false) as boolean) {
		const seen = new Set<string>();
		documents = documents.filter((document) => {
			const type = documentTypeName(document);
			if (seen.has(type)) {
				return false;
			}
			seen.add(type);
			return true;
		});
	}
	return await toOutput.call(this, documents, order, i);
}

/** Newest first. */
async function searchDocuments(
	this: IExecuteFunctions,
	orderId: string,
	types: string[],
	limit?: number,
): Promise<IDataObject[]> {
	const filter: IDataObject[] = [{ type: 'equals', field: 'orderId', value: orderId }];
	if (types.length > 0) {
		filter.push({ type: 'equalsAny', field: 'documentType.technicalName', value: types });
	}
	return await shopwareSearch.call(
		this,
		'document',
		{
			filter,
			associations: { documentType: {} },
			sort: [{ field: 'createdAt', order: 'DESC' }],
		},
		limit,
	);
}

async function findInvoice(
	this: IExecuteFunctions,
	orderId: string,
	number: string,
	type: string,
	i: number,
): Promise<string> {
	const invoices = await searchDocuments.call(this, orderId, INVOICE_TYPES);
	const invoice = number
		? invoices.find((document) => document.documentNumber === number)
		: invoices[0];
	if (!invoice) {
		throw new NodeOperationError(
			this.getNode(),
			number
				? `The order has no invoice with number "${number}"`
				: `A ${type} document needs an invoice, but the order has none`,
			{ itemIndex: i, description: 'Create the invoice first, e.g. with Create Document.' },
		);
	}
	return String(invoice.id);
}

function documentTypeName(document: IDataObject): string {
	return String(((document.documentType as IDataObject | undefined) ?? {}).technicalName ?? '');
}

async function toOutput(
	this: IExecuteFunctions,
	documents: IDataObject[],
	order: IDataObject,
	i: number,
	extra: IDataObject = {},
): Promise<OutputItems> {
	const download = this.getNodeParameter('download', i, false) as boolean;
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
	const items: INodeExecutionData[] = [];
	for (const document of documents) {
		const type = documentTypeName(document);
		const config = (document.config as IDataObject | undefined) ?? {};
		const json: IDataObject = {
			id: document.id,
			type,
			typeName:
				((document.documentType as IDataObject | undefined)?.translated as IDataObject | undefined)
					?.name ?? (document.documentType as IDataObject | undefined)?.name,
			documentNumber: document.documentNumber ?? config.documentNumber,
			documentDate: config.documentDate,
			sent: document.sent,
			createdAt: document.createdAt,
			referencedDocumentId: document.referencedDocumentId,
			orderId: order.id,
			orderNumber: order.orderNumber,
			...extra,
		};
		const item: INodeExecutionData = { json };
		if (download) {
			const file = await shopwareFileRequest.call(
				this,
				`/_action/document/${String(document.id)}/${String(document.deepLinkCode)}`,
				{ download: 1 },
			);
			if (!file) {
				throw new NodeOperationError(
					this.getNode(),
					`The file of document ${String(json.documentNumber)} is not available`,
					{ itemIndex: i },
				);
			}
			item.binary = {
				[binaryPropertyName]: await this.helpers.prepareBinaryData(
					file.data,
					file.fileName ?? `${type}_${String(json.documentNumber)}.pdf`,
					file.mimeType ?? 'application/pdf',
				),
			};
		}
		items.push(item);
	}
	return new OutputItems(items);
}
