import { randomUUID } from 'crypto';
import type { IDataObject, INodeParameterResourceLocator } from 'n8n-workflow';

/** New Shopware ID (UUID v4 as 32 lowercase hex chars). */
export function generateId(): string {
	return randomUUID().replace(/-/g, '');
}

/** Parses a `json` parameter that may arrive as object (expressions) or as string (UI). */
export function parseJsonParameter<T = IDataObject>(
	value: unknown,
	fieldName: string,
): T | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}
	if (typeof value === 'object') {
		return value as T;
	}
	let parsed: T | undefined;
	try {
		parsed = JSON.parse(String(value)) as T;
	} catch {
		parsed = undefined;
	}
	if (parsed === undefined) {
		throw new Error(`"${fieldName}" is not valid JSON`);
	}
	return parsed;
}

/** Reads the locators of an `entityLocatorList` (fixedCollection) value. */
export function locatorListValues(value: unknown): INodeParameterResourceLocator[] {
	const items = (value as { items?: Array<{ value?: INodeParameterResourceLocator }> } | undefined)
		?.items;
	if (!Array.isArray(items)) {
		return [];
	}
	return items
		.map((item) => item.value)
		.filter((locator): locator is INodeParameterResourceLocator => !!locator);
}

/** Splits "a, b,,c" into ["a", "b", "c"]. */
export function splitList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((entry) => String(entry).trim()).filter((entry) => entry !== '');
	}
	if (typeof value !== 'string') {
		return [];
	}
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
}

/** Rounds to a fixed number of decimals without floating point artefacts in the output. */
export function round(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

/** Net price from a gross price and a tax rate in percent. */
export function grossToNet(gross: number, taxRate: number): number {
	return round(gross / (1 + taxRate / 100), 4);
}
