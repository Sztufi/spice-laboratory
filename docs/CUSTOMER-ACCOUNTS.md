# Vásárlói fiók – megvalósított első szakasz

## Jelenlegi állapot

A korábbi statikus oldal szerveroldali alkalmazásra váltott, az eredeti Sites projektazonosító és hozzáférési szabály megtartásával. A boltfelület és termékadatok a `public/`, a nyitóoldal a `storefront/` könyvtárban található. A `dist/` generált buildkimenet.

- Nagyobb, álló termékfotók, külső dobozkeret és belső képkeret nélkül; a kártyák között finom elválasztó vonal marad.
- SVG-szív minden terméken; vendégként csak a termékazonosítók mentődnek a helyi böngészőbe.
- Hitelesített előnézeti felhasználónál a kedvencek, profil és címek Cloudflare D1 adatbázisba kerülnek. A vendégkedvencek sikeres bejelentkezéskor egyesülnek a fiókkal.
- Saját adatok, szállítási és számlázási cím, kedvencek, rendelési előzmények, számlalista, JSON-adatexport és fióktörlési kérés.
- A próbavásárlások szerveroldali árral és megismételt beküldés elleni azonosítóval mentődnek. Külön demójelölést kapnak; nem valódi rendelések, nem generálnak számlát.
- A számlaarchívum és az egyedi tulajdonjogot ellenőrző PDF-letöltési végpont elkészült. A feltöltést/kiállítást számlázószolgáltatóval kell majd összekötni. Nincs tesztként valódi számlának látszó dokumentum létrehozva.

A Sites előnézet továbbra is a platform meglévő hitelesítését használja. A projekt jelenleg tulajdonos számára privát; valódi vásárlók hozzáféréséhez külön publikálási és hitelesítési élesítés szükséges. A felhasználóazonosítót a szerver hitelesített munkamenetéből vesszük, nem a böngésző által küldött `userId` vagy e-mail alapján.

## Google-belépés: előkészítve, nincs aktiválva

A `server/google-identity.mjs` ellenőrzi a Google-aláírást, az engedélyezett algoritmust, a kibocsátót, a kliensazonosítót, a lejáratot és az előzetesen szerverhez kötött nonce értékét. A felhasználói kulcs a Google `sub`, nem az e-mail. Nincs e-mail-egyezés alapján automatikus fiókösszekapcsolás. A komponenshez kriptográfiai pozitív és negatív tesztek tartoznak.

Ez a modul **nem** beléptető végpont, és **nem** ad ki saját munkamenetet. A Google-belépés a felületen egyértelműen előkészítés alatt álló szolgáltatás. A jelenlegi Sites-hitelesítést nem cseréltük le egy ellenőrizetlen második OAuth-rendszerre.

### Az élesítéshez szükséges

1. A végleges, kereskedő által kezelt webcím és a támogatott éles hitelesítési szolgáltató/hosztolási integráció kiválasztása. A Google OIDC-t és a munkamenetek kiadását az adott hosztolás támogatott módjához kell kapcsolni.
2. A cég Google Cloud projektjében Web application típusú OAuth-kliens, pontos Authorized JavaScript origins beállítás és szükség esetén redirect URI.
3. A **nyilvános Google OAuth Client ID** megadása. Az ID-tokenes GIS-integráció ehhez a kliensoldali azonosítóhoz önmagában nem igényel client secretet.
4. Saját domainen elérhető kezdőlap és adatkezelési tájékoztató, a Google Auth Platform márka-/hozzájárulási beállításainak elkészítése. A bejelentkezéshez alapértelmezett `openid`, `email`, `profile` jogosultságok elegendők; nem kérünk Gmail- vagy Drive-hozzáférést.
5. A támogatott Google-munkamenet-integrációban egyszer használatos, szerverhez kötött nonce/CSRF-védelem, szerveroldali ellenőrzés és a szolgáltató biztonságos, nem JavaScriptből olvasható munkamenet-kezelése. Nyers Google ID token vagy saját munkamenet-token nem kerülhet localStorage-ba.
6. Valódi Google-fiókkal végzett teljes bejelentkezési, kijelentkezési, visszavont hozzáférési és böngészős teszt. Ez még nem történt meg.

## Adatkezelési és hozzáférési alapok

- Minden fiókműveletnél szerveroldali hitelesítés; a lekérdezéseket a hitelesített felhasználóhoz kötjük.
- Paraméterezett SQL, írásoknál azonos eredet ellenőrzése, korlátozott JSON-méret és mezőhosszak.
- Privát API-válaszok: `Cache-Control: private, no-store`.
- Az árakat és a rendelési pillanatképet a szerver számolja a katalógusból.
- A számlák objektumkulcsa nem kerül az API-listába. Letöltés előtt számlaazonosító ÉS tulajdonos alapján ellenőrzünk; az R2-objektum nem kap nyilvános URL-t.
- A fióktörlés jelenleg rögzített kérés, nem automatikus teljes törlés. Az üzemeltetői feldolgozást, értesítést és a megőrzendő rendelési/számlázási adatok kezelését még be kell kötni.
- Nincs jelszótárolás, kártyaadat-kezelés, éles fizetés, valós rendelésimport vagy számlakiállítás ebben a szakaszban.

## Stripe és Omnisend

A pénztár, a fizetési webhook, a rendelésarchiválás és a hozzájárulásos hírlevél új modulja elkészült, de nincs aktiválva. Beállítások és korlátok: [STRIPE-OMNISEND.md](STRIPE-OMNISEND.md).

## Következő kereskedelmi integrációk

- WooCommerce/Shopify vásárlói és rendelési kapcsolatok: szolgáltatói azonosítók és jogosultsággal ellátott szerveroldali API-kulcsok, hitelesített webhookok és ismételt események kezelése. Korábbi rendelést kizárólag e-mail-egyezés alapján nem kapcsolunk automatikusan egy új fiókhoz.
- Számlázó: szolgáltató kiválasztása, kiállítási és PDF-átadási API, bizonylatkapcsolat az igazolt rendeléshez.
- Éles Google-hitelesítés és a hozzá kapcsolódó regisztrációs/adatazonosítási útvonal.
- Kéréskorlátok, üzemeltetői naplózás és adatmegőrzési folyamatok véglegesítése a nyilvános indulás előtt.

## Ellenőrzés

`npm test` a katalógus, szűrés, kosár, fiókhozzáférés, külön felhasználók adatainak elkülönítése, eredetellenőrzés, saját számla letöltése, ismételt próbavásárlás és a Google-tokenellenőrző működését ellenőrzi. A D1 tesztadapter ugyanazt a migrációs SQL-t futtatja helyi SQLite-ban. A böngészős vizuális és valódi Google-bejelentkezési teszt külön hiányzó ellenőrzés.

## Elsődleges források – ellenőrizve 2026-10-18

- [Google – Verify the Google ID token on your server side](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Google – Setup, OAuth client ID and permitted origins](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Google – Display the Sign In With Google button](https://developers.google.com/identity/gsi/web/guides/display-button)
- [OWASP – Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP – Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [jose – official project](https://github.com/panva/jose)
