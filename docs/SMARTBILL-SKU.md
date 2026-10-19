# SmartBill product identity

The webshop product `sku` is the exact SmartBill **Cod produs** (`code` in invoice product payloads). Match by code, never by translated product name or storefront URL identifier. Preserve case and leading zeros. Only surrounding whitespace is trimmed. The configured stock warehouse is `Stoc SL`, invoice series `SL-HU`, company CIF `50028326`.

Every admin product save requires a nonempty, single-line SKU of at most 80 characters, including drafts. Codes must remain unique across published, draft and archived records; archiving does not release a code for reuse. An atomic SQL guard prevents simultaneous admin writes from assigning the same SKU to different persisted products. Duplicating a product clears its SKU so a new code must be entered.

Existing products without verified codes remain visible and are labelled **SKU HIÁNYZIK** in admin. No supplier codes are inferred or assigned automatically. Such records must receive the actual SmartBill code before their next save. Existing orders are preserved. New checkout, manual-order and demo-order line snapshots carry the server-side SKU, so later catalogue edits cannot change their historical product identity.

This change enforces the catalogue identity contract and preserves it in order snapshots. It does **not** activate invoice issuance, SmartBill inventory imports, outgoing warehouse deductions, or refund restocking. That integration must use the snapshot code for outgoing document lines and current catalogue codes for inventory reconciliation, with missing/unknown codes reported rather than matched by name. Invoice tax treatment and stock source-of-truth remain prerequisites for that integration.
