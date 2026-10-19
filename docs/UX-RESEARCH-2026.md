# Spice Laboratory — UX/CRO audit és megvalósítás

Ellenőrzés: 2026. október 19. Hatókör: termékoldalak, majd főoldal. A márka karaktere és a meglévő kereskedői adatok megmaradnak.

## Vezetői következtetés

Nyilvános, összehasonlítható látogatottság és rendelési adatok nélkül nem állítható fel hiteles „legjobban konvertáló Shopify-termékoldal” rangsor. Egy erős márka bevétele, egy oldalon megjelenő értékelésszám és egy előtte–utána eredmény nem bizonyítja önmagában a design hatását. A jelenlegi Sites-webshop nem Shopify: a használhatósági elvek átültethetők, a platform vagy egy másik üzlet eredményszámai nem.

A fő korábbi hiány: a főoldal szlogenje nem mondta ki egyértelműen a kínálatot, és nem volt mellette vásárlási CTA. A termékoldalon nem volt összehasonlítható egységár, mennyiségválasztó vagy fotónagyítás; a visszaküldési információ távol volt a vásárlástól.

## Ellenőrzött források és a bizonyíték ereje

| Forrás, szerző, dátum | Mit közöl? | Mire használható / korlát |
| --- | --- | --- |
| [Baymard: Product Page UX 2026](https://baymard.com/research-articles/current-state-ecommerce-product-page-ux), Edward Scott; frissítve 2026.03.18., eredetileg 2023 | A cikk 30 000+ manuális UX-értékelésre és 155+ benchmarkolt oldalra épít. A mobil oldalak 62%-a közepes vagy gyengébb. Az egységár, a teljes költség és a visszaküldési információ gyakori hiány. | Nagy használhatósági kutatási háttér. A 62% minőségi besorolás, NEM konverzió. A 2026-os frissítés nem jelenti, hogy minden alapadat 2026-ban keletkezett. |
| [NN/g: Homepage Design](https://www.nngroup.com/articles/homepage-design-principles/), Huei-Hsin Wang; 2024.03.15. | Egyértelmű kínálat, konkrét példák és érthető továbblépés a főoldalon. | Szakmai tervezési alap, nem százalékos bevételígéret. A cikk balra zárt logót javasol; a megrendelő kifejezett középre zárt logóigényét megtartottuk. |
| [NN/g: 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), Jakob Nielsen; 1994, felülvizsgálva 2024.01.30. | Állapot-visszajelzés, felhasználói kontroll, hibamegelőzés, feladatra fókuszáló felület. | Általános heurisztikák. Nem friss, 2026-os kísérletként kezelendők. |
| [HOLY / Speed Kit](https://www.speedkit.com/customers/holy), 2026.09.28. | A szolgáltató PoC-beszámolója 47%-kal gyorsabb LCP-t és +1,35% RELATÍV konverziót közöl, 90%-os konfidenciaszinttel. A theme és checkout nem változott. | Élelmiszer/ital Shopify-példa, technikai gyorsításról. A nyilvános szöveg nem közöl teljes mintanagyságot, időtartamot és allokációt. A 90% nem azonos a gyakran választott 95%-os küszöbbel; a hatás nem vihető át erre a redesignra. |
| [CTRNE / Fabrik](https://www.fabrik.ae/products/ctrne-horizon-rebuild-case-study), 2026-osként jelölt eset | Teljes Horizon-újraépítés, pontos termékméret-információ és új üzenethierarchia után +20% konverziót, +47% kosárba helyezést közöl. | Kivitelezői, korai előtte–utána beszámoló. Nem dokumentál randomizált kontrollt, mintanagyságot, teljes mérési időszakot vagy konfidenciaintervallumot. Nem állapítható meg, melyik egyedi módosítás okozta a változást. |
| [Relive / Shopify Performance](https://performance.shopify.com/blogs/blog/relive-case-study), Estela Franco; 2025.10.01. | A kritikus képek lazy loadingjának és más teljesítményhibáknak javítása után a következő 90 napban +3% konverzió a megelőző időszakhoz képest. | Elsődleges Shopify-esettanulmány, de 2025-ös, és időszakok közötti összehasonlítás. Nem izolált A/B teszt. |
| [Shopify Analytics mérésváltozás](https://help.shopify.com/en/manual/reports-and-analytics/discrepancies/session-measurement-update), bevezetés 2026.09.21–23. | Megváltozott a sessionök számítása és a botszűrés. | Egy Shopify-eset szeptember előtti/utáni konverziós adata mérési okból is eltérhet. Új baseline szükséges; a rendeléseket és bevételt is vizsgálni kell. Ez a Sites-oldal nem használ Shopify Analyticsot. |

Ezek szakmailag releváns kutatók és elsődleges intézményi források, nem egy objektíven létező „legjobb szakemberek” ranglista.

## Összehasonlító termékoldalak

Az alábbiak aktuális, első kézből ellenőrzött tartalmi minták; nem bizonyított konverziós bajnokok. A vizsgálat a nyilvánosan hozzáférhető szöveges oldalstruktúrára terjedt ki, nem mobil képernyőképes elemzésre.

- [Spiceology — Black Magic](https://spiceology.com/products/black-magic-cajun-blackening-seasoning): megkülönbözteti az ízjelleget, a felhasználási területeket, a kiszerelést és az összetevőket; kapcsolódó receptet mutat. Átvett elv: ne csak fantázianevet, hanem ételhez kötött értelmezést adjunk. A saját katalógus rövid felhasználási leírását használjuk, nem más márka termékállításait.
- [Graza — The Trio](https://www.graza.co/products/the-trio), [főoldal](https://www.graza.co/): a termékneveket a főzési feladat magyarázza. Átvett elv: márkahang mellett közérthető funkció. Más bolt véleményeit, csillagait, forgalmi állításait nem vettük át.

## Megvalósított döntések

| Korábbi probléma | Új megoldás | Ellenőrzés / hipotézis |
| --- | --- | --- |
| Kiszerelések nehezen hasonlíthatók össze | Aktuális árból és grammból számított Ft / 100 g | Tesztelt különböző súllyal, árral és hibás/nulla súllyal. |
| Darabonként kell többször kattintani | 1–99 db mennyiség, szinkronizált összeg, meglévő kosárkorlát | Pozitív egész számra korlátozás; meglévő kosárnál sem léphető túl a 99 db. |
| A szállítás ára bizonytalan | Kiválasztott mennyiséghez a legolcsóbb beállított HU-mód szerinti becslés; díjmentességi küszöb figyelembevétele | RO díjat nem használ HU becsléshez. Hiányzó díjnál nincs ingyenességi állítás vagy kitalált végösszeg. Kupon és célország a pénztárban véglegesedik. |
| A részletek és a vásárlás között nagy a távolság | Mobil alsó vásárlósáv csak a fő vásárlási blokk elhagyása után | Tervezési hipotézis, nem bizonyított általános uplift. Dialog alatt elrejtve; nincs IntersectionObserver esetén a fő CTA változatlanul működik. |
| Egy fotó nem vizsgálható közelről | Natív dialogban nagyítás, bezárógomb és Escape-támogatás | A meglévő kép felbontásáig; nincs mesterséges részlet, hamis galéria vagy méretarányosnak beállított kép. |
| Fontos élelmiszeradat elrejthető | Látható ugrólink, alapból nyitott összetevő/allergén tájékoztatás | Eredeti szöveg, nyomokban-közlés és ismert forrásellentmondások megőrizve. |
| A nyitóképernyő csak hangulatot ad | Szlogen + konkrét fűszerkínálat + hangsúlyos termék CTA, csendesebb recept link | Nincs főoldali kereső, szűrő vagy rendezés. A menü balra, logó középen marad. |
| Nincs folytonos tartalmi út | Hero → valós termékek → meglévő receptötletek → hírlevél | A receptek tényleges katalógustermékekhez kapcsolódnak; adminból változtathatók. |
| Folyamatos dekoratív mozgás | Szüneteltetés/folytatás, csökkentett mozgás beállítás megtartása | Állapotot jelző gomb; nincs új külső script. |

A sárga CTA a meglévő arculatot követi. Nem állítjuk, hogy egy adott gombszín önmagában univerzálisan jobb konverziót ad. Nincs kitalált értékelés, készlet, visszaszámláló, egészségállítás vagy szállítási ígéret.

## Mi nincs még bizonyítva?

Az oldal továbbra is privát előnézet, a valódi fizetés nincs aktiválva. Nincs éles vásárlási baseline, ezért konverziójavulást nem mértünk. A szállítási díjak és a végleges kereskedelmi/jogi feltételek hiánya üzleti élesítési akadály, designnal nem pótolható. A hírlevél fehér e-mail-mezője megmaradt; az inaktív szolgáltatói bekötés nem vált működő kampánnyá.

Automatizált szerver-, DOM- és interakciótesztek készültek. Ebben a környezetben nincs támogatott böngészős előnézet: valódi mobil vizuális ellenőrzést, fókuszcsapda/Escape böngészőtesztet vagy mért Core Web Vitals eredményt nem állítunk. A natív dialog és meglévő közös dialog-kezelő használata ezt nem helyettesíti.

## Éles mérési terv

1. A kereskedelmi beállítások lezárása után egységes eseménydefiníció: termékmegtekintés → kosárba helyezés → pénztárindítás → visszaigazolt fizetett rendelés. Próbavásárlás, admin és bot kizárása. Külső követést most nem telepítettünk.
2. Elsődleges eredmény a fizetett vásárlás aránya; másodlagos a kosárba helyezés és bevétel/látogató. Őrmutató: kosárérték, hibaarány, visszaküldés/reklamáció, teljesítmény.
3. Mobil/desktop és forgalmi csatorna szerinti bontás; promóciók és készletkülönbségek dokumentálása. Véletlen, stabil A/B allokáció a sticky CTA-ra és külön a hero üzenetére, nem több egyidejű változtatás oksági összemosása.
4. Előre rögzített baseline, minimálisan releváns hatás, statisztikai módszer, mintanagyság és leállási szabály. Nincs alap nélküli „két hét után biztos eredmény” ígéret.
5. Mobil használhatósági feladatok: megfelelő fűszer kiválasztása; allergének megtalálása; 3 db rendelése; szállítási végösszeg megértése; receptből termékhez jutás. Mért siker, hibák és félreértések alapján további iteráció.
