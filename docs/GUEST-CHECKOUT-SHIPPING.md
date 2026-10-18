# Vendégpénztár és szállításválasztó

2026-10-18. A kód és a próbafelület elkészült. A Stripe-kulcsok, a publikus webhook-elérés és a kereskedő jóváhagyott szállítási díjai még nincsenek beállítva. Éles rendelést nem fogadunk. A meglévő Site tulajdonosi hozzáférésre korlátozott; a nyilvános vendégfolyamat tényleges használatához később az oldal publikus elérését is külön rendezni kell. A jelen fejlesztés nem változtatta meg a hozzáférési beállítást.

## Felület

- Vendégvásárlás az alapértelmezett, a fiókkal vásárlás külön választható. Nincs kötelező webshop-regisztráció.
- Magyarország az alapértelmezett célország; Románia külön választható. Országonként csak az arra jóváhagyott módszerek jelennek meg.
- Szállítási módonként látható a név, HUF díj, becsült kézbesítési idő munkanapokban, és – ha az üzemeltető valóban beállította – az ingyenes szállítás összeghatára.
- A termékablakban és a kosárban már a pénztár előtt látható a magyarországi szállítás tájékoztatója.
- Ország- vagy módszerváltáskor az összesítő frissül. Valódi fizetés kizárólag érvényes szállításválasztással indítható.
- Hiányzó díj nem válik 0 Ft-tá. A felület külön jelzi, hogy az összeg csak a termékeket tartalmazza, a szállítás pedig még nincs beállítva. Ilyenkor csak próbavásárlás érhető el.
- Vendégként a szükséges e-mail-, szállítási és számlázási adatokat a Stripe következő oldalán lehet megadni. A hírlevél és a fiók ettől külön, önkéntes szolgáltatás.
- Sikertelen indításkor a kosár és az újrapróbálás lehetősége megmarad. A fizetés indítása alatt a választómezők zárolódnak. Billentyűzettel elküldött valódi pénztárűrlap is a Stripe-ot indítja, nem a demórendelést.

## Szállítási beállítás

`SHIPPING_METHODS_JSON`: szerveroldali környezeti érték, legfeljebb 10 jóváhagyott mód JSON-tömbjeként. A kódhoz nem tartozik feltételezett éles szállítási ár vagy kézbesítési vállalás. A tesztekben használt díjak kizárólag tesztadatok.

| Mező | Tartalom |
| --- | --- |
| `id` | Egyedi, stabil azonosító; kisbetű, szám és kötőjel; maximum 50 karakter |
| `label` | Vásárlónak mutatott elnevezés, maximum 80 karakter |
| `country` | `HU` vagy `RO`; egy mód egy célországhoz tartozik |
| `feeMinor` | HUF századegységben: a kereskedő által megadott forintdíj szorozva százzal |
| `deliveryMinDays` | Legalább 1 munkanap; az üzemeltető tényleges vállalása alapján |
| `deliveryMaxDays` | Minimumértéknél nem kisebb, maximum 60 munkanap |
| `freeAboveMinor` | Opcionális, valós ingyenes szállítási küszöb, ugyanabban az egységben |

A kézbesítési időnek a teljes, rendeléstől várható kézbesítésig tartó időt kell lefednie, a feldolgozási idővel együtt. A felület becslésként, munkanapokban mutatja; ünnepnapos/irányítószámos kézbesítési naptár nincs bekötve. Nem jelenítünk meg kitalált naptári érkezési dátumot.

A szállítási díjat és az összeghatárt a szerver újraszámolja. A Stripe egyetlen kiválasztott módot és az ahhoz tartozó célországot kapja; így nem választható másik ország ugyanahhoz a díjhoz. A Stripe `delivery_estimate` értéke megegyezik a felületen mutatott adatokkal. A fizetési hivatkozás egy óráig érvényes.

A kiválasztott szállítás pillanatképe a fizetéshez és a végleges rendeléshez is elmentődik. Későbbi ármódosítás nem írja át a régi rendelést. A fiókban a szállítás önálló összesítősor.

