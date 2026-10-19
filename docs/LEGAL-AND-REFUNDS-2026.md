# Tájékoztatók és visszatérítések — 2026-10-19

## Források és alkalmazásuk

Elsődleges forrás a hatályos jog, nem egy másik bolt szerződése. A megvizsgált Fűszerész tájékoztató szerkezete (rendelés, ár, fizetés, szállítás, elállás) használható mintaként, de a benne talált 14 munkanapos / 30 napos visszatérítési szöveget, kizárólag eredeti csomagolási és futárjegyzőkönyvi megkötéseket nem vettük át. A saját szöveg önálló megfogalmazás.

- 45/2014. (II. 26.) Korm. rendelet, aktuális NJT-szöveg: https://njt.jog.gov.hu/jogszabaly/2014-45-20-22 — előzetes tájékoztatás, tartós visszaigazolás, 14 naptári napos elállás és visszatérítés, visszatartás, közvetlen visszaküldési költség, értékcsökkenés és a 29. § feltételes kivételei. A tartós fűszerekre nincs általános „élelmiszer nem küldhető vissza” szabály.
- (EU) 2023/2673 irányelv: https://eur-lex.europa.eu/eli/dir/2023/2673/oj/eng — az online elállási funkció szabályai 2026. június 19-től alkalmazandók; a magyar rendelet 22. § (1a)–(1c) szerinti feliratok, adatmezők és tartós elismervény.
- GDPR (EU) 2016/679: https://eur-lex.europa.eu/legal-content/HU/TXT/?uri=CELEX:32016R0679 — külön célok/jogalapok, megőrzési idők vagy feltételek, címzettek, érintetti jogok és adattovábbítási garanciák. Nem másoltunk be magyar cégre szabott 8 éves számviteli megőrzést.
- Román Legea contabilității 82/1991, 25. cikk, 2023-as módosítással: https://legislatie.just.ro/public/DetaliiDocument/1576 — főszabály szerint 5 év az érintett pénzügyi évet követő július 1-jétől. Az egyedi irattípusokat és kivételeket a könyvelő ellenőrizze.
- Róma I., 593/2008/EK rendelet 6. cikk: https://eur-lex.europa.eu/eli/reg/2008/593 — magyar fogyasztókra irányuló értékesítésnél a kötelező fogyasztóvédelmi szabályok nem zárhatók ki puszta külföldi jogválasztással.
- (EU) 2024/3228 rendelet: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R3228 — a korábbi ODR-platform megszűnt 2025-ben; nincs elavult ODR-panaszlink.
- Határon átnyúló segítség: https://www.magyarefk.hu/hu/miben-segithetunk ; román SAL: https://anpc.ro/sal/ és https://reclamatiisal.anpc.ro/ ; adatvédelem: https://naih.hu/ és https://www.dataprotection.ro/?lang=en&page=Plangeri_RGPD
- Összehasonlításként olvasott üzlet: https://www.webshop.fuszeresz.hu/vasarlasi_feltetelek_5 (nem jogi hitelesítési forrás).

## Ami készen van

Önálló ÁSZF, adatkezelési és sütitájékoztató, részletes elállási/visszaküldési oldal. A tulajdonos 2026-10-19-én megerősítette, hogy a visszaküldést a cég székhelyére kell fogadni. Nincs kötelező előzetes engedély, indoklás, fiók, fénykép vagy futárjegyzőkönyv.

Az online elállási űrlap szerveroldalon, időponttal rögzíti a nyilatkozatot, és letölthető TXT-elismervényt ad. Nem ellenőrzi automatikusan a nyilatkozó jogosultságát: nem árul el rendelési adatot, nem változtat rendelést és nem fizet vissza pénzt. A jogosultság és az elállás elbírálása ügyintézői feladat. A kérelmek `/admin?tab=withdrawals` alatt, 50-es lapozással olvashatók. Az e-mailes elismervény küldése/újraküldése külön állapot. A `sent` a levélküldő általi elfogadást jelenti, nem bizonyított postaládai kézbesítést.

## Éles használat előtt még szükséges

Az ellenőrzött szöveg és kód nem helyettesíti a tényleges kereskedői és szolgáltatói adatok véglegesítését. Nyitott tételek:

