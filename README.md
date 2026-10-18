# Spice Laboratory

Mobilra tervezett fűszer-webshop előnézet, kedvencekkel és szerveroldali vásárlói fiókalappal.

- Boltfelület: `storefront/index.html`, `public/`
- Fiók API: `app/api/account/[[...path]]/route.ts`, `server/account.mjs`
- D1 séma és migráció: `db/schema.ts`, `drizzle/`
- Google-előkészítés és élesítési feltételek: [docs/CUSTOMER-ACCOUNTS.md](docs/CUSTOMER-ACCOUNTS.md)
- `npm test` – működési és hozzáférési tesztek
- `npm run build` – Vinext / Cloudflare Worker build

A Google-belépés nincs aktiválva. Az előnézeti fiók a Sites meglévő hitelesítését használja. A webshop nem fogad valódi fizetést, és a próbavásárlásokhoz nem készít számlát.
