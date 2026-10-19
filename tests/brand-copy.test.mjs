import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSitePage} from '../server/pages.mjs';
import {seedCatalogue} from '../public/catalogue.mjs';
import {categoryPages,categoryPath} from '../public/page-data.mjs';
import {recipeSeeds} from '../public/recipe-data.mjs';
import {ingredientDetails,ingredientTextHu} from '../public/ingredient-copy.mjs';
const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8');
const paths=['/','/termekek','/kategoriak','/rolunk','/kapcsolat','/gyik','/szallitas-es-fizetes','/visszakuldes','/fiok','/aszf','/adatkezeles','/sutik','/blog','/missing',...seedCatalogue.products.map(p=>'/termek/'+p.id),...categoryPages.map(c=>categoryPath(c.id)),...recipeSeeds.map(r=>'/blog/'+r.id)];
test('the independent Hungarian storefront has no Romanian shop links, cross-shop narrative or injected source links',()=>{
 for(const path of paths){
  const {html}=renderSitePage(base,{pathname:path});
  assert.ok(!/https?:\/\/(?:www\.)?spicelaboratory\.ro/i.test(html),path);
  assert.ok(!/román webshop|román oldal|melyik webshopban|eredeti termékoldal/i.test(html),path);
  assert.ok(!html.includes('"sourceUrl"'),path);
  assert.ok(html.includes('mailto:hello@spicelaboratory.ro'),path+' retains real service email');
 }
 const script=readFileSync(new URL('../public/shop.mjs',import.meta.url),'utf8');
 assert.ok(!script.includes('Eredeti termékoldal'));
 assert.ok(readFileSync(new URL('../server/pages.mjs',import.meta.url),'utf8').includes('ingredientDetails(product)'));
});
test('ingredient copy retains identity, order, trace warnings and known conflicts without external links',()=>{
 assert.equal(ingredientTextHu('Sare de mare, PUDRĂ DE MUȘTAR, țelină.'),'tengeri só, mustárpor, zeller');
 assert.equal(ingredientTextHu('Ismeretlen magyar összetevő'),'Ismeretlen magyar összetevő');
 assert.equal(ingredientTextHu('__proto__, constructor'),'__proto__, constructor');
 const rooster=ingredientDetails(seedCatalogue.products.find(p=>p.id==='rooster-booster'));
 assert.ok(rooster.includes('<strong>mustár</strong>'));assert.ok(rooster.includes('Zellert tartalmazó'));assert.ok(rooster.includes('tojásnyomokat'));
 assert.ok(rooster.includes('<strong>szója</strong>'));assert.ok(rooster.includes('<strong>szezámmag</strong>'));assert.ok(!rooster.includes('https://'));
 const edited={sourceIngredientText:'<img src=x onerror=alert(1)>',traceStatementOriginal:'',sourceConflict:false};
 assert.ok(!ingredientDetails(edited).includes('<img'));assert.ok(ingredientDetails(edited).includes('&lt;img'));
});
test('commerce state stays honest in independent copy and merchant edits are not overridden by canned descriptions',()=>{
 const product={...seedCatalogue.products[0],description:'A kereskedő által frissített termékleírás.'};
 const catalogue={...seedCatalogue,products:[product,...seedCatalogue.products.slice(1)]};
 const {html}=renderSitePage(base,{pathname:'/termek/'+product.id,catalogue});
 assert.ok(html.includes(product.description));assert.ok(html.includes('valódi rendelést és fizetést nem fogadunk'));
 const legal=renderSitePage(base,{pathname:'/aszf'}).html;
 assert.ok(legal.includes('14 naptári nap'));
 assert.ok(legal.includes('SPICE LABORATORY S.R.L.'));
 const home=renderSitePage(base,{pathname:'/'}).html;
 assert.ok(home.includes('UNALMAS KAJA KIZÁRVA'));assert.ok(home.includes('MUTASD A FŰSZEREKET'));
 assert.ok(home.includes('KELL EGY ÖTLET?'));assert.ok(home.includes('id="newsletter-email"'));
});
