import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {renderSitePage} from '../server/pages.mjs';
import {seoDocument,seoEndpoint,seoState,seoSetting,sitemapEntries,seoRedirect} from '../server/seo.mjs';
import {seoPages} from '../public/seo-data.mjs';
import {seedCatalogue} from '../public/catalogue.mjs';
import {recipeSeeds} from '../public/recipe-data.mjs';
import {handleAdminRequest} from '../server/admin.mjs';
import {loadStore} from '../server/store.mjs';
const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8'),origin='https://spice.test';
const publicEnv={SEO_PUBLIC_SITE_CONFIRMED:'true'},enabled={indexingEnabled:true};
const render=(path,extra={})=>renderSitePage(base,{pathname:path,origin,env:publicEnv,seo:enabled,...extra});
const graph=html=>JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
function dbContext(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};}};
 const user={userId:'owner',email:'owner@example.com'},env={ADMIN_EMAILS:user.email};
 const admin=(path='',method='GET',body,extra={})=>handleAdminRequest(new Request(origin+'/api/admin'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{db,user,env,...extra});
 return {db,sqlite,admin};
}

test('indexing fails closed without both explicit flags; private/account/error and filter pages stay noindex',()=>{
 assert.equal(seoState(enabled,{}).enabled,false);assert.equal(seoState({},publicEnv).enabled,false);
 assert.ok(render('/',{env:{}}).html.includes('content="noindex, follow"'));
 assert.ok(render('/').html.includes('content="index, follow, max-image-preview:large"'));
 for(const path of ['/fiok','/missing','/termek/missing'])assert.ok(render(path).html.includes('content="noindex, follow"'));
 for(const search of ['?q=garlic','?ingredient=garlic','?sort=name','?category=bbq','?match=any']){
  const {html}=render('/termekek',{search});assert.ok(html.includes('content="noindex, follow"'));assert.ok(html.includes('rel="canonical" href="https://spice.test/termekek"'));
 }
 assert.ok(render('/termekek',{search:'?utm_source=newsletter'}).html.includes('content="index, follow, max-image-preview:large"'));
 assert.ok(render('/blog',{search:'?product=fries-salt'}).html.includes('content="noindex, follow"'));
});

test('all real public pages have server rendered unique titles/descriptions, canonical and social tags',()=>{
 const titles=new Set(),descriptions=new Set();
 for(const path of [...seoPages.map(p=>p.path),...seedCatalogue.products.map(p=>'/termek/'+p.id),...recipeSeeds.map(r=>'/blog/'+r.id)]){
  const {html,status,title}=render(path);assert.equal(status,200,path);assert.ok(!titles.has(title),path);titles.add(title);
  const description=html.match(/<meta name="description" content="([^"]*)"/)[1];assert.ok(description,path);assert.ok(!descriptions.has(description),path);descriptions.add(description);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);assert.equal((html.match(/name="robots"/g)||[]).length,1);assert.ok(html.includes('property="og:title"'));assert.ok(html.includes('name="twitter:card"'));
  assert.ok(!html.includes('name="keywords"'));assert.ok(graph(html).some(n=>n['@type']==='WebPage'));
 }
});

test('custom metadata is escaped, overrides only its page, and never turns editorial keywords into a meta tag',()=>{
 const seo={...enabled,verification:'test_verification',pages:{'/':{title:'Egyedi <cím>',description:'Leírás "idézet"',focusKeyword:'INTERNAL-EDITORIAL-NOTE'}}};
 const {html}=render('/',{seo});assert.ok(html.includes('<title>Egyedi &lt;cím&gt;</title>'));assert.ok(html.includes('content="Leírás &quot;idézet&quot;"'));assert.ok(html.includes('name="google-site-verification"'));assert.ok(!html.includes('INTERNAL-EDITORIAL-NOTE'));
 assert.ok(!render('/termekek',{seo}).html.includes('<title>Egyedi'));
 const recipes=[{...recipeSeeds[0],image:'/assets/food.jpg',title:'X </script><script>alert(1)</script>'}];
 const page=render('/blog/'+recipes[0].id,{recipes}).html;assert.ok(!page.includes('<script>alert(1)</script>'));assert.equal(graph(page).find(n=>n['@type']==='Recipe').name,recipes[0].title);
});

