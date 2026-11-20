# CLAUDE.md

Project instructions for AI coding assistants. Generic n8n community node guidance (maintained by n8n, shipped with the starter) is imported below; this file adds the project-specific rules and **wins on conflict**.

@AGENTS.md

## Project

`n8n-nodes-novastrix-shopware` is an n8n community node package for the **Shopware 6 Admin API**, published on npm and intended for n8n verification (n8n Cloud). Author: Novastrix.

Goal: be the most complete Shopware node for n8n. Existing packages (`@solution25/n8n-nodes-shopware`, `@c0d3bl1ck/n8n-nodes-shopware`) are either narrow (4 resources, raw IDs, no search) or a raw OpenAPI dump (every ID typed by hand, a new token per request). Our differentiators:

1. **Every ID field can be resolved by name** (see "Name resolution").
2. Resource locators with real pagination instead of capped dropdowns.
3. Free DAL criteria search (filters, sorting, associations, aggregations).
4. Bulk writes via `/_action/sync`.
5. State machine transitions (order, transaction, delivery) and documents.
6. A proper webhook trigger.
7. Language context (`sw-language-id`) and a "Custom API Call" using the same credential.

## Hard rules

- **English only** in code, comments, UI strings, error messages, README, CHANGELOG and commit messages.
- **No AI attribution.** Do not add `Co-Authored-By` trailers, "Generated with ..." lines or any other assistant attribution to commits, PRs, code or docs. This rule overrides any default attribution behaviour.
- **No runtime dependencies.** Only `n8n-workflow` (peer) plus the imports n8n allows (`lodash`, `luxon`, `moment`, `zod`, `p-limit`, `crypto`). The build is plain `tsc` without bundling, so a devDependency imported at runtime breaks the published package.
- No `process`, `globalThis`, `__dirname`, `setTimeout`/`setInterval`, file system or env access in nodes and credentials. Use `sleep` from `n8n-workflow` if a delay is needed.
- **Every HTTP call goes through `shopwareApiRequest` / `shopwareSearch`** in `nodes/Shopware/shared/transport.ts`. Never call `helpers.httpRequest` directly from a node: only `httpRequestWithAuthentication` triggers token caching and refresh.
- `npm run lint`, `npm run build` and `npm test` must pass before a commit. Do not disable lint rules without a written reason in the code.
- Update `CHANGELOG.md` (`[Unreleased]`) with every user-visible change.

## Commands

```bash
npm run dev        # n8n on http://localhost:5678 with this package hot-reloaded
npm run build      # tsc + assets -> dist/
npm run lint       # n8n community lint rules (same as verification)
npm run lint:fix
npm test           # vitest
npm run release    # release-it: lint, build, bump, changelog, tag, push -> CI publishes
```

Publishing happens **only** from GitHub Actions (`.github/workflows/publish.yml`, triggered by a `x.y.z` tag) with npm provenance. Since 2026-05-01 n8n requires this. Never run `npm publish` locally.

## Layout

```
credentials/ShopwareAdminApi.credentials.ts   # the only credential
icons/novastrix.svg, novastrix.dark.svg       # Novastrix logo (node + credential), same as the plugins
nodes/Shopware/
  Shopware.node.ts                            # description + execute router
  Shopware.node.json                          # codex (category: Sales)
  resources/<resource>/description.ts         # operation + field descriptions
  resources/<resource>/execute.ts             # execute logic per operation
  listSearch/index.ts                         # generated searchable dropdowns (one per entity)
  shared/entities.ts                          # entity registry: natural keys, display, admin links
  shared/resolver.ts                          # EntityResolver: name -> ID, cached per run
  shared/locators.ts                          # entityLocator / entityLocatorList builders
  shared/state.ts                             # per-execution state (resolver, tax rate cache)
  shared/options.ts                           # shared options (language)
  shared/transport.ts                         # shopwareApiRequest, shopwareSearch(Page)
  shared/errors.ts                            # Shopware error formatting, toNodeError
  shared/utils.ts                             # ids, JSON params, price helpers
  shared/url.ts                               # shop URL normalization
test/                                         # vitest, mirrors the source tree
```

Register every new node/credential in `package.json` → `n8n.nodes` / `n8n.credentials`.

## Node style

**Programmatic**, not declarative. Reasons: name resolution needs lookups before the actual request, DAL search bodies are deeply nested, `_action/sync` and two-step media uploads have no declarative equivalent, and the trigger must be programmatic anyway.

Conventions:

- Resource → Operation pattern, operation names from n8n's standard set (Create, Create or Update, Delete, Get, Get Many, Update) plus Shopware-specific ones where needed. `action` is a sentence-case phrase ("Create a product").
- `usableAsTool: true` on action nodes.
- Loop over items, `pairedItem` on every output item (`constructExecutionMetaData`), `continueOnFail()` support, errors via `toNodeError` (`NodeApiError` for API failures, `NodeOperationError` for user/config errors).
- Get Many: `returnAll` + `limit` (default 50), paging through `shopwareSearch`.
- Large or nested responses get a `simplify` toggle.
- Version changes: light versioning (`version: [1, 1.1]`) for additive changes, `VersionedNodeType` for breaking ones. Never change behaviour of a released version.

