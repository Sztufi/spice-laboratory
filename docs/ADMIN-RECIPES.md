# Webshopadmin, receptblog és feliratkozás

## Elérés

- `/admin`: tulajdonosi admin. A bejelentkezés a tárhely meglévő hitelesítését használja.
- `/blog`: receptarchívum, keresővel és a felhasznált fűszerre szűréssel.
- `/blog/:id`: önálló receptoldal, hozzávalókkal, lépésekkel és megvásárolható termékekkel.

Az adminlinket csak az engedélyezett tulajdonos látja a webshop láblécében. Az `ADMIN_EMAILS` szerveroldali, titkos környezeti beállításban a Sites által visszaadott tulajdonosi fiók e-mail-címe szerepel. Az alkalmazás nem az első látogatót teszi adminná; egy vásárlói regisztráció sem ad adminjogot. Minden admin-API-művelet külön ellenőrzi a hitelesített azonosítót és az e-mail-engedélylistát. A módosítások azonos eredetű kérést is igényelnek.

## Működő adminfunkciók

| Terület | Funkció |
| --- | --- |
| Vezérlőpult | Aktív termékek, receptek, fizetett Stripe-rendelések és az összegeik; a demó- és tesztrendelések külön maradnak |
| Termékek | Új egyszerű termék, szerkesztés, másolás piszkozatba, közzététel, archiválás és visszaállítás |
| Termékadatok | Név, leírás, SKU, normál/akciós HUF-ár, kiszerelés, kép, szín, készletkövetés, összetevők és címkeinformáció |
| Kategóriák | Létrehozás, szerkesztés, szülőkategória, webcím; a bolti archívum szűrői a mentett kategóriákat használják |
| Összetevők | Önálló elemek szerkesztése és termékekhez rendelése, amelyekre külön lehet szűrni |
| Rendelések | Lista, részletek, kézi fizetésre váró rendelés, teljesítés, csomagkövetési HTTPS-link és belső megjegyzés |
| Vásárlók | Az itt létrejött vásárlók, mentett címeik, rendeléseik és meglévő számláik megtekintése |
| Kuponok | Százalékos vagy fix HUF-kedvezmény, minimum termékösszeg, lejárat, aktiválás/archiválás |
| Szállítás | HU/RO módok, HUF-díj, kézbesítési idő és opcionális díjmentességi küszöb; ugyanazt ellenőrzi a szerver és a pénztár |
| Médiatár | JPG/PNG/WebP feltöltés R2-be, legfeljebb 5 MB; a képcím a termék- és receptszerkesztőben használható |
| Blog / receptek | Piszkozat, közzététel, archiválás, idő, adag, hozzávalók, lépések, tipp, kép és kapcsolódó termékek |
| Hírlevél | Webes feliratkozási kérelmek és az Omnisend-szinkron visszajelzése |
| Export és napló | Termék- és rendelés-CSV, valamint adminmódosítások naplója |

Az archiválás megőrzi a korábbi rendelések ár- és terméknév-pillanatképét. Az elavult adatverzió mentése 409-es hibát ad a csendes felülírás helyett. Használatban lévő kategóriát vagy összetevőt előbb ki kell venni a termékekből. A piszkozatok és archivált termékek nem szerepelnek a nyilvános katalógusban.

## Készlet, ár és kupon

A korábbi tíz termék készletéről nincs hiteles mennyiségi adat, ezért náluk a készletkövetés alapból kikapcsolt. Az adminban bekapcsolt követéshez az üzemeltető adja meg a valós készletet. A nulla készletű termék nem vásárolható.

Az éles Stripe-pénztár foglalja a követett készletet; a visszaigazolt éles fizetés tranzakcióban, rendelésenként egyszer vonja le. A demó és a Stripe-teszt nem fogyaszt valós készletet. A kézi rendelés fizetésre váró rekord: nem indít kártyaterhelést, nem küld levelet, és nem foglal vagy von le készletet.

A böngésző nem határozhatja meg a fizetendő árat. Az adminban mentett aktuális árakat, kuponokat és szállítást a szerver tölti be. A fix kedvezmény a termékösszegre vonatkozik; a szállítási díjmentességi küszöböt a kedvezmény utáni termékösszeg alapján számoljuk. A Stripe ugyanazt a kedvezményt kapja, amelyet a rendelési pillanatkép megőriz.

