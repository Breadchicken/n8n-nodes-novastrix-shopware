# n8n-nodes-novastrix-shopware

An [n8n](https://n8n.io/) community node for the [Shopware 6](https://www.shopware.com/) Admin API.

> **Status: early development.** Products are fully supported; more resources are being added. See the [changelog](CHANGELOG.md).

Planned highlights:

- **Use names instead of IDs.** Fields that take a Shopware ID also accept a name or natural key, such as a product number, `EUR`, `19%`, a sales channel name or a category path. The node resolves it to the ID for you.
- **Searchable pickers** for all entities, with real pagination even in large catalogs.
- **Full DAL criteria search**: filters, sorting, associations and aggregations.
- **Bulk create, update and delete** through Shopware's sync API.
- **Order, payment and delivery state transitions**, plus documents.
- A **webhook trigger** for Shopware events.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Compatibility](#compatibility) · [Development](#development) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install the package `n8n-nodes-novastrix-shopware`.

## Credentials

The node authenticates with a Shopware **integration** (OAuth 2.0 client credentials).

1. In the Shopware Administration, open **Settings > System > Integrations** and click **Add integration**.
2. Enter a name, for example `n8n`. Either enable **Administrator** or assign a role that has the permissions your workflows need.
3. Copy the **Access key ID** and the **Secret access key**. The secret is only shown once.
4. In n8n, create a **Shopware Admin API** credential with:
   - **Shop URL**: the base URL of your shop, e.g. `https://shop.example.com`. A trailing `/api` or `/admin` is removed automatically.
   - **Access Key ID** and **Secret Access Key** from step 3.
5. Click **Test** to check the connection.

**Token handling:** n8n requests an access token once and keeps it, encrypted, inside the credential. A Shopware token is valid for 10 minutes. When it expires, the node gets a new one automatically and retries the request. Workflows that loop over many items therefore do not request a new token for every call.

## Operations

| Resource | Operations |
|---|---|
| Configurator (Novastrix) | Create, Delete, Get, Get Many, Update |
| Product | Create, Create or Update (by product number), Delete, Get, Get Many, Update, Get Quality Audit, Run Quality Audit |
| System | Get Version |

More resources are in progress.

### Names instead of IDs

Every field that references another Shopware record offers three modes:

- **From List**: a searchable dropdown that pages through all records.
- **By Name** (or number, ISO code, ...): the value is resolved when the workflow runs. Great for expressions like `{{ $json.manufacturer }}`.
- **By ID**: the raw Shopware ID.

| Record | Accepted values |
|---|---|
| Product | product number, name |
| Tax rate | rate (`19`, `19%`), name |
| Category | name or path (`Home > Shoes`, also partial: `Men > Shoes`) |
| Property option | `Group: Option` (`Color: Red`), name |
| Currency / Country | ISO code, name |
| Language | locale (`de-DE`), name |
| Payment / Shipping method | technical name, name |
| Customer | customer number, email |
| Sales channel, manufacturer, delivery time, tag, ... | name |

Matching ignores case. If a value matches more than one record, the node stops with an error listing the candidates instead of guessing. Lookups are cached per run, so a loop over 1,000 items with the same manufacturer performs one lookup.

### Product notes

- **Prices** are entered gross in the shop's default currency; the net price is calculated from the tax rate (or set explicitly). Changing only the tax rate recalculates the net prices.
- **Categories, properties, sales channels and tags** are added; existing assignments are kept.
- **Tags** that do not exist fail by default; enable *Create Missing Tags* to create them.
- **Raw Fields (JSON)** lets you set any product field the UI does not cover.
- **Language** (option) reads and writes translated fields such as name and description in that language.

## Novastrix plugins

The node fully supports the product data of the [Novastrix](https://novastrix.com) Shopware plugins. Each field only takes effect if the plugin is installed; if a plugin is missing, the node says which one.

| Plugin | Support |
|---|---|
| Deficiency Description | Product: *Deficiency: Is Defective Item*, *Deficiency: Description* |
| EU Warranty Label | Product: *EU Guarantee: Confirmed*, *EU Guarantee: Months*. Uses the native Shopware fields on 6.7.14+ and the plugin fields before; durations are validated (30–600 months, half-year steps). |
| SEO | Product: *SEO: FAQ* (question/answer pairs, the node builds the HTML), *SEO: Price Valid Until*, *SEO: Disable Product Schema* |
| Back in Stock | Product: *Back in Stock: Disable Alerts*, *Back in Stock: Pre-Launch* |
| Supplier Management | Product: suppliers with purchase price, stock, delivery time, priority (suppliers by number or name), selection strategy |
| Product Dashboard | Product: *Run Quality Audit*, *Get Quality Audit* (score, grade, failed criteria, priority) |
| Product Configurator | Resource *Configurator*: steps as form fields, products by number or name, dependencies by step name, or the raw JSON |

Plugin data appears under **Novastrix Plugin Fields** in Product Create, Create or Update and Update. To read it, select `customFields` or the plugin associations (e.g. `pflaumSuppliers`) in Get.

## Compatibility

- Shopware 6.6 and 6.7 (tested against 6.7.16)
- n8n with community node support (`n8nNodesApiVersion` 1)

## Development

```bash
npm install
npm run dev     # starts n8n on http://localhost:5678 with this node loaded
npm test
npm run lint
npm run build
```

Releases are published to npm from GitHub Actions with provenance whenever a version tag is pushed (`npm run release`).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Shopware Admin API documentation](https://shopware.stoplight.io/docs/admin-api)
- [Shopware integrations](https://docs.shopware.com/en/shopware-6-en/settings/system/integrationen)

## License

[MIT](LICENSE) © Novastrix