A választó nem futárszolgáltatói API: nincs még AWB-generálás, futárfoglalás, csomagpont-adatbázis vagy csomagautomata-térkép. Ilyen átvételi mód csak a szükséges tényleges cím-/pontválasztó integráció elkészítése után ajánlható fel. Jelenleg az összeg és ország alapján működő, címre történő szállítási módokhoz használható.

## Vendégrendelés hozzáférése

A vendég nem kap beléptető munkamenetet vagy hozzáférést a fiók API-hoz. Kizárólag a saját vendégpénztárához és fizetési visszatéréséhez kap véletlen, 256 bites hozzáférési tokent `__Host-spice-checkout` sütiben. Jelzők: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`; nincs Domain attribútum. A token nem kerül JavaScriptbe, localStorage-ba, URL-be vagy API-válasz törzsébe. Az adatbázis csak a SHA-256 lenyomatot tárolja. A belső vendég-vásárlóazonosító rendelési FK, nem bejelentkezési fiók.

A hozzáférés 24 órás, és a szerver is ellenőrzi a lejáratot. Új fizetés előkészítésekor, ha két óránál kevesebb van hátra, ugyanezt a saját hozzáférést újabb 24 órára frissítjük. A Stripe-session egyórás érvényessége ennél rövidebb. Lejárt vagy tetszőleges kliens által kitalált token nem fogadható el. A pénztár szükséges sütijének blokkolásakor nem indítunk tulajdonos nélküli fizetést.

A Stripe Session azonosító önmagában nem biztosít hozzáférést. A fizetett állapotot továbbra is a szolgáltató aláírt webhookja vagy szerveroldali Session-lekérése igazolja. A vendég nem válik automatikusan hírlevél-feliratkozóvá, és e-mail-egyezés alapján nem kapcsoljuk a rendelést fiókhoz.

A sikeroldalon külön gomb kapcsolhatja a vendégrendelést a bejelentkezett fiókhoz. Ehhez egyszerre szükséges az érvényes vendéghozzáférés, a szerver által igazolt fizetett rendelés és a Sites-hitelesített fiók. A két tulajdonosi hivatkozás egy adatbázis-tranzakcióban változik. Kapcsolás után a régi vendéghozzáférés már nem olvashatja azt a rendelést. A kapcsolás ismételt kérése ugyanahhoz a tulajdonoshoz nem hoz létre új rendelést.

A süti lejárta vagy törlése után a vendég a Session azonosítójával nem tudja visszaállítani a hozzáférést. A vendégek e-mailes rendelés-visszakeresése, a lejárt technikai hozzáférések ütemezett takarítása és a nyilvános induláshoz szükséges visszaélés-kezelési korlátok még külön üzemeltetési feladatok. Meglévő számla- és rendelésadatokat nem törlünk automatikusan.

## Ellenőrzés

Automatikus tesztek: guest/account elkülönítés, hozzáférési süti jelzői és lejárata, más vásárló rendelésének tiltása, ismételt fizetésindítás, explicit fiókhoz kapcsolás, HU/RO módszerilleszkedés, árhamisítás, ingyenes küszöb, szállítási pillanatkép és demóarchiválás. DOM-integrációs ellenőrzés valódi szerverkezelőkkel és helyi SQLite-tal: ország- és módszerváltás, összesítő, billentyűzetes elküldés, szolgáltatói hiba és újrapróbálás, fizetési visszatérés és opcionális kapcsolás.

Valódi Stripe-kulcsos vásárlást, publikus webhook-kézbesítést, valódi mobilböngészős megjelenítési/sütikezelési tesztet nem végeztünk, mert ezek feltételei még hiányoznak.

## Elsődleges források

- https://docs.stripe.com/payments/checkout/guest-customers
- https://docs.stripe.com/payments/during-payment/charge-shipping?payment-ui=stripe-hosted
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
