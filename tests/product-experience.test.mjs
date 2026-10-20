import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSitePage} from '../server/pages.mjs';
import {seedCatalogue} from '../public/catalogue.mjs';
import {purchaseQuantity,purchaseCost,unitPrice} from '../public/product-purchase.mjs';
import {formatMoney} from '../public/money.mjs';
const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8');
const product=seedCatalogue.products[0];
const method={id:'hu',country:'HU',label:'Házhozszállítás',feeMinor:99000,freeAboveMinor:500000,deliveryMinDays:2,deliveryMaxDays:4};

test('purchase quantities are finite integers within cart limits, including hostile and blank input',()=>{
 for(const [input,expected] of [['',1],[-3,1],[0,1],[2.9,2],['3',3],[999,99],[Infinity,1],['bad',1]])assert.equal(purchaseQuantity(input),expected);
});
test('unit prices derive from actual weight and current price, including edited sale prices',()=>{
 assert.equal(unitPrice({weightGrams:160,priceMinor:275000}),'1718,75 Ft / 100 g');
 assert.equal(unitPrice({weightGrams:200,priceMinor:199000}),'995 Ft / 100 g');
 assert.equal(unitPrice({weightGrams:0,priceMinor:199000}),'');
});
test('purchase estimate uses selected quantity, cheapest approved country method and free threshold',()=>{
 const methods=[method,{...method,id:'ro',country:'RO',feeMinor:0},{...method,id:'hu-expensive',feeMinor:200000,freeAboveMinor:undefined}];
 assert.ok(purchaseCost(product,methods,1).includes(formatMoney(product.priceMinor+99000,'HUF')));
 const two=purchaseCost(product,methods,2);
 assert.ok(two.includes(formatMoney(product.priceMinor*2,'HUF')));
 assert.ok(two.includes('0 Ft'));
 assert.ok(purchaseCost(product,[],1).includes('nem számítható ki'));
 assert.ok(!purchaseCost(product,[methods[1]],1).includes('0 Ft'));
 assert.ok(purchaseCost(product,[{...method,label:'<img src=x onerror=alert(1)>'}]).includes('&lt;img'));
});
test('edited merchant product keeps its price and safe markup, and replaces both sold-out purchase CTAs with notifications',()=>{
 const changed={...product,id:'merchant-product',name:'<script>merchant</script>',priceMinor:199000,regularPriceMinor:275000,inStock:false};
 const catalogue={...seedCatalogue,products:[changed,...seedCatalogue.products.slice(1)]};
 const {html,status}=renderSitePage(base,{pathname:'/termek/merchant-product',catalogue});
 assert.equal(status,200);assert.ok(html.includes('1990 Ft'));assert.ok(html.includes('<del aria-label="Korábbi ár">2750 Ft</del>'));
 assert.equal((html.match(/data-action="restock" data-id="merchant-product"/g)||[]).length,2);
 assert.ok(!html.includes('data-action="add" data-id="merchant-product"'));
 assert.match(html,/ELFOGYOTT!/);
 assert.ok(html.includes('id="product-quantity"'));assert.ok(html.includes('id="product-ingredients"'));
 assert.ok(html.includes('<details class="source-details" open>'));
 assert.ok(!html.includes('<script>merchant</script>'));assert.ok(!html.includes('aggregateRating'));
});
test('homepage explains offer and prioritizes catalogue, then real recipe ideas without archive filters',()=>{
 const {html}=renderSitePage(base,{pathname:'/'});
 assert.ok(html.includes('class="hero-description"'));assert.ok(html.includes('class="hero-actions"'));
 assert.ok(html.indexOf('class="hero-actions"')<html.indexOf('id="product-grid"'));
 assert.ok(html.indexOf('id="product-grid"')<html.indexOf('id="home-recipes-title"'));
 assert.ok(html.indexOf('id="home-recipes-title"')<html.indexOf('id="newsletter-form"'));
 assert.ok(html.includes('data-toggle-motion'));assert.ok(!html.includes('id="product-search"'));
 assert.ok(!html.includes('id="sort-products"'));assert.ok(!html.includes('id="filter-dialog"'));
 assert.ok(html.includes('width="1225" height="1284" fetchpriority="high"'));
});
