# SmartBill admin

Entry: `/admin?tab=smartbill`, behind the existing trusted admin identity allowlists. The menu uses the shared black SVG receipt icon and the existing responsive admin form/table styles.

Settings: account email, company CIF, invoice series, stock warehouse. Initial values come from the existing `SMARTBILL_EMAIL`, `SMARTBILL_COMPANY_VAT_CODE`, `SMARTBILL_INVOICE_SERIES`, `SMARTBILL_WAREHOUSE_NAME` server variables. Admin saves override them in the existing `store_records` settings store, with revision checks and the existing actor audit. `SMARTBILL_API_TOKEN` stays a server secret, never stored in the settings payload or returned to the browser. No API-token editing field is provided. A future V3 secret may use `SMARTBILL_V3_TOKEN`; only its configured status is exposed.

Operations:
- `GET /api/admin/smartbill`: safe configuration and SKU audit.
- `PUT /api/admin/settings/smartbill`: validated settings, optimistic revision and audit.
- `POST /api/admin/smartbill/test`: server-side read-only V1 `GET /series?cif=...`; returns invoice series and whether the selected series exists. It does not claim to verify the warehouse.
- `POST /api/admin/smartbill/stock`: server-side read-only V1 `GET /stocks` with `cif`, `date`, exact `warehouseName`, exact `productCode`. Result includes quantity and measuring unit; an empty list is not presented as a verified zero quantity. No catalogue stock writes occur.

Provider calls use the fixed HTTPS SmartBill host, Basic authentication, timeout, disabled redirects and a 1 MiB response limit. Provider error bodies are not exposed, avoiding reflected credentials or HTML. Public/ordinary customer identities cannot use these endpoints. POST/PUT requests require same-origin headers; responses are private and uncached. No remote invoice creation, email sending, warehouse deduction or restocking is triggered.

Purchase prices are not available from V1 stock responses. The panel explains that V3 goods receipt (NIR) access is needed, and does not invent an active purchase-price feature. Automatic invoicing and inventory sync remain explicitly inactive.

Primary reference: https://api.smartbill.ro/smartbill-api-spec.yaml (2026-10-09 version, inspected 2026-10-19). V1 configuration and stock response shapes were checked against the official specification and earlier read-only account verification.

Tests cover admin access, cross-origin rejection, secret redaction, persistent/versioned settings, fixed provider request/auth, safe provider errors, exact SKU/warehouse filtering, invalid dates, empty results, unchanged inventory and unsupported issuing operations. Browser/device visual QA is not claimed.
