# Changelog

## 0.2.0 (2026-10-23)

- E-Invoice File: Parse reads a received e-invoice (XML, or a Factur-X / ZUGFeRD PDF) into the invoice
  JSON of Create, with the stated totals, unmapped values, warnings and the validation result
  (POST /api/v1/parse).
- The 429 quota_exceeded hint mentions that a test key makes 25 calls a day.
- README: install from the nodes panel (verified community node, n8n Cloud and self-hosted).

## 0.1.1 (2026-10-20)

- Invoice: Create explains that e-invoices need a due date or payment terms when an amount is due
  (the API now answers 400 without either, rule BR-CO-25).

## 0.1.0 (2026-10-19)

- Invoice: Create (fields or invoice JSON, PDF and XML as binary) and Get.
- E-Invoice File: Validate and Extract XML.
- Invoir API credential with a free test call.
