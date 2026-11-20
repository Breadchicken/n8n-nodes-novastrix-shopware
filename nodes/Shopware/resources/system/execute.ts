import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { shopwareApiRequest } from '../../shared/transport';

export async function executeSystem(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'getVersion') {
		return (await shopwareApiRequest.call(this, 'GET', '/_info/version')) as IDataObject;
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for the system resource`,
		{ itemIndex: i },
	);
}
