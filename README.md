# n8n-nodes-novastrix-shopware

An [n8n](https://n8n.io/) community node for the [Shopware 6](https://www.shopware.com/) Admin API.

> **Status: early development.** The credential and the connection check are done. Resources and operations are being added; see the [changelog](CHANGELOG.md).

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
| System | Get Version |

More resources are in progress.

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
