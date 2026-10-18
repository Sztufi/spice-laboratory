import { catalogue } from './catalogue.mjs';
const $=selector=>document.querySelector(selector);
const h=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const heart='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
const products=new Map(catalogue.products.map(product=>[product.id,product]));
const FAVORITES_KEY='spice-lab:guest-favorites:v1';
let favorites=new Set(),state=null,status='loading',activeTab='profile',favoriteOnly=false;
let initialGuest=[];
const pending=new Set();
try{const stored=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');if(Array.isArray(stored))initialGuest=[...new Set(stored.filter(id=>products.has(id)))];}catch{}
favorites=new Set(initialGuest);
const money=(minor,currency='RON')=>`${new Intl.NumberFormat('hu-HU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(minor/100)} ${currency==='RON'?'lej':currency}`;
const date=value=>new Intl.DateTimeFormat('hu-HU',{dateStyle:'medium'}).format(new Date(value));
export const isFavorite=id=>favorites.has(id);
export const favoritesFilterEnabled=()=>favoriteOnly;
export const favoriteProductIds=()=>new Set(favorites);
export function favoriteButtonMarkup(product){return `<button class="favorite-button${favorites.has(product.id)?' is-favorite':''}" type="button" data-favorite="${h(product.id)}" aria-pressed="${favorites.has(product.id)}" aria-label="${h(product.name)} ${favorites.has(product.id)?'eltávolítása a kedvencekből':'hozzáadása a kedvencekhez'}"${pending.has(product.id)?' disabled aria-busy="true"':''}>${heart}</button>`;}
function emit(){
 $('#favorites-count').textContent=favorites.size;$('#favorites-count').hidden=!favorites.size;
 $('#open-favorites').setAttribute('aria-label',`Kedvencek megnyitása, ${favorites.size} termék`);
 window.dispatchEvent(new window.CustomEvent('spice:favorites-change'));
}
async function api(path='',method='GET',body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(`/api/account${path}`,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok){const error=new Error(data.error||'A művelet nem sikerült.');error.status=response.status;throw error;}
  return data;
 }finally{clearTimeout(timer);}
}
function notice(message,isError=false){if(!$('#account-dialog').open)window.dispatchEvent(new window.CustomEvent('spice:notice',{detail:message}));const node=$('#account-notice');node.textContent=message;node.hidden=false;node.classList.toggle('is-error',isError);}
function hideNotice(){$('#account-notice').hidden=true;}
async function loadAccount(){
 try{
  state=await api();status='authenticated';favorites=new Set(state.favorites);
  if(initialGuest.length){
   try{await api('/favorites/merge','POST',{productIds:initialGuest});state=await api();favorites=new Set(state.favorites);initialGuest=[];localStorage.removeItem(FAVORITES_KEY);}catch{}
  }
 }catch(error){state=null;status=error.status===401?'guest':'unavailable';}
 emit();
}
async function toggleFavorite(id){
 if(!products.has(id)||pending.has(id))return;
 const was=favorites.has(id);was?favorites.delete(id):favorites.add(id);
 if(state?.authenticated){
  pending.add(id);emit();
  try{await api(`/favorites/${encodeURIComponent(id)}`,was?'DELETE':'PUT');state.favorites=[...favorites];}
  catch(error){was?favorites.add(id):favorites.delete(id);notice(error.message,true);}
  finally{pending.delete(id);emit();}
 }else{
  try{localStorage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]));initialGuest=[...favorites];}catch{}
  emit();
 }
 if($('#account-dialog').open&&activeTab==='favorites')renderAccount();
}
function loginPanel(){return `<div class="account-welcome"><span class="account-kicker">A SAJÁT ÍZVILÁGOD.</span><h3>EGY HELYEN<br>MINDEN KEDVENC.</h3><p>A fiókodban mentheted az adataidat és címeidet, eléred a kedvenceidet, rendeléseidet és számláidat.</p><a class="primary-button" href="/signin-with-chatgpt?return_to=%2F%23fiok" target="_top">BELÉPÉS AZ ELŐNÉZETI FIÓKBA ↗</a><div class="account-provider"><strong>Google-belépés</strong><span class="status-pill">Előkészítés alatt</span><p>A Google-belépés még nincs aktiválva. Ez az előnézet a jelenlegi tárhely hitelesítését használja.</p></div></div>`;}
const input=(id,title,value='',options='')=>`<label for="${id}">${title}<input id="${id}" name="${id}" value="${h(value)}" ${options}></label>`;
function profilePanel(){return `<p class="account-description">Az itt mentett adatokat a vásárlói fiókodhoz kapcsoljuk.</p><form class="account-form" id="profile-form">${input('profile-name','Teljes név',state.user.fullName,'maxlength="100" autocomplete="name"')}${input('profile-email','Bejelentkezési e-mail',state.user.email,'type="email" readonly')}${input('profile-phone','Telefonszám',state.user.phone,'type="tel" maxlength="40" autocomplete="tel"')}<p class="account-help">Az e-mail-cím a bejelentkezési azonosítódból származik.</p><button class="primary-button yellow" type="submit">ADATOK MENTÉSE</button></form>`;}
function addressFields(kind,title){const data=state.addresses[kind]||{};return `<fieldset class="address-fieldset"><legend>${title}</legend>${input(`${kind}-recipient`,'Címzett',data.recipient,'maxlength="100" autocomplete="off"')}${kind==='billing'?input('billing-company','Cégnév (opcionális)',data.company,'maxlength="160"')+input('billing-taxId','Adószám (opcionális)',data.taxId,'maxlength="40"'):''}<div class="form-row">${input(`${kind}-country`,'Országkód',data.country||'HU','maxlength="2" pattern="[A-Za-z]{2}" required')}${input(`${kind}-postalCode`,'Irányítószám',data.postalCode,'maxlength="20"')}</div>${input(`${kind}-city`,'Város',data.city,'maxlength="100"')}${input(`${kind}-line1`,'Utca, házszám',data.line1,'maxlength="160"')}${input(`${kind}-line2`,'Emelet, ajtó (opcionális)',data.line2,'maxlength="160"')}</fieldset>`;}
function addressesPanel(){return `<form class="account-form" id="addresses-form">${addressFields('shipping','SZÁLLÍTÁSI CÍM')}<button class="text-button" type="button" id="copy-address">Szállítási cím átmásolása a számlázáshoz ↓</button>${addressFields('billing','SZÁMLÁZÁSI CÍM')}<button class="primary-button yellow" type="submit">CÍMEK MENTÉSE</button></form>`;}
function favoritePanel(){
 const list=catalogue.products.filter(product=>favorites.has(product.id));
 return `${!state?.authenticated?'<p class="account-description">Ezek a kedvencek ezen az eszközön vannak mentve. Bejelentkezés után a fiókodhoz kapcsolhatod őket.</p>':''}${list.length?`<div class="account-favorites">${list.map(product=>`<article class="account-favorite"><button class="account-favorite-photo" type="button" data-action="detail" data-id="${h(product.id)}" aria-label="${h(product.name)} részletei"><img src="${h(product.image)}" width="88" height="110" alt="${h(product.name)}"></button><div><h3>${h(product.name)}</h3><p>${money(product.priceMinor)}</p><button class="text-button" type="button" data-action="add" data-id="${h(product.id)}">Kosárba +</button></div><button class="favorite-remove" type="button" data-favorite="${h(product.id)}" aria-label="${h(product.name)} eltávolítása a kedvencekből">${heart}</button></article>`).join('')}</div><button class="secondary-button" type="button" id="show-favorite-products">Kedvencek mutatása a terméklistában</button>`:'<div class="account-empty"><h3>MÉG ÜRES A KEDVENCLISTÁD.</h3><p>Koppints a szívre egy terméknél, és itt újra megtalálod.</p></div>'}`;
}
function ordersPanel(){return state.orders.length?`<p class="account-description">A demóban végzett próbavásárlásokat külön jelöljük. Nem jelentenek valódi rendelést vagy fizetést.</p>${state.orders.map(order=>`<details class="order-record"><summary><span><strong>${h(order.number)}</strong><small>${date(order.createdAt)}</small></span><span><strong>${money(order.totalMinor,order.currency)}</strong><small class="status-pill">${order.kind==='demo'?'Próbavásárlás':order.kind==='stripe-test'?'Stripe tesztfizetés':order.status==='paid'?'Fizetve':h(order.status)}</small></span></summary><ul>${order.items.map(item=>`<li><span>${item.quantity} × ${h(item.name)}</span><strong>${money(item.subtotalMinor,order.currency)}</strong></li>`).join('')}</ul></details>`).join('')}`:'<div class="account-empty"><h3>MÉG NINCS RENDELÉSED.</h3><p>A fiókhoz mentett rendelések és a megjelölt próbavásárlások itt jelennek meg.</p></div>';}
function invoicesPanel(){return state.invoices.length?state.invoices.map(invoice=>`<article class="invoice-record"><div><h3>${h(invoice.number)}</h3><p>${date(invoice.issuedAt)} · ${money(invoice.totalMinor,invoice.currency)}</p></div><a class="secondary-button" href="${h(invoice.downloadUrl)}">PDF ↓</a></article>`).join(''):'<div class="account-empty"><h3>MÉG NINCS ELÉRHETŐ SZÁMLA.</h3><p>A kiállított számlák itt lesznek letölthetők. A próbavásárlásokról nem készül számla.</p></div>';}
function settingsPanel(){const requested=state.requests.some(item=>item.kind==='deletion'&&item.status==='pending');return `<div class="account-settings"><h3>BEJELENTKEZÉS</h3><p>Előnézeti hitelesítés. A Google-belépés előkészítése folyamatban.</p><a class="secondary-button" href="${h(state.signOutUrl)}" target="_top">Kijelentkezés</a><h3>SAJÁT ADATOK EXPORTÁLÁSA</h3><p>Letöltheted a profilodat, címeidet és a fiókodhoz tartozó archívumadatokat JSON formátumban.</p><a class="secondary-button" href="/api/account/export">Adatok letöltése ↓</a><h3>FIÓKTÖRLÉSI KÉRÉS</h3>${requested?'<p class="account-saved">A törlési kérésed rögzítve van, feldolgozásra vár.</p>':'<p>A kérés rögzítése nem törli azonnal a fiókot vagy a megőrzendő bizonylatokat.</p><form id="delete-request-form"><label class="deletion-consent"><input type="checkbox" required>Kérem a fiókom törlésének feldolgozását.</label><button class="secondary-button" type="submit">Törlési kérés rögzítése</button></form>'}</div>`;}
function renderAccount(){
 const names={profile:'SAJÁT ADATOK',addresses:'CÍMEIM',favorites:'KEDVENCEIM',orders:'RENDELÉSEIM',invoices:'SZÁMLÁIM',settings:'BEÁLLÍTÁSOK'};
 $('#account-title').textContent=names[activeTab];
 $('#account-tabs').innerHTML=Object.entries(names).map(([id,name])=>`<button id="account-tab-${id}" type="button" role="tab" aria-controls="account-panel" aria-selected="${activeTab===id}" tabindex="${activeTab===id?0:-1}" data-account-tab="${id}">${name}${id==='favorites'&&favorites.size?` (${favorites.size})`:''}</button>`).join('');
 $('#account-panel').setAttribute('aria-labelledby',`account-tab-${activeTab}`);
 $('#account-identity').textContent=state?.authenticated?(state.user.fullName||state.user.email):status==='loading'?'Fiók betöltése…':'SPICE LABORATORY';
 if(activeTab==='favorites')$('#account-panel').innerHTML=favoritePanel();
 else if(status==='loading')$('#account-panel').innerHTML='<p class="account-description" role="status">Fiók betöltése…</p>';
 else if(status==='unavailable')$('#account-panel').innerHTML='<div class="account-empty"><h3>A FIÓK MOST NEM ELÉRHETŐ.</h3><p>A mentett adataidat nem módosítottuk. Próbáld újra később.</p><button type="button" class="secondary-button" id="retry-account">Újrapróbálás</button></div>';
 else if(!state?.authenticated)$('#account-panel').innerHTML=loginPanel();
 else $('#account-panel').innerHTML=({profile:profilePanel,addresses:addressesPanel,orders:ordersPanel,invoices:invoicesPanel,settings:settingsPanel}[activeTab]||profilePanel)();
}
export function openAccount(tab='profile'){
 activeTab=['profile','addresses','favorites','orders','invoices','settings'].includes(tab)?tab:'profile';hideNotice();renderAccount();
 window.dispatchEvent(new window.CustomEvent('spice:open-dialog',{detail:'account-dialog'}));
}
export function clearFavoritesFilter(){favoriteOnly=false;emit();}
let checkoutRequest=null;
export async function archiveDemoOrder(items){
 if(!state?.authenticated)return {saved:false};
 const fingerprint=JSON.stringify(items);
 if(!checkoutRequest||checkoutRequest.fingerprint!==fingerprint)checkoutRequest={fingerprint,id:crypto.randomUUID()};
 const result=await api('/demo-orders','POST',{requestId:checkoutRequest.id,items});
 try{state=await api();}catch{}
 return result;
}
export async function initAccount(){
 window.addEventListener('spice:account-refresh',()=>loadAccount().then(()=>renderAccount()).catch(()=>{}));
 $('#open-account').addEventListener('click',()=>openAccount());
 $('#open-favorites').addEventListener('click',()=>openAccount('favorites'));
 document.addEventListener('click',async event=>{
  const favorite=event.target.closest('[data-favorite]');if(favorite){await toggleFavorite(favorite.dataset.favorite);return;}
  const tab=event.target.closest('[data-account-tab]');if(tab){activeTab=tab.dataset.accountTab;hideNotice();renderAccount();return;}
  if(event.target.closest('#copy-address'))for(const field of ['recipient','country','postalCode','city','line1','line2'])$(`#billing-${field}`).value=$(`#shipping-${field}`).value;
  if(event.target.closest('#show-favorite-products')){favoriteOnly=true;emit();$('#account-dialog').close();$('#termekek').scrollIntoView({block:'start'});}
  if(event.target.closest('#retry-account')){status='loading';renderAccount();await loadAccount();renderAccount();}
  if(event.target.closest('[data-open-orders]'))openAccount('orders');
 });
 $('#account-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const ids=['profile','addresses','favorites','orders','invoices','settings'];const index=ids.indexOf(activeTab);
  activeTab=event.key==='Home'?ids[0]:event.key==='End'?ids.at(-1):ids[(index+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length];
  hideNotice();renderAccount();$(`#account-tab-${activeTab}`).focus({preventScroll:true});
 });
 document.addEventListener('submit',async event=>{
  if(!['profile-form','addresses-form','delete-request-form'].includes(event.target.id))return;
  event.preventDefault();const form=event.target;const button=form.querySelector('[type="submit"]');button.disabled=true;hideNotice();
  try{
   if(form.id==='profile-form')await api('/profile','PUT',{fullName:$('#profile-name').value,phone:$('#profile-phone').value});
   if(form.id==='addresses-form'){
    const read=kind=>Object.fromEntries(['recipient','company','taxId','country','postalCode','city','line1','line2'].map(field=>[field,$(`#${kind}-${field}`)?.value||'']));
    await api('/addresses','PUT',{shipping:read('shipping'),billing:read('billing')});
   }
   if(form.id==='delete-request-form')await api('/deletion-request','POST',{});
   state=await api();status='authenticated';renderAccount();notice(form.id==='delete-request-form'?'A kérésed rögzítve. Feldolgozásra vár.':'Mentve a fiókodba.');
  }catch(error){button.disabled=false;notice(error.message||'Nem sikerült menteni. Próbáld újra.',true);}
 });
 window.addEventListener('storage',event=>{
  if(state?.authenticated||event.key!==FAVORITES_KEY)return;
  try{const raw=JSON.parse(event.newValue||'[]');favorites=new Set(Array.isArray(raw)?raw.filter(id=>products.has(id)):[]);emit();}catch{}
 });
 emit();await loadAccount();
 if(location.hash==='#fiok')openAccount();
}