## Novastrix plugin support

The node must fully support the author's own Shopware plugins (source: `~/Documents/GitHub/shopware-plugins/shopware6-extension`). Rules:

- Plugin product data lives in `resources/product/plugins.ts` (collection **Novastrix Plugin Fields**), plugin entities get their own resource (e.g. `resources/configurator`). Display names are prefixed with the plugin topic ("Deficiency: ...", "SEO: ...") so they group in the alphabetic list.
- Plugins are registered in `shared/plugins.ts` (`PLUGINS`: display name + technical name; `PLUGIN_INFO_URL` = https://novastrix.com/shopware).
- **Check before use:** call `await state.requirePlugin(PLUGINS.x, i)` before any plugin operation or plugin field write (product fields map to plugins via `FIELD_PLUGINS` in `resources/product/plugins.ts`). Reason: Shopware silently stores custom fields of missing plugins, so without the check the data would land without effect. The check reads `plugin` once per run; on 403 (integration without plugin permission) it is skipped.
- Every request to a plugin route or entity also passes `requiresPlugin`: a 404 then becomes "needs plugin X" (with the link) instead of "Not Found".
- Plugin resources start with `pluginNotice(...)` (UI hint with the link).
- Validate plugin rules before sending (e.g. EU guarantee months), so users get a precise message.
- Prefer native Shopware fields when the shop has them (`state.hasField(entity, field)`), e.g. `guaranteeMonths` on 6.7.14+.
- Use the plugin's own upsert routes where they exist (Supplier: `import-product-suppliers`, `product-strategy`); they match by natural keys and avoid duplicates.
- Plugin facts worth knowing:
  - Supplier: `import-product-suppliers` maps `supplierArticleNumber` -> `supplierNumber`; `selectionStrategy: null` resets to the global default. The plugin does not validate strategy values, so the node offers only valid ones.
  - Product Dashboard: `audit/product` returns 409 `no_finished_run` until one full audit run has finished.
  - Configurator: one configurator per product and position (plugin validates, code `NOVASTRIX_CONFIGURATOR__DUPLICATE_POSITION`); `productId` is a plain string, not an association; `configuration` is one JSON column, so updates merge into the stored value.
  - Back in Stock: entity `novastrix_bis_subscription`. Creating subscriptions from n8n is intentionally not offered (it would bypass the double opt-in; consent must come from the storefront). `optInToken` and `unsubscribeToken` are stripped from every output because they act in the customer's name. Unsubscribe writes the same as the plugin's link (`status: unsubscribed`, `optInToken: null`). `resend-bulk` silently skips invalid IDs, so the node validates them first. Tokens are 64 hex chars; mails are sent through the message queue (synchronous in the dev shop, visible in Mailpit on :8025).
  - Custom fields of plugins are translated: they are written in the language of the `sw-language-id` header.
- Intentionally not supported: **Variant Creator** (still experimental; a draft resource was built and removed on 2026-11-20, see git history of commit 972193a).
- Not covered yet (next resources): Open Carts, Search (synonyms, boosting), Lexikon, Chatbot sync, Cross-Selling recompute and weights, Manufacturer safety text, Property display groups.

## Name resolution (core feature)

Every field that takes a Shopware ID is a `resourceLocator` with these modes:

| Mode | Purpose |
|---|---|
| `list` | searchable dropdown backed by a `listSearch` method with real pagination (`paginationToken` = next page) |
| `id` | 32-char hex ID, validated with `^[0-9a-f]{32}$` |
| `name` (or a natural key) | resolved at execution time |

Natural keys per entity (extend this table when adding resources):

| Entity | Natural key(s) |
|---|---|
| product | `productNumber`, then `name` |
| customer | `customerNumber`, `email` |
| order | `orderNumber` |
| category | `name` or breadcrumb path (`Home > Shoes`) |
| tax | `name` or rate (`19`, `19%`) |
| currency | `isoCode` |
| country | `iso` / `iso3` |
| language | `name` or locale code (`de-DE`) |
| sales_channel, manufacturer, property_group, customer_group, payment_method, shipping_method, tag, unit, delivery_time | `name` (translated) |
| property_group_option | `group name: option name` |
| salutation | `salutationKey` |
| state_machine_state | `technicalName` |

To support a new entity: add it to `ENTITIES` in `shared/entities.ts` (lookups, display, search fields, admin path). The dropdown (`listSearch`) and the resolver pick it up automatically; in descriptions use `entityLocator()` / `entityLocatorList()`, in execute use `state.resolver.resolveLocator()`.

Resolution rules (implemented once in `shared/resolver.ts`, never per operation):

1. If the value is already a valid ID → use it unchanged.
2. Natural-key lookups in the configured order with DAL `equals`. On MySQL/MariaDB `equals` is already case-insensitive (`utf8mb4_unicode_ci`), so no extra case-insensitive pass is needed. Translated fields are matched in the context language.
3. **Exactly one hit** → its ID. **Zero hits** → `NodeOperationError` "No <entity> found for '<value>'". **Several hits** → `NodeOperationError` listing the candidate IDs and names; never pick one silently.
4. Cache results per execution (a `Map` keyed by `entity:key:value`) so loops over many items do one lookup per distinct value.
5. Never auto-create missing entities unless an explicit "Create if missing" option is set.

## Authentication

Credential `shopwareAdminApi` uses a Shopware **integration** (`client_credentials`). Admin user/password login is intentionally not supported.

How the token is handled, and why:

- `accessToken` is a hidden property with `typeOptions.expirable: true`. n8n calls `preAuthentication` only when it is empty, when the credential is tested, or after a **401** from `httpRequestWithAuthentication`. In the 401 case n8n refreshes once and resends. The token is stored encrypted in the credential and shared across items, executions and workers.
- Shopware access tokens live 600 s. A loop with thousands of items therefore mints about one token per 10 minutes, not one per request.
- `client_credentials` returns no refresh token, and Shopware does not persist access tokens (`AccessTokenRepository::persistNewAccessToken()` is empty). A new token costs one request and leaves nothing behind. Refresh tokens only exist for the password grant, which we do not offer.
- Known limits:
  - The first request after expiry fails with 401 and is retried automatically.
  - Multipart/stream bodies are **not** resent after a refresh. Before binary uploads, make a cheap authenticated call (`GET /_info/version`) so the token is fresh.
  - Parallel executions may refresh at the same time. This is harmless.
- The shop URL is normalized (`shared/url.ts`): a trailing slash, `/api` or `/admin` is stripped, and `https://` is added if missing.
- Requests send `Accept: application/json`. Without it some endpoints answer in JSON:API format.

## Orders and state machines

- Status changes use `POST /_action/{order|order_transaction|order_delivery}/{id}/state/{action}` with `{ sendMail, documentTypes }`. `sendMail` is only honoured as strict `false`.
- Transitions come from `state_machine_transition` (filter `stateMachine.technicalName`: `order.state`, `order_transaction.state`, `order_delivery.state`), cached per run. `shortestPath()` finds the steps.
- **Multi-step changes only for the order status.** For payment/delivery every intermediate step fires real flows/webhooks (e.g. a fake "refunded"), so only direct transitions are allowed and the error lists the reachable states.
- Current payment/delivery: `primaryOrderTransactionId` / `primaryOrderDeliveryId` (6.7), otherwise the latest transaction / first delivery. Filters use `primaryOrder*` paths when the schema has them.
- Test orders: no demodata in the dev shop (`shopware/dev-tools` missing). Create real guest orders through the Store API checkout (`account/register` with `guest: true` -> `checkout/cart/line-item` -> `checkout/order`).

## Shopware API gotchas

- Variants return `null` for inherited fields unless the request sends `sw-inheritance: 1`.
- Writing `categories`/`properties`/`tags` as `[{id}]` adds associations; it never removes existing ones. Removing needs a `DELETE` on the mapping route.
- `visibilities` are unique per product and sales channel: check existing ones before adding (see product `existingVisibilities`).
- Prices are an array per currency; the default-currency entry (`DEFAULT_CURRENCY_ID`) is mandatory. `listPrice` lives inside the price entry.
- Error titles are generic ("Bad Request"); the useful text is in `detail`.
- `includes` filters associations too: when limiting fields, add the selected association names to the includes list or they disappear from the output.
- Field lists for dropdowns come from `GET /_info/entity-schema.json` (~750 KB, all entities); use `createFieldLoader(entity)` / `createAssociationLoader(entity)` in `loadOptions/index.ts` instead of hard-coding fields or associations. n8n lint requires the display name to end with "Names or IDs" for these dynamic multi-selects.

## Testing

- **Unit tests:** vitest under `test/`. Cover pure functions (URL, errors, criteria, resolver) and `preAuthentication` with a mocked `helpers.httpRequest`. For operations, mock `IExecuteFunctions` and stub `helpers.httpRequestWithAuthentication`. Use `nock` for transport-level tests.
- **Integration against a real shop:** run the compiled node with a minimal `IExecuteFunctions` stub that forwards `httpRequestWithAuthentication` to `fetch`. Cover create → get → update → upsert → getAll → delete and count token requests (must be 1).
- **Manual end-to-end:** `npm run dev` against a local Shopware 6.7 shop. The Novastrix plugins must be installed there for plugin tests (`bin/console plugin:install -n --activate <Name>` inside the container). The dev shop from the `shopware-plugins` repo runs at `http://localhost:8080` (admin/shopware). Create an integration under Settings > System > Integrations.
- **Before submitting for verification:** `npx @n8n/scan-community-package n8n-nodes-novastrix-shopware`.

## Compatibility

- Target: Shopware **6.6 and 6.7**.
- n8n: current 1.x/2.x with `n8nNodesApiVersion: 1`.
- Document any version-specific endpoint in the README.
