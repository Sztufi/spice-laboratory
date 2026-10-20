import {brandIcon} from './brand-icons.mjs';
import { catalogue } from './catalogue.mjs';
import { formatMoney } from './money.mjs';
import {imageAttributes} from './image-attrs.mjs';
import {purchaseButton,stockRibbon} from './stock-state.mjs';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const heartIcon=brandIcon('heart');
export function defaultFavorite(product){return `<button class="favorite-button" type="button" data-favorite="${escapeHtml(product.id)}" aria-pressed="false" aria-label="${escapeHtml(product.name)} hozzáadása a kedvencekhez">${heartIcon}</button>`;}
export function productCard(product,favoriteHtml=defaultFavorite(product),activeCatalogue=catalogue){
 const h=escapeHtml,featured=product.ingredients.filter(item=>!['sea-salt','cane-sugar','brown-sugar','raw-sugar','rapeseed-oil'].includes(item.id)).slice(0,2),rest=product.ingredients.length-featured.length;
 return `<article class="product-card" data-stock-product="${h(product.id)}" style="--product-color:${h(product.color)}"><div class="product-media"><a class="product-visual" href="/termek/${h(product.id)}" aria-label="${h(product.name)} – teljes termékoldal"><img ${imageAttributes(product.thumbnailImage||product.image)} width="500" height="500" loading="lazy" decoding="async" alt="${h(product.thumbnailAlt??product.imageAlt??product.name+' fűszerkeverék')}"><span class="weight-tag">${product.weightGrams} g</span></a><span class="stock-ribbon-slot">${stockRibbon(product)}</span>${favoriteHtml}</div><div class="product-info"><p class="product-subtitle">${h(product.subtitle)}</p><h3 style="margin:0"><a class="product-title" href="/termek/${h(product.id)}">${h(product.name)}</a></h3><ul class="card-ingredients" aria-label="Néhány összetevő">${featured.map(item=>`<li>${h(activeCatalogue.ingredients.find(ingredient=>ingredient.id===item.id)?.label||item.sourceLabel)}</li>`).join('')}<li aria-label="További ${rest} összetevő">+${rest}</li></ul><div class="card-bottom"><p class="product-price">${product.regularPriceMinor>product.priceMinor?`<s class="regular-price">${formatMoney(product.regularPriceMinor,product.currency)}</s> `:''}${formatMoney(product.priceMinor,product.currency)}</p>${purchaseButton(product,{card:true})}</div></article>`;
}
