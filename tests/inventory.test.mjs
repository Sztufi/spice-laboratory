import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {loadStore,reserveStock,stockSettlementStatements} from '../server/store.mjs';
import {handleAdminRequest} from '../server/admin.mjs';
import {handleCommerceRequest} from '../server/commerce.mjs';
const owner={userId:'owner',email:'owner@example.com'},env={ADMIN_EMAILS:owner.email,SMARTBILL_EMAIL:'hello@example.com',SMARTBILL_API_TOKEN:'private-test',SMARTBILL_COMPANY_VAT_CODE:'50028326',SMARTBILL_WAREHOUSE_NAME:'Stoc SL',SMARTBILL_STOCK_SYNC_ENABLED:'true'};
function database(){const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return {db,sqlite};}
function product(sqlite,id,sku,extra={}){const payload={id,sku,name:id,currency:'HUF',priceMinor:10000,weightGrams:100,categories:['bbq'],ingredients:[{id:'garlic',sourceLabel:'garlic'}],image:'/assets/mascot.png',manageStock:false,stockQuantity:0,...extra};sqlite.prepare("INSERT INTO store_records VALUES('product',?,?,'published','v1',?,?)").run(id,JSON.stringify(payload),new Date().toISOString(),new Date().toISOString());}
const get=async(db,id)=>(await loadStore(db,{admin:true,env})).catalogue.products.find(p=>p.id===id);
test('cutover uses local verified snapshot only once, never resets an existing manual count',async()=>{
 const {db,sqlite}=database();product(sqlite,'tracked','SKU');product(sqlite,'manual','MAN',{manageStock:true,stockQuantity:17});product(sqlite,'unknown','UNK');
 sqlite.exec("INSERT INTO store_inventory_sync(id,generation,source_key) VALUES('smartbill','g','s'); INSERT INTO store_smartbill_stock VALUES('tracked','SKU','s',9,'db','ok','g','2026-01-01','2026-01-01')");
 assert.equal((await get(db,'tracked')).stockQuantity,9);assert.equal((await get(db,'unknown')).stockQuantity,0);assert.equal((await get(db,'manual')).stockQuantity,17);
 sqlite.exec("UPDATE store_smartbill_stock SET quantity=999");
 assert.equal((await get(db,'tracked')).stockQuantity,9);
});
test('manual quantities are owner-only, validated, revisioned, reflected in storefront and unaffected by SmartBill',async()=>{
 const {db,sqlite}=database();product(sqlite,'tracked','SKU',{manageStock:true,stockQuantity:3});
 const fetcher=()=>{throw Error('unexpected provider call')};
 const req=(path,method='GET',body,origin='https://spice.test')=>new Request('https://spice.test/api/admin'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const call=(path,method='GET',body,user=owner,origin)=>handleAdminRequest(req(path,method,body,origin),{db,env,user,fetcher});
 assert.equal((await call('/inventory','GET',null,null)).status,401);
 assert.equal((await call('/inventory','GET',null,{userId:'buyer',email:'buyer@example.com'})).status,403);
 const edit=n=>({stockQuantity:n,revision:'v1'});
 assert.equal((await call('/inventory/tracked','PUT',edit(5),owner,'https://evil.test')).status,403);
 assert.equal((await call('/inventory/tracked','PUT',edit(-1))).status,400);
 await reserveStock(db,'held',[{id:'tracked',quantity:2}],{env});
 assert.equal((await call('/inventory/tracked','PUT',edit(1))).status,409);
 sqlite.exec('DELETE FROM store_stock_reservations');
 assert.equal((await call('/inventory/tracked','PUT',edit(0))).status,200);
 assert.equal((await call('/inventory/tracked','PUT',edit(9))).status,409);
 const stock=await handleCommerceRequest(new Request('https://spice.test/api/commerce/stock'),{db,env,fetcher});
 assert.equal((await stock.json()).products.find(p=>p.id==='tracked').inStock,false);
 assert.equal((await call('/inventory/sync','POST',{})).status,410);
 assert.equal((await call('/inventory/export')).status,200);
});