## Feliratkozás

A sárga szekcióban fehér, feliratozott `type=email` mező van, e-mailes automatikus kitöltéssel. Külön, alapból üres hozzájárulási jelölőnégyzet szükséges. A `/api/commerce/newsletter` nem kér vásárlói bejelentkezést; ellenőrzi az e-mail-címet, a hozzájárulás verzióját, az eredetet, a kérés méretét és az ismételt kérések korlátját. A hozzájárulás szövege és ideje adatbázisba kerül; a nyers IP-címet nem tároljuk.

Az Omnisend csak engedélyezett integráció és szolgáltatói kulcs esetén kap kérést. Kiesésnél a felület nem állít sikeres feliratkozást: a kérelem mentett, a szinkron sikertelen állapotú. Ez saját webes, egyszeres hozzájárulásos űrlap; nem ígér automatikus double opt-int. Leiratkozás az Omnisend-levelekben és a korábban meglévő fiókos marketing-API-val kezelhető.

## Kezdő receptek

Három eredeti receptötlet került a blogba: burgonya Fries Salttal és Grr Lick dippel; Cajun karfiol; sült zöldségek Chimichurrival. Ezek szerkesztői receptötletek, nem tesztelt gyártói receptek vagy külső szerzőtől átvett leírások. Ételfotó hiányában a kártya a felhasznált fűszer termékfotóját jelöli. Saját ételfotó az adminban feltölthető.

A termékoldal kapcsolódó recepteket mutat; a receptoldal a valóban hozzákapcsolt, aktív termékeket kínálja kosárba. A blog szűrője ugyanazokat a kapcsolatokat használja.

## Határok és élesítés

Ez a saját webshop egyszerű fűszertermékekre kialakított adminja. Nem fut alatta WordPress/WooCommerce, és nincs teljes WooCommerce-funkcióegyezés. Nincsenek változatos/digitális terméktípusok, teljes adózási motor, szolgáltatói számlakibocsátás, automatikus futárcímke, Woo-bővítmények vagy adminból indított Stripe-visszatérítés. A visszatérítéshez az admin a Stripe kezelőfelületére vezet.

A korábbi román WooCommerce termékeinek szerkesztése, rendelései és vásárlói nem szinkronizálódnak automatikusan ezzel a külön adatbázissal. A tíz induló termék forrásadatai megmaradnak; a feltöltött specifikációkat és munkafüzetet nem írta felül automatikus import.

A Stripe és az Omnisend továbbra is külön aktiválást és kulcsokat igényel. Az adminlista nem tartalmazza a kulcsokat. A végleges adózási, jogi, szállítási és számlázási feltételeket az éles webshophoz továbbra is meg kell adni. A Site hozzáférési köre változatlanul privát.

## Technikai ellenőrzés

A 0003-as migráció új tárolási és naplózási táblákat, a 0004-es két nullable kedvezmény-pillanatkép mezőt ad hozzá. Nincs sémaalkotás kéréskezelés közben, és nincs seed-adat migrációban. Az induló katalógus és receptek csak az üres adatbázis tartalmi alapjai; adminmentéskor az adatbázisbeli rekord lép a helyükbe. A katalógus oldalanként biztonságosan kódolt JSON-ként jut el a böngészőbe.

A tesztek valódi SQLite-adatbázison ellenőrzik a jogosultságot, a dinamikus katalógust, az árakat, kedvezményeket, foglalást, készletlevonás ismétlésvédelmét, privát adatokat, fájltípusokat és a vendégfeliratkozást. A DOM-ellenőrzés a tényleges admin- és bolti modulokat kapcsolja a szerveroldali kezelőkhöz. A szolgáltatói tesztek mock válaszokat használnak, nem indítanak valódi fizetést és nem küldenek e-mailt. Valódi mobilböngészős vizuális ellenőrzés ebben a környezetben nem érhető el.

Funkcionális viszonyítási alap: [WooCommerce termékkezelési dokumentáció](https://woocommerce.com/document/managing-products/). A hírlevél a projekt meglévő, verziózott Omnisend Contacts API-bekötését használja.
