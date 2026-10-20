import {catalogue} from './catalogue.mjs';
import {purchaseButton,stockRibbon,soldOut} from './stock-state.mjs';
import {escapeHtml as h} from './html-escape.mjs';
import {brandIcon} from './brand-icons.mjs';
let dialog,activeProduct;
function mount(){
 if(dialog)return dialog;
 dialog=document.createElement('dialog');dialog.className='shop-dialog restock-dialog';dialog.setAttribute('aria-labelledby','restock-title');
 document.body.append(dialog);return dialog;
}
function content(product){
 return `<div class="dialog-header"><h2 id="restock-title">SZÓLJATOK, HA VISSZATÉRT.</h2><button type="button" class="icon-button" data-restock-close aria-label="Bezárás">${brandIcon('close',22)}</button></div><div class="restock-content"><p class="restock-product">${h(product.name)}</p><p>Egy e-mailt küldünk, amikor ez a keverék újra elérhető. Az értesítés nem foglal készletet.</p><form data-restock-form><label for="restock-email">E-mail-címed</label><input id="restock-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="pelda@email.hu"><label class="restock-consent"><input name="consent" type="checkbox" required><span>Kérek egyszeri értesítést erről a termékről. Megismertem az <a href="/adatkezeles" target="_blank" rel="noopener">adatkezelési tájékoztatót</a>.</span></label><p class="restock-small">Ez nem hírlevél-feliratkozás. A kérés legfeljebb 180 napig érvényes.</p><button type="submit" class="primary-button restock-button">KÉREM AZ ÉRTESÍTÉST ${brandIcon('mail',20)}</button><p data-restock-status role="status" aria-live="polite"></p></form></div>`;
}
document.addEventListener('click',event=>{
 if(event.target.closest('[data-restock-close]')){dialog?.close();return;}
 const button=event.target.closest('[data-action="restock"]');if(!button)return;
 const product=catalogue.products.find(p=>p.id===button.dataset.id);if(!product)return;
 activeProduct=product;mount().innerHTML=content(product);dialog.showModal();
});
document.addEventListener('submit',async event=>{
 const form=event.target;
 if(!form.matches('[data-restock-form],[data-restock-cancel]'))return;
 event.preventDefault();const button=form.querySelector('[type=submit]'),status=form.querySelector('[data-restock-status]');button.disabled=true;
 try{
  const cancel=form.matches('[data-restock-cancel]'),values=new FormData(form);
  const response=await fetch('/api/commerce/restock'+(cancel?'/cancel':''),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(cancel?{token:form.dataset.restockCancel}:{productId:activeProduct.id,email:values.get('email'),consent:values.has('consent')}),signal:AbortSignal.timeout(16000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Nem sikerült. Próbáld újra.');
  status.textContent=cancel?'A készletértesítőt lemondtad.':'Felírtunk. E-mailben szólunk, amikor újra elérhető.';form.querySelectorAll('input').forEach(input=>input.disabled=true);button.textContent=cancel?'LEMONDVA':'ÉRTESÍTŐ KÉRVE';
 }catch(error){status.textContent=error.message;button.disabled=false;}
});
export function updateStockControls(){
 for(const button of document.querySelectorAll('[data-action="add"],[data-action="restock"]')){
  const p=catalogue.products.find(p=>p.id===button.dataset.id);if(!p)continue;
  const card=!!button.closest('.product-card,.account-favorite'),sticky=!!button.closest('[data-mobile-buy]');button.outerHTML=purchaseButton(p,{card,sticky});
 }
 for(const node of document.querySelectorAll('[data-stock-product],.product-experience')){
  const p=catalogue.products.find(p=>p.id===(node.dataset.stockProduct||node.dataset.productId));if(!p)continue;
  const slot=node.querySelector('.stock-ribbon-slot');if(slot)slot.innerHTML=stockRibbon(p);
  const message=node.querySelector('[data-product-stock-message]');if(message){message.hidden=p.inStock!==false;message.textContent=soldOut(p)?'Elfogyott. Kérj értesítést, és szólunk, amikor újra elérhető.':'A készlet ellenőrzés alatt. Kérj értesítést az elérhetőségről.';}
  const qty=node.querySelector('.pdp-quantity');if(qty)qty.hidden=p.inStock===false;
 }
}
window.addEventListener('spice:stock-change',updateStockControls);
const token=new URLSearchParams(location.hash.slice(1)).get('restockCancel');
if(token&&/^[a-f0-9-]{36}$/.test(token)){
 mount().innerHTML=`<div class="dialog-header"><h2 id="restock-title">KÉSZLETÉRTESÍTŐ</h2><button type="button" class="icon-button" data-restock-close aria-label="Bezárás">${brandIcon('close',22)}</button></div><div class="restock-content"><form data-restock-cancel="${h(token)}"><p>Lemondod az ehhez a termékhez kért értesítést?</p><button type="submit" class="primary-button restock-button">ÉRTESÍTŐ LEMONDÁSA</button><p data-restock-status role="status"></p></form></div>`;dialog.showModal();history.replaceState(null,'',location.pathname+location.search);
}
