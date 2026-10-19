# Passwordless customer email login

Implemented on 2026-10-19. Email magic links complement Google customer login. Native Sites owner/admin authentication remains separate. No SMS integration was added.

## Activation still required

No real authentication email has been sent. The integration is disabled until all of the following runtime values are configured through Sites, followed by deployment:

| Runtime value | Setting |
| --- | --- |
| `MAGIC_AUTH_ENABLED` | `true` |
| `MAGIC_ALLOWED_ORIGINS_JSON` | `["https://spicelaboratory.eu"]` |
| `MAGIC_EMAIL_FROM` | A bare email address on the merchant's verified sending domain, e.g. `belepes@spicelaboratory.eu` |
| `RESEND_API_KEY` | Secret Resend sending API key, restricted to the verified domain when available |

Create/choose a merchant-owned Resend account, verify its sending domain with the exact DNS records shown by Resend, and configure the secret through secure runtime settings. Do not put secrets into chat, the repository, browser code, or this document. Existing email DNS records must be preserved; do not create a second SPF record for the same hostname. Link tracking should be disabled for authentication mail. Verify the provider's data-processing terms and update the final privacy notice before launch.

Resend acceptance is checked before the API reports sent. Provider acceptance does not prove delivery to inbox. Before enabling for shoppers, test real delivery, spam placement, expiry, same-browser sign-in, opening from a mobile email app in another browser, logout and resend limits. Provider/network/production delivery and mobile visual QA have not been tested.

## Flow

- Shared login form in `/fiok` and the account dialog: email -> `/api/auth/magic/request` -> email link. No password or separate registration screen.
- Links contain 256-bit random tokens in the URL fragment (`/fiok#magic=...`), so tokens are not sent in the HTTP path/query or referrer. Client removes the fragment before posting to same-origin API.
- The 10-minute token is stored only as SHA-256 in D1; sending failure removes it. Pending delivery records cannot be redeemed.
- Preview does not consume the token. Same-browser links verify automatically after preview, bound to an HttpOnly random browser cookie. Other browsers show the full recipient address and require an explicit confirmation click before sign-in. Ordinary email scanner GETs do not redeem a link.
- Verification atomically consumes the token with DELETE RETURNING. Sessions are opaque random values in Secure, HttpOnly, SameSite=Lax host-only cookies, hashed in storage, with seven-day expiry. Logout revokes both email and Google customer sessions through their separate endpoints.
- All mutation endpoints enforce same origin; bodies are streamed with a 4 KB cap. Only explicitly allowed HTTPS origins can use the provider. Limits: one send/address/minute, five/address/hour, 20 sends/IP/hour, 200 sends/site/hour, and 60 previews or verifications/IP/hour. Expired throttle, link and session records are cleaned on requests; expiry is always checked on access.
- No provider secret, delivery token, or account-existence flag is returned to the requesting client. Email login never grants admin rights, even if the email matches the owner allowlist.

## Google account association

Existing Google accounts are not automatically merged by matching email. A Google-signed-in shopper can request an email login association from account Settings. The request must come from that Google session and use its exact verified email; the association becomes usable only after opening the emailed proof link. A distinct existing email account is not merged; that case requires separately designed account migration. Changed Google email invalidates access through an outdated email association.

Repeated standalone email logins map to the same email customer. Signing into Google independently before association can create a distinct customer; automatic merging of existing order/favorite/address histories is deliberately unsupported. Guest order claiming still requires its existing order receipt capability.

## Validation

Real SQLite migrations + injected provider HTTP fixture cover delivery failure, hashed tokens/sessions, atomic replay rejection, cross-browser confirmation, CSRF, wrong origins, expiry, throttling, customer API scope and admin separation. DOM harness covers email submission, fragment removal, same-browser and cross-browser redemption, account visibility, and Google login regression. No test emails or customer records were created in production.

Primary integration reference: https://resend.com/docs/api-reference/emails/send-email
