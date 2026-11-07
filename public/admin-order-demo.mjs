const labelUrl='/demo/awb-a6.pdf';
export const demoOrder={
 id:'demo-pack-order',number:'SL-DEMO-001',kind:'demo',demo:true,status:'demo-completed',createdAt:'2026-11-07T09:00:00Z',currency:'HUF',totalMinor:1055000,actionable:true,glsReady:true,maxJarsPerBox:12,
 customer:{billing:{name:'Minta Vásárló',email:'demo@example.com'},shipping:{name:'Minta Vásárló',address:{country:'HU',postal_code:'1111',city:'Budapest',line1:'Minta utca 12.'}}},
 items:[{id:'fries-salt',name:'Fries Salt',sku:'DEMO-FRIES',quantity:2,subtotalMinor:550000,image:'/assets/products/condiment-pentru-cartofi-prajiti-fries-salt.jpg'},{id:'grr-lick',name:'GRR Lick!',sku:'DEMO-GRR',quantity:1,subtotalMinor:275000,image:'/assets/products/mix-pentru-dip-usturoi-grr-lick.jpg'}],
};
export const demoOrderCard=()=>`<section class="admin-card"><span class="pill pink">DEMÓ · NEM VALÓDI RENDELÉS</span><h2>SL-DEMO-001</h2><p>Minta Vásárló · 3 üveg · 10 550 Ft mintaösszeg</p><p>A bemutató nem indít fizetést, e-mailt, készletváltozást vagy GLS-feladást, és nem kerül a riportokba.</p><div class="row-actions"><button type="button" class="button light" data-order-demo>DEMÓ RENDELÉS MEGNYITÁSA</button><a class="button yellow" href="/admin?tab=packing&amp;demo=1&amp;order=demo-pack-order">DEMÓ CSOMAGOLÁS</a><a class="button light" href="${labelUrl}" target="_blank" rel="noopener">DEMÓ A6 AWB</a></div></section>`;
export const demoOrderDetail=()=>`<div class="customer-detail"><span class="pill pink">DEMÓ · NINCS FIZETÉS VAGY FELADÁS</span><h3>Minta Vásárló</h3><p>demo@example.com<br>1111 Budapest, Minta utca 12.<br>Kitalált tesztadatok.</p></div><table class="order-lines"><tbody><tr><td>2 × Fries Salt · DEMO-FRIES</td><td>5 500 Ft</td></tr><tr><td>1 × GRR Lick! · DEMO-GRR</td><td>2 750 Ft</td></tr><tr><td>Szállítás (minta)</td><td>2 300 Ft</td></tr></tbody></table><p class="order-total">10 550 Ft · DEMÓ</p><p>Ez nem valódi vásárlás. A minta külön kezelt; nem menthető éles rendelésként.</p><div class="row-actions"><a class="button yellow" href="/admin?tab=packing&amp;demo=1&amp;order=demo-pack-order">CSOMAGOLÁS KIPRÓBÁLÁSA</a><a class="button light" href="${labelUrl}" target="_blank" rel="noopener">DEMÓ AWB MEGNYITÁSA / NYOMTATÁS</a></div><p>A címke A6-os nyomtatási minta, nem GLS által kibocsátott fuvarlevél.</p>`;
export function createPackingDemoApi(){
 let packing={counts:[0,0],revision:'demo-0',packedAt:null,weightGrams:850},parcelNumber=null;
 return async(path,method='GET',input)=>{
  if(path.startsWith('/packing?')&&method==='GET'){
   const url=new URL(path,'https://demo.invalid'),done=url.searchParams.get('view')==='done';
   return {total:done?0:1,page:1,orders:done?[]:[{id:demoOrder.id,number:demoOrder.number,name:'Minta Vásárló · DEMÓ',createdAt:demoOrder.createdAt,units:3,fulfillmentStatus:'processing',packedAt:packing.packedAt,parcelNumber,labelStatus:parcelNumber?'ready':null}]};
  }
  if(path==='/packing/'+demoOrder.id&&method==='GET')return structuredClone({...demoOrder,packing,parcelNumber,labelStatus:parcelNumber?'ready':null});
  if(path==='/packing/'+demoOrder.id&&method==='PUT'){
   if(input.revision!==packing.revision)throw Error('A demó állapota megváltozott. Nyisd meg újra.');
   if(!Array.isArray(input.counts)||input.counts.length!==2||input.counts.some((n,i)=>!Number.isInteger(n)||n<0||n>demoOrder.items[i].quantity))throw Error('Hibás demó darabszám.');
   if(!Number.isInteger(input.weightGrams)||input.weightGrams<50||input.weightGrams>30000)throw Error('A csomagtömeg 50–30000 g lehet.');
   packing={...input,revision:'demo-'+crypto.randomUUID(),packedAt:input.counts.every((n,i)=>n===demoOrder.items[i].quantity)?'2026-11-07T09:00:00Z':null};return {saved:true,packing:structuredClone(packing)};
  }
  if(path==='/packing/'+demoOrder.id+'/label'&&method==='POST'){
   if(!packing.packedAt)throw Error('Előbb jelöld és mentsd az összes tételt.');
   const created=!parcelNumber;parcelNumber='DEMO-NEM-FELADHATO';return {created,parcelNumber,labelUrl};
  }
  throw Error('A demóban ez a művelet nem érhető el. Éles API-kérés nem indult.');
 };
}
export function decoratePackingDemo(root,demo){
 const workspace=root.querySelector('.pack-workspace');if(!workspace)return;
 workspace.insertAdjacentHTML('afterbegin',demo?'<aside class="admin-card"><span class="pill pink">DEMÓ ÜZEMMÓD</span><p>Kitalált rendelés. Nincs GLS-kérés, fizetés, készletváltozás vagy riportbejegyzés. Újratöltéssel a bemutató alaphelyzetbe áll.</p><a href="/admin?tab=packing">Vissza az éles csomagolópulthoz</a></aside>':demoOrderCard());
 if(!demo)return;
 for(const a of root.querySelectorAll('a[href*="/gls-label"]'))a.href=labelUrl;
 for(const p of root.querySelectorAll('p'))if(p.textContent.startsWith('Fizetve ·'))p.textContent=p.textContent.replace('Fizetve ·','DEMÓ · nincs fizetés ·');
 for(const p of root.querySelectorAll('p'))if(p.textContent.includes('A kérés valódi GLS-címkét hoz létre.'))p.textContent=p.textContent.replace('A kérés valódi GLS-címkét hoz létre.','A demó csak a mintacímkét nyitja meg, GLS-feladás nélkül.');
 const b=root.querySelector('[data-pack-label]');if(b)b.textContent='DEMÓ AWB LÉTREHOZÁSA';
}
