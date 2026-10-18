# Stripe és Omnisend – átadási állapot

Ellenőrizve: 2026-10-18. A kód elkészült, a szolgáltatói fiókok és kulcsok nincsenek összekapcsolva. Sem valódi fizetés, sem valódi Omnisend-feliratkozás nem történt az ellenőrzés során. A Stripe plugin csatlakoztatása külön lépés; önmagában nem helyettesíti a webalkalmazás szerveroldali kulcsait.

## Vásárlói működés

- A meglévő mobilfelület és próbapénztár megmarad, amíg a Stripe nincs bekapcsolva.
- Aktiválás után a kosár összesítője a beállított szállítást is mutatja. A bejelentkezett vásárló a Stripe hosztolt fizetési oldalára kerül, ott adja meg a kártya-, számlázási és szállítási adatokat. Kártyaadatot ez az oldal nem kér és nem tárol.
- Az első verzió HUF pénznemmel, Románián belüli szállítással, egyszeri kártyás fizetéssel működik. A tesztmódot mindenhol külön jelöljük.
- Az árakat és a mennyiségeket a szerver ellenőrzi. A kliens nem adhat meg kedvezményt, árat vagy rendeléstulajdonost.
- A visszatérési URL nem bizonyíték a fizetésre. Szerveroldali Stripe Session-lekérés és/vagy aláírás-ellenőrzött webhook szükséges. Az összeg, pénznem, Session, mód és belső rendelésazonosító egyezését is ellenőrizzük.
- Ugyanaz a kérés ugyanazt a Stripe idempotency key-t használja; a DB-ben is egyedi a kérés és a Session. Régi bizonytalan fizetési kísérletet nem küldünk újra a Stripe kulcsmegőrzési idején túl.
- Fizetett rendelésből egy példány kerül a saját fiókba. Az ismételt és későn érkező webhook nem fordítja vissza a fizetett állapotot. Megszakítás vagy ellenőrzési hiba esetén a kosár megmarad. A sikeroldal újratöltése nem vonja le újra a vásárolt mennyiségeket.
- Fizetési visszaigazolás nem számla. A számlázó és a teljesítés/csomagfeladás külön, még hiányzó integráció.

## Biztonságos aktiválás

A következő értékeket a tárhely környezeti beállításaiban kell kezelni, kulcsokat titokként. Titkos kulcsot ne küldjünk chatben, ne tegyük Gitbe vagy böngészőkódba.

| Név | Szerep |
| --- | --- |
| `STRIPE_SECRET_KEY` | Először tesztmódú Stripe szerveroldali kulcs; később külön éles kulcs |
| `STRIPE_WEBHOOK_SECRET` | Az adott webhook-végpont aláírási titka |
| `STRIPE_MODE` | `test` az első teljes körű teszthez; csak utána `live` |
| `STRIPE_ENABLED` | `true` a fizetés engedélyezéséhez |
| `STRIPE_WEBHOOK_READY` | Csak a valóban elérhető, ellenőrzött webhook után `true` |
| `SHIPPING_HUF_MINOR` | Kereskedő által meghatározott romániai szállítási díj a Stripe századforintos egységében (1 Ft = 100 egység); explicit `0` is lehet |
| `MERCHANT_PRICES_APPROVED` | Csak ellenőrzött katalógusárak, adókezelés és szállítás után `true` |
| `OMNISEND_API_KEY` | Omnisend szerveroldali API-kulcs, `contacts.write`; eseményküldéshez `events.write` is |
| `OMNISEND_ENABLED` | `true` a hozzájárulásos fel- és leiratkozás engedélyezéséhez |
| `OMNISEND_ORDER_EVENTS_ENABLED` | Opcionális `true`, kizárólag az Omnisend automatizmusok ellenőrzése után |

A jelenlegi Site tulajdonosi hozzáférésre korlátozott. A Stripe nem tud felhasználóként belépni a privát oldalra, ezért a `/api/commerce/stripe-webhook` útvonalhoz publikus, támogatott szerveres elérés szükséges. A Site közönségét nem változtattuk meg. A visszatérési oldal önmagában nem helyettesíti a webhookot. Élesítés előtt véglegesíteni kell a publikus kereskedői domaint/hosztolást és a webhook-elérést.

