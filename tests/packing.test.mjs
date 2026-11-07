import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAdminRequest} from '../server/admin.mjs';
import {packingLines} from '../public/admin-packing.mjs';
const owner={userId:'owner',email:'owner@example.com'},env={ADMIN_EMAILS:owner.email,GLS_ENABLED:'true',GLS_USERNAME:'fake',GLS_PASSWORD:'fake',GLS_CLIENT_NUMBER:'1'};
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(s){return {bind(...args){return {async first(){return sql.prepare(s).get(...args)||null;},async all(){return {results:sql.prepare(s).all(...args)};},async run(){return sql.prepare(s).run(...args);}};}};},async batch(stmts){const out=[];for(const s of stmts)out.push(await s.run());return out;}};
 sql.prepare('INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('buyer','buyer@example.com','Buyer','+36301234567','2026-11-01','2026-11-01');
 const items=[{id:'fries-salt',sku:'FRIES-1',name:'Fries Salt',quantity:2,priceMinor:275000,subtotalMinor:550000}];
 const customer={billing:{name:'Buyer',email:'buyer@example.com',phone:'+36301234567'},shipping:{name:'Buyer',phone:'+36301234567',address:{line1:'Teszt utca 12',postal_code:'1111',city:'Budapest',country:'HU'}}};
 function order(id='live',kind='stripe',status='paid'){
  sql.prepare('INSERT INTO customer_orders(id,user_id,request_id,number,kind,status,total_minor,currency,items_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'buyer',id,'SL-'+id,kind,status,550000,'HUF',JSON.stringify(items),'2026-11-01');
  sql.prepare('INSERT INTO payment_checkouts(id,user_id,request_id,fingerprint,items_json,total_minor,currency,mode,status,customer_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'buyer',id,'f',JSON.stringify(items),550000,'HUF','live',status,JSON.stringify(customer),'2026-11-01','2026-11-01');
 }
 order();const setting={enabled:true,country:'HU',senderPostalCode:'410000',senderContactPhone:'+40700123456'};
 sql.prepare("INSERT INTO store_records(kind,id,payload_json,status,revision,created_at,updated_at) VALUES('setting','gls',?,'published','v1','2026-11-01','2026-11-01')").run(JSON.stringify(setting));
 const objects=new Map(),bucket={async put(key,body,options){objects.set(key,{body,customMetadata:options.customMetadata});},async get(key){return objects.get(key);}};
 let calls=0,sent;
 const fetcher=async(url,options)=>{calls++;sent=JSON.parse(options.body);return Response.json({PrintLabelsInfoList:[{ParcelNumber:123456789,ParcelId:123}],Labels:[37,80,68,70,45,49]});};
 async function api(path='',method='GET',body,user=owner,extra={}){return handleAdminRequest(new Request('https://spice.test/api/admin/packing'+path,{method,headers:{Origin:'https://spice.test','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{db,env,user,bucket,fetcher,...extra});}
 return {db,sql,api,order,items,bucket,get calls(){return calls;},get sent(){return sent;}};
}
test('packing is admin-only, private, paginated and excludes test, unpaid and refunded orders',async()=>{
 const f=fixture();f.order('test','stripe-test');f.order('demo','demo','demo-completed');f.order('unpaid','stripe','pending-payment');
 assert.equal((await f.api('','GET',null,null)).status,401);assert.equal((await f.api('','GET',null,{userId:'b',email:'b@x.hu'})).status,403);
 const r=await f.api();assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual((await r.json()).orders.map(o=>o.id),['live']);
 assert.equal((await f.api('/test')).status,404);
 f.sql.prepare("INSERT INTO payment_refunds(id,checkout_id,charge_id,amount_minor,currency,mode,status,created_at,updated_at) VALUES('r','live','c',1,'HUF','live','succeeded','x','x')").run();
 assert.equal((await (await f.api()).json()).total,0);
});
test('packing validates counts and actual weight, persists progress, rejects stale writes and blocks incomplete label',async()=>{
 const f=fixture();assert.equal((await f.api('/live/label','POST',{})).status,409);assert.equal(f.calls,0);
 for(const counts of [[3],[-1],[1.5],[],[2,2]])assert.equal((await f.api('/live','PUT',{revision:'new',counts,weightGrams:850})).status,400);
 assert.equal((await f.api('/live','PUT',{revision:'new',counts:[2],weightGrams:0})).status,400);
 let r=await f.api('/live','PUT',{revision:'new',counts:[1],weightGrams:850});assert.equal(r.status,200);const saved=await r.json();
 assert.equal((await f.api('/live','PUT',{revision:'new',counts:[2],weightGrams:850})).status,409);
 assert.equal((await (await f.api('/live')).json()).packing.counts[0],1);
 assert.equal((await f.api('/live/label','POST',{})).status,409);
 assert.equal((await f.api('/live','PUT',{revision:saved.packing.revision,counts:[2],weightGrams:850})).status,200);
});
test('packed order requests Thermo with measured weight, reuses AWB and serves PDF only to admin',async()=>{
 const f=fixture();await f.api('/live','PUT',{revision:'new',counts:[2],weightGrams:850});
 let r=await f.api('/live/label','POST',{});assert.equal(r.status,201,await r.clone().text());assert.equal(f.sent.TypeOfPrinter,'Thermo');assert.equal(f.sent.ParcelList[0].Weight,.85);
 r=await f.api('/live/label','POST',{});assert.equal(r.status,200);assert.equal(f.calls,1);
 const req=new Request('https://spice.test/api/admin/orders/live/gls-label?inline=1');const ctx={db:f.db,env,bucket:f.bucket,user:owner};
 r=await handleAdminRequest(req,ctx);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/^inline/);assert.equal(r.headers.get('x-gls-printer-type'),'Thermo');assert.equal(r.headers.get('content-type'),'application/pdf');
 assert.equal((await handleAdminRequest(req,{...ctx,user:null})).status,401);
 assert.equal((await f.api('/live','PUT',{revision:(await (await f.api('/live')).json()).packing.revision,counts:[1],weightGrams:850})).status,409);
});
test('GLS timeout retains a review lock and never resubmits an uncertain label',async()=>{
 const f=fixture();await f.api('/live','PUT',{revision:'new',counts:[2],weightGrams:850});let calls=0;
 const fetcher=async()=>{calls++;throw Error('timeout');};
 assert.equal((await f.api('/live/label','POST',{},owner,{fetcher})).status,502);
 assert.equal(f.sql.prepare("SELECT status FROM gls_shipments WHERE order_id='live'").get().status,'review');
 assert.equal((await f.api('/live/label','POST',{},owner,{fetcher})).status,409);assert.equal(calls,1);
});
test('GLS explicit errors release claim, multi-box orders are blocked, and item markup escapes data',async()=>{
 const f=fixture();await f.api('/live','PUT',{revision:'new',counts:[2],weightGrams:850});
 assert.equal((await f.api('/live/label','POST',{},owner,{fetcher:async()=>Response.json({PrintLabelsErrorList:[{ErrorCode:2}]})})).status,502);
 assert.equal(f.sql.prepare("SELECT * FROM gls_shipments WHERE order_id='live'").get(),undefined);
 f.sql.prepare("UPDATE store_records SET payload_json=json_set(payload_json,'$.maxJarsPerBox',1) WHERE id='gls'").run();assert.equal((await f.api('/live/label','POST',{})).status,409);assert.equal(f.calls,0);
 assert.ok(!packingLines({items:[{name:'<script>x</script>',sku:'"',quantity:1,image:''}],packing:{counts:[0]}}).includes('<script>'));
});
