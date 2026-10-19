import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCommerceRequest,commerceConfig} from '../server/commerce.mjs';
import {handleAdminRequest} from '../server/admin.mjs';
import {handleAccountRequest} from '../server/account.mjs';
import {syncRefundEvent,refundSummary} from '../server/refunds.mjs';
import {handleWithdrawal} from '../server/withdrawals.mjs';
import {returnsContent,termsContent,privacyContent} from '../server/legal-pages.mjs';
const origin='https://spice.test',user={userId:'u',email:'u@example.com'},owner={userId:'owner',email:'owner@example.com'};
function database(){const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return {db,sqlite};}
function sale(sqlite,{paid=true,mode='live'}={}){
 const items=JSON.stringify([{id:'fries-salt',name:'Fries Salt',quantity:1,priceMinor:100000,subtotalMinor:100000}]),date='2026-01-01T12:00:00Z';
 sqlite.prepare('INSERT INTO customers(id,email,created_at,updated_at) VALUES(?,?,?,?)').run(user.userId,user.email,date,date);
 sqlite.prepare('INSERT INTO payment_checkouts(id,user_id,request_id,fingerprint,items_json,total_minor,currency,mode,status,session_id,payment_intent_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('checkout',user.userId,'request','f',items,100000,'HUF',mode,paid?'paid':'open','cs_test_x','pi_x',date,date);
 if(paid)sqlite.prepare('INSERT INTO customer_orders(id,user_id,request_id,number,kind,status,total_minor,currency,items_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('checkout',user.userId,'sale','SL-X',mode==='live'?'stripe':'stripe-test','paid',100000,'HUF',items,date);
}
const refund=(id='re_x',status='succeeded',amount=30000)=>({id,object:'refund',charge:'ch_x',payment_intent:'pi_x',amount,currency:'huf',created:Date.parse('2026-10-01T12:00:00Z')/1000,status,reason:'requested_by_customer'});
function provider(refunds,{live=true,amount=100000,amountRefunded}={}){return async path=>{
 if(path.startsWith('refunds/'))return refunds.find(r=>r.id===path.slice(8));
 if(path.startsWith('charges/'))return {id:'ch_x',paid:true,livemode:live,amount,currency:'huf',payment_intent:'pi_x',amount_refunded:amountRefunded??refunds.filter(r=>r.status==='succeeded').reduce((s,r)=>s+r.amount,0)};
 if(path.startsWith('refunds?'))return {data:refunds,has_more:false};
 if(path.startsWith('payment_intents/'))return {id:'pi_x',livemode:live,metadata:{checkout_id:'checkout'}};
 throw new Error(path);
};}
const event=(id='evt_x',type='refund.updated',live=true)=>({id,type,livemode:live,data:{object:{id:type==='charge.refunded'?'ch_x':'re_x'}}});
const admin=(db,path)=>handleAdminRequest(new Request(origin+'/api/admin'+path),{db,user:owner,env:{ADMIN_EMAILS:owner.email}});
test('refund ledger preserves the sale, deduplicates IDs, and handles partial, pending, failed and full refunds',async()=>{
 const {db,sqlite}=database();sale(sqlite);
 await syncRefundEvent(db,event(),provider([refund()]));await syncRefundEvent(db,event('evt_again'),provider([refund()]));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM payment_refunds').get().n,1);
 assert.equal(sqlite.prepare('SELECT total_minor FROM customer_orders').get().total_minor,100000);
 await syncRefundEvent(db,event('evt_pending'),provider([refund(),refund('re_pending','pending',70000)],{amountRefunded:100000}));
 let order=await (await admin(db,'/archive/checkout')).json();assert.equal(order.refundedMinor,30000);assert.equal(order.refundPendingMinor,70000);assert.equal(order.retainedMinor,70000);assert.equal(order.refundStatus,'partial');
 await syncRefundEvent(db,event('evt_failed'),provider([refund(),refund('re_pending','failed',70000)]));
 order=await (await admin(db,'/archive/checkout')).json();assert.equal(order.refundPendingMinor,0);
 await syncRefundEvent(db,event('evt_full'),provider([refund(),refund('re_pending','failed',70000),refund('re_final','succeeded',70000)]));
 order=await (await admin(db,'/archive/checkout')).json();assert.equal(order.refundStatus,'full');assert.equal(order.retainedMinor,0);assert.equal(order.refunds.length,3);
 // A stale request finishing after a final one must not regress its financial status.
 await syncRefundEvent(db,event('evt_stale'),provider([refund('re_x','pending'),refund('re_pending','pending',70000),refund('re_final','pending',70000)],{amountRefunded:100000}));
 assert.equal((await (await admin(db,'/archive/checkout')).json()).refundedMinor,100000);
 const account=await (await handleAccountRequest(new Request(origin+'/api/account'),{db,user})).json();assert.equal(account.orders[0].refundStatus,'full');
});
test('refund synchronization validates mode, currency, amount, pagination and early checkout association',async()=>{
 const {db,sqlite}=database();sale(sqlite,{paid:false});sqlite.prepare('UPDATE payment_checkouts SET payment_intent_id=NULL').run();
 await syncRefundEvent(db,event(),provider([refund()]));assert.equal(sqlite.prepare('SELECT checkout_id FROM payment_refunds').get().checkout_id,'checkout');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_orders').get().n,0);
 await assert.rejects(syncRefundEvent(db,event('evt_wrong'),provider([refund()],{live:false})));
 await assert.rejects(syncRefundEvent(db,event('evt_amount'),provider([refund()],{amount:1})));
 await assert.rejects(syncRefundEvent(db,event('evt_currency'),provider([{...refund(),currency:'eur'}])));
 await assert.rejects(syncRefundEvent(db,event('evt_more'),async path=>path.startsWith('refunds?')?{data:[refund()],has_more:true}:provider([refund()])(path)));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM payment_events').get().n,1);
});
test('refund reports include old orders refunded in the selected period, preserve negative cash flow, and export reconciliation',async()=>{
 const {db,sqlite}=database();sale(sqlite);await syncRefundEvent(db,event(),provider([refund()]));
 const response=await admin(db,'/analytics?from=2026-10-01&to=2026-10-02');assert.equal(response.status,200);const report=await response.json();
 assert.equal(report.totals.orders,0);assert.equal(report.totals.paidMinor,0);assert.equal(report.totals.refundedMinor,30000);assert.equal(report.totals.retainedMinor,-30000);assert.equal(report.timeline[0].refundedMinor,30000);
 const csv=await (await admin(db,'/analytics/export?from=2026-10-01&to=2026-10-02&report=refunds')).text();assert.match(csv,/re_x/);assert.match(csv,/SL-X/);
 const archive=await (await admin(db,'/export/archive')).json();assert.equal(archive.orders[0].refundedMinor,30000);assert.equal(archive.orders[0].refunds[0].id,'re_x');
 assert.equal(refundSummary({total_minor:100,refunded_minor:0,refund_pending_minor:20}).refundStatus,'pending');
});
test('unsigned refund webhooks cannot reach provider or mutate the ledger',async()=>{
 const {db,sqlite}=database();sale(sqlite);let called=false;
 const response=await handleCommerceRequest(new Request(origin+'/api/commerce/stripe-webhook',{method:'POST',body:JSON.stringify(event())}),{db,env:{STRIPE_WEBHOOK_SECRET:'whsec_x'},fetcher:()=>{called=true;}});
 assert.equal(response.status,400);assert.equal(called,false);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM payment_refunds').get().n,0);
});
test('a signed refund webhook syncs through the commerce endpoint exactly once',async()=>{
 const {db,sqlite}=database();sale(sqlite);const raw=JSON.stringify(event()),timestamp=Math.floor(Date.now()/1000),secret='whsec_refund';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 let calls=0;const ctx={db,env:{STRIPE_SECRET_KEY:'sk_live_fake',STRIPE_WEBHOOK_SECRET:secret},fetcher:async url=>{calls++;return Response.json(await provider([refund()])(url.replace('https://api.stripe.com/v1/','')));}};
 const req=()=>new Request(origin+'/api/commerce/stripe-webhook',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${signature}`},body:raw});
 assert.equal((await handleCommerceRequest(req(),ctx)).status,200);assert.equal(calls,3);assert.equal((await handleCommerceRequest(req(),ctx)).status,200);assert.equal(calls,3);
 assert.equal(sqlite.prepare('SELECT SUM(amount_minor) n FROM payment_refunds').get().n,30000);
});
const withdrawalInput=()=>({requestId:crypto.randomUUID(),name:'Teszt Fogyasztó',email:'u@example.com',orderReference:'SL-X',detail:'',confirm:true});
const request=input=>new Request(origin+'/api/commerce/withdrawal',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(input)});
test('withdrawal works for guests, persists before mail, returns a durable receipt and retries without duplicate statements',async()=>{
 const {db,sqlite}=database(),input=withdrawalInput();let sends=0;
 let result=await handleWithdrawal(request(input),{db});assert.equal(result.status,202);let data=await result.json();assert.equal(data.received,true);assert.equal(data.emailSent,false);assert.match(data.receipt,/SL-X/);assert.match(data.receipt,/UTC/);
 result=await handleWithdrawal(request(input),{db,env:{RESEND_API_KEY:'re_fake',TRANSACTIONAL_EMAIL_FROM:'shop@example.com'},fetcher:async(url,options)=>{sends++;assert.equal(url,'https://api.resend.com/emails');assert.match(options.headers['Idempotency-Key'],/^withdrawal-/);return Response.json({id:'email_x'});}});
 assert.equal(result.status,200);assert.equal((await result.json()).emailSent,true);
 await handleWithdrawal(request(input),{db});assert.equal(sends,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_withdrawals').get().n,1);
 const bad=request({...input,requestId:crypto.randomUUID()});bad.headers.set('origin','https://evil.test');assert.equal((await handleWithdrawal(bad,{db})).status,403);
 assert.equal((await handleWithdrawal(request({...input,confirm:false}),{db})).status,400);
 const listing=await (await admin(db,'/withdrawals')).json();assert.equal(listing.total,1);assert.equal(listing.requests[0].email_status,'sent');
 const denied=await handleAdminRequest(new Request(origin+'/api/admin/withdrawals'),{db,user,env:{ADMIN_EMAILS:owner.email}});assert.equal(denied.status,403);
});
test('live checkout cannot launch before legal operational checks and transactional mail; texts expose statutory rights',()=>{
 const env={STRIPE_ENABLED:'true',STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_x',STRIPE_WEBHOOK_SECRET:'whsec_x',STRIPE_WEBHOOK_READY:'true',MERCHANT_PRICES_APPROVED:'true',SHIPPING_METHODS_JSON:JSON.stringify([{id:'hu',label:'Futár',country:'HU',feeMinor:100,deliveryMinDays:1,deliveryMaxDays:2}])};
 assert.equal(commerceConfig(env).stripeEnabled,false);assert.equal(commerceConfig({...env,LEGAL_LAUNCH_APPROVED:'true',RESEND_API_KEY:'re_x',TRANSACTIONAL_EMAIL_FROM:'shop@example.com'}).stripeEnabled,true);
 assert.match(returnsContent(),/Elállás megerősítése/);assert.match(returnsContent(),/nyilatkozatminta/);assert.match(termsContent(),/14 naptári nap/);assert.match(termsContent(),/Románia/);assert.match(privacyContent(),/GDPR/);assert.ok(!termsContent().includes('ec.europa.eu/consumers/odr'));
});