Webhook-események: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`. A kód a nyers kérés törzsén ellenőrzi az aláírást és az ötperces időablakot. Stripe Session API-t használunk HTTPS-en, függőség nélkül, Workers-kompatibilis fetch/Web Crypto megoldással.

A kód nem számít fel kitalált adó- vagy szállítási díjat. A jelenlegi katalógusárakat használja, a Stripe Tax nincs bekapcsolva; a kereskedőnek aktiválás előtt jóvá kell hagynia az árak és az adók kezelését. Készlet, visszatérítés/dispute feldolgozás, számlázó, szállítási szolgáltató és nyilvános induláshoz szükséges üzemeltetői folyamatok még nincsenek bekötve. Addig ne aktiváljuk az éles módot.

## Omnisend

Új, mobilra rendezett hírlevélmodul készült, alapból üres hozzájárulással. A fiók hitelesített e-mail-címét használja; tetszőleges harmadik fél címére nem lehet feliratkozást küldeni. Vendégként bejelentkezést kér. A feliratkozás nem feltétele a vásárlásnak.

A szerver `POST https://api.omnisend.com/api/contacts` kéréssel, `Omnisend-Version: 2026-03-15` verzióval rögzít fel- vagy leiratkozást. Tárolja a szándékot, időpontot, hozzájárulás szövegverzióját és a szinkron eredményét. Kieséskor nem állítja, hogy az Omnisend már elfogadta a változást; újrapróbálás érhető el. Ez közvetlen hozzájárulásos feliratkozás, nem double opt-in folyamat. Publikus indulás előtt szükséges a kereskedő jóváhagyott adatkezelési tájékoztatója, a küldő domain hitelesítése és a választott feliratkozási eljárás véglegesítése.

A levelekben történő leiratkozás Omnisend-oldali kezelése az ottani küldési jogosultság forrása; a helyi panel a legutóbbi itt kért állapotot mutatja. Az Omnisendben történt külső státuszváltozások visszaszinkronizálása még nem része ennek a verziónak. A kód nem iratkoztat újra automatikusan, és vásárlástól sem válik valaki feliratkozóvá.

A kifizetett éles rendelésből külön, egyedi adatbázis-sor készül az Omnisendnek, kizárólag sikeresen szinkronizált marketing-hozzájárulás esetén. A `spice laboratory paid order` **egyéni** esemény tartalmazza a rendelésazonosítót, összeget HUF-ban, pénznemet és termékeket. Ez nem teljes Omnisend e-commerce katalógus-/kosárintegráció, és nem a beépített `placed order` séma.

Az események küldése külön kapcsolóval engedélyezhető. Tesztfizetés nem küld eseményt. A fizetést nem akadályozza marketingkiesés. Küldés előtt egyetlen feldolgozó foglalja le a sort. Az Omnisend valós idejű eseményeihez nem garantál távoli deduplikálást: bizonytalan hálózati eredmény esetén a sor `review` marad, automatikusan nem ismételjük meg, és az üzemeltetőnek kell az Omnisendben ellenőriznie. Lefoglalt, félbeszakadt `sending` sor is ilyen ellenőrzést igényel. `pending` sor következő hitelesített fizetésállapot-lekéréskor kézbesíthető; nincs háttérütemező vagy adminisztrációs felület ehhez.

Kampányt, welcome flow-t vagy tömeges küldést nem hoztunk létre és nem indítottunk el. Az eseménykapcsoló engedélyezése előtt ellenőrizni kell, milyen meglévő automatizmust indíthat az Omnisend-fiókban.

## Ellenőrzés

- Automatikus SQLite/D1 szerződéstesztek a migrációkkal: szerveroldali ár, eredet- és tulajdonosellenőrzés, idempotencia, hibás/lejárt/módosított webhook, fizetett állapot, hozzájárulás, leiratkozás és kiesések.
- DOM-integrációs ellenőrzés a meglévő kosárhoz, fiókhoz és új Stripe/Omnisend felülethez.
- TypeScript és termelési build.
- Valódi szolgáltatói kulcsos Stripe tesztfizetés, webhook-kézbesítés, Omnisend tesztkontakt, tényleges mobilböngészős vizuális ellenőrzés még nem történt meg.

## Hivatalos források

- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/webhooks/signature
- https://api-docs.omnisend.com/reference/post_contacts
- https://api-docs.omnisend.com/reference/contacts
- https://api-docs.omnisend.com/reference/post_events
- https://api-docs.omnisend.com/reference/events

## Ármódosítás – 2026-10-18

Minden termék új ára 2 750 Ft, a Stripe-ban `unit_amount=275000`, pénznem `huf`. Ez kereskedői ár, nem a forrásoldal árának átváltása. A korábbi rendelések és fizetési kísérletek saját pénzneme és összege változatlan marad. A szállítási díjhoz új, explicit HUF-beállítás szükséges; a korábbi RON-beállítás nem kerül újraértelmezésre. A szállítási célország ebben az ármódosításban nem változott.
