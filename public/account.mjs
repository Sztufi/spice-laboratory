import {loginPanel} from './account-login.mjs';
import {brandIcon} from './brand-icons.mjs';
import {styleIcons} from './brand-icons.mjs';
import { formatMoney } from './money.mjs';
import { catalogue } from './catalogue.mjs';
import {mountGoogleLogin,logoutGoogle} from './google-login.mjs';
import {refreshCommerceIdentity} from './commerce.mjs';
const $=selector=>document.querySelector(selector);
const h=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const heart=brandIcon('heart');
const products=new Map(catalogue.products.map(product=>[product.id,product]));
const FAVORITES_KEY='spice-lab:guest-favorites:v1';
let favorites=new Set(),state=null,status='loading',activeTab='profile',favoriteOnly=new URLSearchParams(location.search).get('favorites')==='1';
let initialGuest=[];
const pending=new Set();
try{const stored=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');if(Array.isArray(stored))initialGuest=[...new Set(stored.filter(id=>products.has(id)))];}catch{}
favorites=new Set(initialGuest);
const money=(minor,currency=catalogue.currency)=>formatMoney(minor,currency);
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

const input=(id,title,value='',options='')=>`<label for="${id}">${title}<input id="${id}" name="${id}" value="${h(value)}" ${options}></label>`;
function profilePanel(){return `<p class="account-description">Az itt mentett adatokat a vásárlói fiókodhoz kapcsoljuk.</p><form class="account-form" id="profile-form">${input('profile-name','Teljes név',state.user.fullName,'maxlength="100" autocomplete="name"')}${input('profile-email','Bejelentkezési e-mail',state.user.email,'type="email" readonly')}${input('profile-phone','Telefonszám',state.user.phone,'type="tel" maxlength="40" autocomplete="tel"')}<p class="account-help">Az e-mail-cím a bejelentkezési azonosítódból származik.</p><button class="primary-button yellow" type="submit">ADATOK MENTÉSE</button></form>`;}
function addressFields(kind,title){const data=state.addresses[kind]||{};return `<fieldset class="address-fieldset"><legend>${title}</legend>${input(`${kind}-recipient`,'Címzett',data.recipient,'maxlength="100" autocomplete="off"')}${kind==='billing'?input('billing-company','Cégnév (opcionális)',data.company,'maxlength="160"')+input('billing-taxId','Adószám (opcionális)',data.taxId,'maxlength="40"'):''}<div class="form-row">${input(`${kind}-country`,'Országkód',data.country||'HU','maxlength="2" pattern="[A-Za-z]{2}" required')}${input(`${kind}-postalCode`,'Irányítószám',data.postalCode,'maxlength="20"')}</div>${input(`${kind}-city`,'Város',data.city,'maxlength="100"')}${input(`${kind}-line1`,'Utca, házszám',data.line1,'maxlength="160"')}${input(`${kind}-line2`,'Emelet, ajtó (opcionális)',data.line2,'maxlength="160"')}</fieldset>`;}
function addressesPanel(){return `<form class="account-form" id="addresses-form">${addressFields('shipping','SZÁLLÍTÁSI CÍM')}<button class="text-button" type="button" id="copy-address">Szállítási cím átmásolása a számlázáshoz ↓</button>${addressFields('billing','SZÁMLÁZÁSI CÍM')}<button class="primary-button yellow" type="submit">CÍMEK MENTÉSE</button></form>`;}
function favoritePanel(){
 const list=catalogue.products.filter(product=>favorites.has(product.id));
 return `${!state?.authenticated?'<p class="account-description">Ezek a kedvencek ezen az eszközön vannak mentve. Bejelentkezés után a fiókodhoz kapcsolhatod őket.</p>':''}${list.length?`<div class="account-favorites">${list.map(product=>`<article class="account-favorite"><a class="account-favorite-photo" href="/termek/${h(product.id)}" aria-label="${h(product.name)} – teljes termékoldal"><img src="${h(product.image)}" width="88" height="110" alt="${h(product.name)}"></a><div><h3><a href="/termek/${h(product.id)}">${h(product.name)}</a></h3><p>${money(product.priceMinor)}</p><button class="text-button" type="button" data-action="add" data-id="${h(product.id)}">Kosárba +</button></div><button class="favorite-remove" type="button" data-favorite="${h(product.id)}" aria-label="${h(product.name)} eltávolítása a kedvencekből">${heart}</button></article>`).join('')}</div><button class="secondary-button" type="button" id="show-favorite-products">Kedvencek mutatása a terméklistában</button>`:'<div class="account-empty"><h3>AMI BEJÖN, SZÍVEZD BE.</h3><p>Koppints a szívre egy fűszernél. Ide mentjük, hogy legközelebb ne kelljen keresgélned.</p></div>'}`;
}
const fulfillmentLabels={processing:'Feldolgozás alatt',packing:'Csomagolás alatt',shipped:'Feladva',completed:'Teljesítve','on-hold':'Várakozik',cancelled:'Törölve'};
function ordersPanel(){return state.orders.length?`<p class="account-description">A demóban végzett próbavásárlásokat külön jelöljük. Nem jelentenek valódi rendelést vagy fizetést.</p>${state.orders.map(order=>`<details class="order-record"><summary><span><strong>${h(order.number)}</strong><small>${date(order.createdAt)}</small></span><span><strong>${money(order.totalMinor,order.currency)}</strong><small class="status-pill">${order.kind==='demo'?'Próbavásárlás':order.kind==='stripe-test'?'Stripe tesztfizetés':order.status==='paid'?'Fizetve':order.status==='pending-payment'?'Fizetésre vár':h(order.status)}</small></span></summary><ul>${order.items.map(item=>`<li><span>${item.quantity} × ${h(item.name)}</span><strong>${money(item.subtotalMinor,order.currency)}</strong></li>`).join('')}${order.discount?`<li><span>Kupon · ${h(order.discount.code)}</span><strong>−${money(order.discount.discountMinor,order.currency)}</strong></li>`:''}${order.shipping?`<li><span>Szállítás · ${h(order.shipping.label)}</span><strong>${money(order.shipping.feeMinor,order.currency)}</strong></li>`:''}</ul>${order.fulfillmentStatus?`<p class="order-tracking">${h(fulfillmentLabels[order.fulfillmentStatus]||order.fulfillmentStatus)}${order.trackingUrl?`<br><a href="${h(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Csomagkövetés ↗</a>`:''}</p>`:''}</details>`).join('')}`:'<div class="account-empty"><h3>AZ ELSŐ KÖR MÉG ELŐTTED VAN.</h3><p>A fiókhoz mentett rendelések és a megjelölt próbavásárlások itt jelennek meg.</p></div>';}
function invoicesPanel(){return state.invoices.length?state.invoices.map(invoice=>`<article class="invoice-record"><div><h3>${h(invoice.number)}</h3><p>${date(invoice.issuedAt)} · ${money(invoice.totalMinor,invoice.currency)}</p></div><a class="secondary-button" href="${h(invoice.downloadUrl)}">PDF ↓</a></article>`).join(''):'<div class="account-empty"><h3>MÉG NINCS ELÉRHETŐ SZÁMLA.</h3><p>Ha van kiállított számlád, itt tudod letölteni. A próbavásárlásról nem készül számla.</p></div>';}
function settingsPanel(){const requested=state.requests.some(item=>item.kind==='deletion'&&item.status==='pending');return `<div class="account-settings"><h3>BEJELENTKEZÉS</h3><p>${state.authenticationProvider==='google'?'Google-fiókkal vagy bejelentkezve.':'A tárhelyfiókkal vagy bejelentkezve.'}</p>${state.authenticationProvider==='google'?'<button class="secondary-button" type="button" data-google-logout>Kijelentkezés</button>':`<a class="secondary-button" href="${h(state.signOutUrl)}" target="_top">Kijelentkezés</a>`}${state.authenticationProvider!=='google'?'<button type="button" class="text-button" data-use-google>Belépés Google-fiókkal</button>':''}<h3>SAJÁT ADATOK EXPORTÁLÁSA</h3><p>Letöltheted a profilodat, címeidet és a fiókodhoz tartozó archívumadatokat JSON formátumban.</p><a class="secondary-button" href="/api/account/export">Adatok letöltése ↓</a><h3>FIÓKTÖRLÉSI KÉRÉS</h3>${requested?'<p class="account-saved">A törlési kérésed rögzítve van, feldolgozásra vár.</p>':'<p>A kérés rögzítése nem törli azonnal a fiókot vagy a megőrzendő bizonylatokat.</p><form id="delete-request-form"><label class="deletion-consent"><input type="checkbox" required>Kérem a fiókom törlésének feldolgozását.</label><button class="secondary-button" type="submit">Törlési kérés rögzítése</button></form>'}</div>`;}
function renderAccount(){
 syncAccountView();
 const signedIn=Boolean(state?.authenticated);
 const names={profile:'SAJÁT ADATOK',addresses:'CÍMEIM',favorites:'KEDVENCEIM',orders:'RENDELÉSEIM',invoices:'SZÁMLÁIM',settings:'BEÁLLÍTÁSOK'};
 $('#account-title').textContent=signedIn?names[activeTab]:activeTab==='favorites'?'KEDVENCEIM':'BELÉPÉS';
 $('#account-tabs').innerHTML=styleIcons(Object.entries(names).map(([id,name])=>`<button id="account-tab-${id}" type="button" role="tab" aria-controls="account-panel" aria-selected="${activeTab===id}" tabindex="${activeTab===id?0:-1}" data-account-tab="${id}">${name}${id==='favorites'&&favorites.size?` (${favorites.size})`:''}</button>`).join(''));
 $('#account-tabs').hidden=!signedIn;
 if(!signedIn)$('#account-tabs').replaceChildren();
 $('#account-panel').setAttribute('aria-labelledby',`account-tab-${activeTab}`);
 if(!signedIn)$('#account-panel').setAttribute('aria-labelledby','account-title');
 $('#account-identity').textContent=state?.authenticated?(state.user.fullName||state.user.email):status==='loading'?'Fiók betöltése…':'SPICE LABORATORY';
 if(activeTab==='favorites')$('#account-panel').innerHTML=styleIcons(favoritePanel());
 else if(status==='loading')$('#account-panel').innerHTML=styleIcons('<p class="account-description" role="status">Fiók betöltése…</p>');
 else if(status==='unavailable')$('#account-panel').innerHTML=styleIcons('<div class="account-empty"><h3>A FIÓK MOST NEM ELÉRHETŐ.</h3><p>A mentett adataidat nem módosítottuk. Próbáld újra később.</p><button type="button" class="secondary-button" id="retry-account">Újrapróbálás</button></div>');
 else if(!state?.authenticated)$('#account-panel').innerHTML=styleIcons(loginPanel());
 else $('#account-panel').innerHTML=styleIcons(({profile:profilePanel,addresses:addressesPanel,orders:ordersPanel,invoices:invoicesPanel,settings:settingsPanel}[activeTab]||profilePanel)());
 if(!state?.authenticated&&$('#account-dialog').open)mountGoogleLogin($('#account-panel'),afterGoogleLogin);
}
function syncAccountView(){
 const signedIn=Boolean(state?.authenticated),label=signedIn?'Saját fiók':'Belépés';
 $('#open-account')?.setAttribute('aria-label',label+' megnyitása');
 for(const anchor of document.querySelectorAll('a[href="/fiok"]')){
  const text=anchor.querySelector('span');if(text)text.textContent=label;else anchor.textContent=label;
 }
 const root=$('#account-page-login');if(!root)return;
 root.hidden=signedIn;
 if(signedIn)root.replaceChildren();
 else if(!root.querySelector('[data-google-button]'))root.innerHTML=styleIcons(loginPanel());
 for(const node of document.querySelectorAll('[data-account-content]'))node.hidden=!signedIn;
 const heading=$('.page-title');if(heading)heading.innerHTML=signedIn?'KEDVENCEK.<br>RENDELÉSEK. TE.':'BELÉPÉS';
 const lead=$('.page-lead');if(lead)lead.textContent=signedIn?'A mentett fűszereid, a rendeléseid és az adataid. Nem kell mindent újra előkeresned.':'Jelentkezz be a fiókod eléréséhez.';
 if(!signedIn)mountGoogleLogin(root,afterGoogleLogin);
}
async function afterGoogleLogin(){await loadAccount();await refreshCommerceIdentity();renderAccount();window.dispatchEvent(new CustomEvent('spice:account-login'));}
export function openAccount(tab='profile'){
 activeTab=['profile','addresses','favorites','orders','invoices','settings'].includes(tab)?tab:'profile';hideNotice();renderAccount();
 window.dispatchEvent(new window.CustomEvent('spice:open-dialog',{detail:'account-dialog'}));
 if(!state?.authenticated)mountGoogleLogin($('#account-panel'),afterGoogleLogin);
}
export function clearFavoritesFilter(){favoriteOnly=false;const params=new URLSearchParams(location.search);if(params.has('favorites')){params.delete('favorites');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}emit();}
let checkoutRequest=null;
export async function archiveDemoOrder(items,shipping,couponCode){
 const fingerprint=JSON.stringify({items,shipping,couponCode});
 if(!checkoutRequest||checkoutRequest.fingerprint!==fingerprint)checkoutRequest={fingerprint,id:crypto.randomUUID()};
 const result=await api('/demo-orders','POST',{requestId:checkoutRequest.id,items,shipping,couponCode});
 checkoutRequest=null;
 try{state=await api();}catch{}
 return result;
}
export async function initAccount(){
 window.addEventListener('spice:account-refresh',()=>loadAccount().then(()=>renderAccount()).catch(()=>{}));
 $('#open-account').addEventListener('click',()=>openAccount());
 $('#open-favorites').addEventListener('click',()=>openAccount('favorites'));
 document.addEventListener('click',async event=>{
  if(event.target.closest('[data-google-retry]')){mountGoogleLogin(event.target.closest('[data-login-root], #account-panel')||$('#account-panel'),afterGoogleLogin,true);return;}
  if(event.target.closest('[data-google-logout]')){try{await logoutGoogle();await refreshCommerceIdentity();state=null;status='guest';favorites=new Set();emit();renderAccount();}catch(error){notice(error.message,true);}return;}
  if(event.target.closest('[data-use-google]')){state=null;status='guest';activeTab='profile';renderAccount();return;}
  const favorite=event.target.closest('[data-favorite]');if(favorite){await toggleFavorite(favorite.dataset.favorite);return;}
  const tab=event.target.closest('[data-account-tab]');if(tab){activeTab=tab.dataset.accountTab;hideNotice();renderAccount();return;}
  if(event.target.closest('#copy-address'))for(const field of ['recipient','country','postalCode','city','line1','line2'])$(`#billing-${field}`).value=$(`#shipping-${field}`).value;
  if(event.target.closest('#show-favorite-products')){if(!$('.listing-shop')){location.assign('/termekek?favorites=1');return;}favoriteOnly=true;emit();$('#account-dialog').close();$('#termekek').scrollIntoView({block:'start'});}
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
 emit();await loadAccount();syncAccountView();
 if(location.hash==='#fiok')openAccount();
}
