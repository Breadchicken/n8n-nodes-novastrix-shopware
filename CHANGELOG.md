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
