# Webshopoldalak és navigáció

2026-10-18. A meglévő Site és hozzáférési beállításai megmaradtak. Az oldal továbbra is privát előnézet; a fizetés és az Omnisend nincs aktiválva. A termékár változatlanul 2 750 Ft.

## Elkészült útvonalak

| Útvonal | Tartalom |
| --- | --- |
| `/` | Animált főoldal, termékkártyák és az archívumra vezető gomb; kereső, szűrők és rendezés nélkül |
| `/termekek` | Teljes terméklista, keresés, összetevőszűrés és rendezés |
| `/kategoriak` | Négy kategória, valódi termékképekkel és darabszámmal |
| `/kategoria/grill-bbq` | Grill / BBQ, rögzített kategórián belüli szűréssel |
| `/kategoria/martogatosok` | Mártogatósok |
| `/kategoria/ropogos-feltetek` | Ropogós & feltét |
| `/kategoria/vilagkonyha` | Világkonyha |
| `/termek/:id` | Mind a tíz katalógustermék saját oldala |
| `/rolunk` | Rövid, forrásra támaszkodó márkatörténet |
| `/kapcsolat` | Kattintható e-mail és telefon, elérhetőségi idő, cégadatok |
| `/gyik` | Keverékek, alapanyagszűrés, vendégvásárlás, fiók, rendelés és segítség |
| `/szallitas-es-fizetes` | Tényleges konfigurációból származó HU/RO szállítási információk és fizetési tájékoztatás |
| `/visszakuldes` | Kapcsolat reklamációhoz, szükséges adatok és az eredeti román feltételek hivatkozása |
| `/fiok` | Belépési pont az adatokhoz, címekhez, kedvencekhez, rendelésekhez, számlákhoz és beállításokhoz |
| `/aszf` | Üzemeltető és az előnézet működése; egyértelműen nem végleges ÁSZF |
| `/adatkezeles` | A jelenlegi funkciókhoz igazodó rövid tájékoztatás; végleges jogi szöveg még szükséges |
| `/sutik` | Kosár/kedvencek helyi tárolása, vendégpénztár szükséges sütije, hitelesítés és külső betűtípus |
| Ismeretlen útvonal | Valódi HTTP 404, keresővel és visszavezető linkekkel |

Összesen 26 ismert oldal, ezen felül a 404-es állapot. Minden oldalhoz egy H1 és saját cím tartozik. Az előnézet `noindex, nofollow` metaadatot kap. A kategóriák és termékek nem csupán a főoldalra irányító query-linkek.

## Közös viselkedés

- A fejlécben balra van a menüikon, középen a főoldalra vezető márkajelzés, jobbra a vásárlói műveletek. A mobilmenü balról nyílik; a nyitógomb jelzi a nyitott állapotot is.
- A főmenü és a lábléc egyetlen „Termékek” hivatkozása a `/termekek` archívumra vezet. A kategóriák ott szűrőként választhatók, a keresővel, az összetevőkkel és a rendezéssel együtt. A korábbi kategóriaútvonalak továbbra is működnek.
- A főoldal nem tartalmaz szűrőpanelt vagy keresővezérlőket, és a termékkártyáit a szűrési URL-paraméterek sem szűkítik. A kedvencekre és a gyorsnézet összetevőire indított szűrés az archívumra vezet.
- Mobilmenü natív dialoggal; a kosár és a kedvencek a felső sorban maradnak. Mobilon a fiók a menüből is elérhető, így a fejléc nem zsúfolódik túl.
- Minden oldalon ugyanaz a kosár-, kedvenc-, fiók- és pénztármodul működik.
- Az információs oldalak nem tartalmaznak elrejtett, ismétlődő termékkatalógust.
- A termékkártya neve saját termékoldalra vezet; a kép továbbra is gyorsnézetet nyit. A gyorsnézetből is megnyitható a teljes termékoldal.
- Összetevőre kattintva a termékoldalról szűrt terméklistára lehet jutni. A kategóriaoldalon a keresés és a szűrőtörlés megtartja a kategóriát.
- Az információs oldalon megnyitott kedvenclistából a kedvencekre szűrt teljes listára lehet lépni.
- Közös, csoportosított lábléc, morzsanavigáció és billentyűzettel elérhető tartalomra ugrás.
- A kapcsolati hivatkozások a látogató levelező- vagy telefonalkalmazását nyitják. Nincs elküldést színlelő üzenetűrlap, és a fejlesztés nem küldött üzenetet.
- A termékoldal csak a meglevő katalógusadatokat használja; nem állít ellenőrizetlen készletet, értékelésszámot vagy termékegészségügyi tulajdonságot.

