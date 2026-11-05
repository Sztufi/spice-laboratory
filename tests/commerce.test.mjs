import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCommerceRequest,commerceConfig,verifyStripeEvent,CONSENT_VERSION} from '../server/commerce.mjs';
const origin='https://spice.test',alice={userId:'alice',email:'alice@example.com',fullName:'Alice'},bob={userId:'bob',email:'bob@example.com'};
const env={STRIPE_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_fake',STRIPE_WEBHOOK_READY:'true',SHIPPING_METHODS_JSON:JSON.stringify([{id:'hu-home',label:'Házhozszállítás',country:'HU',feeMinor:99000,deliveryMinDays:2,deliveryMaxDays:4},{id:'ro-home',label:'Házhozszállítás',country:'RO',feeMinor:199000,deliveryMinDays:1,deliveryMaxDays:3}]),MERCHANT_PRICES_APPROVED:'true',OMNISEND_ENABLED:'true',OMNISEND_API_KEY:'fake'};
function database(){const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return {sqlite,db};}
function request(path,method='GET',body,customOrigin=origin){return new Request(origin+'/api/commerce/'+path,{method,headers:{Origin:customOrigin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
function call(ctx,path,method='GET',body){return handleCommerceRequest(request(path,method,body),ctx);}
function mockStripe(){let calls=0,params;const session={id:'cs_test_123',url:'https://checkout.stripe.com/c/pay/cs_test_123',expires_at:Math.floor(Date.now()/1000)+3600,livemode:false,status:'open',payment_status:'unpaid',currency:'huf',amount_total:649000};return {session,get calls(){return calls;},get params(){return params;},async fetcher(url,options){calls++;if(options.method==='POST'){params=new URLSearchParams(options.body);session.metadata={checkout_id:params.get('metadata[checkout_id]')};session.client_reference_id=params.get('client_reference_id');}return Response.json(session);}};}
async function sign(event,secret=env.STRIPE_WEBHOOK_SECRET,t=Math.floor(Date.now()/1000)){const raw=JSON.stringify(event),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`)));return {raw,signature:`t=${t},v1=${Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')}`};}
async function webhook(ctx,event,options={}){const signed=await sign(event,options.secret,options.timestamp);return handleCommerceRequest(new Request(origin+'/api/commerce/stripe-webhook',{method:'POST',headers:{'stripe-signature':signed.signature},body:options.body??signed.raw}),ctx);}
const checkoutBody=()=>({checkoutMode:'account',country:'HU',shippingMethodId:'hu-home',requestId:crypto.randomUUID(),items:[{id:'fries-salt',quantity:2,priceMinor:1}],totalMinor:1,customer:{email:'alice@example.com',shipping:{name:'Alice Example',phone:'+3612345678',address:{country:'HU',postalCode:'1111',city:'Budapest',line1:'Példa utca 1.',line2:''}},billingSame:true,termsAccepted:true,privacyAccepted:true}});
test('locker checkout requires an official HU locker and persists canonical point data with the 1400 HUF price',async()=>{
 const {db,sqlite}=database(),mock=mockStripe();
 const point={id:'HU-LOCKER-1',name:'GLS tesztautomata',type:'parcel-locker',features:['delivery'],contact:{countryCode:'HU',postalCode:'1111',city:'Budapest',address:'Teszt utca 2'}};
 const lockerEnv={...env,SHIPPING_METHODS_JSON:JSON.stringify([{id:'hu-locker',label:'GLS csomagautomata',deliveryType:'gls-locker',country:'HU',feeMinor:140000,deliveryMinDays:2,deliveryMaxDays:2}])};
 const ctx={db,env:lockerEnv,user:alice,fetcher:async(url,options)=>url.includes('/data/deliveryPoints/')?Response.json({items:[point]}):mock.fetcher(url,options)};
 const input={...checkoutBody(),shippingMethodId:'hu-locker'};
 assert.equal((await call(ctx,'checkout','POST',input)).status,400);
 input.customer.pickupPoint={id:'fake'};assert.equal((await call(ctx,'checkout','POST',input)).status,400);
 input.customer.pickupPoint={id:point.id,name:'forged name',address:'forged address'};
 assert.equal((await call(ctx,'checkout','POST',input)).status,201);
 const row=sqlite.prepare('SELECT * FROM payment_checkouts').get();
 assert.equal(JSON.parse(row.shipping_json).feeMinor,140000);
 assert.equal(JSON.parse(row.customer_json).shipping.pickupPoint.name,point.name);
 assert.equal(JSON.parse(row.customer_json).billing.address.line1,'Példa utca 1.');
 assert.equal(mock.params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'140000');
 point.type='parcel-shop';assert.equal((await call(ctx,'checkout','POST',{...input,requestId:crypto.randomUUID()})).status,400);
});
test('checkout preserves validated customer addresses after Stripe completes and rejects changed details on a reused attempt',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:alice,fetcher:mock.fetcher},input=checkoutBody();
 assert.equal((await call(ctx,'checkout','POST',{...input,customer:undefined})).status,400);
 assert.equal((await call(ctx,'checkout','POST',{...input,customer:{...input.customer,termsAccepted:false}})).status,400);
 assert.equal((await call(ctx,'checkout','POST',input)).status,201);
 let saved=JSON.parse(sqlite.prepare('SELECT customer_json FROM payment_checkouts').get().customer_json);
 assert.equal(saved.shipping.address.postal_code,'1111');assert.equal(saved.billing.address.line1,'Példa utca 1.');assert.equal(saved.shipping.phone,'+3612345678');
 assert.equal((await call(ctx,'checkout','POST',{...input,customer:{...input.customer,email:'other@example.com'}})).status,409);
 mock.session.customer_details={email:'provider@example.com',address:null};mock.session.status='complete';mock.session.payment_status='paid';
 assert.equal((await call(ctx,'checkout-status?session_id=cs_test_123')).status,200);
 saved=JSON.parse(sqlite.prepare('SELECT customer_json FROM payment_checkouts').get().customer_json);
 assert.equal(saved.billing.email,input.customer.email);assert.equal(saved.shipping.address.postal_code,'1111');
});
test('provider configuration fails closed until every payment prerequisite is explicit',()=>{
 assert.equal(commerceConfig().stripeEnabled,false);assert.equal(commerceConfig(env).stripeEnabled,true);
 for(const key of ['STRIPE_WEBHOOK_READY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SHIPPING_METHODS_JSON','MERCHANT_PRICES_APPROVED'])assert.equal(commerceConfig({...env,[key]:undefined}).stripeEnabled,false,key);
 assert.equal(commerceConfig({...env,STRIPE_MODE:'live'}).stripeEnabled,false);
 assert.equal(commerceConfig({...env,SHIPPING_METHODS_JSON:'invalid'}).stripeEnabled,false);
 assert.equal(commerceConfig().newsletterEnabled,false);
});
test('checkout requires identity and same-origin and never trusts browser prices',async()=>{
 const {db}=database(),mock=mockStripe(),ctx={db,env,user:alice,fetcher:mock.fetcher};
 assert.equal((await call({...ctx,user:null},'checkout','POST',checkoutBody())).status,401);
 assert.equal((await handleCommerceRequest(request('checkout','POST',checkoutBody(),'https://attacker.test'),ctx)).status,403);
 const input=checkoutBody(),result=await call(ctx,'checkout','POST',input);assert.equal(result.status,201);
 assert.equal(mock.params.get('line_items[0][price_data][currency]'),'huf');assert.equal(mock.params.get('shipping_options[0][shipping_rate_data][fixed_amount][currency]'),'huf');assert.equal(mock.params.get('line_items[0][price_data][unit_amount]'),'275000');assert.equal(mock.params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'99000');
 assert.equal(mock.params.get('customer_email'),'alice@example.com');assert.equal(mock.params.has('shipping_address_collection[allowed_countries][0]'),false);
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
 const rows=sqlite.prepare('SELECT * FROM customer_orders').all();assert.equal(rows.length,1);assert.equal(rows[0].kind,'stripe-test');assert.equal(rows[0].total_minor,649000);assert.equal(rows[0].status,'paid');
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
 const {db,sqlite}=database();const liveEnv={...env,STRIPE_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fake',LEGAL_LAUNCH_APPROVED:'true',RESEND_API_KEY:'re_fake',TRANSACTIONAL_EMAIL_FROM:'shop@example.com',OMNISEND_ORDER_EVENTS_ENABLED:'true'};
 let eventCalls=0;const mock=mockStripe();mock.session.livemode=true;
 const ctx={db,env:liveEnv,user:alice,fetcher:async(url,options)=>{if(url.endsWith('/events')){eventCalls++;const payload=JSON.parse(options.body);assert.equal(payload.contact.email,alice.email);assert.equal(payload.eventName,'spice laboratory paid order');assert.equal(payload.properties.value,6490);throw new Error('ambiguous network failure');}if(url.endsWith('/contacts'))return Response.json({id:'contact'});return mock.fetcher(url,options);}};
 await call(ctx,'marketing','PUT',{subscribed:true,consentVersion:CONSENT_VERSION});await call(ctx,'checkout','POST',checkoutBody());mock.session.status='complete';mock.session.payment_status='paid';
 assert.equal((await call(ctx,'checkout-status?session_id=cs_test_123')).status,200);assert.equal(eventCalls,1);assert.equal(sqlite.prepare('SELECT status FROM marketing_events').get().status,'review');
 await call(ctx,'checkout-status?session_id=cs_test_123');await deliverMarketingEvent(ctx,sqlite.prepare('SELECT id FROM customer_orders').get().id);assert.equal(eventCalls,1);
});

async function callCookie(ctx,path,method='GET',input,cookie){const req=request(path,method,input);if(cookie)req.headers.set('Cookie',cookie);return handleCommerceRequest(req,ctx);}
async function guestCookie(ctx){const response=await call(ctx,'checkout-access','POST',{});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
test('guest checkout access is server-issued, cookie-only, short-lived, and cannot access account APIs',async()=>{
 const {db,sqlite}=database(),ctx={db,env,user:null};
 assert.equal((await handleCommerceRequest(request('checkout-access','POST',{},'https://attacker.test'),ctx)).status,403);
 const response=await call(ctx,'checkout-access','POST',{}),header=response.headers.get('set-cookie'),cookie=header.split(';')[0];
 for(const flag of ['__Host-spice-checkout=','HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=86400'])assert.ok(header.includes(flag));
 const row=sqlite.prepare('SELECT * FROM guest_checkout_access').get();assert.equal(row.token_hash.length,64);assert.notEqual(row.token_hash,cookie.split('=')[1]);assert.ok(row.customer_id.startsWith('guest:'));assert.ok(row.expires_at>Date.now());
 const repeated=await callCookie(ctx,'checkout-access','POST',{},cookie);assert.equal(repeated.headers.get('set-cookie'),null);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM guest_checkout_access').get().n,1);
 assert.equal((await callCookie(ctx,'marketing','GET',undefined,cookie)).status,401);
 const {handleAccountRequest}=await import('../server/account.mjs');assert.equal((await handleAccountRequest(request('profile'),{db,user:null})).status,401);
});
test('guest can pay without an account, while session IDs alone and other visitors grant no access',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:null,fetcher:mock.fetcher},cookie=await guestCookie(ctx);
 const input={...checkoutBody(),checkoutMode:'guest',email:alice.email};
 assert.equal((await callCookie(ctx,'checkout','POST',input,cookie)).status,201);assert.equal(mock.params.get('customer_email'),'alice@example.com');
 assert.equal((await callCookie(ctx,'checkout','POST',input,cookie)).status,200);assert.equal(mock.calls,1);
 assert.equal((await call({...ctx,user:alice},'checkout-status?session_id=cs_test_123')).status,404);
 const stranger=await guestCookie(ctx);assert.equal((await callCookie(ctx,'checkout-status?session_id=cs_test_123','GET',undefined,stranger)).status,404);
 mock.session.status='complete';mock.session.payment_status='paid';mock.session.customer_details={email:alice.email};
 const response=await callCookie(ctx,'checkout-status?session_id=cs_test_123','GET',undefined,cookie),result=await response.json();assert.equal(result.status,'paid');assert.equal(result.guest,true);assert.equal(result.shipping.country,'HU');
 const row=sqlite.prepare('SELECT * FROM customer_orders').get();assert.ok(row.user_id.startsWith('guest:'));assert.equal(row.total_minor,649000);assert.equal(JSON.parse(row.shipping_json).id,'hu-home');
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM customers WHERE id=?').get(alice.userId).n,0);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM marketing_events').get().n,0);
});
test('guest order linking requires the paid receipt capability AND explicit authenticated account approval',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:null,fetcher:mock.fetcher},cookie=await guestCookie(ctx);
 await callCookie(ctx,'checkout','POST',{...checkoutBody(),checkoutMode:'guest'},cookie);
 assert.equal((await callCookie({...ctx,user:alice},'claim-order','POST',{sessionId:'cs_test_123'},cookie)).status,404);
 mock.session.status='complete';mock.session.payment_status='paid';await callCookie(ctx,'checkout-status?session_id=cs_test_123','GET',undefined,cookie);
 assert.equal((await callCookie(ctx,'claim-order','POST',{sessionId:'cs_test_123'},cookie)).status,401);
 assert.equal((await call({...ctx,user:alice},'claim-order','POST',{sessionId:'cs_test_123'})).status,403);
 const linked=await callCookie({...ctx,user:alice},'claim-order','POST',{sessionId:'cs_test_123',userId:bob.userId},cookie);assert.equal(linked.status,200);
 assert.equal(sqlite.prepare('SELECT user_id FROM customer_orders').get().user_id,alice.userId);assert.equal(sqlite.prepare('SELECT user_id FROM payment_checkouts').get().user_id,alice.userId);
 assert.equal((await callCookie(ctx,'checkout-status?session_id=cs_test_123','GET',undefined,cookie)).status,404);
 assert.equal((await call({...ctx,user:alice},'checkout-status?session_id=cs_test_123')).status,200);
 assert.equal((await callCookie({...ctx,user:alice},'claim-order','POST',{sessionId:'cs_test_123'},cookie)).status,200);
 assert.equal((await callCookie({...ctx,user:bob},'claim-order','POST',{sessionId:'cs_test_123'},cookie)).status,404);
});
test('expired and fabricated guest capabilities are rejected before checkout or receipt access',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:null,fetcher:mock.fetcher},cookie=await guestCookie(ctx);
 await callCookie(ctx,'checkout','POST',{...checkoutBody(),checkoutMode:'guest'},cookie);
 sqlite.prepare('UPDATE guest_checkout_access SET expires_at=0').run();
 assert.equal((await callCookie(ctx,'checkout','POST',{...checkoutBody(),checkoutMode:'guest'},cookie)).status,401);
 assert.equal((await callCookie(ctx,'checkout-status?session_id=cs_test_123','GET',undefined,cookie)).status,404);
 assert.equal((await callCookie(ctx,'checkout','POST',{...checkoutBody(),checkoutMode:'guest'},'__Host-spice-checkout='+'a'.repeat(64))).status,401);
});
test('shipping is country-scoped, server priced, immutable in the order, and part of idempotency',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:alice,fetcher:mock.fetcher},input=checkoutBody();
 const romanianCustomer={...input.customer,shipping:{...input.customer.shipping,address:{...input.customer.shipping.address,country:'RO'}}};
 assert.equal((await call(ctx,'checkout','POST',{...input,customer:romanianCustomer})).status,400);
 assert.equal((await call(ctx,'checkout','POST',{...input,shippingMethodId:'not-real'})).status,400);
 assert.equal((await call(ctx,'checkout','POST',{...input,shippingMinor:1})).status,201);
 assert.equal(mock.params.has('shipping_address_collection[allowed_countries][0]'),false);assert.equal(mock.params.get('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]'),'2');assert.equal(mock.params.get('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]'),'4');
 assert.equal((await call(ctx,'checkout','POST',{...input,customer:romanianCustomer,shippingMethodId:'ro-home'})).status,409);
 mock.session.status='complete';mock.session.payment_status='paid';await call(ctx,'checkout-status?session_id=cs_test_123');
 assert.equal(JSON.parse(sqlite.prepare('SELECT shipping_json FROM customer_orders').get().shipping_json).feeMinor,99000);
});
test('free shipping thresholds are applied by the server and malformed merchant rate configuration fails closed',async()=>{
 const {shippingMethods,shippingQuote}=await import('../server/shipping.mjs');
 const methods=[{id:'hu-home',country:'HU',label:'Házhozszállítás',feeMinor:99000,deliveryMinDays:2,deliveryMaxDays:4,freeAboveMinor:550000}];
 assert.equal(shippingQuote(methods,{country:'HU',methodId:'hu-home'},549999).feeMinor,99000);assert.equal(shippingQuote(methods,{country:'HU',methodId:'hu-home'},550000).feeMinor,0);
 assert.equal(shippingQuote(methods,{country:'RO',methodId:'hu-home'},550000),null);
 for(const value of ['invalid',JSON.stringify([{...methods[0],feeMinor:-1}]),JSON.stringify([...methods,...methods]),JSON.stringify([{...methods[0],deliveryMaxDays:1}])])assert.deepEqual(shippingMethods({SHIPPING_METHODS_JSON:value}),[]);
 const {db}=database(),mock=mockStripe();const ctx={db,user:alice,env:{...env,SHIPPING_METHODS_JSON:JSON.stringify(methods)},fetcher:mock.fetcher};await call(ctx,'checkout','POST',checkoutBody());assert.equal(mock.params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'),'0');
});
test('demo account orders use the same approved shipping quote and retain it in their archive',async()=>{
 const {handleAccountRequest}=await import('../server/account.mjs');const {db,sqlite}=database();
 const req=new Request(origin+'/api/account/demo-orders',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),items:[{id:'fries-salt',quantity:2}],shipping:{country:'HU',shippingMethodId:'hu-home',feeMinor:1}})});
 const response=await handleAccountRequest(req,{db,user:alice,env});assert.equal(response.status,201);
 const row=sqlite.prepare('SELECT total_minor,shipping_json FROM customer_orders').get();assert.equal(row.total_minor,649000);assert.equal(JSON.parse(row.shipping_json).feeMinor,99000);
});
test('member checkout fills missing profile data, preserves existing addresses and never returns another member’s data',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:alice,fetcher:mock.fetcher};
 const form=checkoutBody();form.customer.billingSame=false;form.customer.billing={name:'Számlázási név',address:{...form.customer.shipping.address,line1:'Számla utca 3'}};
 assert.equal((await call(ctx,'checkout','POST',form)).status,201);
 const defaults=async user=>(await (await call({...ctx,user},'config?checkout=1')).json()).profile;
 const p=await defaults(alice);assert.equal(p.phone,form.customer.shipping.phone);assert.equal(p.addresses.shipping.line1,'Példa utca 1.');assert.equal(p.addresses.billing.line1,'Számla utca 3');
 assert.deepEqual((await defaults(bob)).addresses,{});assert.equal(await defaults(null),null);
 assert.equal((await (await call(ctx,'config')).json()).profile,undefined);
 const {handleAccountRequest}=await import('../server/account.mjs');
 const demo=async(user,customer)=>handleAccountRequest(new Request(origin+'/api/account/demo-orders',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),items:form.items,customer})}),{db,user,env});
 form.customer.shipping.address.line1='Másik utca 4';assert.equal((await demo(alice,form.customer)).status,201);
 assert.equal((await defaults(alice)).addresses.shipping.line1,'Példa utca 1.');
 assert.equal((await demo(bob,form.customer)).status,201);assert.equal((await defaults(bob)).addresses.shipping.line1,'Másik utca 4');
 assert.equal((await defaults(bob)).email,bob.email);
});
test('checkout upsell is independently configured, never mutates the cart, and is revalidated on the server',async()=>{
 const {db,sqlite}=database(),mock=mockStripe(),ctx={db,env,user:alice,fetcher:mock.fetcher};
 const setting={id:'upsell',enabled:true,thresholdMinor:500000,productId:'bulls-blaze',discountPercent:20,title:'MÉG EGY JÓ DÖNTÉS.',copy:'Dobd hozzá kedvezményesen.'};
 sqlite.prepare("INSERT INTO store_records(kind,id,payload_json,status,revision,created_at,updated_at) VALUES('setting','upsell',?,'published','upsell-v1','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')").run(JSON.stringify(setting));
 const config=await (await call(ctx,'config')).json();assert.equal(config.upsell.enabled,true);assert.equal(config.upsell.productId,'bulls-blaze');assert.equal(config.upsell.product.priceMinor,220000);
 const result=await call(ctx,'checkout','POST',{...checkoutBody(),upsellProductId:'bulls-blaze'});assert.equal(result.status,201);
 assert.equal(mock.params.get('line_items[1][price_data][product_data][name]'),'Bull’s Blaze');assert.equal(mock.params.get('line_items[1][price_data][unit_amount]'),'220000');
 const checkout=sqlite.prepare('SELECT items_json,total_minor FROM payment_checkouts').get(),items=JSON.parse(checkout.items_json);assert.equal(items.length,2);assert.equal(items[0].id,'fries-salt');assert.equal(items[1].id,'bulls-blaze');assert.equal(items[1].upsell,true);assert.equal(checkout.total_minor,869000);
 const duplicate={...checkoutBody(),requestId:crypto.randomUUID(),items:[{id:'bulls-blaze',quantity:2}],upsellProductId:'bulls-blaze'};
 assert.equal((await call(ctx,'checkout','POST',duplicate)).status,400);
 const below={...checkoutBody(),requestId:crypto.randomUUID(),items:[{id:'fries-salt',quantity:1}],upsellProductId:'bulls-blaze'};
 assert.equal((await call(ctx,'checkout','POST',below)).status,400);
});
