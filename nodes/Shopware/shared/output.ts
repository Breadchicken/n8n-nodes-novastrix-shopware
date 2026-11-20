import type { INodeExecutionData } from 'n8n-workflow';

/**
 * Complete output items (e.g. with binary data). Executors return this instead of plain JSON when
 * they need more than `json`; the node adds `pairedItem`.
 */
export class OutputItems {
	constructor(readonly items: INodeExecutionData[]) {}
}
