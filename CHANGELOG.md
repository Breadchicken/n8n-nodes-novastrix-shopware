# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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
- Clear error when a required Novastrix plugin is not installed.
- Product Get/Get Many: associations are loaded dynamically from the entity schema, including associations added by plugins.
