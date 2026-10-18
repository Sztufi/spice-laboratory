import { openAccount,favoriteButtonMarkup } from './account.mjs';
import { catalogue } from './catalogue.mjs';
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