- aktuális cégjegyzéki adatok, nyilvántartó szerv, teljes postacím/irányítószám és ügyfélszolgálati e-mail működése;
- jóváhagyott HUF fogyasztói árak/adózás, konkrét futár, szerződött díjak és teljesítési idők;
- számlázó, könyvelő, tárhely, e-mail és marketing adatkezelés tényleges szerződő jogi személyei, címei és szerepei; GDPR 28. cikk szerinti feltételek, adattovábbítás jogalapja/garanciái és hozzáférhető példánya;
- különösen a számlázás és az adatmegőrzés könyvelői/jogi ellenőrzése, dokumentált törlési és biztonsági mentési rend (a szoftver nem állít automatikus teljes törlést);
- az éles szerződés visszaigazolása tartós formában a rendelési adatokkal és az elfogadott feltételverzióval. A vásárlói fiók és Stripe-nyugta önmagában nem elég; ez a rendelési levélfolyamat még külön bekötendő;
- ellenőrzött küldő domain, `RESEND_API_KEY`, `TRANSACTIONAL_EMAIL_FROM` és valódi kézbesítési próba;
- az élesítési ellenőrzés lezárása után `LEGAL_LAUNCH_APPROVED=true`. Ez önmagában nem végez el sem jogi ellenőrzést, sem levélküldő-aktiválást. Az éles pénztár e jelzés és az elismervény-levél konfigurációja nélkül nem aktiválható. A korábbi fizetési/szállítási előfeltételek is megmaradnak.

## Stripe-visszatérítési szinkron

Források: https://docs.stripe.com/refunds ; https://docs.stripe.com/api/refunds/object ; https://docs.stripe.com/api/refunds/list ; https://docs.stripe.com/api/charges/object ; https://docs.stripe.com/webhooks

A Stripe webhooknál engedélyezendő események a meglévő Checkout-eseményeken felül:

`refund.created`, `refund.updated`, `refund.failed`, `charge.refunded`

Végpont: `https://spicelaboratory.eu/api/commerce/stripe-webhook`. A nyers törzs Stripe-aláírását és az 5 perces időablakot ellenőrizzük. A pénzügyi állapothoz a szerver az aktuális Stripe Refund/Charge adatokat olvassa, lapozva a teljes visszatérítési listát. Ellenőrzi a PaymentIntent kapcsolatot, pénznemet, összeget, éles/tesztmódot. Új pénztár a PaymentIntent metaadataiban is megőrzi a checkout ID-t, ezért a fizetés rendezése előtt érkező visszatérítés is összekapcsolható. Más alkalmazás rendeléseit nem importálja.

A `payment_refunds` naplóban a refund ID egyedi: eseményduplázás nem duplázza az összeget. A napló és eseménymentés egy adatbázis-batchben fut; végleges állapotot késve befejeződő függő lekérés nem ront vissza. Csak `succeeded` csökkenti a megtartott összeget; `pending` és `requires_action` külön látszik, `failed`/`canceled` nem levonás. Eredeti rendelési összeg, darabszám és fizetési státusz megmarad.

A részleges/teljes visszatérítés megjelenik a vásárló rendelésénél, admin rendelésnél, archívumban, riportban és CSV/JSON-exportban. Az archívum JSON verziója 2, részletes refund-sorokkal. A napi/heti/havi riport a sikeressé vált visszatérítést annak Stripe szerinti létrehozási napjához számítja; a siker első helyi megfigyelését külön időbélyeg őrzi. Utólag sikeressé váló tétel ezért korábbi riportot is módosít. Régi rendelés mostani visszatérítése a mostani időszakban megjelenik. A `megtartott pénz = időszaki fizetés − időszaki visszatérítés` lehet negatív, nem áfa nélküli nettó vagy profit. A termékriport az eredeti eladásokat mutatja, nem talál ki termékszintű refund-felosztást.

Nincs automatikus pénz-visszautalási művelet, számlastornó, chargeback-elszámolás, banki payout-egyeztetés vagy készlet-visszavételezés. A pénzt a kereskedő a Stripe-ban téríti vissza; a szoftver az eredményt szinkronizálja. Régi, elmaradt eseményt a Stripe Dashboardból újra kell küldeni. Valódi Stripe-esemény és valódi levélküldés integrációs próbája még szükséges; az automatikus tesztek szimulált szolgáltatót használnak.

## SVG-karakterek

A három új figurát a tulajdonos kérésére 2026-10-19-én eltávolítottuk. A weboldal a hozzáadásuk előtti szekcióelrendezést használja; az eredeti hero-figura megmaradt.
