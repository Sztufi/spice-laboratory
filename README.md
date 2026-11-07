# Spice Laboratory

Mobilra tervezett fűszer-webshop előnézet, kedvencekkel és szerveroldali vásárlói fiókalappal.

## Fejlesztés GitHubbal

A GitHub-repo az elsődleges forráskód. Ne szerkeszd párhuzamosan a GitHubot és a korábbi Sites-forrást: a változtatásokat ebben a repóban készítsd el, ellenőrizd, majd pushold fel.

```bash
git clone https://github.com/Sztufi/spice-laboratory.git
cd spice-laboratory
npm ci
git checkout -b rovid-leiras
# szerkesztés
npm test
git add .
git commit -m "Rövid leírás"
git push -u origin rovid-leiras
```

Ezután GitHubon nyiss Pull Requestet a `main` ágba. A Pull Request megnyitása előtt futtasd a teszteket helyben. Éles Sites- vagy későbbi SiteGround-közzététel előtt mindig a `main` legyen az ellenőrzött forrás.

Az `.env` fájlokat, API-kulcsokat és jelszavakat soha ne commitold; ezeket csak a célkörnyezet változóiként állítsd be.

- Oldalak és navigáció: [docs/WEBSITE-PAGES.md](docs/WEBSITE-PAGES.md)
- Tulajdonosi admin (`/admin`), termék- és kategóriakezelés, receptblog (`/blog`) és vendégfeliratkozás: [docs/ADMIN-RECIPES.md](docs/ADMIN-RECIPES.md)
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
