import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {renderSitePage} from '../server/pages.mjs';
import {escapeHtml} from '../public/product-markup.mjs';
import {catalogue} from '../public/catalogue.mjs';
import {categoryPages,categoryPath} from '../public/page-data.mjs';
const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8');
const paths=['/','/termekek','/kategoriak','/rolunk','/kapcsolat','/gyik','/szallitas-es-fizetes','/visszakuldes','/fiok','/aszf','/adatkezeles','/sutik',...categoryPages.map(item=>categoryPath(item.id)),...catalogue.products.map(item=>'/termek/'+item.id)];
const page=(path,extra={})=>renderSitePage(base,{pathname:path,...extra});
test('all pages have one primary heading, distinct metadata, shared navigation, and working root-relative assets',()=>{
 const titles=new Set();
 for(const path of paths){const {html,status,title}=page(path);assert.equal(status,200,path);assert.equal((html.match(/<h1\b/g)||[]).length,1,path);assert.ok(!titles.has(title),title);titles.add(title);
 assert.ok(html.includes('id="main-content"'));assert.ok(html.includes('id="menu-dialog"'));assert.ok(html.includes('href="/kapcsolat"'));assert.ok(html.includes('src="/shop.mjs"'));assert.ok(html.includes('src="/pages.mjs"'));
 for(const [,asset] of html.matchAll(/(?:src|href)="(\/(?:assets\/[^"?]+|[^/"?]+\.(?:css|mjs)))"/g))assert.ok(existsSync(new URL('../public'+asset,import.meta.url)),path+': '+asset);
 }
});
test('category pages render only matching products on the server and retain their category with search filters',()=>{
 for(const category of categoryPages){const {html}=page(categoryPath(category.id));assert.ok(html.includes(`data-page-category="${category.id}"`));assert.equal((html.match(/class="product-card"/g)||[]).length,catalogue.products.filter(p=>p.categories.includes(category.id)).length);}
 const {html}=page('/kategoria/grill-bbq',{search:'?q=levendula'});assert.equal((html.match(/class="product-card"/g)||[]).length,1);assert.ok(html.includes('href="/termek/bulls-blaze"'));
 const empty=page('/kategoria/martogatosok',{search:'?q=no-match'});assert.equal((empty.html.match(/class="product-card"/g)||[]).length,0);
});
test('product pages expose the real current price and original ingredients without invented stock or reviews',()=>{
 for(const product of catalogue.products){const {html}=page('/termek/'+product.id);assert.ok(html.includes(escapeHtml(product.name)));assert.ok(html.replace(/\s/g,'').includes('2750Ft'));assert.ok(html.includes('data-action="add"'));assert.ok(html.includes('data-product-favorite'));assert.ok(html.includes('Összetevőlista és allergéntájékoztatás'));assert.ok(!html.includes('aggregateRating'));assert.ok(!html.includes('InStock'));}
});
test('unknown pages are actual 404s and query text cannot inject HTML',()=>{
 for(const path of ['/missing','/kategoria/missing','/termek/missing']){assert.equal(page(path).status,404);assert.ok(page(path).html.includes('action="/termekek"'));}
 const {html}=page('/termekek',{search:'?q=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E'});assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
});
test('every internal page link resolves and information pages do not include a hidden duplicate catalogue',()=>{
 for(const path of paths){const {html}=page(path);
 for(const [,href] of html.matchAll(/href="(\/[^"#?]*)[^"\n]*"/g)){if(/\.(css|mjs)$/.test(href)||href.startsWith('/assets/'))continue;assert.equal(page(href).status,200,path+' -> '+href);}
 }
 for(const path of ['/rolunk','/kapcsolat','/gyik','/aszf'])assert.ok(!page(path).html.includes('id="product-grid"'));
});
test('shipping and legal pages disclose missing business settings and never leak provider secrets',()=>{
 const empty=page('/szallitas-es-fizetes');assert.ok(empty.html.includes('még nincsenek véglegesítve'));assert.ok(empty.html.includes('nem jelent díjmentes szállítást'));
 const env={STRIPE_SECRET_KEY:'never-expose-this',OMNISEND_API_KEY:'nor-this',SHIPPING_METHODS_JSON:JSON.stringify([{id:'hu-home',country:'HU',label:'Házhozszállítás',feeMinor:99000,deliveryMinDays:2,deliveryMaxDays:4}])};
 const configured=page('/szallitas-es-fizetes',{env}).html;assert.ok(configured.includes('990 Ft'));assert.ok(configured.includes('2–4 munkanap'));assert.ok(!configured.includes('never-expose-this'));assert.ok(!configured.includes('nor-this'));
 assert.ok(page('/aszf').html.includes('nem helyettesít végleges szerződési feltételeket'));assert.ok(page('/kapcsolat').html.includes('mailto:hello@spicelaboratory.ro'));assert.ok(!page('/kapcsolat').html.includes('Üzenet elküldve'));
});
