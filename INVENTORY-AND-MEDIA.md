# Inventory and product media

## Back-in-stock requests

Unavailable products replace purchase CTAs with a purple email notification CTA.
Verified zero stock and manual zero stock show the diagonal purple sold-out ribbon;
unverified stock never claims to be sold out. Guest opt-in stores one request per
product/email, without joining the newsletter or changing marketing consent.
Requests expire after 180 days and can be cancelled through the email link.

After storefront and stock API reads, response-background processing checks the
current catalogue, verifies the dedicated Omnisend workflow is enabled, and claims
up to 20 requests atomically. It sends one custom event per request. Accepted
events mean Omnisend accepted the request, not confirmed inbox delivery. Ambiguous
failures stay in review and are never automatically retried. Inventory admin shows
waiting, accepted, in-flight and review counts. There is no unattended cron: stock
reads currently depend on traffic and open-storefront polling, so an idle store
does not detect replenishment until its next stock check.

Omnisend workflow: https://app.omnisend.com/automation/edit/6ad743fd9a21c7aaedc000d5

## SmartBill stock

`/admin?tab=inventory` lists every product's exact SKU, provider quantity,
available quantity, active payment reservations, unposted paid sales, safety stock,
low-stock threshold and verification state. CSV is owner-only and uncached.

Enable/disable in SmartBill settings or use the secret-independent runtime default
`SMARTBILL_STOCK_SYNC_ENABLED=true`. Existing saved settings take precedence.
The V1 token/email/CIF and warehouse remain server-side. Stock is read using the
official `GET /stocks` warehouse/date filters (Europe/Bucharest).
Reference: https://api.smartbill.ro/en/smartbill-api-spec.yaml

This is demand-driven polling, not a SmartBill webhook or a background cron.
Catalogue visits and visible open storefronts request updates, globally limited
by a D1 lease/cooldown to one provider request per 60 seconds. Live checkout
requires a successful recent sync; snapshots expire after 300 seconds and at the
warehouse's local midnight. No website traffic means no polling until the next visit.

Only exact case-sensitive SKU matches and integer piece quantities (`buc`, `buc.`,
`db`) are accepted. No name fallback or bulk-weight-to-jar conversion exists.
Missing, duplicate, fractional, negative, unknown-unit and changed-source entries
are unavailable, not invented zeroes. Failure retains the prior snapshot but
prevents new live checkout; stale or partial imports cannot reserve stock.

Available = provider quantity - unpaid active reservations - paid unposted sales
- safety stock, clamped at zero. Paid sale holdbacks survive repeated provider
imports. They are cleared only by an owner-confirmed SmartBill document reference
and a NEW successful provider read. No invoice, credit note or remote stock write
is performed. Refunds do not automatically restock.

Initial blank SKUs for eight exact name/weight matches come from the uploaded
Spice Laboratory Fuszer Lista.xlsx, first sheet A/C/E. Rooster Booster and Bull’s
Blaze have different weights between the sheet and the store; their SKU remains
unassigned until the merchant resolves the discrepancy. Existing nonblank SKUs
are never replaced. Existing blank records are filled only without active holds,
without duplicate codes and under a revision check.

## Product images

`/admin?tab=products` provides up to 12 ordered images, independent featured and
catalogue-thumbnail selections, product-specific alt/title/caption, multi-upload
and a searchable, paged library picker. Selecting or removing a gallery image
does not delete its library asset. Save the product to publish gallery changes.

Uploads use self-hosted FilePond with its official validation, preview, EXIF,
resize and transform plugins. FilePond provides progress, cancellation and retry.
The browser prepares a maximum 1280×1280 PNG, preserving transparency without
requiring Safari to encode WebP. The server accepts one prepared image up to
7 MiB, then generates WebP (master plus 160/320/640/960 variants).
The native Workers upload test exercises real D1/R2 and both WASM image codecs,
including FilePond metadata and binary sharing the same multipart field.
Contain preserves the image; cover center-crops size variants. The master remains
uncropped and is used for zoom. No arbitrary server-side image URL fetch exists.

The media library edits default metadata with revisions and soft-hides unused
assets. Used product/gallery/recipe/category assets cannot be hidden. Hidden
assets can be restored. Library metadata changes do not silently overwrite
previously saved product-specific captions or alt text.

Public gallery supports thumbnail buttons, previous/next, keyboard arrows, touch
swipe and zoom; it lazy-loads secondary images. The catalogue uses the selected
thumbnail and alt; structured Product data lists the gallery images.

Verification: node tests cover read/write authorization, CSRF, revisions, media
membership/limits/escaping, stock classifications, reservations, repeat imports,
paid holdbacks and reconciliation. A separate Miniflare test runs the inventory
code with native workerd fetch and real D1 semantics against a controlled outbound
provider boundary. That test is not evidence of a real SmartBill-account response.
