# @invoir/n8n-nodes-invoir

An [n8n](https://n8n.io/) community node for [Invoir](https://invoir.dev): turn invoice data into a
compliant EU e-invoice (Factur-X, ZUGFeRD, XRechnung, Peppol BIS), and validate the e-invoices you
receive, inside your n8n workflows.

Every invoice Invoir generates is checked against the official rules (KoSIT, EN 16931 and Peppol
Schematron, PDF/A-3) before you get it, so what you send is what tax offices and public buyers accept.

![Create Invoice in n8n](https://raw.githubusercontent.com/invoir-dev/n8n-nodes-invoir/main/.github/images/create-invoice.png)

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Example workflow](#example-workflow) · [Errors](#errors) · [Compatibility](#compatibility) ·
[Resources](#resources) · [Version history](#version-history)

## Installation

In n8n: **Settings → Community Nodes → Install**, enter `@invoir/n8n-nodes-invoir`, accept the risk
note and install. Self-hosted n8n can also run `npm install @invoir/n8n-nodes-invoir` in
`~/.n8n/nodes`. See the n8n [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

The package has no dependencies besides n8n itself.

## Credentials

1. Get a free API key at [validate.invoir.dev/signup](https://validate.invoir.dev/signup): enter
   your email, click the link, copy the key. The free plan includes 25 documents a month, no card.
2. In the [dashboard](https://validate.invoir.dev/dashboard), create a **test key** (`inv_test_…`)
   too. Test documents are identical but watermarked, never count against your quota and are deleted
   after 24 hours, so build and try your workflow with it, then switch to the live key.
3. In n8n, add an **Invoir API** credential and paste the key. n8n checks it with a free call.

## Operations

| Resource | Operation | What it does |
| --- | --- | --- |
| Invoice | **Create** | Generates the e-invoice from fields or from invoice JSON. Output: the API answer (ID, totals, validation report) plus the PDF and XML as binary fields `pdf` and `xml`. |
| Invoice | **Get** | The same answer and files again for an invoice ID (kept 90 days, test documents 24 hours). |
| E-Invoice File | **Validate** | Checks a PDF or XML from a binary field against the official rules. Output: `valid` (true/false), `status`, `errors`, `warnings`, and `findings` (rule, message, location) as a flat list. |
| E-Invoice File | **Extract XML** | The XML inside a Factur-X / ZUGFeRD PDF, as text and as a binary `xml` field. |

**Profiles** (Create): Factur-X and ZUGFeRD (PDF/A-3 with the XML embedded; France and Germany),
XRechnung UBL / CII (German public sector), Peppol BIS Billing 3.0 (Belgium, Netherlands, the Peppol
network), and Plain PDF (no XML).

**Two ways to fill in an invoice** (Input Mode):

- **Fields Below**: invoice number, issue date (empty = today), seller and buyer (name, VAT ID,
  address, contact, electronic address, buyer reference / Leitweg-ID), line items, and additional
  fields for payment (IBAN, BIC, reference, terms), references (order, contract, project), notes,
  due date, currency, language, template and Factur-X level. Line items can be defined in the node or
  come from an expression (**Line Items Source → From JSON**), e.g. mapped from a shop order:
  `{{ $json.items.map(i => ({ description: i.title, quantity: i.qty, unitPrice: i.net, vatRate: 19 })) }}`
- **Invoice JSON**: the complete request body of `POST /invoices`, documented under
  "The invoice JSON" at [invoir.dev/docs](https://invoir.dev/docs). Every field the API knows,
  including allowances, charges, delivery and attachments.

Totals and the VAT breakdown are always computed by Invoir from the lines (EN 16931 rules, rounded to
cents), so the PDF, the XML and the numbers never disagree.

**Options**: an **Idempotency Key** (e.g. the order ID) makes a re-run return the first invoice
instead of creating a second one; **Download Files** can be switched off when you only need the
JSON; the binary field names can be changed.

## Example workflow

**Order paid → e-invoice → email to the customer.** Import
[`examples/create-and-email-invoice.json`](examples/create-and-email-invoice.json) (n8n: **⋯ →
Import from File**), pick your Invoir credential, and run it:

1. **Manual Trigger** (replace with your shop's trigger, a webhook or a form).
2. **Invoir → Invoice → Create**: Factur-X, seller and buyer, two lines. The output has the PDF in
   the binary field `pdf`.
3. **Send Email** (or Gmail / Outlook) with *Attachments* set to `pdf`.

![Workflow](https://raw.githubusercontent.com/invoir-dev/n8n-nodes-invoir/main/.github/images/workflow.png)

To check incoming e-invoices: **Email Trigger (IMAP)** with attachments → **Invoir → E-Invoice File →
Validate** (Input Binary Field `attachment_0`) → **If** `{{ $json.valid }}`.

## Errors

The node shows Invoir's own explanation, so you can fix the input in one go:

- **400 invalid_request**: every problem at once, with the field, e.g.
  `buyer.reference: XRechnung requires the buyer reference (BR-DE-15)`.
- **422 invoice_invalid**: the document was generated but the official rules rejected it; the rule
  IDs and messages are listed. Nothing was stored or counted.
- **401**: the API key is wrong or revoked. **429 quota_exceeded**: the free plan's 25 documents for
  the month are used up; upgrade in the dashboard or use a test key while building.
- **503 busy**: Invoir was busy for 30 seconds; turn on **Retry On Fail** in the node settings.

With **On Error → Continue** the item carries `error` and `details` instead of stopping the workflow.

## Compatibility

Built with the n8n node CLI and tested on n8n 2.43.8 (self-hosted). Needs n8n 1.0 or newer.

## Resources

- [Invoir API documentation](https://invoir.dev/docs) and [OpenAPI](https://validate.invoir.dev/openapi.json)
- [Free e-invoice validator](https://validate.invoir.dev) (no signup)
- [Invoir integrations: n8n, Make, Zapier](https://invoir.dev/integrations)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- Support: hello@invoir.dev

## Version history

- **0.1.0**: first release. Invoice Create and Get, E-Invoice File Validate and Extract XML.

## Development

```bash
npm install
npm run dev      # n8n on http://localhost:5678 with this node, rebuilt on every change
npm run lint
npm run build
```

Releases are published to npm by the GitHub Action in `.github/workflows/publish.yml` when a version
tag is pushed (`npm run release` bumps the version, updates the changelog, tags and pushes), with an
npm provenance statement as n8n requires for community nodes.

## License

[MIT](LICENSE)
