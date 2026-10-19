export const categoryPages=[
 {id:'bbq',slug:'grill-bbq',label:'Grill / BBQ',headline:'TŰZ. FÜST. KARAKTER.',description:'Csirke, steak, oldalas. Keverékek a következő sütéshez, a grillrácson innen és túl.',color:'#f2b4d0',productId:'rooster-booster'},
 {id:'dip',slug:'martogatosok',label:'Mártogatósok',headline:'EZT MÉG KIMÁRTOGATOD.',description:'Fokhagymás és pirított hagymás alapok. Keverd joghurtba, tejfölbe vagy majonézbe.',color:'#d9e7b5',productId:'grr-lick'},
 {id:'topping',slug:'ropogos-feltetek',label:'Ropogós & feltét',headline:'A VÉGÉRE EGY CSAVAR.',description:'Fűszersó a krumplira, ropogós feltét a tányér tetejére. A befejezés is számít.',color:'#ffe383',productId:'fries-salt'},
 {id:'international',slug:'vilagkonyha',label:'Világkonyha',headline:'NEM KELL HOZZÁ REPJEGY.',description:'Cajun vagy Chimichurri? Más konyhák ihlette keverékek, a saját vacsorádhoz.',color:'#e6c9f0',productId:'cajun-mix'}
];
export const categoryPath=(id,activeCategories=categoryPages)=>{const page=activeCategories.find(item=>item.id===id);const original=categoryPages.find(item=>item.id===id);return page?'/kategoria/'+(page.slug||original?.slug||page.id):'/termekek';};
export const supportLinks=[{path:'/gyik',label:'Gyakori kérdések'},{path:'/szallitas-es-fizetes',label:'Szállítás és fizetés'},{path:'/visszakuldes',label:'Visszaküldés és reklamáció'},{path:'/fiok',label:'Saját fiók és rendeléseim'}];
export const legalLinks=[{path:'/aszf',label:'Vásárlási feltételek'},{path:'/adatkezeles',label:'Adatkezelés'},{path:'/sutik',label:'Sütik és böngészőadatok'}];
