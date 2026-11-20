# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

### Changed

- Node and credential use the Novastrix logo.
- Configurator step field *Limit* is now *Max Products Shown*.
