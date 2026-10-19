# Custom domain

Primary hostname: `spicelaboratory.eu`. Hosting confirmed primary domain and SSL active on 2026-10-19.

`www.spicelaboratory.eu` is registered with Sites, pending DNS validation. Required SiteGround records (Name excludes automatically appended `.spicelaboratory.eu`):

| Type | Name | Value |
| --- | --- | --- |
| CNAME | www | custom-domains.chatgpt.site. |
| TXT | _openai-site-verification.www | openai-site-verification=x627p0u322VtAK1rmqlg5bOeIdnrVOjuv91FQfO_Xnc |
| TXT | _cf-custom-hostname.www | 4679ac99-5847-4ecd-afee-5eacf6ec42fd |

Remove any conflicting www A/AAAA records only. Leave mail records unchanged. Sites manages certificate issuance after DNS validation; www HTTPS cannot be verified before that completes.

The Worker permanently redirects www requests to HTTPS on the primary hostname with status 308, preserving path and query. Google customer login remains origin-restricted; adding the primary domain to both app runtime allowlist and Google OAuth console is a separate pending configuration.

Admin: `https://spicelaboratory.eu/admin`. Unauthenticated requests redirect to the native Sites ChatGPT sign-in, then return to `/admin`. Access requires the verified identity in `ADMIN_EMAILS`; Google customer login does not grant admin rights. Successful interactive owner sign-in has not been verified by automation.
