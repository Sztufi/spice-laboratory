import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { catalogue } from '../dist/catalogue.mjs';
import { filterProducts, ingredientFacets, sanitizeCart, setQuantity, cartTotals, readFilters, writeFilters } from '../dist/shop-core.mjs';

const { products, ingredients } = catalogue;
const select = options => filterProducts(products, options, ingredients).map(product => product.id);

test('all ten verified products have separately structured ingredients and local images', () => {
  assert.equal(products.length, 10);
  assert.equal(ingredients.length, 38);
  assert.equal(new Set(products.map(product => product.id)).size, 10);
  const known = new Set(ingredients.map(item => item.id));
  for (const product of products) {
    const original = product.sourceIngredientText.split(',').map(item => item.replace(/^[\s.;,]+|[\s.;,]+$/g, '')).filter(Boolean);
    assert.deepEqual(product.ingredients.map(item => item.sourceLabel), original);
    assert.ok(product.ingredients.every(item => known.has(item.id)));
    assert.equal(new Set(product.ingredients.map(item => item.id)).size, product.ingredients.length);
    assert.ok(existsSync(new URL(`../dist/${product.image}`, import.meta.url)));
    assert.ok(Number.isSafeInteger(product.priceMinor) && product.priceMinor > 0);
    assert.equal(new URL(product.sourceUrl).hostname, 'spicelaboratory.ro');
  }
  assert.deepEqual(products.filter(product => product.sourceConflict).map(product => product.id), ['rooster-booster', 'redneck-dust']);
});

test('individual ingredients use the visible source list, including distinctive ingredients', () => {
  assert.deepEqual(select({ ingredients: ['lavender'] }), ['bulls-blaze']);
  assert.deepEqual(select({ ingredients: ['celery'] }), ['grill-salt']);
  assert.deepEqual(select({ ingredients: ['lemon-peel'] }), ['rooster-booster', 'sweet-onion']);
  assert.deepEqual(select({ ingredients: ['mustard'] }), ['rooster-booster', 'fries-salt', 'redneck-dust', 'cajun-mix', 'sweet-onion']);
});

test('multiple ingredient filters support intersection and union with category filtering', () => {
  assert.deepEqual(select({ ingredients: ['lavender', 'lemon-peel'], match: 'all' }), []);
  assert.deepEqual(select({ ingredients: ['lavender', 'lemon-peel'], match: 'any' }), ['rooster-booster', 'bulls-blaze', 'sweet-onion']);
  assert.deepEqual(select({ category: 'dip', ingredients: ['garlic'] }), ['grr-lick', 'sweet-onion']);
});

test('search works with Hungarian accents and Romanian ingredient names', () => {
  assert.deepEqual(select({ query: 'citromhej' }), ['rooster-booster', 'sweet-onion']);
  assert.deepEqual(select({ query: 'levendula' }), ['bulls-blaze']);
  assert.deepEqual(select({ query: 'lavandă' }), ['bulls-blaze']);
  assert.deepEqual(select({ query: 'nemletezoiz' }), []);
});

test('sorting leaves the original catalogue unchanged', () => {
  const before = products.map(product => product.id);
  const sorted = filterProducts(products, { sort: 'weight' }, ingredients);
  assert.equal(sorted[0].id, 'chimichurri');
  assert.equal(sorted.at(-1).id, 'fries-salt');
  assert.deepEqual(products.map(product => product.id), before);
});

test('ingredient facet counts respect search and categories', () => {
  const counts = new Map(ingredientFacets(products, { category: 'dip' }, ingredients).map(item => [item.id, item.count]));
  assert.equal(counts.get('garlic'), 2);
  assert.equal(counts.get('mustard'), 1);
  assert.equal(counts.get('lavender'), 0);
});

test('corrupt storage and unrecognized product IDs cannot enter the cart', () => {
  assert.deepEqual(sanitizeCart(null, products), []);
  assert.deepEqual(sanitizeCart({ id: 'fries-salt', quantity: 2 }, products), []);
  assert.deepEqual(sanitizeCart([
    null, { id: 'unknown', quantity: 3 }, { id: 'fries-salt', quantity: -1 },
    { id: 'rooster-booster', quantity: '3' }, { id: 'fries-salt', quantity: Infinity },
    { id: 'fries-salt', quantity: 1.9 }, { id: 'fries-salt', quantity: 2 }
  ], products), [{ id: 'fries-salt', quantity: 3 }]);
});

test('cart quantity changes, removals and limits are consistent', () => {
  let cart = setQuantity([], 'fries-salt', 2, products);
  cart = setQuantity(cart, 'bulls-blaze', 1, products);
  cart = setQuantity(cart, 'fries-salt', 3, products);
  assert.deepEqual(cart, [{ id: 'fries-salt', quantity: 3 }, { id: 'bulls-blaze', quantity: 1 }]);
  assert.equal(setQuantity(cart, 'fries-salt', 1000, products)[0].quantity, 99);
  assert.deepEqual(setQuantity(cart, 'fries-salt', 0, products), [{ id: 'bulls-blaze', quantity: 1 }]);
  assert.deepEqual(setQuantity(cart, 'unknown', 2, products), cart);
  assert.deepEqual(setQuantity(cart, 'fries-salt', NaN, products), cart);
});

test('totals use integer catalogue prices instead of untrusted stored prices', () => {
  const result = cartTotals([{ id: 'fries-salt', quantity: 2, priceMinor: 1 }, { id: 'bulls-blaze', quantity: 1 }], products);
  assert.equal(result.count, 3);
  assert.equal(result.totalMinor, 11700);
  assert.equal(result.lines[0].subtotalMinor, 7800);
  assert.equal(cartTotals([], products).totalMinor, 0);
});

test('filter URLs round-trip, reject invalid values and preserve unrelated parameters', () => {
  const parsed = readFilters('?q=Citromh%C3%A9j&category=dip&ingredient=lemon-peel&ingredient=bad&ingredient=lemon-peel&match=any&sort=weight', catalogue);
  assert.deepEqual(parsed, { query: 'Citromhéj', category: 'dip', ingredients: ['lemon-peel'], match: 'any', sort: 'weight' });
  const written = writeFilters(parsed, '?utm_source=test&ingredient=bad');
  assert.equal(new URLSearchParams(written).get('utm_source'), 'test');
  assert.deepEqual(readFilters(written, catalogue), parsed);
  const invalid = readFilters('?category=missing&sort=missing&ingredient=missing&match=missing', catalogue);
  assert.deepEqual(invalid, { query: '', category: '', ingredients: [], match: 'all', sort: 'default' });
});

test('the page points to its own catalogue and has no external checkout submission', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('class="cta" href="#termekek"'));
  assert.ok(html.includes('type="module" src="shop.mjs"'));
  assert.ok(!/<form[^>]+action="https?:/i.test(html));
});
