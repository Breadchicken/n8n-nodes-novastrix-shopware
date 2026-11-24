# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Lexikon** (Novastrix Lexikon plugin): resources *Lexikon Entry* (Create, Create or Update by term, Delete, Get, Get Many, Update) and *Lexikon Category* (Create, Delete, Get, Get Many, Update). Entries take synonyms, meta data, category, cover image, gallery, related entries and sales channels by name; Update replaces the given lists. Get and Get Many return a simplified entry with names instead of IDs.
- Media files can be picked from a searchable list or looked up by file name.
- Example workflow *Shopware 9 · Lexikon*.

### Changed

- *Guarantee (Months)* and *Guarantee Confirmed* are now regular product fields (Additional Fields / Update Fields) and write Shopware's native guarantee fields. They need Shopware 6.7.14 or later; older shops get a clear error. Workflows that set them under *Novastrix Plugin Fields* must set them again.

### Removed

- Support for the Novastrix EU Warranty Label plugin (custom fields `novastrix_eu_guarantee_*`), superseded by the native Shopware fields.

## [0.1.1] - 2026-11-24

### Changed

- The nodes are now called **Shopware Novastrix** and **Shopware Novastrix Trigger**, so they can be told apart from other Shopware nodes in the nodes panel. Node types are unchanged; existing workflows keep working.
- The nodes panel entry describes the whole package instead of only the trigger.
- The System action reads "Get the shop version".

### Fixed

- On n8n 2.x, API errors showed only "Bad request - please check your parameters" instead of Shopware's error details, and a missing Novastrix plugin was reported as a plain 404. n8n now wraps failed requests itself; the node sets its message on that error.

## [0.1.0] - 2026-11-23

First release.

### Added

- **Shopware Trigger** node: business events of the shop (incl. plugins), status changes and record changes; creates and deletes its Shopware webhooks automatically, secures them with a secret URL token and simplifies orders in the payload. Record changes list the changed fields without technical noise and include their new values.
- Docker quickstart (`docker compose up -d`): local n8n with hot reload, a login, a Shopware credential from `.env` and eight example workflows (`examples/workflows`) covering every resource.
- `Shopware Admin API` credential (integration / client_credentials) with cached, auto-refreshing access token.
- `Shopware` node with the `System > Get Version` operation to verify connectivity.
- Product resource: Create, Create or Update (by product number), Delete, Get, Get Many, Update.
- Name resolution for referenced records (tax rate, manufacturer, category path, property option, sales channel, tag, language, ...) with per-run caching and explicit errors for ambiguous values.
- Searchable, paginated dropdowns for all referenced records.
- Language option (`sw-language-id`) for translated fields.
- Error messages list every Shopware error with the affected field.
- Product Get/Get Many: field selection as a multi-select loaded from the shop's entity schema (includes plugin and custom fields); selected associations are kept in the output.
- Novastrix plugin support for products: Deficiency Description, EU Warranty Label (native fields on 6.7.14+), SEO (FAQ builder), Back in Stock, Supplier Management (suppliers and strategy).
- Product operations *Run Quality Audit* and *Get Quality Audit* (Novastrix Product Dashboard).
- Configurator resource (Novastrix Product Configurator) with step editor, name resolution and dependencies.
- Plugin check: before plugin fields or plugin operations are used, the node verifies that the Novastrix plugin is installed and active (once per run) and links to novastrix.com/shopware otherwise. Plugin resources show a hint with the same link.
- Product Get/Get Many: associations are loaded dynamically from the entity schema, including associations added by plugins.
- Order resource: Get, Get Many (filters for order, payment and delivery status, customer, email, dates, tag, sales channel), Update (comments, tags, custom fields), Change Status with automatic steps for the order status and optional status mail with documents, Add Tracking Code with optional "mark as shipped". Simplified output with statuses, customer, addresses, line items and tracking codes.
- Order documents: Create Document (any document type of the shop, PDF as binary, reuses an existing document by default, automatic invoice reference for cancellations and credit notes) and Get Documents (filter by type, latest per type, optional download).
- Back in Stock resource (Novastrix Back in Stock): list and get subscriptions, unsubscribe by ID or email, resend notifications, list and retry failed notifications, demand per variant, recovered revenue.
- Error messages of Novastrix plugin routes (`{ success: false, message, errors[] }`) are shown in full.

[Unreleased]: https://github.com/Breadchicken/n8n-nodes-novastrix-shopware/compare/0.1.1...HEAD
[0.1.1]: https://github.com/Breadchicken/n8n-nodes-novastrix-shopware/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/Breadchicken/n8n-nodes-novastrix-shopware/releases/tag/0.1.0
