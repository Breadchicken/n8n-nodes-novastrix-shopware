import type { IDataObject, INodeParameterResourceLocator } from 'n8n-workflow';

import type { EntityConfig, EntityKey } from './entities';
import { CATEGORY_PATH_SEPARATOR, getEntityConfig, isShopwareId } from './entities';
import type { NovastrixPlugin } from './plugins';

/** Runs a DAL search and returns the records (no paging needed for lookups). */
export type SearchFn = (
	entity: string,
	criteria: IDataObject,
	headers?: Record<string, string>,
	requiresPlugin?: NovastrixPlugin,
) => Promise<IDataObject[]>;

/** Thrown when a value cannot be resolved to exactly one record. */
export class ResolutionError extends Error {}

const MAX_CANDIDATES_SHOWN = 5;
const CATEGORY_PATH_LIMIT = 100;

/**
 * Resolves human-readable values (names, numbers, ISO codes, paths) to Shopware IDs.
 *
 * Rules (see CLAUDE.md, "Name resolution"):
 * 1. A valid 32-char hex ID is returned unchanged without a request.
 * 2. Natural-key lookups are tried in the order defined in `entities.ts`.
 * 3. Exactly one hit resolves, zero hits and several hits throw a `ResolutionError`.
 * 4. Results are cached for the lifetime of the resolver (one node execution), so a loop over
 *    many items performs one lookup per distinct value.
 */
export class EntityResolver {
	private readonly cache = new Map<string, Promise<string | undefined>>();

	constructor(private readonly search: SearchFn) {}

	/** Resolves a value or throws if nothing matches. */
	async resolve(key: EntityKey, value: string): Promise<string> {
		const id = await this.find(key, value);
		if (id === undefined) {
			const config = getEntityConfig(key);
			throw new ResolutionError(
				`No ${config.label} found for "${value}". Check the spelling or use the ID instead.`,
			);
		}
		return id;
	}

	/** Resolves a value; returns undefined if nothing matches, throws if ambiguous. */
	async find(key: EntityKey, rawValue: string): Promise<string | undefined> {
		const value = String(rawValue ?? '').trim();
		if (value === '') {
			return undefined;
		}
		if (isShopwareId(value)) {
			return value.toLowerCase();
		}

		const cacheKey = `${key}\u0000${value.toLowerCase()}`;
		let pending = this.cache.get(cacheKey);
		if (!pending) {
			pending = this.lookup(key, value);
			this.cache.set(cacheKey, pending);
			// Do not cache failures (e.g. network errors), only real results.
			pending.catch(() => this.cache.delete(cacheKey));
		}
		return await pending;
	}

	/**
	 * Resolves the value of a resource locator parameter. `list` and `id` modes already contain an
	 * ID; every other mode (name, number, ...) is resolved. Plain strings are accepted too, which
	 * keeps expressions and AI tool calls simple.
	 */
	async resolveLocator(
		key: EntityKey,
		locator: INodeParameterResourceLocator | string | undefined,
	): Promise<string | undefined> {
		if (locator === undefined || locator === null) {
			return undefined;
		}
		if (typeof locator === 'string') {
			return locator.trim() === '' ? undefined : await this.resolve(key, locator);
		}

		const value = String(locator.value ?? '').trim();
		if (value === '') {
			return undefined;
		}
		if (locator.mode === 'list' || locator.mode === 'id') {
			if (!isShopwareId(value)) {
				throw new ResolutionError(
					`"${value}" is not a valid Shopware ID for ${getEntityConfig(key).label}. Switch the mode to "By Name" to look it up.`,
				);
			}
			return value.toLowerCase();
		}
		return await this.resolve(key, value);
	}

	/** Lets callers seed the cache, e.g. after creating a tag. */
	remember(key: EntityKey, value: string, id: string): void {
		this.cache.set(`${key}\u0000${value.trim().toLowerCase()}`, Promise.resolve(id));
	}

	private async lookup(key: EntityKey, value: string): Promise<string | undefined> {
		const config = getEntityConfig(key);

		if (key === 'category' && value.includes(CATEGORY_PATH_SEPARATOR)) {
			return await this.lookupCategoryPath(config, value);
		}

		for (const buildFilter of config.lookups) {
			const filter = buildFilter(value);
			if (!filter) {
				continue;
			}

			const records = await this.search(
				config.entity,
				buildCriteria(config, [filter], MAX_CANDIDATES_SHOWN + 1),
				config.headers,
				config.plugin,
			);

			if (records.length === 1) {
				return String(records[0].id);
			}
			if (records.length > 1) {
				throw ambiguous(config, value, records);
			}
		}

		return undefined;
	}

	/**
	 * Resolves "Parent > Child" paths. The last segment is searched by name, then candidates are
	 * matched against the breadcrumb from the end, so partial paths ("Shoes > Sneakers") work too.
	 */
	private async lookupCategoryPath(
		config: EntityConfig,
		value: string,
	): Promise<string | undefined> {
		const segments = value
			.split(CATEGORY_PATH_SEPARATOR)
			.map((segment) => segment.trim().toLowerCase())
			.filter((segment) => segment !== '');
		if (segments.length === 0) {
			return undefined;
		}

		const records = await this.search(
			config.entity,
			buildCriteria(
				config,
				[{ type: 'equals', field: 'name', value: segments[segments.length - 1] }],
				CATEGORY_PATH_LIMIT,
			),
		);

		const matches = records.filter((record) => {
			const breadcrumb = getBreadcrumb(record).map((entry) => entry.trim().toLowerCase());
			if (breadcrumb.length < segments.length) {
				return false;
			}
			const tail = breadcrumb.slice(breadcrumb.length - segments.length);
			return tail.every((entry, index) => entry === segments[index]);
		});

		if (matches.length === 1) {
			return String(matches[0].id);
		}
		if (matches.length > 1) {
			throw ambiguous(config, value, matches);
		}
		return undefined;
	}
}

export function buildCriteria(
	config: EntityConfig,
	filter: IDataObject[],
	limit: number,
): IDataObject {
	const criteria: IDataObject = {
		filter,
		limit,
		'total-count-mode': 0,
	};

	if (config.associations) {
		criteria.associations = config.associations;
	} else {
		criteria.includes = {
			[config.entity]: ['id', ...config.displayFields, 'translated'],
		};
	}

	return criteria;
}

function getBreadcrumb(record: IDataObject): string[] {
	const translated = record.translated as IDataObject | undefined;
	const breadcrumb = (translated?.breadcrumb ?? record.breadcrumb) as unknown;
	return Array.isArray(breadcrumb) ? breadcrumb.map(String) : [];
}

function ambiguous(config: EntityConfig, value: string, records: IDataObject[]): ResolutionError {
	const shown = records
		.slice(0, MAX_CANDIDATES_SHOWN)
		.map((record) => `"${config.display(record)}" (${String(record.id)})`)
		.join(', ');
	const more = records.length > MAX_CANDIDATES_SHOWN ? ', ...' : '';
	return new ResolutionError(
		`"${value}" matches more than one ${config.label}: ${shown}${more}. Use the ID or a more specific value.`,
	);
}
