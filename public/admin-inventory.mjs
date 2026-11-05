import {escapeHtml as h} from './html-escape.mjs';
const number=value=>value===null||value===undefined?'—':String(value);
const date=value=>value?new Date(value).toLocaleString('hu-HU'):'Még nem történt';
export async function mountInventory(root,api){
 root.innerHTML='<p>Raktár betöltése…</p>';const loading=root.firstElementChild;let data,busy=false;
 const alive=()=>root.firstElementChild===loading||root.firstElementChild?.inventoryOwner===loading;
 const card=p=>`<article class="admin-card inventory-card"><h3>${h(p.name)}</h3><p>SKU: ${h(p.sku||'—')} · Eladható: ${number(p.availableQuantity)} db · Foglalt: ${number(p.inventory.reserved)} db</p><form data-inventory-product="${h(p.id)}" class="editor-form"><label>Webshopkészlet (db)<input name="stockQuantity" type="number" inputmode="numeric" min="0" max="1000000" step="1" value="${p.stockQuantity??''}" required></label><button class="button light" type="submit">MENTÉS</button><p role="status"></p></form></article>`;
 function render(){
  root.innerHTML=`<div class="inventory-admin"><section class="admin-card"><h2>Webshopraktár</h2><p>A készletet darabban add meg. A 0 db elfogyott terméket jelent. A SmartBill nem módosítja ezt a készletet.</p><a class="button light" href="/api/admin/inventory/export">CSV EXPORT</a><p data-inventory-notice role="status"></p></section><label>Termék vagy SKU keresése<input type="search" data-inventory-search></label><div class="inventory-grid">${data.products.map(card).join('')}</div></div>`;
  root.firstElementChild.inventoryOwner=loading;
  const labels={waiting:'Várakozó',sent:'Omnisendnek átadva',review:'Ellenőrzendő küldés',sending:'Feldolgozás alatt',cancelled:'Lemondva'};
  const requests=document.createElement('section');requests.className='admin-card';
  requests.innerHTML=`<h2>KÉSZLETÉRTESÍTŐK</h2><p>Egyszeri, termékenként kért értesítések. Küldés a következő sikeres készletellenőrzés után. Az „átadva” állapot nem igazolja a postaládába kézbesítést. Az ellenőrzendő küldést nem ismételjük automatikusan.</p>${(data.restock||[]).map(r=>`<div class="status-line"><span>${h(data.products.find(p=>p.id===r.product_id)?.name||r.product_id)} · ${h(labels[r.status]||r.status)}</span><strong>${number(r.total)}</strong></div>`).join('')||'<p>Még nincs készletértesítő-kérés.</p>'}`;
  root.firstElementChild.append(requests);
 }
 try{data=await api('/inventory');if(!alive())return;render();}catch(error){if(alive())root.textContent=error.message;return;}
 async function run(button,node,action){if(busy)return;busy=true;button.disabled=true;node.textContent='Folyamatban…';try{await action();}catch(error){if(alive())node.textContent=error.message;}finally{busy=false;button.disabled=false;}}
 root.addEventListener('input',event=>{if(!alive()||!event.target.matches('[data-inventory-search]'))return;const search=event.target.value.toLocaleLowerCase('hu');for(const card of root.querySelectorAll('.inventory-card'))card.hidden=!card.textContent.toLocaleLowerCase('hu').includes(search);});
 root.addEventListener('submit',event=>{
  const form=event.target;if(!alive()||!form.matches('[data-inventory-product],[data-reconcile-order]'))return;event.preventDefault();const values=new FormData(form);
  run(form.querySelector('button'),form.querySelector('[role=status]'),async()=>{
   if(form.dataset.inventoryProduct){const p=data.products.find(p=>p.id===form.dataset.inventoryProduct);await api('/inventory/'+encodeURIComponent(p.id),'PUT',{stockQuantity:Number(values.get('stockQuantity')),revision:p.revision});}
   data=await api('/inventory');if(!alive())return;render();root.querySelector('[data-inventory-notice]').textContent='A webshopkészlet mentve.';
  });
 });
}
