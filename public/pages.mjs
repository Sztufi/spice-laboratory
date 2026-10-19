import {styleIcons} from './brand-icons.mjs';
import { openAccount,favoriteButtonMarkup } from './account.mjs';
import { catalogue } from './catalogue.mjs';
import {purchaseQuantity,purchaseCost} from './product-purchase.mjs';
import {formatMoney} from './money.mjs';
import {mountScrollMarquee} from './scroll-marquee.mjs';
for(const band of document.querySelectorAll('[data-scroll-marquee]'))mountScrollMarquee(band);
function paintFavorites(){
 for(const button of document.querySelectorAll('[data-favorite]')){
  if(button.closest('#product-grid')||button.closest('#account-dialog'))continue;
  const product=catalogue.products.find(item=>item.id===button.dataset.favorite);
  if(product)button.outerHTML=favoriteButtonMarkup(product);
 }
}
const menuButton=document.querySelector('#open-menu');
menuButton?.addEventListener('click',()=>{
 window.dispatchEvent(new CustomEvent('spice:open-dialog',{detail:'menu-dialog'}));
 menuButton.setAttribute('aria-expanded','true');
});
document.querySelector('#menu-dialog')?.addEventListener('close',()=>menuButton?.setAttribute('aria-expanded','false'));
document.addEventListener('click',event=>{const button=event.target.closest('[data-open-account-tab]');if(button)openAccount(button.dataset.openAccountTab);});
window.addEventListener('spice:favorites-change',paintFavorites);
paintFavorites();
document.querySelector('[data-toggle-motion]')?.addEventListener('click',event=>{
 const paused=document.body.classList.toggle('motion-paused');
 event.currentTarget.setAttribute('aria-pressed',String(paused));
 event.currentTarget.textContent=paused?'Animáció folytatása':'Animáció szüneteltetése';
 window.dispatchEvent(new Event('spice:motion-change'));
});

// A single quantity source powers both purchase buttons. No external CRO scripts.
const quantityInput=document.querySelector('#product-quantity');
const product=catalogue.products.find(p=>p.id===document.querySelector('[data-product-id]')?.dataset.productId);
if(quantityInput&&product){
 const methods=JSON.parse(document.querySelector('#purchase-shipping-methods')?.textContent||'[]');
 function refreshPurchase(){
  const quantity=purchaseQuantity(quantityInput.value);
  quantityInput.value=String(quantity);
  for(const node of document.querySelectorAll('[data-purchase-total]'))node.textContent=formatMoney(product.priceMinor*quantity,'HUF');
  for(const node of document.querySelectorAll('[data-sticky-quantity]'))node.textContent=String(quantity);
  for(const button of document.querySelectorAll('[data-quantity-step]'))button.disabled=product.inStock===false||(Number(button.dataset.quantityStep)<0?quantity<=1:quantity>=99);
  document.querySelector('[data-purchase-shipping]').innerHTML=styleIcons(purchaseCost(product,methods,quantity));
 }
 quantityInput.addEventListener('change',refreshPurchase);
 document.addEventListener('click',event=>{
  const step=event.target.closest('[data-quantity-step]');
  if(step&&!step.disabled){quantityInput.value=String(purchaseQuantity(quantityInput.value)+Number(step.dataset.quantityStep));refreshPurchase();}
 });
 const zoom=document.querySelector('[data-product-zoom]');
 zoom?.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('spice:open-dialog',{detail:'product-image-dialog'})));
 const sticky=document.querySelector('[data-mobile-buy]');
 const panel=document.querySelector('#product-purchase');
 // Reveal only after the primary purchase panel has passed, never before it.
 if(sticky&&panel&&'IntersectionObserver' in window){
  new window.IntersectionObserver(([entry])=>{
   const visible=!entry.isIntersecting&&entry.boundingClientRect.bottom<0;
   sticky.hidden=!visible;
   document.body.classList.toggle('has-sticky-purchase',visible);
  }).observe(panel);
 }
 refreshPurchase();
}
