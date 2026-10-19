# Concise login copy — 2026-10-19

The merchant-provided mobile screenshot showed two introductory sections before the email field: an outer login title/lead and an inner promotional kicker/title/lead. This pushed the actual authentication controls down the page. The screenshot supports this bounded finding; no full browser-flow audit or conversion uplift is claimed.

The signed-out account page now has one H1, `BELÉPÉS`, and one explanation: `Jelszó nélkül, e-mailes linkkel vagy Google-fiókkal.` The shared login panel can omit its own heading when rendered under that page title, including after client-side logout. In the account dialog it retains one concise heading and explanation. The Magic link form stays above the `vagy` divider and the official black Google sign-in button. Field labels, status messages, link lifetime, privacy link and accessible status announcements remain. Form spacing is reduced on the login page only.

Research used:
- USWDS sign-in template: https://designsystem.digital.gov/templates/authentication-pages/sign-in/
- USWDS multiple sign-in options: https://designsystem.digital.gov/templates/authentication-pages/multiple-sign-in-options/
- Nielsen Norman Group, concise/scannable/objective writing: https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/

The USWDS pattern provides a current reference for clear authentication structure. NN/G's foundational writing research is older, not a 2026 case study; it supports concise, task-oriented copy, not a numerical conversion forecast for this shop. The chosen wording and priority order are contextual implementation decisions, not a universally proven best variant.

Checks: server-rendered signed-out page has one title/explanation before the email field, panel can omit its duplicate intro, both authentication methods retain their agreed order, existing application tests and production build. Real mobile browser visual verification remains outstanding.
