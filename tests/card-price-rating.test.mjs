import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productCard} from '../public/product-markup.mjs';
import {seedCatalogue} from '../public/catalogue.mjs';
test('product cards retain price, rating, and purchase action as independent rows',()=>{
 const html=productCard({...seedCatalogue.products[0],reviewCount:3,reviewAverage:4});
 assert.match(html,/class="card-rating"/);assert.match(html,/class="product-price"/);assert.match(html,/Ft/);assert.match(html,/add-button/);
 const css=readFileSync(new URL('../public/shop.css',import.meta.url),'utf8');
 assert.match(css,/grid-row:span 7/);assert.match(css,/card-rating\{grid-row:4/);assert.match(css,/product-price\{grid-row:6/);assert.match(css,/add-button\{grid-row:7/);
});