## Tartalmi források

Ellenőrizve 2026-10-18:

- Márkatörténet: https://spicelaboratory.ro/despre-noi/ – BBQ-kezdetek és más konyhák inspirációja; rövid, önálló magyar megfogalmazás.
- E-mail, telefon és elérhetőségi idő: https://spicelaboratory.ro/contact/ – hello@spicelaboratory.ro, 0778 729 954, hétfő–péntek 8:00–17:00.
- Cégnév, cégjegyzékszám, CUI és székhely: https://spicelaboratory.ro/termeni-si-conditii/ – SPICE LABORATORY S.R.L., J05/1267/2024, 50028326, Petofi Sandor 325, Saldabagiu de Munte, Bihor.
- A kapcsolati és a román feltételoldalon eltérő telefonszám szerepel. A Kapcsolat oldalhoz a kifejezetten erre szolgáló, aktuálisan elérhető kapcsolati oldal számát használtuk. A kapcsolati oldal Oradea-megjelölése helyett székhelyként a feltételoldal pontos településadata szerepel. A telefonszámot nem minősítjük cégnyilvántartásból igazolt adatnak.
- Román visszaküldési oldal: https://spicelaboratory.ro/politica-de-returnare/
- Román adatkezelési oldal: https://spicelaboratory.ro/gdpr/
- Román sütitájékoztató: https://spicelaboratory.ro/politica-cookie-uri-ue/

A román jogi szövegeket nem másoltuk át a magyar előnézetre, és nem állítjuk, hogy a jelenlegi rövid oldalak teljes vagy jogilag jóváhagyott dokumentumok. A székhely nem automatikusan átvételi vagy visszaküldési cím. Nincs kitalált visszaküldési feltétel, szállítási díj, válaszadási határidő, futárpartner vagy fizetési ígéret.

## Megvalósítás és ellenőrzés

Az `app/route.ts` és az `app/[...path]/route.ts` ugyanazt a `server/pages.mjs` HTML-renderelőt használja. A közös fejléc, dialogok és alapstílus a `storefront/index.html` forrásból származik; a navigáció és az oldaltartalom szerveroldalon áll össze. A `public/pages.mjs` a menüt és az önálló oldalak műveleteit kezeli. Az útvonalleírók és termékkártyák közösek a szerver és a kliens között.

Az automatikus tesztek ellenőrzik az útvonalakat, a tényleges 404 státuszt, a kategóriákhoz tartozó termékeket, a saját termékoldalakat, az összes belső linket, a gyökérhez kötött eszközútvonalakat, a titkok szivárgásának kizárását és a HTML-kódolást. A 27 DOM-futás mind a 26 oldalt és a 404-et is betölti a tényleges böngészőkóddal; ellenőrzi a menüt, kosarat, fiókműveleteket, termékkedvenceket, kategóriaszűrést, az egyedi ID-ket és a mezőcímkéket. A CSS-ek szintaktikai ellenőrzése is megtörtént.

Valódi mobilböngészős vizuális és képernyőolvasós ellenőrzés nem történt. A szolgáltatói kulcsos fizetés, a végleges szállítási vállalások, a futárintegráció és a magyar jogi dokumentumok továbbra is külön hiányzó élesítési feltételek.
