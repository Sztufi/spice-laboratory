import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCommerceRequest} from '../server/commerce.mjs';
import {dispatchRestock,RESTOCK_EVENT} from '../server/restock.mjs';
import {loadStore} from '../server/store.mjs';
import {productCard} from '../public/product-markup.mjs';
import {productExperience} from '../server/product-experience.mjs';
import {soldOut} from '../public/stock-state.mjs';
const env={OMNISEND_ENABLED:'true',OMNISEND_API_KEY:'private-test'};
function setup(){
 const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};}};
 const p={id:'waiting-spice',name:'Kért <fűszer>',sku:'WAIT-1',priceMinor:275000,weightGrams:130,categories:['dip'],ingredients:[{id:'garlic'}],image:'/assets/mascot.png',manageStock:true,stockQuantity:0};
 sqlite.prepare("INSERT INTO store_records VALUES('product',?,?,'published','v1',?,?)").run(p.id,JSON.stringify(p),new Date().toISOString(),new Date().toISOString());
 const request=(input,path='restock',origin='https://spice.test')=>new Request('https://spice.test/api/commerce/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'cf-connecting-ip':'192.0.2.5'},body:JSON.stringify(input)});
 const call=(input,path,origin)=>handleCommerceRequest(request(input,path,origin),{db,env});
 return {sqlite,db,p,call};
}
const signup={productId:'waiting-spice',email:'Person@example.com',consent:true};
test('guest restock opt-in is product-scoped, deduplicated, CSRF protected and separate from newsletter',async()=>{
 const {db,sqlite,call}=setup();
 assert.equal((await call(signup,'restock','https://evil.test')).status,403);
 assert.equal((await call({...signup,consent:false})).status,400);
 assert.equal((await call({...signup,email:'<bad>'})).status,400);
 assert.equal((await call({...signup,productId:'missing'})).status,404);
 assert.equal((await call(signup)).status,200);assert.equal((await call(signup)).status,200);
 const rows=sqlite.prepare('SELECT * FROM restock_requests').all();assert.equal(rows.length,1);assert.equal(rows[0].email,'person@example.com');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM newsletter_subscribers').get().n,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM marketing_preferences').get().n,0);
 const {catalogue}=await loadStore(db,{env});await dispatchRestock({db,env,fetcher:()=>assert.fail('out-of-stock must not send')},catalogue);
 assert.equal((await call({token:rows[0].cancel_token},'restock/cancel')).status,200);
 assert.equal(sqlite.prepare('SELECT status FROM restock_requests').get().status,'cancelled');
 assert.equal((await call(signup)).status,200);assert.notEqual(sqlite.prepare('SELECT cancel_token FROM restock_requests').get().cancel_token,rows[0].cancel_token);
});
test('restock dispatch claims once across concurrent polls, ignores unknown stock, and never subscribes to marketing',async()=>{
 const {db,sqlite,p,call}=setup();await call(signup);
 const {catalogue}=await loadStore(db,{env});const item=catalogue.products.find(i=>i.id===p.id);item.inStock=false;item.stockStatus='unverified';
 let events=0;
 const fetcher=async(url,options)=>{
  assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Omnisend-API-Key private-test');
  if(url.includes('/automations/'))return Response.json({isEnabled:true,trigger:{condition:{event:RESTOCK_EVENT,origin:'api'}}});
  assert.equal(url,'https://api.omnisend.com/api/events');events++;
  const event=JSON.parse(options.body);assert.equal(event.contact.email,'person@example.com');assert.equal(event.properties.productId,p.id);assert.equal(event.properties.productUrl,'https://spicelaboratory.eu/termek/waiting-spice');assert.ok(!event.contact.optIns);assert.ok(!event.contact.consent);assert.equal(event.properties.productName,'Kért &lt;fűszer&gt;');
  return new Response(null,{status:202});
 };
 await dispatchRestock({db,env,fetcher},catalogue);assert.equal(events,0);
 item.inStock=true;item.stockStatus='verified';
 await Promise.all([dispatchRestock({db,env,fetcher},catalogue),dispatchRestock({db,env,fetcher},catalogue)]);
 await dispatchRestock({db,env,fetcher},catalogue);assert.equal(events,1);assert.equal(sqlite.prepare('SELECT status FROM restock_requests').get().status,'sent');
});
test('provider timeout or rejection remains reviewable and cannot trigger blind duplicate sends; inactive automation sends nothing',async()=>{
 const {db,sqlite,p,call}=setup();await call(signup);const {catalogue}=await loadStore(db,{env});catalogue.products.find(i=>i.id===p.id).inStock=true;
 const inactive=async()=>Response.json({isEnabled:false});await dispatchRestock({db,env,fetcher:inactive},catalogue);assert.equal(sqlite.prepare('SELECT status FROM restock_requests').get().status,'waiting');
 let attempts=0;const ambiguous=async url=>{if(url.includes('/automations/'))return Response.json({isEnabled:true,trigger:{condition:{event:RESTOCK_EVENT,origin:'api'}}});attempts++;throw new Error('timeout');};
 await dispatchRestock({db,env,fetcher:ambiguous},catalogue);await dispatchRestock({db,env,fetcher:ambiguous},catalogue);
 assert.equal(attempts,1);assert.equal(sqlite.prepare('SELECT status FROM restock_requests').get().status,'review');
});
test('unavailable products have no purchase CTA, have a purple ribbon only when sold out, and keep product links',()=>{
 const {p}=setup();p.inStock=false;
 const card=productCard(p),page=productExperience(p,{label:'Dip'},{shippingMethods:[]});
 for(const html of [card,page]){assert.ok(!html.includes('data-action="add"'));assert.match(html,/data-action="restock"/);assert.match(html,/restock-button/);assert.match(html,/ELFOGYOTT!/);}
 assert.match(card,/href="\/termek\/waiting-spice"/);assert.equal(soldOut({...p,stockStatus:'unverified'}),false);
 assert.ok(!productCard({...p,inStock:true}).includes('ELFOGYOTT!'));
});
