# Spice Laboratory

Mobilra tervezett fűszer-webshop előnézet, kedvencekkel és szerveroldali vásárlói fiókalappal.

- Boltfelület: `storefront/index.html`, `public/`
- Fiók API: `app/api/account/[[...path]]/route.ts`, `server/account.mjs`
- Stripe és Omnisend API: `app/api/commerce/[[...path]]/route.ts`, `server/commerce.mjs`
- Vendégpénztár és szállítás: [docs/GUEST-CHECKOUT-SHIPPING.md](docs/GUEST-CHECKOUT-SHIPPING.md)
- Aktiválás és üzemeltetés: [docs/STRIPE-OMNISEND.md](docs/STRIPE-OMNISEND.md)
- D1 séma és migráció: `db/schema.ts`, `drizzle/`
- Google-előkészítés és élesítési feltételek: [docs/CUSTOMER-ACCOUNTS.md](docs/CUSTOMER-ACCOUNTS.md)
- `npm test` – működési és hozzáférési tesztek
- `npm run build` – Vinext / Cloudflare Worker build

A Google-belépés nincs aktiválva. Az előnézeti fiók a Sites meglévő hitelesítését használja. A Stripe és az Omnisend bekötése elkészült, de konfiguráció hiányában kikapcsolva marad. A webshop jelenleg próbavásárlást kínál. Számlakiállító nincs bekötve.
