import {brandIcon} from './brand-icons.mjs';
import {styleIcons} from './brand-icons.mjs';
import { productCard } from './product-markup.mjs';
import { categoryPath } from './page-data.mjs';
import { renderCheckout, checkoutSelection, shippingOverview } from './checkout.mjs';
import { commerceApi } from './commerce.mjs';
import { formatMoney } from './money.mjs';
import {purchaseQuantity} from './product-purchase.mjs';
import { getCommerceConfig, startStripeCheckout, initCommerce } from './commerce.mjs';
import { initAccount, isFavorite, favoritesFilterEnabled, favoriteProductIds, favoriteButtonMarkup, clearFavoritesFilter, archiveDemoOrder } from './account.mjs';
import { catalogue } from './catalogue.mjs';
import { MAX_QUANTITY, normalize, filterProducts, ingredientFacets, sanitizeCart, setQuantity, cartTotals, readFilters, writeFilters } from './shop-core.mjs';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const icon = (name,size=20)=>brandIcon(name,size);
const money = minor => formatMoney(minor, catalogue.currency);
const ingredientsById = new Map(catalogue.ingredients.map(item => [item.id, item]));
const productsById = new Map(catalogue.products.map(product => [product.id, product]));
const label = id => ingredientsById.get(id)?.label || id;
const CART_KEY = 'spice-lab-unalmas-kaja:demo-cart:v1';
const isProductArchive=Boolean($('.listing-shop'));
const pageCategory=document.body.dataset.pageCategory||'';
let filters = readFilters(isProductArchive?location.search:'', catalogue);
if(pageCategory)filters.category=pageCategory;
let cart = [];
let cartView = 'cart';
let toastTimer;

try { cart = sanitizeCart(JSON.parse(localStorage.getItem(CART_KEY) || '[]'), catalogue.products); } catch { /* Keep a usable in-memory cart when storage is blocked or corrupt. */ }

function persistCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Shopping still works for this page session. */ }
  renderCartBadge();
}

function renderCartBadge() {
  const { count } = cartTotals(cart, catalogue.products);
  $('#cart-count').textContent = count;
  $('#open-cart').setAttribute('aria-label', `Kosár megnyitása, ${count} termék`);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('#cart-toast').hidden = true;
}

function toast(message, showCart = true) {
  hideToast();
  $('#toast-message').textContent = message;
  $('#toast-cart').hidden = !showCart;
  $('#cart-toast').hidden = false;
  toastTimer = setTimeout(hideToast, 5000);
}

function openDialog(id) {
  hideToast();
  for (const dialog of document.querySelectorAll('dialog[open]')) {
    if (dialog.id !== id) dialog.close();
  }
  const dialog = document.getElementById(id);
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('dialog-open');
}

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open');
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}

