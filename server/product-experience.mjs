import {escapeHtml as h,defaultFavorite} from '../public/product-markup.mjs';
import {formatMoney} from '../public/money.mjs';
import {unitPrice} from '../public/product-purchase.mjs';
import {brandIcon} from '../public/brand-icons.mjs';
import {galleryMarkup} from './product-gallery.mjs';
import {purchaseButton,soldOut} from '../public/stock-state.mjs';

export function productExperience(product,category,config){
 const disabled=product.inStock===false;
 const money=value=>formatMoney(value,'HUF');
 const sale=product.regularPriceMinor>product.priceMinor;
 const {gallery,dialog}=galleryMarkup(product);
 return `<article class="product-page product-experience" data-product-id="${h(product.id)}">
 ${gallery}
 <div class="product-page-info"><p class="section-kicker">${h(category.label)}</p><h1 class="page-title product-page-title">${h(product.name)}</h1><p class="product-page-subtitle">${h(product.subtitle)} <span>· ${product.weightGrams} g</span></p><p class="page-lead product-use">${h(product.description)}</p>
 <div class="purchase-panel" id="product-purchase"><p class="product-page-price">${sale?`<del aria-label="Korábbi ár">${money(product.regularPriceMinor)}</del> `:''}${money(product.priceMinor)}${sale?'<small>Akciós ár</small>':''}</p><p class="unit-price">${h(unitPrice(product))}<span>Szállítási díj nélkül</span></p>
 <p class="product-stock-message" data-product-stock-message${disabled?'':' hidden'}>${soldOut(product)?'Elfogyott. Kérj értesítést, és szólunk, amikor újra elérhető.':'A készlet ellenőrzés alatt. Kérj értesítést az elérhetőségről.'}</p>
 <div class="product-page-actions"><div class="pdp-quantity"${disabled?' hidden':''}><label for="product-quantity">Mennyiség</label><div><button type="button" data-quantity-step="-1" aria-label="Mennyiség csökkentése" disabled>−</button><input id="product-quantity" type="number" inputmode="numeric" min="1" max="99" step="1" value="1"${disabled?' disabled':''}><button type="button" data-quantity-step="1" aria-label="Mennyiség növelése"${disabled?' disabled':''}>+</button></div></div>${purchaseButton(product)}<div data-product-favorite>${defaultFavorite(product)}</div></div>
 <div class="purchase-links"><a href="#product-ingredients">Összetevők és allergének ↓</a><span>Fiók nélkül is menthetsz kedvencet.</span></div>
 <aside class="taste-guarantee-card"><span class="taste-guarantee-stamp">ÍZCSERE<br>GARANCIA</span><div class="taste-guarantee-copy"><h2>NEM JÖTT BE?<br>VÁLASSZ MÁSIK ÍZT.</h2><p>Hiszünk abban, amit keverünk. Ha ez az íz nem a te világod, küldd vissza szinte tele — adunk érte 100%-os kupont egy másikra.</p></div><a href="/izcsere-garancia">RÉSZLETEK ÉS FELTÉTELEK →</a></aside>
 </div></div></article>
 <div class="mobile-product-buy" data-mobile-buy hidden><div><strong>${h(product.name)}</strong><span><span data-sticky-quantity>1</span> db · <span data-purchase-total>${money(product.priceMinor)}</span></span></div>${purchaseButton(product,{sticky:true})}</div>
 ${dialog}
 `;
}
