import {escapeHtml as h,defaultFavorite} from '../public/product-markup.mjs';
import {formatMoney} from '../public/money.mjs';
import {unitPrice,purchaseCost} from '../public/product-purchase.mjs';
import {brandIcon} from '../public/brand-icons.mjs';
import {galleryMarkup} from './product-gallery.mjs';

export function productExperience(product,category,config){
 const disabled=product.inStock===false;
 const money=value=>formatMoney(value,'HUF');
 const sale=product.regularPriceMinor>product.priceMinor;
 const {gallery,dialog}=galleryMarkup(product);
 return `<article class="product-page product-experience" data-product-id="${h(product.id)}">
 ${gallery}
 <div class="product-page-info"><p class="section-kicker">${h(category.label)}</p><h1 class="page-title product-page-title">${h(product.name)}</h1><p class="product-page-subtitle">${h(product.subtitle)} <span>· ${product.weightGrams} g</span></p><p class="page-lead product-use">${h(product.description)}</p>
 <div class="purchase-panel" id="product-purchase"><p class="product-page-price">${sale?`<del aria-label="Korábbi ár">${money(product.regularPriceMinor)}</del> `:''}${money(product.priceMinor)}${sale?'<small>Akciós ár</small>':''}</p><p class="unit-price">${h(unitPrice(product))}<span>Szállítási díj nélkül</span></p>
 <div class="product-page-actions"><div class="pdp-quantity"><label for="product-quantity">Mennyiség</label><div><button type="button" data-quantity-step="-1" aria-label="Mennyiség csökkentése" disabled>−</button><input id="product-quantity" type="number" inputmode="numeric" min="1" max="99" step="1" value="1"${disabled?' disabled':''}><button type="button" data-quantity-step="1" aria-label="Mennyiség növelése"${disabled?' disabled':''}>+</button></div></div><button class="primary-button yellow pdp-add" type="button" data-action="add" data-id="${h(product.id)}" data-use-product-quantity${disabled?' disabled':''}>${disabled?'NEM ELÉRHETŐ':'KOSÁRBA '+brandIcon('cart',20)}</button><div data-product-favorite>${defaultFavorite(product)}</div></div>
 <div class="purchase-links"><a href="#product-ingredients">Összetevők és allergének ↓</a><span>Fiók nélkül is menthetsz kedvencet.</span></div>
 <div class="shipping-overview" data-purchase-shipping>${purchaseCost(product,config.shippingMethods)}</div><div class="purchase-help-links"><a href="/szallitas-es-fizetes">Szállítás és fizetés</a><a href="/visszakuldes">Visszaküldés, reklamáció</a><a href="/kapcsolat">Kérdésed van?</a></div>
 ${!config.stripeEnabled?'<p class="store-preview"><strong>Előnézet.</strong> Csak próbavásárlás: valódi rendelést és fizetést nem fogadunk.</p>':config.mode==='test'?'<p class="store-preview"><strong>Stripe tesztmód.</strong> Nem történik valódi pénzmozgás.</p>':''}</div></div></article>
 <div class="mobile-product-buy" data-mobile-buy hidden><div><strong>${h(product.name)}</strong><span><span data-sticky-quantity>1</span> db · <span data-purchase-total>${money(product.priceMinor)}</span></span></div><button class="primary-button yellow" type="button" data-action="add" data-id="${h(product.id)}" data-use-product-quantity${disabled?' disabled':''}>${disabled?'NEM ELÉRHETŐ':'KOSÁRBA '+brandIcon('cart',20)}</button></div>
 ${dialog}
 <script type="application/json" id="purchase-shipping-methods">${JSON.stringify(config.shippingMethods||[]).replace(/</g,'\\u003c')}</script>`;
}
