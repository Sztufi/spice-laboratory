import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCommerceRequest,commerceConfig,verifyStripeEvent,CONSENT_VERSION} from '../server/commerce.mjs';
const origin='https://spice.test',alice={userId:'alice',email:'alice@example.com',fullName:'Alice'},bob={userId:'bob',email:'bob@example.com'};
const env={STRIPE_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_fake',STRIPE_WEBHOOK_READY:'true',SHIPPING_RON_MINOR:'1500',MERCHANT_PRICES_APPROVED:'true',OMNISEND_ENABLED:'true',OMNISEND_API_KEY:'fake'};
function database(){const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return {sqlite,db};}
function request(path,method='GET',body,customOrigin=origin){return new Request(origin+'/api/commerce/'+path,{method,headers:{Origin:customOrigin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
function call(ctx,path,method='GET',body){return handleCommerceRequest(request(path,method,body),ctx);}
function mockStripe(){let calls=0,params;const session={id:'cs_test_123',url:'https://checkout.stripe.com/c/pay/cs_test_123',expires_at:Math.floor(Date.now()/1000)+3600,livemode:false,status:'open',payment_status:'unpaid',currency:'ron',amount_total:9300};return {session,get calls(){return calls;},get params(){return params;},async fetcher(url,options){calls++;if(options.method==='POST'){params=new URLSearchParams(options.body);session.metadata={checkout_id:params.get('metadata[checkout_id]')};session.client_reference_id=params.get('client_reference_id');}return Response.json(session);}};}
async function sign(event,secret=env.STRIPE_WEBHOOK_SECRET,t=Math.floor(Date.now()/1000)){const raw=JSON.stringify(event),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`)));return {raw,signature:`t=${t},v1=${Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')}`};}
async function webhook(ctx,event,options={}){const signed=await sign(event,options.secret,options.timestamp);return handleCommerceRequest(new Request(origin+'/api/commerce/stripe-webhook',{method:'POST',headers:{'stripe-signature':signed.signature},body:options.body??signed.raw}),ctx);}
const checkoutBody=()=>({requestId:crypto.randomUUID(),items:[{id:'fries-salt',quantity:2,priceMinor:1}],totalMinor:1});
test('provider configuration fails closed until every payment prerequisite is explicit',()=>{
 assert.equal(commerceConfig().stripeEnabled,false);assert.equal(commerceConfig(env).stripeEnabled,true);
 for(const key of ['STRIPE_WEBHOOK_READY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SHIPPING_RON_MINOR','MERCHANT_PRICES_APPROVED'])assert.equal(commerceConfig({...env,[key]:undefined}).stripeEnabled,false,key);
 assert.equal(commerceConfig({...env,STRIPE_MODE:'live'}).stripeEnabled,false);
 assert.equal(commerceConfig({...env,SHIPPING_RON_MINOR:'-1'}).stripeEnabled,false);
 assert.equal(commerceConfig().newsletterEnabled,false);
});
test('checkout requires identity and same-origin and never trusts browser prices',async()=>{
 const {db}=database(),mock=mockStripe(),ctx={db,env,user:alice,fetcher:mock.fetcher};
 assert.equal((await call({...ctx,user:null},'checkout','POST',checkoutBody())).status,401);
 assert.equal((await handleCommerceRequest(request('checkout','POST',checkoutBody(),'https://attacker.test'),ctx)).status,403);
 const input=checkoutBody(),result=await call(ctx,'checkout','POST',input);assert.equal(result.status,201);
 assert.equal(mock.params.get('line_items[0][price_data][unit_amount]'),'3900');assert.equal(mock.params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'1500');
 assert.equal(mock.params.get('customer_email'),alice.email);assert.equal(mock.params.get('shipping_address_collection[allowed_countries][0]'),'RO');
 assert.equal((await call(ctx,'checkout','POST',input)).status,200);assert.equal(mock.calls,1);
 assert.equal((await call(ctx,'checkout','POST',{...input,items:[{id:'fries-salt',quantity:3}]})).status,409);
 for(const items of [[{id:'unknown',quantity:1}],[{id:'fries-salt',quantity:1.2}],[{id:'fries-salt',quantity:100}],[]])assert.equal((await call(ctx,'checkout','POST',{...checkoutBody(),items})).status,400);
});
test('unpaid return does not create an order and another user cannot inspect a session',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:alice,fetcher:mock.fetcher};await call(ctx,'checkout','POST',checkoutBody());
 assert.equal((await call({...ctx,user:bob},'checkout-status?session_id=cs_test_123')).status,404);
 assert.equal((await (await call(ctx,'checkout-status?session_id=cs_test_123')).json()).status,'open');
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM customer_orders').get().n,0);
});
test('verified webhook creates exactly one paid test order, rejects tampering and cannot regress paid state',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:alice,fetcher:mock.fetcher};await call(ctx,'checkout','POST',checkoutBody());
 mock.session.status='complete';mock.session.payment_status='paid';const event={id:'evt_paid',type:'checkout.session.completed',data:{object:mock.session}};
 assert.equal((await webhook(ctx,event,{secret:'wrong'})).status,400);
 assert.equal((await webhook(ctx,event,{timestamp:Math.floor(Date.now()/1000)-301})).status,400);
 assert.equal((await webhook(ctx,event,{body:'{}'})).status,400);
 assert.equal((await webhook(ctx,{...event,data:{object:{...mock.session,amount_total:1}}})).status,400);
 assert.equal((await webhook(ctx,event)).status,200);assert.equal((await webhook(ctx,event)).status,200);
 assert.equal((await call(ctx,'checkout-status?session_id=cs_test_123')).status,200);
 const rows=sqlite.prepare('SELECT * FROM customer_orders').all();assert.equal(rows.length,1);assert.equal(rows[0].kind,'stripe-test');assert.equal(rows[0].total_minor,9300);assert.equal(rows[0].status,'paid');
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM marketing_events').get().n,0);
 await webhook(ctx,{id:'evt_old',type:'checkout.session.expired',data:{object:{...mock.session,status:'expired',payment_status:'unpaid'}}});
 assert.equal(sqlite.prepare('SELECT status FROM payment_checkouts').get().status,'paid');
});
test('server retrieval can confirm a paid return without trusting query parameters',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:alice,fetcher:mock.fetcher};await call(ctx,'checkout','POST',checkoutBody());mock.session.status='complete';mock.session.payment_status='paid';
 const result=await (await call(ctx,'checkout-status?session_id=cs_test_123')).json();assert.equal(result.status,'paid');assert.equal(result.items[0].quantity,2);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM customer_orders').get().n,1);
});
test('Omnisend receives only the authenticated email after explicit consent, unsubscribe is supported',async()=>{
 const {db,sqlite}=database();let payload,calls=0;const ctx={db,env,user:alice,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.omnisend.com/api/contacts');assert.equal(options.headers['Omnisend-Version'],'2026-03-15');payload=JSON.parse(options.body);return Response.json({id:'contact'});}};
 assert.equal((await call(ctx,'marketing','PUT',{subscribed:true})).status,400);assert.equal(calls,0);
 assert.equal((await call(ctx,'marketing','PUT',{subscribed:true,consentVersion:CONSENT_VERSION,email:bob.email})).status,200);
 assert.equal(payload.identifiers[0].id,alice.email);assert.equal(payload.identifiers[0].channels.email.status,'subscribed');assert.ok(payload.identifiers[0].consent.createdAt);
 await call(ctx,'marketing','PUT',{subscribed:true,consentVersion:CONSENT_VERSION});assert.equal(calls,1);
 assert.equal((await (await call({...ctx,user:bob},'marketing')).json()).status,'not-subscribed');
 sqlite.prepare("UPDATE marketing_preferences SET changed_at='2020-01-01T00:00:00Z'").run();
 await call(ctx,'marketing','PUT',{subscribed:false});assert.equal(payload.identifiers[0].channels.email.status,'unsubscribed');assert.equal(payload.identifiers[0].consent,undefined);
});
test('Omnisend outages remain pending instead of reporting a successful subscription',async()=>{
 const {db,sqlite}=database(),ctx={db,env,user:alice,fetcher:async()=>{throw new Error('network');}};
 const response=await call(ctx,'marketing','PUT',{subscribed:true,consentVersion:CONSENT_VERSION});assert.equal(response.status,202);assert.equal((await response.json()).synced,false);assert.equal(sqlite.prepare('SELECT sync_status FROM marketing_preferences').get().sync_status,'failed');
 assert.equal((await call(ctx,'marketing','PUT',{subscribed:false})).status,429);
 assert.equal((await call({...ctx,env:{}},'marketing','PUT',{subscribed:true,consentVersion:CONSENT_VERSION})).status,503);
});

test('live paid events require consent and explicit enablement, are claimed once, and ambiguous sends need review',async()=>{
 const {deliverMarketingEvent}=await import('../server/commerce.mjs');
 const {db,sqlite}=database();const liveEnv={...env,STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fake',OMNISEND_ORDER_EVENTS_ENABLED:'true'};
 let eventCalls=0;const mock=mockStripe();mock.session.livemode=true;
 const ctx={db,env:liveEnv,user:alice,fetcher:async(url,options)=>{if(url.endsWith('/events')){eventCalls++;const payload=JSON.parse(options.body);assert.equal(payload.contact.email,alice.email);assert.equal(payload.eventName,'spice laboratory paid order');assert.equal(payload.properties.value,93);throw new Error('ambiguous network failure');}if(url.endsWith('/contacts'))return Response.json({id:'contact'});return mock.fetcher(url,options);}};
 await call(ctx,'marketing','PUT',{subscribed:true,consentVersion:CONSENT_VERSION});await call(ctx,'checkout','POST',checkoutBody());mock.session.status='complete';mock.session.payment_status='paid';
 assert.equal((await call(ctx,'checkout-status?session_id=cs_test_123')).status,200);assert.equal(eventCalls,1);assert.equal(sqlite.prepare('SELECT status FROM marketing_events').get().status,'review');
 await call(ctx,'checkout-status?session_id=cs_test_123');await deliverMarketingEvent(ctx,sqlite.prepare('SELECT id FROM customer_orders').get().id);assert.equal(eventCalls,1);
});
