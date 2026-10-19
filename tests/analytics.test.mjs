import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAdminRequest} from '../server/admin.mjs';
import {buildAnalytics,reportOptions,startOfDay,allocateDiscount,forecastSeries} from '../server/analytics-core.mjs';
import {csvCell} from '../server/admin-analytics.mjs';
const origin='https://spice.test',owner={userId:'owner',email:'owner@example.com'},env={ADMIN_EMAILS:owner.email};
function database(){const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};return {db,sqlite};}
const call=(db,path,user=owner)=>handleAdminRequest(new Request(origin+'/api/admin'+path),{db,user,env});
function order(sqlite,{id,user='a',email='a@example.com',date='2026-10-01T12:00:00Z',kind='stripe',status='paid',currency='HUF',items=[{productId:'fries-salt',name:'Fries Salt',quantity:2,priceMinor:10000,subtotalMinor:20000}],discount=0,shipping=1000,customer=null}={}){
 sqlite.prepare('INSERT OR IGNORE INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(user,email,'Teszt vásárló','',date,date);
 const total=items.reduce((s,i)=>s+i.subtotalMinor,0)-discount+shipping;
 sqlite.prepare('INSERT INTO customer_orders(id,user_id,request_id,number,kind,status,total_minor,currency,items_json,created_at,shipping_json,discount_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user,id,'N-'+id,kind,status,total,currency,JSON.stringify(items),date,JSON.stringify({country:'HU',feeMinor:shipping,label:'Futár'}),discount?JSON.stringify({code:'SALE',discountMinor:discount}):null);
 if(customer)sqlite.prepare('INSERT INTO payment_checkouts(id,user_id,request_id,fingerprint,items_json,total_minor,currency,mode,status,customer_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user,id,'f',JSON.stringify(items),total,currency,'live','paid',JSON.stringify(customer),date,date);
}
test('report access and every archive/download endpoint remain owner-only, private and uncached',async()=>{
 const {db}=database();for(const path of ['/analytics','/analytics/export','/archive','/archive/id','/export/orders','/export/order-lines','/export/archive']){
  assert.equal((await call(db,path,null)).status,401,path);assert.equal((await call(db,path,{userId:'buyer',email:'buyer@example.com'})).status,403,path);
 }
 const response=await call(db,'/analytics');assert.equal(response.status,200,await response.clone().text());assert.match(response.headers.get('cache-control'),/private, no-store/);
 const report=await response.json();assert.equal(report.totals.orders,0);assert.equal(report.totals.returningRate,null);assert.equal(report.forecast.orders.available,false);
 assert.equal((await call(db,'/analytics?from=2026-02-31')).status,400);assert.equal((await call(db,'/analytics?scope=all')).status,400);
});
test('paid summaries reconcile discounts/shipping, exclude demo/test/currency, use zero days and retain pre-period customer history',async()=>{
 const {db,sqlite}=database();order(sqlite,{id:'old',date:'2025-01-01T12:00:00Z'});
 order(sqlite,{id:'oct-a',discount:3000});order(sqlite,{id:'oct-b',user:'b',email:'b@example.com',date:'2026-10-02T12:00:00Z',shipping:0});
 order(sqlite,{id:'demo',kind:'demo',status:'demo-completed'});order(sqlite,{id:'test',kind:'stripe-test'});order(sqlite,{id:'currency',currency:'RON'});order(sqlite,{id:'unpaid',kind:'manual',status:'pending-payment'});
 const response=await call(db,'/analytics?from=2026-10-01&to=2026-10-03');assert.equal(response.status,200,await response.clone().text());const r=await response.json();
 assert.equal(r.totals.orders,2);assert.equal(r.totals.grossMinor,40000);assert.equal(r.totals.discountMinor,3000);assert.equal(r.totals.productMinor,37000);assert.equal(r.totals.shippingMinor,1000);assert.equal(r.totals.paidMinor,38000);
 assert.equal(r.totals.aovProductMinor,18500);assert.equal(r.totals.returningCustomers,1);assert.equal(r.totals.newCustomers,1);assert.equal(r.totals.returningRate,.5);
 assert.equal(r.customers.find(c=>c.email==='a@example.com').lifetimeOrders,2);assert.equal(r.timeline.length,3);assert.equal(r.timeline[2].orders,0);assert.equal(r.products[0].units,4);
 assert.equal(r.coverage.excludedCurrency,1);assert.equal(r.coverage.refundsAvailable,false);
 const week=await (await call(db,'/analytics?from=2026-10-01&to=2026-10-03&group=week')).json();assert.equal(week.timeline[0].period,'2026-09-28');assert.equal(week.totals.paidMinor,r.totals.paidMinor);
 const month=await (await call(db,'/analytics?from=2026-10-01&to=2026-10-03&group=month')).json();assert.equal(month.timeline[0].period,'2026-10');
});
test('returning customers reconcile account and guest checkout identities through case-normalized real email',async()=>{
 const {db,sqlite}=database();order(sqlite,{id:'guest-old',user:'guest:old',email:'',date:'2026-01-01T12:00:00Z',customer:{billing:{email:'Same@Example.com',name:'Vendég'}}});
 order(sqlite,{id:'account-now',user:'account-new',email:'same@example.com'});
 const r=await (await call(db,'/analytics?from=2026-10-01&to=2026-10-03')).json();assert.equal(r.totals.customers,1);assert.equal(r.totals.returningCustomers,1);assert.equal(r.customers[0].lifetimeOrders,2);
});
test('integer coupon allocation conserves every minor currency unit and archived prices override current catalogue prices',()=>{
 assert.deepEqual(allocateDiscount([{subtotalMinor:1},{subtotalMinor:1},{subtotalMinor:1}],2),[1,1,0]);
 const opt=reportOptions(new URLSearchParams('from=2026-10-01&to=2026-10-01'));
 const raw={id:'a',user_id:'a',kind:'stripe',status:'paid',currency:'HUF',created_at:'2026-10-01T12:00:00Z',total_minor:298,items:[{productId:'old',name:'Régi név',quantity:3,subtotalMinor:300}],discount:{discountMinor:2}};
 const r=buildAnalytics([raw],{products:[{id:'old',name:'Új név',priceMinor:999999}]},opt);assert.equal(r.products[0].name,'Régi név');assert.equal(r.products[0].productMinor,298);assert.equal(r.totals.paidMinor,298);
 const bad=buildAnalytics([{...raw,total_minor:1}],{products:[]},opt);assert.equal(bad.totals.orders,0);assert.equal(bad.coverage.invalidOrders,1);
});
test('Budapest dates respect DST rather than fixed UTC offsets',()=>{
 assert.equal(startOfDay('2026-03-29','Europe/Budapest'),'2026-03-28T23:00:00.000Z');assert.equal(startOfDay('2026-03-30','Europe/Budapest'),'2026-03-29T22:00:00.000Z');
 const opt=reportOptions(new URLSearchParams('from=2026-10-19&to=2026-10-19'),new Date('2026-10-19T10:00Z'));assert.equal(opt.partial,true);
 assert.throws(()=>reportOptions(new URLSearchParams('from=2026-02-31')),/Érvényes/);
});
test('forecast refuses sparse history and compares real out-of-sample one-day baseline errors',()=>{
 const series=Array.from({length:90},(_,i)=>({day:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),orders:10,paidMinor:100000,units:20}));
 assert.equal(forecastSeries(series.slice(-20),'orders',20).available,false);
 const f=forecastSeries(series,'orders',20);assert.equal(f.available,true);assert.equal(f.next7,70);assert.equal(f.next30,300);assert.equal(f.mae,0);assert.equal(f.wape,0);assert.equal(f.validationHorizon,1);
 const zeros=series.map(r=>({...r,orders:0}));assert.equal(forecastSeries(zeros,'orders',20).available,false);
 const weekly=series.map((r,i)=>({...r,orders:i%7+1}));assert.equal(forecastSeries(weekly,'orders',20).model,'seasonal7');
});
test('archive pagination, detail and streaming CSV/JSON include more than 200 orders and all line items without secrets',async()=>{
 const {db,sqlite}=database();for(let i=0;i<215;i++)order(sqlite,{id:'order-'+String(i).padStart(3,'0'),user:'user-'+i,email:i===0?'=SUM(1)@example.com':'e'+i+'@example.com',date:'2026-10-01T12:00:00Z'});
 const first=await (await call(db,'/archive')).json();assert.equal(first.total,215);assert.equal(first.orders.length,50);assert.equal(first.pages,5);
 const last=await (await call(db,'/archive?page=5')).json();assert.equal(last.orders.length,15);
 const detail=await call(db,'/archive/order-000');assert.equal(detail.status,200);assert.equal((await detail.json()).items[0].quantity,2);
 const csv=await call(db,'/export/orders');const text=await csv.text();assert.equal(text.trim().split('\r\n').length,216);assert.ok(text.includes("'=SUM(1)@example.com"));assert.match(csv.headers.get('cache-control'),/no-store/);
 const lines=await (await call(db,'/export/order-lines')).text();assert.equal(lines.trim().split('\r\n').length,216);assert.ok(lines.includes('Fries Salt'));
 const archive=await (await call(db,'/export/archive')).json();assert.equal(archive.orders.length,215);assert.equal(archive.schemaVersion,1);assert.ok(!JSON.stringify(archive).includes('session_url'));
 const search=await (await call(db,'/archive?q=N-order-000')).json();assert.equal(search.total,1);
 const product=await (await call(db,'/archive?product=missing')).json();assert.equal(product.total,0);
});
test('CSV guards formula injection even after leading whitespace and safely quotes multiline cells',()=>{
 for(const value of ['=1+1',' +SUM(A1)','\t@bad','\r\n=bad','-1','\ufeff=1'])assert.ok(csvCell(value).startsWith('"\''),JSON.stringify(value));
 assert.equal(csvCell('a"b'),'"a""b"');assert.equal(csvCell('normal'),'"normal"');
});
test('a buyer can first purchase and return in the same period without losing their new-customer acquisition count',async()=>{
 const {db,sqlite}=database();order(sqlite,{id:'first'});order(sqlite,{id:'second',date:'2026-10-02T12:00:00Z'});
 const r=await (await call(db,'/analytics?from=2026-10-01&to=2026-10-03')).json();
 assert.equal(r.totals.customers,1);assert.equal(r.totals.newCustomers,1);assert.equal(r.totals.returningCustomers,1);assert.equal(r.totals.returningRate,1);
});
test('unreconciled older orders do not make a new buyer a returning customer',async()=>{
 const {db,sqlite}=database();order(sqlite,{id:'broken',date:'2025-01-01T12:00:00Z'});sqlite.prepare('UPDATE customer_orders SET total_minor=1 WHERE id=?').run('broken');order(sqlite,{id:'valid'});
 const r=await (await call(db,'/analytics?from=2026-10-01&to=2026-10-03')).json();assert.equal(r.totals.returningCustomers,0);assert.equal(r.customers[0].lifetimeOrders,1);
});
test('forecast exports carry source/timezone metadata and do not export imaginary estimates for sparse stores',async()=>{
 const {db,sqlite}=database();assert.equal((await call(db,'/analytics/export?report=forecast')).status,422);
 for(let i=0;i<95;i++)order(sqlite,{id:'day-'+i,date:new Date(Date.UTC(2026,6,i+1,12)).toISOString()});
 const response=await call(db,'/analytics/export?report=forecast&from=2026-09-01&to=2026-10-01');assert.equal(response.status,200,await response.clone().text());
 const csv=await response.text();assert.equal(csv.trim().split('\r\n').length,31);assert.ok(csv.includes('Europe/Budapest'));assert.ok(csv.includes('Becsült'));
 assert.equal((await call(db,'/analytics/export?report=__proto__')).status,404);
});
