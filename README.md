# n8n-nodes-novastrix-shopware

An [n8n](https://n8n.io/) community node for the [Shopware 6](https://www.shopware.com/) Admin API.

> **Status: early development.** Products and orders are supported; more resources are being added. See the [changelog](CHANGELOG.md).

Planned highlights:

- **Use names instead of IDs.** Fields that take a Shopware ID also accept a name or natural key, such as a product number, `EUR`, `19%`, a sales channel name or a category path. The node resolves it to the ID for you.
- **Searchable pickers** for all entities, with real pagination even in large catalogs.
- **Full DAL criteria search**: filters, sorting, associations and aggregations.
- **Bulk create, update and delete** through Shopware's sync API.
- A **Shopware Trigger** that starts workflows on Shopware events and manages its webhooks itself.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger](#trigger) · [Compatibility](#compatibility) · [Quickstart](#quickstart) · [Development](#development) · [Resources](#resources)

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
| Back in Stock (Novastrix) | Get, Get Many, Unsubscribe (by ID or all of an email), Resend Notification, Get Failed Notifications, Retry Failed Notification, Get Demand, Get Recovered Revenue |
| Configurator (Novastrix) | Create, Delete, Get, Get Many, Update |
| Order | Get, Get Many, Update, Change Status (order, payment, delivery), Add Tracking Code, Create Document, Get Documents |
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

### Order notes

- **Change Status** works like the Administration: pick the new order, payment or delivery status, and the node runs the matching Shopware transition. The configured status mail is sent unless *Send Mail* is off; *Attach Documents* adds the latest existing invoice, delivery note, etc.
- For the **order status**, the node goes through the required steps (Open → In Progress → Done). **Payment and delivery** statuses only change directly; if the target needs several steps (e.g. Unconfirmed → Paid → Refunded), the node stops and lists the possible next states, because each step triggers its own flows and webhooks.
- Setting a status the order already has does nothing and returns `changed: false`, so workflows can run repeatedly.
- **Add Tracking Code** keeps existing codes, ignores duplicates and can mark the delivery as shipped in the same step.
- **Create Document** creates an invoice, delivery note, cancellation invoice, credit note, ZUGFeRD or app-provided document and returns the PDF as binary data (field `data`), ready for an email or upload node. By default an existing document of the same type is returned instead of creating a new one, so a re-run does not produce a second invoice number. Cancellation invoices and credit notes reference the latest invoice automatically.
- **Get Documents** lists the documents of an order (optionally only the latest per type) and can download their PDFs.
- Payment means the current payment (the primary one on 6.7, otherwise the latest); delivery means the main delivery.

### Product notes

- **Prices** are entered gross in the shop's default currency; the net price is calculated from the tax rate (or set explicitly). Changing only the tax rate recalculates the net prices.
- **Categories, properties, sales channels and tags** are added; existing assignments are kept.
- **Tags** that do not exist fail by default; enable *Create Missing Tags* to create them.
- **Raw Fields (JSON)** lets you set any product field the UI does not cover.
- **Language** (option) reads and writes translated fields such as name and description in that language.

## Novastrix plugins

The node fully supports the [Novastrix Shopware plugins](https://novastrix.com/shopware). Before using plugin data, the node checks that the plugin is installed and active in the shop (one lookup per run). If it is missing or inactive, the node stops with a message naming the plugin and a link to [novastrix.com/shopware](https://novastrix.com/shopware), instead of storing data that has no effect. If the integration may not read the plugin list, the check is skipped and a missing plugin is reported from Shopware's 404.

| Plugin | Support |
|---|---|
| Deficiency Description | Product: *Deficiency: Is Defective Item*, *Deficiency: Description* |
| EU Warranty Label | Product: *EU Guarantee: Confirmed*, *EU Guarantee: Months*. Uses the native Shopware fields on 6.7.14+ and the plugin fields before; durations are validated (30–600 months, half-year steps). |
| SEO | Product: *SEO: FAQ* (question/answer pairs, the node builds the HTML), *SEO: Price Valid Until*, *SEO: Disable Product Schema* |
| Back in Stock | Product: *Back in Stock: Disable Alerts*, *Back in Stock: Pre-Launch*. Resource *Back in Stock*: list subscriptions (filter by status, email, product incl. variants, sales channel, VIP, date), unsubscribe one or all of an email address, resend notifications, inspect and retry failed mails, demand per variant, recovered revenue. Subscriptions cannot be created from n8n, so the double opt-in cannot be bypassed; unsubscribe tokens are never returned. |
| Supplier Management | Product: suppliers with purchase price, stock, delivery time, priority (suppliers by number or name), selection strategy |
| Product Dashboard | Product: *Run Quality Audit*, *Get Quality Audit* (score, grade, failed criteria, priority) |
| Product Configurator | Resource *Configurator*: steps as form fields, products by number or name, dependencies by step name, or the raw JSON |

Plugin data appears under **Novastrix Plugin Fields** in Product Create, Create or Update and Update. To read it, select `customFields` or the plugin associations (e.g. `pflaumSuppliers`) in Get.

## Trigger

**Shopware Trigger** starts a workflow when something happens in the shop. Pick one or more events:

- **Business events from your shop**, including plugin events: *Order Placed*, *Customer Registered*, *Newsletter Registered*, *Contact Form Sent*, ...
- **Status changes**: *Payment Status Changed to Paid*, *Delivery Status Changed to Shipped*, *Order Status Changed to Cancelled*, and the matching "Changed From" events.
- **Record changes**: *Product Created or Updated*, *Order Deleted*, ... for category, customer, customer address, document, media, order, order address, product, product price, sales channel and sales channel domain.

When you activate the workflow, the node creates one Shopware webhook per event. When you deactivate it, the node deletes them again. Nothing needs to be set up in the Shopware Administration, but the integration needs permission to manage webhooks.

Output:

- **Record changes:** one item per changed record, with `event`, `entity`, `operation` (`insert`, `update`, `delete`), `id`, `changedFields` and `changes`. Example for a stock update: `changedFields: ["stock", "availableStock"]`, `changes: {"stock": 11, "availableStock": 11}`.
  - `changedFields` leaves out the technical fields Shopware lists on every write (version IDs, `updatedAt`, `id`).
  - `changes` holds the **new** values. The node loads them right after the event, with one API call per webhook (option *Include Changed Values*). Shopware does not send old values. If you need them, keep the last value yourself, e.g. in an n8n Data Table.
  - With *Simplify* off, the raw `updatedFields` and `versionId` are included as well.
- **Business events and status changes:** one item with the event data, e.g. `order` or `customer`. With **Simplify** (default), an order is flattened like in the Order resource. It then also leaves out the `deepLinkCode`.

Security: Shopware signs webhooks only for apps, not for integrations. The node therefore adds a random secret token to the webhook URL and rejects calls without it (HTTP 401).

### Reachability

Shopware must be able to reach n8n:

- **Shopware 6.7** sends webhooks only to **public HTTPS** addresses. Run n8n under a public HTTPS URL (n8n setting `WEBHOOK_URL`). Otherwise activation fails with "Shopware does not accept the webhook URL".
- **Local test shop in Docker:** set **Options > Webhook Base URL** to `http://host.docker.internal:5678`. Also allow private HTTP targets in the shop (for test shops only):
  ```yaml
  # config/packages/zz_dev_webhook.yaml
  shopware:
      app_system:
          enable_url_validation: false
  ```
  Then run `bin/console cache:clear`.
- Shopware sends webhooks through its message queue. If the shop has no worker running (`messenger:consume`) and the admin worker is disabled, events arrive late or not at all.
- Shopware deactivates a webhook after repeated delivery errors, e.g. while n8n is down. Deactivating and activating the workflow creates it again.

## Compatibility

- Shopware 6.6 and 6.7 (tested against 6.7.16)
- n8n with community node support (`n8nNodesApiVersion` 1)

## Quickstart

Try every area of the node in a local n8n within a few minutes. You need Node.js 22+ and a Shopware 6.6/6.7 shop with an integration (see [Credentials](#credentials)).

```bash
git clone https://github.com/Breadchicken/n8n-nodes-novastrix-shopware.git
cd n8n-nodes-novastrix-shopware
npm install
cp .env.example .env    # enter SHOPWARE_URL, SHOPWARE_CLIENT_ID, SHOPWARE_CLIENT_SECRET
npm run quickstart
```

Open http://localhost:5678 and log in with:

| Email | Password |
|---|---|
| `admin@example.com` | `Quickstart123!` |

This login is for local testing only. Do not expose this n8n instance.

The quickstart creates a separate n8n home in `~/.n8n-novastrix-shopware` with the `Shopware (Quickstart)` credential and these workflows:

| Workflow | What it shows | Writes data |
|---|---|---|
| Shopware 1 · Connection check | Shopware version, credential test | no |
| Shopware 2 · Products read | Get Many with filters and sorting, Get with associations | no |
| Shopware 3 · Products write | Create or Update, Update, Get, Delete of product `N8N-QUICKSTART-001` | yes, removes it again |
| Shopware 4 · Orders read | newest orders (simplified), their documents as PDF | no |
| Shopware 5 · Order processing | invoice PDF for the newest order. Tracking code and payment status are included but disabled | yes |
| Shopware 6 · Back in Stock | subscriptions, demand, recovered revenue, failed mails (Novastrix plugin) | no |
| Shopware 7 · Configurator and audit | configurators and product quality audit (Novastrix plugins) | no |
| Shopware 8 · Trigger | starts on new orders and paid orders (see [Reachability](#reachability)) | no |

Open a workflow and click **Execute workflow**. Workflows marked "writes data" change your shop, so use a test shop for them.

Options:

- `npm run quickstart` again: re-imports the example workflows and starts n8n. The data is kept.
- `npm run quickstart -- --reset`: starts over with an empty n8n home.
- `npm run quickstart -- --no-start`: only sets things up.
- Without a `.env`, a placeholder credential is created. Enter the shop URL and keys under **Credentials** in n8n.
- `N8N_PORT` changes the port. Stop `npm run dev` first, or pick another port.

The workflows are in [`examples/workflows`](examples/workflows). You can also import them into any n8n with the package installed: **Workflows > Import from File**.

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
