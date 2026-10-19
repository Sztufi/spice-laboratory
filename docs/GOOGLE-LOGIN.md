# Google customer sign-in

Configured for `https://spice-lab-unalmas-kaja.sztufi.chatgpt.site` from the supplied Web OAuth client configuration. The uploaded Client Secret is not used, committed, or sent to the browser. This implementation uses Google Identity Services popup ID-token login; no OAuth code exchange or redirect URI is needed for this popup flow.

Customer sign-in is separate from the Sites owner sign-in. Google sessions authorize customer profiles, favorites, addresses, customer orders/invoices and account-mode checkout. The owner/admin routes keep using Sites identity and the existing owner allowlist. Google customer identity cannot grant admin access, including when the email matches an administrator.

## Where to use it

Open the account icon and choose Google sign-in. If you are already signed in with a Sites account, go to the account's settings and choose “Belépés Google-fiókkal”. The Google script loads only when the login panel is opened. The normal storefront does not download it on initial page load.

After choosing a Google account, the server verifies the signed Google ID token using Google's public keys: audience/client ID, issuer, expiry, required issued-at claim, a browser-bound single-use nonce and verified email. It creates a seven-day opaque session cookie: Secure, HttpOnly, SameSite=Lax, host-only. Only the hash of the session token is stored in D1. Google credentials and session tokens are not stored in localStorage.

Challenges expire after ten minutes and are consumed once. Auth requests require the exact same Origin; challenge and login attempts are rate limited. Logout revokes the current session on the server and expires its cookie. Other devices remain signed in until they log out or their own seven-day session expires.

Google's stable `sub` identifies the customer, using a `google:` ID namespace. An existing account with the same email is not automatically merged. Guest favorites merge through the existing favorite workflow; paid guest order claiming still requires the existing guest receipt capability and explicit claim. Existing Sites-account orders and addresses are not silently moved into a Google account.

## Hosting settings

- `GOOGLE_AUTH_ENABLED=true`
- `GOOGLE_CLIENT_ID`: the public Web client identifier
- `GOOGLE_ALLOWED_ORIGINS_JSON`: exact HTTPS origins permitted to use this customer login

No Google Client Secret is required. A future domain must be added both to Google Cloud's Authorized JavaScript origins and the hosting origin allowlist. These settings are separate from SEO/indexing and do not activate payments.

## Google Cloud checks still requiring the owner

The downloaded JSON confirms the client type and allowed origin. It does not prove the consent screen is published, whether the app is restricted to a Workspace organization or test users, brand/domain verification status, or browser popup compatibility.

Use Google Auth Platform to verify branding, audience, support email, homepage and privacy-policy URLs. For a consumer webshop, configure the appropriate external audience and production status. If a Google test-user restriction appears during sign-in, the owner must adjust that setting or add the intended tester. Use only the basic identity scopes; no Gmail, contacts or Drive permission is requested by this implementation.

The current privacy page is an informational draft, not finalized legal text. Before business launch, update it with the actual Google login purposes, identifiers, retention, controller information and applicable user rights.

## Verification

Tests use real RSA-signed ID tokens and a local JWK set, with the same verifier as production. They cover login, customer access, admin separation, same-origin protection, nonce/audience mismatch, unverified email, replay, missing/fabricated cookies, session expiry, logout, origin restrictions and rate limiting.

A real consent/popup login must still be tested by the owner with a Google account. Automated signed-token tests do not prove Google's console settings or replace that browser test. No end-user Google credentials were requested or used.

Official references:

- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/reference/js-reference