test('structured product data uses exact current integer-based price only for live offers and recipes require food images',()=>{
 const options={path:'/termek/'+seedCatalogue.products[0].id,title:'T',description:'D',catalogue:seedCatalogue,origin,settings:enabled,env:publicEnv};
 const demo=JSON.parse(seoDocument(options).tags.match(/application\/ld\+json">(.*?)<\/script>/)[1]);assert.ok(!demo['@graph'].find(n=>n['@type']==='Product').offers);
 const catalogue={...seedCatalogue,products:[{...seedCatalogue.products[0],priceMinor:199050,inStock:false,sku:'SKU-REAL'}]};
 const live=JSON.parse(seoDocument({...options,catalogue,live:true}).tags.match(/application\/ld\+json">(.*?)<\/script>/)[1]);
 const product=live['@graph'].find(n=>n['@type']==='Product');assert.equal(product.offers.price,'1990.50');assert.equal(product.offers.priceCurrency,'HUF');assert.equal(product.offers.availability,'https://schema.org/OutOfStock');assert.equal(product.sku,'SKU-REAL');assert.ok(!product.aggregateRating);
 const path='/blog/'+recipeSeeds[0].id;assert.ok(!graph(render(path).html).some(n=>n['@type']==='Recipe'));
 const recipe={...recipeSeeds[0],image:'/assets/dish.jpg'};const node=graph(render(path,{recipes:[recipe]}).html).find(n=>n['@type']==='Recipe');
 assert.equal(node.totalTime,'PT45M');assert.equal(node.recipeInstructions.length,recipe.steps.length);assert.deepEqual(node.recipeIngredient,recipe.ingredients);assert.ok(!node.nutrition);assert.deepEqual(node.image,[origin+'/assets/dish.jpg']);
});

test('sitemap and robots exclude private/test indexing, query URLs and noindex documents without invented dates',async()=>{
 const store={catalogue:seedCatalogue,recipes:recipeSeeds,settings:[]};
 assert.equal((await seoEndpoint('/sitemap.xml',store,publicEnv,origin).text()).includes('<url>'),false);
 assert.ok((await seoEndpoint('/robots.txt',store,publicEnv,origin).text()).includes('Disallow: /\n'));
 store.settings=[{id:'seo',...enabled,pages:{'/rolunk':{noindex:true}}}];
 const response=seoEndpoint('/sitemap.xml',store,publicEnv,origin),xml=await response.text();
 assert.equal(response.headers.get('Content-Type'),'application/xml; charset=utf-8');assert.ok(xml.includes(origin+'/termek/rooster-booster'));assert.ok(!xml.includes('/fiok'));assert.ok(!xml.includes('/rolunk'));assert.ok(!xml.includes('/aszf'));assert.ok([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].every(([,loc])=>!loc.includes('?')));assert.ok(!xml.includes('lastmod'));assert.ok(!xml.includes('priority'));
 const entries=sitemapEntries(store);for(const entry of entries)assert.equal(render(entry.path).status,200,entry.path);
 const robots=await seoEndpoint('/robots.txt',store,publicEnv,origin).text();assert.ok(robots.includes('Sitemap: '+origin+'/sitemap.xml'));assert.ok(robots.includes('Disallow: /admin'));assert.ok(!robots.includes('Disallow: /\n'));
 assert.equal(seoEndpoint('/other',store,publicEnv,origin),null);
});

test('SEO settings are owner-only, validated, revision-protected and cannot toggle hosting access',async()=>{
 const {db,admin}=dbContext();
 assert.equal((await admin('/settings/seo','PUT',{id:'seo',status:'published'},{user:null})).status,401);
 assert.equal((await admin('/settings/seo','PUT',{id:'seo',status:'published'},{user:{userId:'buyer',email:'buyer@example.com'}})).status,403);
 const input={id:'seo',status:'published',indexingEnabled:true,verification:'valid_code-123',pages:{'/':{title:'Egyedi főoldal',description:'Egyedi leírás',focusKeyword:'fűszerek'}}};
 assert.equal((await admin('/settings/seo','PUT',input)).status,200);
 let store=await loadStore(db);assert.equal(seoSetting(store).pages['/'].title,'Egyedi főoldal');
 const state=await (await admin()).json();assert.equal(state.seoState.enabled,false);assert.equal(state.seoState.requested,true);
 const current=state.settings.find(s=>s.id==='seo');
 assert.equal((await admin('/settings/seo','PUT',input)).status,409);
 assert.equal((await admin('/settings/seo','PUT',{...current,verification:'<meta>'})).status,400);
 assert.equal((await admin('/settings/seo','PUT',{...current,pages:{'/admin':{title:'not allowed'}}})).status,400);
 assert.equal((await admin('/settings/seo','PUT',{...current,pages:{'/':{title:'a'.repeat(121)}}})).status,400);
 assert.equal((await admin('/settings/seo','PUT',{...current,indexingEnabled:false})).status,200);
});

test('product/category/recipe SEO persists across live catalogue and category slug changes retain permanent redirects',async()=>{
 const {db,admin}=dbContext(),initial=await (await admin()).json();
 const p=initial.catalogue.products[0];
 assert.equal((await admin('/products/'+p.id,'PUT',{...p,sku:'TEST-SEO-SKU',seo:{title:'Csirkefűszer – Rooster',description:'Részletes termékmeta',focusKeyword:'csirkefűszer'}})).status,200);
 let store=await loadStore(db);const html=render('/termek/'+p.id,{...store}).html;assert.ok(html.includes('<title>Csirkefűszer – Rooster</title>'));
 let category=initial.catalogue.categories[0];const old=category.slug;
 assert.equal((await admin('/categories/'+category.id,'PUT',{...category,slug:'uj-bbq-url',seo:{title:'BBQ fűszerek',noindex:true}})).status,200);
 store=await loadStore(db);assert.equal(seoRedirect('/kategoria/'+old,store.catalogue.categories),'/kategoria/uj-bbq-url');assert.equal(seoRedirect('/termekek/'),'/termekek');assert.equal(seoRedirect('/termekek'),null);
 assert.ok(!sitemapEntries(store).some(e=>e.path==='/kategoria/uj-bbq-url'));
 category=(await (await admin()).json()).catalogue.categories.find(c=>c.id===category.id);
 assert.equal((await admin('/categories/'+category.id,'PUT',{...category,slug:'harmadik-url'})).status,200);
 store=await loadStore(db);assert.equal(seoRedirect('/kategoria/'+old,store.catalogue.categories),'/kategoria/harmadik-url');assert.equal(seoRedirect('/kategoria/uj-bbq-url',store.catalogue.categories),'/kategoria/harmadik-url');
 const other=(await (await admin()).json()).catalogue.categories.find(c=>c.id!==category.id);assert.equal((await admin('/categories/'+other.id,'PUT',{...other,slug:old})).status,400);
 const recipe=initial.recipes[0];assert.equal((await admin('/recipes/'+recipe.id,'PUT',{...recipe,seo:{title:'Saját recept SEO',description:'Recept részletei'}})).status,200);
 store=await loadStore(db);assert.ok(render('/blog/'+recipe.id,{...store}).html.includes('<title>Saját recept SEO</title>'));
});
