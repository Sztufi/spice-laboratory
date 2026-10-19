# Omnisend admin

Entry: `/admin?tab=omnisend`. Owner-only API prefix: `/api/admin/omnisend`. The existing native Sites / verified Google admin authorization applies to every read and write; same-origin enforcement applies to writes. Customer Magic link sessions cannot grant admin access.

The UI reads the website's existing secret `OMNISEND_API_KEY` through a server-only HTTPS client using `Omnisend-Version: 2026-03-15`. It does not use or export the ChatGPT connector credential. `redirect: manual` is intentional: Workers rejects redirect mode `error`. Provider responses are bounded to 2 MiB and 12 seconds; failures are translated to fixed messages without reflected response bodies or credentials. No HTML content or arbitrary webhook settings reach the browser.

## Available controls

- Local integration/key-presence, paid order marketing gate and Magic link status (read only; runtime secrets and switches remain hosted settings).
- Brand connection, domain, currency and time zone (read only). Non-HUF currency is flagged, not silently changed.
- Automations: paginated list, active state, trigger, name, email/SMS subscription thresholds and frequency limit. Settings are editable only while disabled. Saving leaves the flow disabled; activation is explicit and never enrolls historical contacts. Disable requires choosing `keep` or `exit` for in-flight contacts. Expanded audiences require explicit transactional-only acknowledgement. Provider-selected URLs are linked only on `https://app.omnisend.com`.
- The configured Magic link flow, and any flow using its event name, cannot be edited or disabled from this UI. A disabled login flow can be re-enabled.
- Forms: paginated list, status, enable/disable. Publishing requires review of content/targeting in Omnisend. A/B test forms are managed in Omnisend.
- Email template names/IDs (read only). No campaign sends, subscription changes, test emails, deletions, template writes or arbitrary API proxy are exposed.

Mutations first refetch the resource and compare an opaque revision of editable/state metadata. This catches stale UI edits; it is not a provider-side atomic compare-and-swap. A concurrent remote edit after that read remains possible. Writes are audited by actor, resource and operation without secret payloads. Unknown provider success after a network failure must be resolved by refreshing, not automatic retries.

Each API section loads independently and displays its actual missing-permission/version error instead of a false empty list. Successful reads do not prove write scopes. API endpoints/capabilities are a maintained subset of the Omnisend API, not the full dashboard: sender-domain DNS verification, billing/security settings and the visual flow/email editors remain in Omnisend.

## References

- https://api-docs.omnisend.com/v2026-preview/reference/automations
- https://api-docs.omnisend.com/reference/get_forms
- https://developers.cloudflare.com/workers/runtime-apis/request/

## Verification

SQLite-backed endpoint tests cover authorization, CSRF, secret redaction, bounded responses, opaque cursor round-trip, list/full-detail revision compatibility, stale writes, partial updates preserving webhook secrets, lifecycle enrollment/in-flight behavior, transactional acknowledgement, protected login flow, form review/A-B guards and provider failures. Browser/mobile visual verification requires the supported browser-control integration, unavailable in this session.

On 2026-10-19, read-only live probes using the merchant-provided website API key returned HTTP 200 for brand, automations, forms and email templates. No live automation or form was changed to test write permission. Full suite: 119 passing tests. A DOM check verifies independent loading, provider text escaping, the currency warning and protected-login controls. Mutation calls have a five-second per-hop budget to fit three provider calls within the browser request timeout.
