export const categoryPages=[
 {id:'bbq',slug:'grill-bbq',label:'Grill / BBQ',headline:'TŰZ. FÜST. KARAKTER.',description:'Keverékek csirkéhez, húshoz és a következő grillezéshez.',color:'#f2b4d0',productId:'rooster-booster'},
 {id:'dip',slug:'martogatosok',label:'Mártogatósok',headline:'MÁRTS BELE VALAMI JÓBA.',description:'Fokhagymás és hagymás keverékek a mártogatósok világából.',color:'#d9e7b5',productId:'grr-lick'},
 {id:'topping',slug:'ropogos-feltetek',label:'Ropogós & feltét',headline:'A VÉGÉRE EGY CSAVAR.',description:'Keverékek és feltétek, amelyekkel befejezheted a tányért.',color:'#ffe383',productId:'fries-salt'},
 {id:'international',slug:'vilagkonyha',label:'Világkonyha',headline:'EGY CSIPET VILÁG.',description:'Más konyhák ihlette ízek a saját konyhádban.',color:'#e6c9f0',productId:'cajun-mix'}
];
export const categoryPath=(id,activeCategories=categoryPages)=>{const page=activeCategories.find(item=>item.id===id);const original=categoryPages.find(item=>item.id===id);return page?'/kategoria/'+(page.slug||original?.slug||page.id):'/termekek';};
export const supportLinks=[{path:'/gyik',label:'Gyakori kérdések'},{path:'/szallitas-es-fizetes',label:'Szállítás és fizetés'},{path:'/visszakuldes',label:'Visszaküldés és reklamáció'},{path:'/fiok',label:'Saját fiók és rendeléseim'}];
export const legalLinks=[{path:'/aszf',label:'Vásárlási feltételek'},{path:'/adatkezeles',label:'Adatkezelés'},{path:'/sutik',label:'Sütik és böngészőadatok'}];
