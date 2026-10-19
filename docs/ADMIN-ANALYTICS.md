# Értékesítési analitika és rendelési archívum

Spice Laboratory · 2026. október 19.

## Elérés

- Elemzés: `/admin?tab=analytics`
- Archívum: `/admin?tab=archive`
- A vezérlőpulton és az admin menüjében is van belépési pont.

Mindkettő a meglévő tulajdonosi engedélylistát használja. A riportok, a keresés, a rendelésrészletek és a letöltések is szerveroldali jogosultság-ellenőrzés mögött vannak. Vásárlói fiókkal nem hozzáférhetők. A böngésző és a megosztott cache nem tárolhatja a válaszokat.

## A szakmai alap

| Elsődleges forrás | A felhasznált elv |
| --- | --- |
| [Shopify hivatalos értékesítési adatdefiníciók, 2026-07 API](https://shopify.dev/docs/api/shopifyql/2026-07/schemas/sales_revenue/sales) | A rendelések, darabszám, kosárérték és visszatérő vásárlói arány külön mutató. A kedvezmény és szállítás nem ugyanaz, mint a termékérték. |
| [Shopify vásárlói riportok](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/customers-reports) | Az első és az ismételt vásárlás megkülönböztetése; korábbi rendelési előzmény vizsgálata; recency, frequency és monetary elemzés. Ugyanaz a vásárló ugyanabban az időszakban új és visszatérő is lehet. |
| [Shopify készletriportok](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/inventory-reports) | Termékenkénti eladási sebesség, készletnap és árbevétel szerinti ABC-besorolás. A nullás eladási ütem nem igazol végtelen készletbiztonságot. |
| [Hyndman–Athanasopoulos: Forecasting: Principles and Practice, 3. kiadás, 5. fejezet](https://otexts.com/fpp3/toolbox.html) | Egyszerű átlag- és szezonális naiv alapmodellek, valamint valódi, korábban nem látott adatokon mért előrejelzési hiba. A visszamérés nem helyettesíthető az illeszkedés bemutatásával. |

Ez saját Sites-implementáció, nem a Shopify Analytics másolata, integrációja vagy teljes funkcionális megfelelője. A mutatók hatókörét a ténylegesen rendelkezésre álló adatokhoz igazítottuk.

## Mit mutat az analitika?

Az alapértelmezett nézet az utolsó 30 teljes napot mutatja, budapesti idő szerint. Választható 7/30/90 nap, eddigi hónap, egyedi időszak és napi/heti/havi bontás. A heti időszak hétfőn kezdődik. A budapesti, bukaresti és UTC-időzóna választható; a helyi napok a nyári időszámítás miatt nem fix 24 órás UTC-eltolással számolódnak.

Termék-, célország- és teljesítési szűrő használható. A termékszűrő jelentése „a kosár tartalmazza”: az adott keveréket tartalmazó teljes rendeléseket vizsgálja, nem egyetlen termékre vágja vissza a rendelési végösszeget. Az egyedi termék eladott mennyiségét a Termékeladások és Termék × időszak táblák bontják ki.

| Mutató | Pontos jelentés |
| --- | --- |
| Fizetett összeg | Az időszaki, rögzített fizetett rendelési végösszeg szállítással, visszatérítés levonása nélkül. Nem banki jóváírás vagy profit. |
| Rendelések | Egyedi jogosult rendelésazonosítók száma. |
| Termékérték kupon előtt | A rendelési tételpillanatképek összegének összege. Nem a mai katalógusárral újraszámolt érték. |
| Kuponkedvezmény | A rendeléskor rögzített kedvezmény. Termékszinten arányosan, egész váltópénzegységekre, legnagyobb maradék módszerrel felosztva. A felosztás összege pontosan visszaadja a kedvezményt. |
| Termékérték | Tételösszeg mínusz kupon. A külön áfaadat hiánya miatt nem nevezzük áfa nélküli nettó árbevételnek. |
| Átlagos termékkosár | Kedvezmény utáni termékérték / fizetett rendelések, szállítás nélkül. |
| Átlagos fizetett rendelés | Fizetett végösszeg / fizetett rendelések, szállítással. |
| Darab / rendelés | Rögzített darabszám / rendelések. |
| Visszatérő arány | Az időszakban ismételten vásárló egyedi vásárlók / az időszaki egyedi vásárlók. Korábbi rendelés az elemzési kezdőnap előtt is lehet. |
| Új vásárlók | Akiknek a vizsgált rendelések között az első vásárlásuk is szerepel. Az időszakon belüli második vásárlás miatt az új és a visszatérő csoport átfedhet. |
| Időszaki változás | Azonos hosszúságú előző naptári időablakhoz képest. Nulla nevezőnél nincs százalék. Mai, még részleges napot tartalmazó időszaknál nem mutatunk változási százalékot. |

A grafikon az eladás nélküli napokat is tartalmazza. A termék × időszak tábla csak tényleges eladási sorokat mutat; ezt a felület külön jelzi. Minden megjelenített tábla lapozható, nem az első néhány sorból készül az összesítés.

## Vásárlók és termékek

- A vásárló azonosítása a rendelési e-mail alapján, ennek hiányában fiókazonosítóval történik. Vendég- és fiókos rendelések azonos e-mail esetén összekapcsolhatók az elemzésben; eltérő címekről nem találgatjuk, hogy ugyanaz az ember használja-e őket.
- A vásárlói táblában látszik az időszaki rendelés és összeg, az utolsó vásárlás óta eltelt nap, az összes korábbi jogosult rendelés és a megfigyelt fizetett érték az időablak végéig. Ez RFM-alapadat és megfigyelt ügyfélérték, nem prediktív CLV vagy profit.
- Az első vásárlási hónap szerinti tábla az időszakban aktív vásárlókat csoportosítja. Nem állítunk teljes kohorsz-retenciós mátrixot vagy kohorszmegtartási arányt az aktív vásárlók csonkolt nevezőjéből.
- Terméknév, darabszám, rendelésszám, kedvezmény, termékérték és részesedés is megjelenik. A név és ár a rendelési pillanatképből, a SKU a jelenlegi katalógusból származik.
- ABC: termékérték szerint csökkenő sorrend, az első kumulatív 80%-ba kerülő termékek A, a következő 15% B, a maradék C. A küszöböt átlépő egész termék az adott csoportban marad. Ez a kiválasztott időablakra vonatkozik, nem állandó minősítés.
- A közösen vásárolt termékpárok közös rendelésszámot mutatnak. Nem okozati ajánlási vagy promóciós eredményességi bizonyítékok.

## Előrejelzés

A felület a zárónapot követő 7 és 30 nap rendelését, fizetett összegét és darabszámát becsüli. A következő 30 nap napi értékei is megnyithatók és CSV-be tölthetők.

Két alapmodell készül: az utolsó 28 nap átlaga, illetve heti szezonális naiv modell, amely a legutóbbi azonos hétköznap értékét ismétli. Az utolsó 14 teljes napra gördülő, egynapos előrejelzéssel mérjük a hibát; minden pontnál kizárólag az azt megelőző adatok használhatók. Mutatónként a kisebb MAE-jű modell adja a becslést. A WAPE is megjelenik, nulla tényleges összegnél nem számoljuk.

A minimum 70 teljes nap és 20 fizetett rendelés saját óvatossági termékszabály, nem tudományos garancia a pontosságra. Teszt- és próbavásárlásokból nem adunk valódi forgalmi előrejelzést. Az előrejelzés hiányában az export is hibát jelez, nem generál mesterséges számokat.

Az egynapos hibamutató nem igazolja a 30 napos horizont pontosságát. Nem készül 95%-osnak nevezett intervallum, éves szezonalitás, kampány-, ár- vagy készlethiány-modell. A tört darabszám várható érték. Üzleti tervhez hosszabb, tisztított eladási előzmény és többhorizontú ellenőrzés szükséges.

## Készlet

A jelenleg rögzített készletet és a zárónapig mért 28 nap eladását mutatjuk. Legalább 28 napos eladási előzmény és pozitív eladási ütem esetén: készletnap = rögzített készlet / napi átlag. Nem követett készlet, rövid előzmény, nulla eladás vagy nem éles adatforrás esetén nincs készletnap-becslés.

A készlet mostani adat, nem a múltbeli zárónap historikus készlete; az aktív fizetési foglalásokat nem vonja le. A hiányos készletmozgás-történetből nem számolunk sell-through rátát vagy automatikus beszerzési mennyiséget.

## Archívum és export

Az archívum alapból az összes rögzített időszakot és rendeléstípust mutatja, 50 soros lapozással. Dátum, ország, termék a kosárban, fizetési és teljesítési állapot, rendelésszám, név és e-mail alapján kereshető. A régi, 200-as listán kívüli rendelés is megnyitható és a meglévő teljesítési szerkesztőben kezelhető.

| Export | Tartalom |
| --- | --- |
| Rendelések CSV | Teljes szűrt rendelési lista, állapotok, kapcsolat, pénzügyi komponensek és belső megjegyzés. |
| Terméktételek CSV | Minden rendelés minden tétele, rendelési ár- és névpillanatképpel. A rendelési összeg soronként ismétlődik: ne add össze újra terméktétel-árbevételként. |
| Részletes JSON | Szűrési metaadat, rendelések, tétellista, szállítás, kedvezmény, elérhető cím- és ügyfélpillanatkép, teljesítési adatok és belső megjegyzés. |
| Analitikai CSV-k | Idősor, termékriport, termék × időszak, vásárlók, készlet és elegendő adatnál napi előrejelzés. Tartalmazzák az időzónát, adatforrást és készítési időt. |

Az export minden találatot olvas, nem az aktuális oldalt vagy a legutóbbi 200 sort. A nagy archívum 100-as kulcsalapú adatbázisblokkokban, streamelve készül, nincs hallgatólagos export-sorlimit. A CSV UTF-8 BOM-mal és pontosvesszővel készül; a tizedesek vesszőt kapnak. A lehetséges táblázatképleteket kezdő szóköz után is szövegként védi. Pénznem a rendelési CSV-ben külön szerepel; a riportok HUF-alapúak, nincs kitalált devizakonverzió.

A letöltések személyes adatot is tartalmazhatnak. Nem teljes adatbázis-mentések, és nem tartalmazzák a számlák PDF-bájtfájljait vagy szolgáltatói kulcsokat. Az export alatt módosított teljesítési adatok nem tranzakciósan befagyasztott pillanatképnek tekintendők. Az eredeti rendelési adatokat az export nem módosítja.

## Határok és szükséges további adatok

Az éles riport kizárólag az itt tárolt, fizetett éles Stripe-rendeléseket használja. A kézi, fizetésre váró rendelések az archívumban látszanak, de nem válnak eladássá. A tesztfizetések és próbavásárlások külön források.

| Kívánt további mutató | Hiányzó adat / szükséges kapcsolat |
| --- | --- |
| Visszatérítésekkel korrigált eladás, visszáruarány | Visszatérítési és visszáru-események rendelés- és tételszintű naplója. A Stripe-ban végzett refund jelenleg nem szinkronizálódik ide. |
| Fedezet, profit, készletérték önköltségen | Rendeléskori önköltség-pillanatkép, csomagolás, fizetési díj, teljesítési és egyéb költségek. |
| Áfa szerinti nettó, adókimutatás | Rendelésenként és adónemenként külön adóbontás, jóváhagyott számlázási rendszer. |
| Konverzió, termék–kosár–pénztár tölcsér | Egységes, tényleges látogatási és eseménymérés, megfelelő adatkezelési kialakítással. Most nem telepítettünk külső követőkódot. |
| ROAS, CAC, marketingattribúció | Kampányköltségek és dokumentált rendelés-hozzárendelés. |
| A meglévő vállalkozás teljes múltja | Korábbi rendszerek rendelésállományának külön, ellenőrzött importja. Ez a fejlesztés ilyet nem végzett. |

A riport maximum 731 napos elemzési időablakkal, 20 000 betöltött rendeléssel és 12 MB tételadattal dolgozik. Ebbe az előző összehasonlítási és előrejelzési időablak is beleszámít. A határt előre ellenőrzi, túllépésnél egyértelmű hibát ad: nem összesít csonkolt mintát. A teljes archívum letöltése ettől független, nincs 731 napos archívumkorlát.

Az érvénytelen tételadatú vagy nem egyező összegű eladás kimarad a riportból és adatminőségi figyelmeztetésként látszik. A visszatérő vásárló és az előzmény első időpontjának kereséséből is kizárjuk a nem egyező rendelést. Ez az ellenőrzés nem könyvvizsgálat.

## Ellenőrzés

Valódi SQLite-kezelőkön futó tesztek ellenőrzik a jogosultságot, időzónát, korábbi vásárlást, kuponfelosztást, pénzügyi egyeztetést, hiányzó adatot, előrejelzési visszamérést, valamint a 200 sort meghaladó CSV/JSON-exportot. A tesztadatok csak helyi, memóriabeli adatbázisba kerülnek, nem az éles boltba.

A DOM-ellenőrzés az új riportlapokat, szűrőket, lapozási/letöltési útvonalakat, rendelésmegnyitást és a korábbi adminűrlapokat is vizsgálja. A böngészős vizuális és nagyüzemi terheléses ellenőrzés nem történt meg; ezeket nem állítjuk késznek. A számításokhoz két keresési index készült, adatot törlő migráció nélkül.
