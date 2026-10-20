import {brandIcon} from './brand-icons.mjs';
import {escapeHtml as h} from './html-escape.mjs';
// Keep the customer-facing state consistent: if a product cannot be bought,
// its card and gallery must show the same unavailable state.
export const soldOut=product=>product.inStock===false;
export const stockRibbon=product=>soldOut(product)?'<span class="sold-out-ribbon">ELFOGYOTT!</span>':'';
export function purchaseButton(product,{card=false,sticky=false}={}){
 const unavailable=product.inStock===false;
 const label=unavailable?(card?'KÉREK ÉRTESÍTÉST':sticky?'ÉRTESÍTS!':'ÉRTESÍTS, HA ÚJRA ELÉRHETŐ'):'KOSÁRBA';
 const cls=card?'add-button':`primary-button ${unavailable?'restock-button':'yellow'}${sticky?'':' pdp-add'}`;
 return `<button class="${cls}${unavailable?' restock-button':''}" type="button" data-action="${unavailable?'restock':'add'}" data-id="${h(product.id)}"${!card?' data-use-product-quantity':''} aria-label="${h(product.name)} – ${unavailable?'készletértesítő kérése':'kosárba'}">${label} ${brandIcon(unavailable?'mail':'cart',20)}</button>`;
}