function updateUrl() {
  const search = writeFilters(pageCategory?{...filters,category:''}:filters, location.search);
  try { history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`); } catch { /* Filtering also works without history access. */ }
}

function cardMarkup(product){return productCard(product,favoriteButtonMarkup(product));}

function renderCatalogue(updateHistory = true) {
  if(!$('#product-grid'))return;
  const focusedCategory = document.activeElement?.dataset.category;
  let results = filterProducts(catalogue.products, filters, catalogue.ingredients);
  if (isProductArchive && favoritesFilterEnabled()) results = results.filter(product => isFavorite(product.id));
  $('#product-grid').innerHTML = styleIcons(results.map(cardMarkup).join(''));
  if(!isProductArchive)return;
  const available=pageCategory?catalogue.products.filter(product=>product.categories.includes(pageCategory)).length:catalogue.products.length;
  $('#product-count').textContent = `${results.length} / ${available} fűszerkeverék`;
  $('#empty-results').hidden = results.length > 0;
  $('#reset-filters').hidden = !filters.query && (!filters.category||filters.category===pageCategory) && !filters.ingredients.length && !favoritesFilterEnabled();
  $('#categories').innerHTML = styleIcons([{ id: '', label: 'Összes' }, ...catalogue.categories].map(category =>
    pageCategory?`<a class="category-chip" href="${categoryPath(category.id,catalogue.categories)}"${category.id===pageCategory?' aria-current="page"':''}>${escape(category.label)}</a>`:`<button class="category-chip" type="button" data-category="${escape(category.id)}" aria-pressed="${filters.category === category.id}">${escape(category.label)}</button>`
  ).join(''));
  if (focusedCategory !== undefined) [...document.querySelectorAll('[data-category]')].find(button => button.dataset.category === focusedCategory)?.focus({ preventScroll: true });
  $('#active-filters').innerHTML = styleIcons(filters.ingredients.map(id =>
    `<button class="active-filter" type="button" data-remove-ingredient="${escape(id)}" aria-label="${escape(label(id))} szűrő törlése">${escape(label(id))}${icon('close', 12)}</button>`
  ).join(''));
  if (favoritesFilterEnabled()) $('#active-filters').insertAdjacentHTML('beforeend', styleIcons('<button class="favorite-filter-reset" type="button" id="clear-favorites-filter">Csak kedvencek ×</button>'));
  $('#active-filters').hidden = !filters.ingredients.length && !favoritesFilterEnabled();
  $('#filter-count').textContent = filters.ingredients.length;
  $('#filter-count').hidden = !filters.ingredients.length;
  $('#selected-count').textContent = `${filters.ingredients.length} kiválasztva`;
  $('#apply-filters').textContent = `${results.length} termék megjelenítése`;
  $('#clear-ingredients').disabled = !filters.ingredients.length;
  for (const radio of document.querySelectorAll('[name="ingredient-match"]')) radio.checked = radio.value === filters.match;
  if (updateHistory) updateUrl();
}

function renderIngredientOptions() {
  if(!$('#ingredient-search'))return;
  const focused = document.activeElement?.dataset.ingredient;
  const query = normalize($('#ingredient-search').value);
  const facets = ingredientFacets(catalogue.products, filters, catalogue.ingredients).filter(item => normalize(item.label).includes(query));
  $('#ingredient-options').innerHTML = styleIcons(facets.length ? facets.map(item => {
    const selected = filters.ingredients.includes(item.id);
    return `<label class="ingredient-option${selected ? ' is-selected' : ''}"><input type="checkbox" data-ingredient="${escape(item.id)}"${selected ? ' checked' : ''}><span>${escape(item.label)}</span><span aria-label="${item.count} termék">${item.count}</span></label>`;
  }).join('') : '<p class="filter-description">Nincs ilyen nevű összetevő.</p>');
  if (focused) [...document.querySelectorAll('[data-ingredient]')].find(input => input.dataset.ingredient === focused)?.focus({ preventScroll: true });
}

function resetFilters() {
  filters = { query: '', category: pageCategory, ingredients: [], match: 'all', sort: 'default' };
  $('#product-search').value = '';
  $('#sort-products').value = 'default';
  $('#ingredient-search').value = '';
  clearFavoritesFilter();
  renderCatalogue();
  renderIngredientOptions();
}

function addToCart(id, requestedQuantity=1) {
  const product = productsById.get(id);
  if (!product) return;
  if(product.inStock===false){toast('Ez a termék átmenetileg nem elérhető.',false);return;}
  const previous = cart.find(item => item.id === id)?.quantity || 0;
  if (previous >= MAX_QUANTITY) {
    if ($('#account-dialog').open) $('#account-dialog').close();
    toast(`A demóban legfeljebb ${MAX_QUANTITY} db választható termékenként.`);
    return;
  }
  const added=Math.min(purchaseQuantity(requestedQuantity),MAX_QUANTITY-previous);
  cart = setQuantity(cart, id, previous + added, catalogue.products);
  persistCart();
  if ($('#account-dialog').open) $('#account-dialog').close();
  toast(`${added} db ${product.name} a kosaradban.${added<purchaseQuantity(requestedQuantity)?' Elérted a termékenkénti 99 db-os korlátot.':''}`);
}

function renderCart() {
  cartView = 'cart';
  const { lines, count, totalMinor } = cartTotals(cart, catalogue.products);
  $('#cart-title').textContent = count ? `A KOSARAD (${count})` : 'A KOSARAD';
  $('#cart-footer').hidden = !count;
  if (!count) {
    $('#cart-content').innerHTML = styleIcons(`<div class="cart-empty">${icon('bag', 60)}<h3>IDE MÉG KELL EGY KIS ÍZ.</h3><p>Még üres a kosarad. Nézz ki egy keveréket a következő kajádhoz, és tedd ide.</p><button class="secondary-button" type="button" data-action="continue">MUTASD A FŰSZEREKET ↗</button></div>`);
    $('#cart-footer').innerHTML = styleIcons('');
    return;
  }
  $('#cart-content').innerHTML = styleIcons(lines.map(({ id, quantity, product, subtotalMinor }) => `
    <article class="cart-item"><img src="${escape(product.image)}" width="82" height="82" alt="${escape(product.name)}">
      <div><h3>${escape(product.name)}</h3><p class="item-meta">${product.weightGrams} g · ${money(product.priceMinor)} / db</p>
        <div class="cart-item-bottom"><div class="quantity-control"><button type="button" data-action="decrease" data-id="${escape(id)}" aria-label="${escape(product.name)} mennyiségének csökkentése">−</button><output aria-label="${escape(product.name)} mennyisége">${quantity}</output><button type="button" data-action="increase" data-id="${escape(id)}" aria-label="${escape(product.name)} mennyiségének növelése"${quantity >= MAX_QUANTITY ? ' disabled' : ''}>+</button></div><button class="remove-item" type="button" data-action="remove" data-id="${escape(id)}" aria-label="${escape(product.name)} törlése a kosárból">Törlés</button></div>
        <p class="cart-line-total">${money(subtotalMinor)}</p></div></article>`
  ).join(''));
  $('#cart-content').insertAdjacentHTML('beforeend',styleIcons(shippingOverview(getCommerceConfig(),totalMinor)));
  $('#cart-footer').innerHTML = styleIcons(`<div class="subtotal-row"><span>Termékek összesen</span><strong>${money(totalMinor)}</strong></div><button class="primary-button yellow" type="button" data-action="checkout">TOVÁBB A PÉNZTÁRHOZ ↗</button><p class="demo-note">${getCommerceConfig().stripeEnabled ? 'Fizetés a Stripe biztonságos felületén.' : 'A Stripe-fizetés előkészítés alatt. Jelenleg próbavásárlás érhető el.'}</p>`);
}

function showCart() {
  renderCart();
  $('#cart-content').scrollTop = 0;
  openDialog('cart-dialog');
}

function showCheckout() {
 const totals=cartTotals(cart,catalogue.products);if(!totals.count){renderCart();return;}
 cartView='checkout';
 renderCheckout({totals,config:getCommerceConfig(),onPay:selection=>startStripeCheckout(cart,selection),onAccount:()=>document.querySelector('#open-account').click(),onCoupon:code=>commerceApi('coupon-quote',{method:'POST',body:JSON.stringify({code,items:cart})})});
 $('#cart-content').scrollTop=0;
}

async function completeDemoOrder(event) {
  event.preventDefault();
  const { count, totalMinor:subtotalMinor } = cartTotals(cart, catalogue.products);
  const selection=checkoutSelection(getCommerceConfig(),subtotalMinor);const totalMinor=subtotalMinor-selection.discountMinor+(selection.quote?.feeMinor||0);
  if (!count) { renderCart(); return; }
  const submit = document.querySelector('[form="checkout-form"]');
  if (submit?.disabled) return;
  if (submit) submit.disabled = true;
  let archived;
  try { archived = selection.checkoutMode==='account'?await archiveDemoOrder(cart,selection.quote?{country:selection.country,shippingMethodId:selection.methodId}:undefined,selection.couponCode):{saved:false}; }
  catch (error) {
    if (submit) submit.disabled = false;
    $('#cart-content .checkout-error')?.remove();
    const message = document.createElement('p'); message.className = 'checkout-error'; message.setAttribute('role','alert'); message.textContent = error.message || 'Nem sikerült az archívumba menteni. A kosarad megmaradt.';
    $('#cart-content').prepend(message); $('#cart-content').scrollTop = 0;
    return;
  }
  cart = [];
  persistCart();
  cartView = 'confirmation';
  $('#cart-title').textContent = 'PRÓBA TELJESÍTVE';
  $('#cart-content').innerHTML = styleIcons(`<div class="confirmation"><div class="confirmation-mark" aria-hidden="true">✓</div><h3>A PRÓBA KÉSZ.<br>A FŐZÉS MÉG RÁÉR.</h3><p>A próbavásárlás sikerült.<br>Nem történt fizetés, és nem adtunk le valódi rendelést.</p><div class="confirmation-total">${count} termék · ${money(totalMinor)}</div><p>${archived?.saved ? 'A próbavásárlást megtalálod a fiókod rendelései között.' : 'A kosarad kiürült. Kipróbálhatsz egy új összeállítást is.'}</p>${archived?.saved ? '<button class="text-button" type="button" data-open-orders>Próbavásárlás megtekintése →</button>' : ''}<button class="primary-button" type="button" data-action="continue">VISSZA A FŰSZEREKHEZ ↗</button></div>`);
  $('#cart-footer').hidden = true;
  $('#cart-content').scrollTop = 0;
  $('#cart-content [data-action="continue"]').focus({ preventScroll: true });
}

document.addEventListener('click', event => {
  if (event.target.closest('#clear-favorites-filter')) { clearFavoritesFilter(); return; }
  const close = event.target.closest('[data-close]');
  if (close) { document.getElementById(close.dataset.close)?.close(); return; }
  const category = event.target.closest('[data-category]');
  if (category) { filters.category = category.dataset.category; renderCatalogue(); return; }
  const removeIngredient = event.target.closest('[data-remove-ingredient]');
  if (removeIngredient) {
    filters.ingredients = filters.ingredients.filter(id => id !== removeIngredient.dataset.removeIngredient);
    renderCatalogue();
    $('#open-filters').focus({ preventScroll: true });
    return;
  }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const { id } = action.dataset;
  switch (action.dataset.action) {
    case 'add': addToCart(id,action.hasAttribute('data-use-product-quantity')?$('#product-quantity')?.value:1); break;
    case 'checkout': showCheckout(); break;
    case 'back-cart': renderCart(); $('#cart-content').scrollTop = 0; break;
    case 'continue':
      $('#cart-dialog').close();
      if($('#termekek')){$('#termekek').scrollIntoView({ block: 'start' });$('#product-search')?.focus({ preventScroll: true });}else location.assign('/termekek');
      break;
    case 'decrease':
    case 'increase':
    case 'remove': {
      const previous = cart.find(item => item.id === id)?.quantity || 0;
      const quantity = action.dataset.action === 'remove' ? 0 : previous + (action.dataset.action === 'increase' ? 1 : -1);
      const actionName = action.dataset.action;
      cart = setQuantity(cart, id, quantity, catalogue.products);
      persistCart();
      renderCart();
      const nextFocus = [...$('#cart-content').querySelectorAll('[data-action]')].find(button => button.dataset.id === id && button.dataset.action === actionName && !button.disabled);
      (nextFocus || $('#cart-content [data-action]') || $('#cart-dialog [data-close]')).focus({ preventScroll: true });
      break;
    }
  }
});

document.addEventListener('change', event => {
  if (event.target.matches('[data-ingredient]')) {
    const id = event.target.dataset.ingredient;
    const selected = new Set(filters.ingredients);
    event.target.checked ? selected.add(id) : selected.delete(id);
    filters.ingredients = [...selected];
    renderCatalogue();
    renderIngredientOptions();
  }
  if (event.target.matches('[name="ingredient-match"]')) {
    filters.match = event.target.value;
    renderCatalogue();
  }
});

document.addEventListener('submit', event => {
  if (event.target.id === 'checkout-form') {
    if(getCommerceConfig().stripeEnabled){event.preventDefault();$('#stripe-pay')?.click();}
    else completeDemoOrder(event);
  }
});

$('#product-search')?.addEventListener('input', event => { filters.query = event.target.value; renderCatalogue(); });
$('#sort-products')?.addEventListener('change', event => { filters.sort = event.target.value; renderCatalogue(); });
$('#ingredient-search')?.addEventListener('input', renderIngredientOptions);
$('#open-filters')?.addEventListener('click', () => { renderIngredientOptions(); openDialog('filter-dialog'); });
$('#apply-filters')?.addEventListener('click', () => $('#filter-dialog').close());
$('#clear-ingredients')?.addEventListener('click', () => { filters.ingredients = []; renderCatalogue(); renderIngredientOptions(); });
$('#reset-filters')?.addEventListener('click', resetFilters);
$('#reset-empty')?.addEventListener('click', resetFilters);
$('#open-cart').addEventListener('click', showCart);
$('#toast-cart').addEventListener('click', showCart);

window.addEventListener('popstate', () => {
  filters = readFilters(isProductArchive?location.search:'', catalogue);
  if(pageCategory)filters.category=pageCategory;
  if($('#product-search'))$('#product-search').value = filters.query;
  if($('#sort-products'))$('#sort-products').value = filters.sort;
  renderCatalogue(false);
  if ($('#filter-dialog')?.open) renderIngredientOptions();
});
window.addEventListener('storage', event => {
  if (event.key !== CART_KEY && event.key !== null) return;
  try { cart = sanitizeCart(JSON.parse(event.newValue || '[]'), catalogue.products); } catch { cart = []; }
  renderCartBadge();
  if ($('#cart-dialog').open && cartView !== 'confirmation') renderCart();
});

if($('#product-search'))$('#product-search').value = filters.query;
if($('#sort-products'))$('#sort-products').value = filters.sort;
if(pageCategory&&$('#reset-empty'))$('#reset-empty').textContent='Kategória összes terméke';
renderCatalogue(false);
renderCartBadge();

window.addEventListener('spice:commerce-ready',()=>{if(cartView==='checkout')showCheckout();});
window.addEventListener('spice:favorites-change', () => renderCatalogue(false));
window.addEventListener('spice:open-dialog', event => openDialog(event.detail));
window.addEventListener('spice:notice', event => toast(event.detail, false));
initAccount().catch(() => {});

initCommerce(async result=>{
  if(result.status!=='paid')return;
  let completed=[];try{completed=JSON.parse(localStorage.getItem('spice-lab:completed-payments:v1')||'[]');if(!Array.isArray(completed))completed=[];}catch{}
  // A refreshed or copied return URL must not remove quantities twice.
  if(!completed.includes(result.orderId))for(const item of result.items||[]){const current=cart.find(line=>line.id===item.id);if(current)cart=setQuantity(cart,item.id,current.quantity-item.quantity,catalogue.products);}
  persistCart();try{localStorage.setItem('spice-lab:completed-payments:v1',JSON.stringify([...new Set([...completed,result.orderId])].slice(-50)));}catch{}renderCart();cartView='confirmation';
  window.dispatchEvent(new CustomEvent('spice:account-refresh'));
  $('#cart-title').textContent=result.mode==='test'?'TESZTFIZETÉS SIKERÜLT':'FIZETÉS SIKERÜLT';
  $('#cart-content').innerHTML=styleIcons(`<div class="confirmation"><div class="confirmation-mark" aria-hidden="true">✓</div><h3>${result.mode==='test'?'A TESZTFIZETÉS SIKERÜLT.':'EZ JÓ VÁLASZTÁS VOLT.<br>KÖSZÖNJÜK A RENDELÉST!'}</h3><p>${result.mode==='test'?'A Stripe tesztfizetést visszaigazoltuk. Nem történt valódi pénzmozgás.':'A Stripe visszaigazolta a fizetésedet.'}</p><p>${result.guest?'A vendégrendelésedet külön hozzákapcsolhatod a fiókodhoz.':'A rendelés a saját fiókodban is megtalálható.'} A fizetési visszaigazolás nem számla.</p>${result.shipping?`<p>${escape(result.shipping.label)} · ${money(result.shipping.feeMinor)}<br>Várható kézbesítés: ${result.shipping.deliveryMinDays}–${result.shipping.deliveryMaxDays} munkanap</p>`:''}${result.guest?'<p>Vendégként vásároltál. A fiók létrehozása opcionális.</p><button class="secondary-button" type="button" id="claim-guest-order">RENDELÉS HOZZÁADÁSA A FIÓKOMHOZ →</button><p id="claim-order-status" role="status"></p>':'<button class="primary-button yellow" type="button" data-open-orders>RENDELÉSEIM →</button>'}</div>`);
  $('#cart-footer').hidden=true;openDialog('cart-dialog');
  $('#claim-guest-order')?.addEventListener('click',async event=>{
   const button=event.currentTarget;button.disabled=true;const status=$('#claim-order-status');
   try{await commerceApi('claim-order',{method:'POST',body:JSON.stringify({sessionId:result.sessionId})});status.textContent='A rendelést hozzáadtuk a bejelentkezett fiókodhoz.';window.dispatchEvent(new CustomEvent('spice:account-refresh'));button.remove();}
   catch(error){status.textContent=error.message;button.disabled=false;if(error.status===401)status.insertAdjacentHTML('beforeend',styleIcons(` <a target="_top" href="/signin-with-chatgpt?return_to=${encodeURIComponent('/?payment=success&session_id='+result.sessionId)}">Bejelentkezés és visszatérés a rendeléshez →</a>`));}
  });
}).catch(()=>{});
