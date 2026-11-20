import type { IDataObject, INodeParameterResourceLocator, INodeProperties } from 'n8n-workflow';

import { entityLocator } from './locators';
import type { EntityResolver } from './resolver';

/**
 * Language context for reads and writes. Translated fields (name, description, ...) are read
 * and written in this language via the `sw-language-id` header.
 */
export const languageOption: INodeProperties = entityLocator({
	displayName: 'Language',
	name: 'language',
	entity: 'language',
	description:
		'Language for translated fields such as name and description. Defaults to the system language.',
});

/** Builds request headers from the shared options (language, inheritance). */
export async function contextHeaders(
	resolver: EntityResolver,
	options: IDataObject,
): Promise<Record<string, string>> {
	const headers: Record<string, string> = {};

	const languageId = await resolver.resolveLocator(
		'language',
		options.language as INodeParameterResourceLocator | undefined,
	);
	if (languageId) {
		headers['sw-language-id'] = languageId;
	}

	return headers;
}
