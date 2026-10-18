import { getCommerceConfig, startStripeCheckout, initCommerce } from './commerce.mjs';
import { initAccount, isFavorite, favoritesFilterEnabled, favoriteProductIds, favoriteButtonMarkup, clearFavoritesFilter, archiveDemoOrder } from './account.mjs';
import { catalogue } from './catalogue.mjs';
import { MAX_QUANTITY, normalize, filterProducts, ingredientFacets, sanitizeCart, setQuantity, cartTotals, readFilters, writeFilters } from './shop-core.mjs';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const icon = (name, size = 20) => {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    bag: '<path d="M6 8h12l2 12H4L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    eye: '<path d="M3 12s3.4-6 9-6 9 6 9 6-3.4 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.7"/>'
  };
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};
const money = minor => `${new Intl.NumberFormat('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} lej`;
const ingredientsById = new Map(catalogue.ingredients.map(item => [item.id, item]));
const productsById = new Map(catalogue.products.map(product => [product.id, product]));
const label = id => ingredientsById.get(id)?.label || id;
const CART_KEY = 'spice-lab-unalmas-kaja:demo-cart:v1';
let filters = readFilters(location.search, catalogue);
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
  const search = writeFilters(filters, location.search);
  try { history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`); } catch { /* Filtering also works without history access. */ }
}

function cardMarkup(product) {
  const featured = product.ingredients.filter(item => !['sea-salt', 'cane-sugar', 'brown-sugar', 'raw-sugar', 'rapeseed-oil'].includes(item.id)).slice(0, 2);
  const rest = product.ingredients.length - featured.length;
  return `<article class="product-card" style="--product-color:${escape(product.color)}">
    <div class="product-media"><button class="product-visual" type="button" data-action="detail" data-id="${escape(product.id)}" aria-label="${escape(product.name)} – termékrészletek" aria-haspopup="dialog">
      <img src="${escape(product.image)}" width="500" height="500" loading="lazy" decoding="async" alt="${escape(product.name)} fűszerkeverék">
      <span class="weight-tag">${product.weightGrams} g</span>
      <span class="product-peek" aria-hidden="true">${icon('eye')}</span>
    </button>${favoriteButtonMarkup(product)}</div>
    <div class="product-info"><p class="product-subtitle">${escape(product.subtitle)}</p>
      <h3 style="margin:0"><button class="product-title" type="button" data-action="detail" data-id="${escape(product.id)}" aria-haspopup="dialog">${escape(product.name)}</button></h3>
      <ul class="card-ingredients" aria-label="Néhány összetevő">${featured.map(item => `<li>${escape(label(item.id))}</li>`).join('')}<li aria-label="További ${rest} összetevő">+${rest}</li></ul>
      <div class="card-bottom"><p class="product-price">${money(product.priceMinor)}</p><button class="add-button" type="button" data-action="add" data-id="${escape(product.id)}" aria-label="${escape(product.name)} kosárba">KOSÁRBA ${icon('plus')}</button></div>
    </div>
  </article>`;
}

function renderCatalogue(updateHistory = true) {
  const focusedCategory = document.activeElement?.dataset.category;
  let results = filterProducts(catalogue.products, filters, catalogue.ingredients);
  if (favoritesFilterEnabled()) results = results.filter(product => isFavorite(product.id));
  $('#product-grid').innerHTML = results.map(cardMarkup).join('');
  $('#product-count').textContent = `${results.length} / ${catalogue.products.length} fűszerkeverék`;
  $('#empty-results').hidden = results.length > 0;
  $('#reset-filters').hidden = !filters.query && !filters.category && !filters.ingredients.length && !favoritesFilterEnabled();
  $('#categories').innerHTML = [{ id: '', label: 'Mind a 10' }, ...catalogue.categories].map(category =>
    `<button class="category-chip" type="button" data-category="${escape(category.id)}" aria-pressed="${filters.category === category.id}">${escape(category.label)}</button>`
  ).join('');
  if (focusedCategory !== undefined) [...document.querySelectorAll('[data-category]')].find(button => button.dataset.category === focusedCategory)?.focus({ preventScroll: true });
  $('#active-filters').innerHTML = filters.ingredients.map(id =>
    `<button class="active-filter" type="button" data-remove-ingredient="${escape(id)}" aria-label="${escape(label(id))} szűrő törlése">${escape(label(id))}${icon('close', 12)}</button>`
  ).join('');
  if (favoritesFilterEnabled()) $('#active-filters').insertAdjacentHTML('beforeend', '<button class="favorite-filter-reset" type="button" id="clear-favorites-filter">Csak kedvencek ×</button>');
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
  const focused = document.activeElement?.dataset.ingredient;
  const query = normalize($('#ingredient-search').value);
  const facets = ingredientFacets(catalogue.products, filters, catalogue.ingredients).filter(item => normalize(item.label).includes(query));
  $('#ingredient-options').innerHTML = facets.length ? facets.map(item => {
    const selected = filters.ingredients.includes(item.id);
    return `<label class="ingredient-option${selected ? ' is-selected' : ''}"><input type="checkbox" data-ingredient="${escape(item.id)}"${selected ? ' checked' : ''}><span>${escape(item.label)}</span><span aria-label="${item.count} termék">${item.count}</span></label>`;
  }).join('') : '<p class="filter-description">Nincs ilyen nevű összetevő.</p>';
  if (focused) [...document.querySelectorAll('[data-ingredient]')].find(input => input.dataset.ingredient === focused)?.focus({ preventScroll: true });
}

function resetFilters() {
  filters = { query: '', category: '', ingredients: [], match: 'all', sort: 'default' };
  $('#product-search').value = '';
  $('#sort-products').value = 'default';
  $('#ingredient-search').value = '';
  clearFavoritesFilter();
  renderCatalogue();
  renderIngredientOptions();
}

function showProduct(id) {
  const product = productsById.get(id);
  if (!product) return;
  $('#product-detail').innerHTML = `
    <img class="product-detail-image" src="${escape(product.image)}" width="500" height="500" alt="${escape(product.name)} fűszerkeverék">
    <p class="detail-kicker">${escape(product.subtitle)}</p><h2 id="detail-title">${escape(product.name)}</h2>
    <p class="detail-description">${escape(product.description)}</p>
    <div class="detail-meta"><span>Kiszerelés: ${product.weightGrams} g</span><strong>${money(product.priceMinor)}</strong></div>
    <h3 class="ingredient-title">MI VAN BENNE? · ${product.ingredients.length} ÖSSZETEVŐ</h3>
    <div class="ingredient-chips">${product.ingredients.map(item => `<button class="ingredient-tag" type="button" data-filter-ingredient="${escape(item.id)}" title="${escape(item.sourceLabel)}" aria-label="Szűrés erre az összetevőre: ${escape(label(item.id))}">${escape(label(item.id))}</button>`).join('')}</div>
    <p class="ingredient-hint">Koppints egy összetevőre, és nézd meg, melyik másik keverékben találod meg.</p>
    <details class="source-details"><summary>Eredeti összetevőlista és adatforrás</summary>
      <p lang="ro">${escape(product.sourceIngredientText)}</p>
      ${product.sourceConflict ? `<div class="source-discrepancy"><strong>Eltérő adatok az eredeti oldalon.</strong><br>A fenti lista a termékoldal látható „Ingrediente” részéből származik. A webáruház termékattribútuma ettől eltér:<p lang="ro">${escape(product.sourceAttributeIngredientText)}</p></div>` : ''}
      ${product.traceStatementOriginal ? `<p>Nyomokban tartalmazhat – eredeti forrásszöveg:<br><span lang="ro">${escape(product.traceStatementOriginal)}</span></p>` : ''}
      <p>A szűrő az összetevőlistán alapul, a nyomokban előforduló allergéneket nem értékeli. Ételallergia esetén az aktuális termékcímkét ellenőrizd.</p>
      <a href="${escape(product.sourceUrl)}" target="_blank" rel="noopener noreferrer">Eredeti termékoldal ↗</a>
    </details>`;
  $('#product-detail-footer').innerHTML = `<button class="primary-button yellow" type="button" data-action="add" data-id="${escape(id)}">KOSÁRBA · ${money(product.priceMinor)} ${icon('plus')}</button>`;
  $('#product-detail').scrollTop = 0;
  openDialog('product-dialog');
}

function addToCart(id) {
  const product = productsById.get(id);
  if (!product) return;
  const previous = cart.find(item => item.id === id)?.quantity || 0;
  if (previous >= MAX_QUANTITY) {
    if ($('#product-dialog').open) $('#product-dialog').close();
    if ($('#account-dialog').open) $('#account-dialog').close();
    toast(`A demóban legfeljebb ${MAX_QUANTITY} db választható termékenként.`);
    return;
  }
  cart = setQuantity(cart, id, previous + 1, catalogue.products);
  persistCart();
  if ($('#product-dialog').open) $('#product-dialog').close();
    if ($('#account-dialog').open) $('#account-dialog').close();
  toast(`${product.name} a kosaradban.`);
}

function renderCart() {
  cartView = 'cart';
  const { lines, count, totalMinor } = cartTotals(cart, catalogue.products);
  $('#cart-title').textContent = count ? `A KOSARAD (${count})` : 'A KOSARAD';
  $('#cart-footer').hidden = !count;
  if (!count) {
    $('#cart-content').innerHTML = `<div class="cart-empty">${icon('bag', 60)}<h3>EGY CSIPET HIÁNYZIK.</h3><p>Még üres a kosarad. Keress egy keveréket, ami feldobja a következő fogást.</p><button class="secondary-button" type="button" data-action="continue">Fűszerek felfedezése ↗</button></div>`;
    $('#cart-footer').innerHTML = '';
    return;
  }
  $('#cart-content').innerHTML = lines.map(({ id, quantity, product, subtotalMinor }) => `
    <article class="cart-item"><img src="${escape(product.image)}" width="82" height="82" alt="${escape(product.name)}">
      <div><h3>${escape(product.name)}</h3><p class="item-meta">${product.weightGrams} g · ${money(product.priceMinor)} / db</p>
        <div class="cart-item-bottom"><div class="quantity-control"><button type="button" data-action="decrease" data-id="${escape(id)}" aria-label="${escape(product.name)} mennyiségének csökkentése">−</button><output aria-label="${escape(product.name)} mennyisége">${quantity}</output><button type="button" data-action="increase" data-id="${escape(id)}" aria-label="${escape(product.name)} mennyiségének növelése"${quantity >= MAX_QUANTITY ? ' disabled' : ''}>+</button></div><button class="remove-item" type="button" data-action="remove" data-id="${escape(id)}" aria-label="${escape(product.name)} törlése a kosárból">Törlés</button></div>
        <p class="cart-line-total">${money(subtotalMinor)}</p></div></article>`
  ).join('');
  $('#cart-footer').innerHTML = `<div class="subtotal-row"><span>Termékek összesen</span><strong>${money(totalMinor)}</strong></div><button class="primary-button yellow" type="button" data-action="checkout">TOVÁBB A PÉNZTÁRHOZ ↗</button><p class="demo-note">${getCommerceConfig().stripeEnabled ? 'Fizetés a Stripe biztonságos felületén.' : 'A Stripe-fizetés előkészítés alatt. Jelenleg próbavásárlás érhető el.'}</p>`;
}

function showCart() {
  renderCart();
  $('#cart-content').scrollTop = 0;
  openDialog('cart-dialog');
}

function showStripeCheckout() {
  const totals = cartTotals(cart,catalogue.products), config=getCommerceConfig();
  if(!totals.count){renderCart();return;}
  cartView='checkout';
  $('#cart-title').textContent=config.mode==='test'?'STRIPE TESZTFIZETÉS':'PÉNZTÁR';
  $('#cart-content').innerHTML=`<button class="checkout-back" type="button" data-action="back-cart">← Vissza a kosárhoz</button><div class="stripe-intro"><span class="section-kicker">BIZTONSÁGOS FIZETÉS</span><h3>MÁR CSAK<br>EGY CSIPET.</h3><p>A szállítási és számlázási adataidat a Stripe fizetési oldalán adhatod meg.</p>${config.mode==='test'?'<p class="demo-banner">Tesztmód · nincs valódi pénzmozgás. Csak Stripe tesztkártyát használj.</p>':''}<p>Jelenleg Románián belüli szállítással rendelhetsz.</p></div><div class="checkout-summary"><h3 class="checkout-title">A VÁLOGATÁSOD</h3><ul>${totals.lines.map(({product,quantity,subtotalMinor})=>`<li><span>${quantity} × ${escape(product.name)}</span><strong>${money(subtotalMinor)}</strong></li>`).join('')}<li><span>Szállítás</span><strong>${money(config.shippingMinor)}</strong></li></ul></div><p class="checkout-error" id="stripe-error" role="alert" hidden></p>`;
  $('#cart-footer').hidden=false;
  $('#cart-footer').innerHTML=`<div class="subtotal-row"><span>Fizetendő összesen</span><strong>${money(totals.totalMinor+config.shippingMinor)}</strong></div><button class="primary-button yellow" type="button" id="stripe-pay">${config.mode==='test'?'STRIPE TESZTFIZETÉS':'FIZETÉS STRIPE-PAL'} ↗</button><p class="demo-note">A bankkártyaadataidat a Stripe kezeli. Hírlevélre külön iratkozhatsz fel.</p>`;
  $('#stripe-pay').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='ÁTIRÁNYÍTÁS…';try{await startStripeCheckout(cart);}catch(error){const message=$('#stripe-error');message.hidden=false;message.textContent=error.message;button.disabled=false;button.textContent='ÚJRAPRÓBÁLOM ↗';}});
  $('#cart-content').scrollTop=0;
}
function showCheckout() {
  if(getCommerceConfig().stripeEnabled){showStripeCheckout();return;}
  const totals = cartTotals(cart, catalogue.products);
  if (!totals.count) { renderCart(); return; }
  cartView = 'checkout';
  $('#cart-title').textContent = 'DEMÓ PÉNZTÁR';
  $('#cart-content').innerHTML = `
    <button class="checkout-back" type="button" data-action="back-cart">← Vissza a kosárhoz</button>
    <div class="demo-banner"><strong>EZ EGY PRÓBAVÁSÁRLÁS.</strong>Nem küldünk rendelést, nem történik fizetés. A mezők mintaadatokkal vannak kitöltve.</div>
    <h3 class="checkout-title">SZÁLLÍTÁSI MINTAADATOK</h3>
    <form class="checkout-form" id="checkout-form" autocomplete="off">
      <label for="demo-name">Teljes név<input id="demo-name" name="demo-name" required maxlength="100" value="Teszt Vásárló" autocomplete="off"></label>
      <label for="demo-email">E-mail<input id="demo-email" name="demo-email" type="email" required maxlength="150" value="teszt@example.com" autocomplete="off"></label>
      <div class="form-row"><label for="demo-postcode">Irányítószám<input id="demo-postcode" name="demo-postcode" required maxlength="12" value="1234" autocomplete="off"></label><label for="demo-city">Város<input id="demo-city" name="demo-city" required maxlength="80" value="Mintaváros" autocomplete="off"></label></div>
      <label for="demo-address">Utca, házszám<input id="demo-address" name="demo-address" required maxlength="160" value="Minta utca 1." autocomplete="off"></label>
    </form>
    <div class="checkout-summary"><h3 class="checkout-title">A VÁLOGATÁSOD</h3><ul>${totals.lines.map(({ product, quantity, subtotalMinor }) => `<li><span>${quantity} × ${escape(product.name)}</span><span>${money(subtotalMinor)}</span></li>`).join('')}</ul><p class="demo-note">A demó csak a termékek összegét számolja. Szállítási díjat nem kalkulál. A megadott adatokat nem küldjük el és nem tároljuk.</p></div>`;
  $('#cart-footer').hidden = false;
  $('#cart-footer').innerHTML = `<div class="subtotal-row"><span>Termékek összesen</span><strong>${money(totals.totalMinor)}</strong></div><button class="primary-button yellow" type="submit" form="checkout-form">DEMÓ RENDELÉS VÉGLEGESÍTÉSE ↗</button><p class="demo-note">Próbavásárlás · nincs fizetési kötelezettség.</p>`;
  $('#cart-content').scrollTop = 0;
}

async function completeDemoOrder(event) {
  event.preventDefault();
  const { count, totalMinor } = cartTotals(cart, catalogue.products);
  if (!count) { renderCart(); return; }
  const submit = document.querySelector('[form="checkout-form"]');
  if (submit?.disabled) return;
  if (submit) submit.disabled = true;
  let archived;
  try { archived = await archiveDemoOrder(cart); }
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
  $('#cart-content').innerHTML = `<div class="confirmation"><div class="confirmation-mark" aria-hidden="true">✓</div><h3>EZ MÁR<br>JÓL KEVEREDIK.</h3><p>A próbavásárlás sikerült.<br>Nem történt fizetés, és nem adtunk le valódi rendelést.</p><div class="confirmation-total">${count} termék · ${money(totalMinor)}</div><p>${archived?.saved ? 'A próbavásárlást megtalálod a fiókod rendelései között.' : 'A kosarad kiürült. Kipróbálhatsz egy új összeállítást is.'}</p>${archived?.saved ? '<button class="text-button" type="button" data-open-orders>Próbavásárlás megtekintése →</button>' : ''}<button class="primary-button" type="button" data-action="continue">VISSZA A FŰSZEREKHEZ ↗</button></div>`;
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
  const filterIngredient = event.target.closest('[data-filter-ingredient]');
  if (filterIngredient) {
    filters = { ...filters, category: '', query: '', ingredients: [filterIngredient.dataset.filterIngredient], match: 'all' };
    $('#product-search').value = '';
    $('#product-dialog').close();
    renderCatalogue();
    $('#termekek').scrollIntoView({ block: 'start' });
    $('#open-filters').focus({ preventScroll: true });
    return;
  }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const { id } = action.dataset;
  switch (action.dataset.action) {
    case 'detail': showProduct(id); break;
    case 'add': addToCart(id); break;
    case 'checkout': showCheckout(); break;
    case 'back-cart': renderCart(); $('#cart-content').scrollTop = 0; break;
    case 'continue':
      $('#cart-dialog').close();
      $('#termekek').scrollIntoView({ block: 'start' });
      $('#product-search').focus({ preventScroll: true });
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
  if (event.target.id === 'checkout-form') completeDemoOrder(event);
});

$('#product-search').addEventListener('input', event => { filters.query = event.target.value; renderCatalogue(); });
$('#sort-products').addEventListener('change', event => { filters.sort = event.target.value; renderCatalogue(); });
$('#ingredient-search').addEventListener('input', renderIngredientOptions);
$('#open-filters').addEventListener('click', () => { renderIngredientOptions(); openDialog('filter-dialog'); });
$('#apply-filters').addEventListener('click', () => $('#filter-dialog').close());
$('#clear-ingredients').addEventListener('click', () => { filters.ingredients = []; renderCatalogue(); renderIngredientOptions(); });
$('#reset-filters').addEventListener('click', resetFilters);
$('#reset-empty').addEventListener('click', resetFilters);
$('#open-cart').addEventListener('click', showCart);
$('#toast-cart').addEventListener('click', showCart);

window.addEventListener('popstate', () => {
  filters = readFilters(location.search, catalogue);
  $('#product-search').value = filters.query;
  $('#sort-products').value = filters.sort;
  renderCatalogue(false);
  if ($('#filter-dialog').open) renderIngredientOptions();
});
window.addEventListener('storage', event => {
  if (event.key !== CART_KEY && event.key !== null) return;
  try { cart = sanitizeCart(JSON.parse(event.newValue || '[]'), catalogue.products); } catch { cart = []; }
  renderCartBadge();
  if ($('#cart-dialog').open && cartView !== 'confirmation') renderCart();
});

$('#product-search').value = filters.query;
$('#sort-products').value = filters.sort;
renderCatalogue(false);
renderCartBadge();

window.addEventListener('spice:favorites-change', () => renderCatalogue(false));
window.addEventListener('spice:open-dialog', event => openDialog(event.detail));
window.addEventListener('spice:notice', event => toast(event.detail, false));
initAccount().catch(() => {});

initCommerce(async result=>{
  if(result.status!=='paid')return;
  let completed=[];try{completed=JSON.parse(localStorage.getItem('spice-lab:completed-payments:v1')||'[]');if(!Array.isArray(completed))completed=[];}catch{}
  // A refreshed or copied return URL must not remove quantities twice.
  if(!completed.includes(result.orderId))for(const item of result.items||[]){const current=cart.find(line=>line.id===item.id);if(current)cart=setQuantity(cart,item.id,current.quantity-item.quantity,catalogue.products);}
  persistCart();try{localStorage.setItem('spice-lab:completed-payments:v1',JSON.stringify([...new Set([...completed,result.orderId])].slice(-50)));}catch{}renderCart();
  window.dispatchEvent(new CustomEvent('spice:account-refresh'));
  $('#cart-title').textContent=result.mode==='test'?'TESZTFIZETÉS SIKERÜLT':'FIZETÉS SIKERÜLT';
  $('#cart-content').innerHTML=`<div class="confirmation"><div class="confirmation-mark" aria-hidden="true">✓</div><h3>KÖSZÖNJÜK<br>A RENDELÉST!</h3><p>${result.mode==='test'?'A Stripe tesztfizetést visszaigazoltuk. Nem történt valódi pénzmozgás.':'A Stripe visszaigazolta a fizetésedet.'}</p><p>A rendelés a saját fiókodban is megtalálható. A fizetési visszaigazolás nem számla.</p><button class="primary-button yellow" type="button" data-open-orders>RENDELÉSEIM →</button></div>`;
  $('#cart-footer').hidden=true;openDialog('cart-dialog');
}).catch(()=>{});
