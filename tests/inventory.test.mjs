import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {syncInventory,requireFreshInventory,inventoryOverview,reconcileStock} from '../server/inventory.mjs';
import {loadStore,reserveStock,stockSettlementStatements} from '../server/store.mjs';
import {handleAdminRequest} from '../server/admin.mjs';
import {handleCommerceRequest} from '../server/commerce.mjs';
const owner={userId:'owner',email:'owner@example.com'},env={ADMIN_EMAILS:owner.email,SMARTBILL_EMAIL:'hello@example.com',SMARTBILL_API_TOKEN:'private-test',SMARTBILL_COMPANY_VAT_CODE:'50028326',SMARTBILL_WAREHOUSE_NAME:'Stoc SL',SMARTBILL_STOCK_SYNC_ENABLED:'true'};
function database(){const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return {db,sqlite};}
function product(sqlite,id,sku,extra={}){const payload={id,sku,name:id,currency:'HUF',priceMinor:10000,weightGrams:100,categories:['bbq'],ingredients:[{id:'garlic',sourceLabel:'garlic'}],image:'/assets/mascot.png',manageStock:false,stockQuantity:0,...extra};sqlite.prepare("INSERT INTO store_records VALUES('product',?,?,'published','v1',?,?)").run(id,JSON.stringify(payload),new Date().toISOString(),new Date().toISOString());}
const provider=products=>async(url,opts)=>{const u=new URL(url);assert.equal(u.origin,'https://ws.smartbill.ro');assert.equal(u.searchParams.get('warehouseName'),'Stoc SL');assert.ok(!u.searchParams.has('productCode'));assert.equal(opts.redirect,'manual');return Response.json({errorText:'',list:[{warehouse:{warehouseName:'Other'},products:[{productCode:'SKU',measuringUnit:'buc',quantity:999}]},{warehouse:{warehouseName:'Stoc SL'},products}]});};
const row=(sku,q,unit='buc')=>({productCode:sku,quantity:q,measuringUnit:unit});
const reset=sqlite=>sqlite.exec("UPDATE store_inventory_sync SET lease_until=0,next_attempt_at=0");
const get=async(db,id)=>(await loadStore(db,{admin:true,env})).catalogue.products.find(p=>p.id===id);
test('SKU sync distinguishes zero, missing, duplicate, fractional and non-piece stock; API failure never invents or overwrites quantities',async()=>{
 const {db,sqlite}=database();for(const id of ['valid','zero','missing','duplicate','fractional','kg'])product(sqlite,id,id.toUpperCase());
 const fetcher=provider([row('VALID',9),row('ZERO',0),row('DUPLICATE',3),row('DUPLICATE',3),row('FRACTIONAL',2.5),row('KG',100,'kg')]);
 const result=await syncInventory(db,env,{fetcher});assert.equal(result.state.status,'ok');
 assert.equal((await get(db,'valid')).availableQuantity,9);assert.equal((await get(db,'zero')).inventory.status,'zero');
 for(const [id,status] of [['missing','missing'],['duplicate','duplicate'],['fractional','invalid'],['kg','unit']]){const p=await get(db,id);assert.equal(p.inventory.status,status);assert.equal(p.availableQuantity,null);}
 const publicStore=await loadStore(db,{env});assert.equal(publicStore.catalogue.products.find(p=>p.id==='missing').inStock,false);assert.ok(!JSON.stringify(publicStore.catalogue).includes('rawQuantity'));
 reset(sqlite);await syncInventory(db,env,{fetcher:async()=>new Response('secret provider body',{status:401})});assert.equal((await get(db,'valid')).inventory.rawQuantity,9);
 await assert.rejects(()=>requireFreshInventory(db,env,fetcher),e=>e.status===503);
 sqlite.exec("UPDATE store_smartbill_stock SET checked_at='2000-01-01T00:00:00.000Z'");assert.equal((await get(db,'valid')).inventory.status,'stale');
});
test('distributed lease and cooldown issue only one fetch for concurrent visitors, then allow recovery after expiry',async()=>{
 const {db,sqlite}=database();product(sqlite,'tracked','SKU');let calls=0,release;const blocked=new Promise(r=>release=r);
 const fetcher=async(...args)=>{calls++;await blocked;return provider([row('SKU',5)])(...args);};
 const first=syncInventory(db,env,{fetcher});await new Promise(r=>setImmediate(r));
 const second=await syncInventory(db,env,{fetcher});assert.equal(second.performed,false);release();await first;assert.equal(calls,1);
 await syncInventory(db,env,{fetcher});assert.equal(calls,1);reset(sqlite);await syncInventory(db,env,{fetcher});assert.equal(calls,2);
});
test('reservations and paid holdbacks survive repeated imports; no overselling, double settlement, or automatic refund restock',async()=>{
 const {db,sqlite}=database();product(sqlite,'tracked','SKU',{safetyStock:1});const fetcher=provider([row('SKU',7)]);await syncInventory(db,env,{fetcher});
 await reserveStock(db,'first',[{id:'tracked',quantity:4}],{env});assert.equal((await get(db,'tracked')).availableQuantity,2);
 await assert.rejects(()=>reserveStock(db,'second',[{id:'tracked',quantity:3}],{env}),e=>e.status===409);
 const order={id:'first',mode:'live',items_json:JSON.stringify([{id:'tracked',sku:'SKU',quantity:4}])};await db.batch(stockSettlementStatements(db,order));await db.batch(stockSettlementStatements(db,order));
 assert.equal((await get(db,'tracked')).inventory.pending,4);assert.equal((await get(db,'tracked')).availableQuantity,2);
 reset(sqlite);await syncInventory(db,env,{fetcher});assert.equal((await get(db,'tracked')).availableQuantity,2);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM store_stock_movements').get().n,1);
 const input={orderId:'first',productId:'tracked',document:'SL-HU 001',confirmed:true};await assert.rejects(()=>reconcileStock(db,env,owner,input,fetcher),e=>e.status===409);
 reset(sqlite);await reconcileStock(db,env,owner,input,provider([row('SKU',3)]));assert.equal((await get(db,'tracked')).availableQuantity,2);assert.equal((await get(db,'tracked')).inventory.pending,0);
 await reconcileStock(db,env,owner,input,fetcher);assert.equal((await get(db,'tracked')).availableQuantity,2);
});
test('admin stock operations, mappings and exports are owner-only, CSRF-safe, revisioned and protect held SKUs',async()=>{
 const {db,sqlite}=database();product(sqlite,'tracked','SKU');const fetcher=provider([row('SKU',5)]);
 const req=(path,method='GET',body,origin='https://spice.test')=>new Request('https://spice.test/api/admin'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const call=(path,method='GET',body,user=owner,origin)=>handleAdminRequest(req(path,method,body,origin),{db,env,user,fetcher});
 assert.equal((await call('/inventory','GET',null,null)).status,401);assert.equal((await call('/inventory','GET',null,{userId:'buyer',email:'buyer@example.com'})).status,403);
 assert.equal((await call('/inventory/sync','POST',{},owner,'https://evil.test')).status,403);assert.equal((await call('/inventory/sync','POST',{})).status,200);
 const input={sku:'NEW',safetyStock:0,lowStockThreshold:5,revision:'v1'};
 await reserveStock(db,'held',[{id:'tracked',quantity:1}],{env});assert.equal((await call('/inventory/tracked','PUT',input)).status,409);
 sqlite.exec('DELETE FROM store_stock_reservations');assert.equal((await call('/inventory/tracked','PUT',input)).status,200);assert.equal((await get(db,'tracked')).inventory.status,'changed');assert.equal((await call('/inventory/tracked','PUT',input)).status,409);
 const exported=await call('/inventory/export');assert.match(exported.headers.get('cache-control'),/no-store/);assert.ok(!(await exported.text()).includes(env.SMARTBILL_API_TOKEN));
 const response=await handleCommerceRequest(new Request('https://spice.test/api/commerce/stock'),{db,env,fetcher});const data=await response.json();assert.equal(data.enabled,true);assert.ok(!JSON.stringify(data).includes('rawQuantity'));assert.ok(!JSON.stringify(data).includes(env.SMARTBILL_API_TOKEN));
});
