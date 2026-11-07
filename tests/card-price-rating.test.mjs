import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productCard} from '../public/product-markup.mjs';
import {seedCatalogue} from '../public/catalogue.mjs';
import {productExperience} from '../server/product-experience.mjs';
import {productRating} from '../public/rating-markup.mjs';
test('product heading has a local review anchor without replacing price or purchase controls',()=>{
 const p={...seedCatalogue.products[0],reviewCount:3,reviewAverage:4};
 const html=productExperience(p,seedCatalogue.categories[0],{});
 assert.match(html,/class="product-title-row"/);assert.match(html,/class="product-rating-link" href="#reviews"/);assert.match(html,/4,0/);assert.match(html,/\(3\)/);
 assert.match(html,/product-page-price/);assert.match(html,/2750/);assert.match(html,/product-page-actions/);
 assert.match(productRating({...p,reviewCount:0}),/Még nincs/);
 assert.match(productRating(p,true),/DEMO/);
 const js=readFileSync(new URL('../public/reviews.mjs',import.meta.url),'utf8');assert.match(js,/scrollIntoView/);assert.match(js,/prefers-reduced-motion/);
});
test('product cards retain price, rating, and purchase action as independent rows',()=>{
 const html=productCard({...seedCatalogue.products[0],reviewCount:3,reviewAverage:4});
 assert.match(html,/class="card-rating"/);assert.match(html,/class="product-price"/);assert.match(html,/Ft/);assert.match(html,/add-button/);
 const css=readFileSync(new URL('../public/shop.css',import.meta.url),'utf8');
 assert.match(css,/grid-row:span 7/);assert.match(css,/card-rating\{grid-row:4/);assert.match(css,/product-price\{grid-row:6/);assert.match(css,/add-button\{grid-row:7/);
});
