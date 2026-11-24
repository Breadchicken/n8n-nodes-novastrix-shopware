# Workflow templates

Workflows for the [n8n template library](https://n8n.io/workflows/), built along n8n's template guidelines: an overview note with *How it works*, *Setup* and *Customization*, section notes, a **Configuration** node for every value to change, no credentials or IDs of a real shop, and error handling that writes problems back or reports them.

| File | Needs | Screenshot |
|---|---|---|
| `paid-order-invoice.json` | Shopware, Gmail, Slack; n8n reachable from Shopware over HTTPS | `paid-order-invoice.png` |
| `product-import-google-sheets.json` | Shopware, Google Sheets | `product-import-google-sheets.png` |
| `back-in-stock-weekly-report.json` | Shopware with Novastrix Back in Stock, Gmail | `back-in-stock-weekly-report.png` |
| `lexikon-from-google-sheets.json` | Shopware with Novastrix Lexikon, Google Sheets | `lexikon-from-google-sheets.png` |

All templates need the community node `n8n-nodes-novastrix-shopware` (tested with 0.2.0 on n8n 2.48 and 3.3, Shopware 6.7). Until the node is verified by n8n they run on self-hosted n8n only.

## Testing a template before submitting

1. Import the JSON into a fresh workflow, connect the credentials and fill in **Configuration**.
2. Run it with real data and check the result in Shopware, the sheet, the mailbox and Slack.
3. Run it a second time: no duplicate products, entries, invoices or emails.

n8n accepts one template at a time from new creators. Submit the JSON and the screenshot in the Creator Dashboard.
