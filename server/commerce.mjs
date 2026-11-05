import { shippingMethods, shippingQuote, SHIPPING_COUNTRIES } from './shipping.mjs';
import { guestCheckoutAccess, issueGuestCheckoutAccess } from './guest-checkout.mjs';
import {loadStore,runtimeEnv,assertAvailable,reserveStock,stockSettlementStatements,couponQuote,StoreError} from './store.mjs';
import {subscribeNewsletter} from './newsletter.mjs';
import {subscribeRestock,cancelRestock,dispatchRestock} from './restock.mjs';
import { cartTotals } from '../public/shop-core.mjs';
import { assertSameOrigin } from './account.mjs';
import {REFUND_EVENTS,syncRefundEvent} from './refunds.mjs';
import {handleWithdrawal,withdrawalMailReady} from './withdrawals.mjs';
import {publicUpsell,selectedUpsell} from './upsell.mjs';
import {publicTracking,ensureTrackingLink} from './gls.mjs';
import {sendOrderConfirmation} from './order-email.mjs';
import {resolveGlsLocker} from './gls-lockers.mjs';
import {checkoutCustomer,profileDefaults,missingProfileWrites} from './checkout-profile.mjs';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const now=()=>new Date().toISOString();
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
class CommerceError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(status,message)=>{throw new CommerceError(status,message);};
export const CONSENT_VERSION='email-marketing-v1';
export const CONSENT_TEXT='Szeretnék e-mailben recepteket, újdonságokat és ajánlatokat kapni a Spice Laboratorytól az Omnisend közreműködésével. Bármikor leiratkozhatok.';
export function commerceConfig(env={}) {
 const mode=env.STRIPE_MODE==='live'?'live':'test';
 const methods=shippingMethods(env);
 const configured=env.STRIPE_ENABLED==='true' && typeof env.STRIPE_SECRET_KEY==='string' && env.STRIPE_SECRET_KEY.startsWith(`sk_${mode}_`) && !!env.STRIPE_WEBHOOK_SECRET && env.STRIPE_WEBHOOK_READY==='true' && methods.length>0 && env.MERCHANT_PRICES_APPROVED==='true';
 const legalReady=env.LEGAL_LAUNCH_APPROVED==='true'&&withdrawalMailReady(env);
 return {stripeEnabled:configured&&(mode!=='live'||legalReady),legalReady,withdrawalEmailReady:withdrawalMailReady(env),mode,shippingMethods:methods,shippingCountries:SHIPPING_COUNTRIES,newsletterEnabled:!!env.OMNISEND_API_KEY&&env.OMNISEND_ENABLED==='true',consentVersion:CONSENT_VERSION,consentText:CONSENT_TEXT};
}
async function readLimited(request,limit){
 if(Number(request.headers.get('content-length')||0)>limit)fail(413,'Túl nagy kérés.');
 if(!request.body)return '';
 const reader=request.body.getReader(),chunks=[];let length=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();fail(413,'Túl nagy kérés.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(bytes);
}
async function body(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON kérés szükséges.');
 const raw=await readLimited(request,32768);
 try{return JSON.parse(raw);}catch{fail(400,'Hibás kérés.');}
}
async function customer(db,user){await q(db,'INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',user.userId,user.email,user.fullName||'','',now(),now()).run();}
async function stripe(env,path,{params,key,fetcher=fetch}={}) {
 let response;
 try{response=await fetcher('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},body:params?.toString(),signal:AbortSignal.timeout(12000)});}catch{fail(502,'A fizetési szolgáltató átmenetileg nem elérhető. A kosarad megmaradt.');}
 const data=await response.json();if(!response.ok)fail(502,'Nem sikerült kapcsolatot létesíteni a fizetési szolgáltatóval.');return data;
}
export async function verifyStripeEvent(raw,signature,secret,timestamp=Math.floor(Date.now()/1000)) {
 if(!secret||!signature||raw.length>262144)fail(400,'Érvénytelen webhook.');
 const parts=signature.split(',').map(part=>part.split('='));const t=parts.find(([k])=>k==='t')?.[1];
 if(!/^\d+$/.test(t||'')||Math.abs(timestamp-Number(t))>300)fail(400,'Lejárt webhook.');
 const signatures=parts.filter(([k,v])=>k==='v1'&&/^[0-9a-f]{64}$/.test(v)).map(([,v])=>v);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 let valid=false;
 for(const value of signatures){const bytes=Uint8Array.from(value.match(/../g),x=>parseInt(x,16));if(await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(`${t}.${raw}`)))valid=true;}
 if(!valid)fail(400,'Érvénytelen webhook aláírás.');
 try{return JSON.parse(raw);}catch{fail(400,'Hibás webhook.');}
}
function validateItems(items,catalogue){
 if(!Array.isArray(items)||!items.length||items.length>100)fail(400,'Hibás kosár.');
 const ids=new Set();for(const item of items){if(!catalogue.products.some(p=>p.id===item?.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99||ids.has(item.id))fail(400,'Hibás termék vagy mennyiség.');ids.add(item.id);}
 assertAvailable(items,catalogue);return cartTotals(items,catalogue.products);
}
// Checkout validation is shared with the authenticated demo checkout.
async function createCheckout(request,ctx,config,input){
 const {db,user,env,fetcher,catalogue}=ctx;if(!config.stripeEnabled)fail(503,'A Stripe-fizetés még nincs aktiválva.');
 if(!/^[\da-f-]{36}$/i.test(input?.requestId||''))fail(400,'Hibás kérésazonosító.');
 const totals=validateItems(input.items,catalogue),customerData=checkoutCustomer(input,new Set((config.shippingCountries||[]).map(item=>item.code)));
 const cartItems=totals.lines.map(({product,quantity,subtotalMinor})=>({id:product.id,sku:product.sku||'',name:product.name,priceMinor:product.priceMinor,quantity,subtotalMinor})).sort((a,b)=>a.id.localeCompare(b.id));
 let upsell;try{upsell=selectedUpsell(input.upsellProductId,config.upsell,cartItems,totals.totalMinor);}catch(error){fail(400,error.message);}
 if(upsell){const product=catalogue.products.find(item=>item.id===upsell.id);upsell.sku=product?.sku||'';}
 const items=upsell?[...cartItems,upsell]:cartItems;
 const discount=input.couponCode?await couponQuote(db,input.couponCode,totals.totalMinor):null;
 const merchandiseMinor=totals.totalMinor+(upsell?.priceMinor||0);
 const shipping=shippingQuote(config.shippingMethods,{country:customerData.shipping.address.country,methodId:input.shippingMethodId},merchandiseMinor-(discount?.discountMinor||0));if(!shipping)fail(400,'Válassz elérhető szállítási módot a kiválasztott országhoz.');
 const total=merchandiseMinor-(discount?.discountMinor||0)+shipping.feeMinor;
 if(shipping.deliveryType==='gls-locker'){
  const point=await resolveGlsLocker(input.customer?.pickupPoint?.id,shipping.country,fetcher);
  customerData.shipping.pickupPoint=point;
  shipping.pickupPoint=point;
 }
 const customerHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({billing:customerData.billing,shipping:customerData.shipping})))),x=>x.toString(16).padStart(2,'0')).join('');
 const fingerprint=JSON.stringify({items,shipping,discount,mode:config.mode,customerHash});
 await customer(db,user);
 let row=await q(db,'SELECT * FROM payment_checkouts WHERE user_id = ? AND request_id = ?',user.userId,input.requestId).first();
 if(row&&row.fingerprint!==fingerprint)fail(409,'Ehhez a fizetéshez más kosár tartozik. Indíts új fizetést.');
 if(!row){const id=crypto.randomUUID();await q(db,'INSERT INTO payment_checkouts(id,user_id,request_id,fingerprint,items_json,total_minor,currency,mode,status,created_at,updated_at,shipping_json,discount_json,customer_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,request_id) DO NOTHING',id,user.userId,input.requestId,fingerprint,JSON.stringify(items),total,catalogue.currency,config.mode,'creating',now(),now(),JSON.stringify(shipping),discount?JSON.stringify(discount):null,JSON.stringify(customerData)).run();row=await q(db,'SELECT * FROM payment_checkouts WHERE user_id = ? AND request_id = ?',user.userId,input.requestId).first();}
 if(row.fingerprint!==fingerprint)fail(409,'A kosár időközben megváltozott.');
 if(row.status==='paid')fail(409,'Ezt a rendelést már kifizetted.');
 if(row.session_id){if(row.expires_at*1000<=Date.now())fail(409,'A fizetési hivatkozás lejárt. Indíts új fizetést.');return json({url:row.session_url,checkoutId:row.id,mode:row.mode});}
 // Never reuse a possibly forgotten Stripe idempotency key after its retention window.
 if(Date.now()-Date.parse(row.created_at)>23*60*60*1000)fail(409,'Ez a fizetési kísérlet lejárt. Indíts új fizetést.');
 if(config.mode==='live')await reserveStock(db,row.id,items,{env});
 const origin=new URL(request.url).origin;
 const params=new URLSearchParams({mode:'payment',locale:'hu',expires_at:String(Math.floor(Date.now()/1000)+3600),billing_address_collection:'auto',client_reference_id:row.id,'metadata[checkout_id]':row.id,'payment_method_types[0]':'card',success_url:`${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/?payment=cancelled`});
 params.set('customer_email',customerData.billing.email);
 params.set('payment_intent_data[metadata][checkout_id]',row.id);
 if(discount){
  const coupon=await stripe(env,'coupons',{params:new URLSearchParams({duration:'once',currency:catalogue.currency.toLowerCase(),amount_off:String(discount.discountMinor),name:discount.code}),key:`spice-coupon-${row.id}`,fetcher});
  if(typeof coupon.id!=='string'||coupon.id.length>200)fail(502,'Nem sikerült a kedvezményt érvényesíteni.');
  params.set('discounts[0][coupon]',coupon.id);
 }
 for(const [i,item] of items.entries()){params.set(`line_items[${i}][price_data][currency]`,catalogue.currency.toLowerCase());params.set(`line_items[${i}][price_data][unit_amount]`,String(item.priceMinor));params.set(`line_items[${i}][price_data][product_data][name]`,item.name);params.set(`line_items[${i}][quantity]`,String(item.quantity));}
 params.set('shipping_options[0][shipping_rate_data][type]','fixed_amount');params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]',String(shipping.feeMinor));params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]',catalogue.currency.toLowerCase());params.set('shipping_options[0][shipping_rate_data][display_name]',shipping.label);
 params.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]','business_day');params.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]',String(shipping.deliveryMinDays));params.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]','business_day');params.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]',String(shipping.deliveryMaxDays));
 const session=await stripe(env,'checkout/sessions',{params,key:`spice-checkout-${row.id}`,fetcher});
 if(!/^cs_[a-zA-Z0-9_]+$/.test(session.id||'')||!session.url?.startsWith('https://checkout.stripe.com/')||!Number.isInteger(session.expires_at)||session.expires_at*1000<=Date.now()||session.livemode!==(config.mode==='live'))fail(502,'Érvénytelen fizetési válasz.');
 await db.batch([q(db,"UPDATE payment_checkouts SET session_id=?,session_url=?,expires_at=?,status='open',updated_at=? WHERE id=? AND status='creating'",session.id,session.url,session.expires_at,now(),row.id),...(input.checkoutMode==='account'?missingProfileWrites(db,user,customerData):[])]);
 return json({url:session.url,checkoutId:row.id,mode:config.mode},201);
}
async function applySession(db,row,session,eventId,eventType){
 if(session.id!==row.session_id||session.metadata?.checkout_id!==row.id||session.client_reference_id!==row.id||session.livemode!==(row.mode==='live')||session.amount_total!==row.total_minor||session.currency?.toUpperCase()!==row.currency)fail(400,'A fizetési adatok nem egyeznek.');
 const paid=(session.payment_status==='paid'||session.payment_status==='no_payment_required'&&row.total_minor===0)&&session.status==='complete';
 const status=paid?'paid':session.status==='expired'?'expired':'open';
 const pi=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 if(pi&&(!/^pi_[a-zA-Z0-9_]{1,200}$/.test(pi)||row.payment_intent_id&&row.payment_intent_id!==pi))fail(400,'Eltérő fizetésazonosító.');
 const statements=[q(db,"UPDATE payment_checkouts SET status=CASE WHEN status='paid' THEN status ELSE ? END, customer_json=COALESCE(customer_json,?),updated_at=? WHERE id=?",status,paid?JSON.stringify({billing:session.customer_details,shipping:session.collected_information?.shipping_details??session.shipping_details??null}):null,now(),row.id)];
 if(pi)statements.push(q(db,'UPDATE payment_checkouts SET payment_intent_id=? WHERE id=?',pi,row.id));
 if(paid){
 const number=`SL-${row.id.slice(0,8).toUpperCase()}`;
 statements.push(q(db,'INSERT INTO customer_orders(id,user_id,request_id,number,kind,status,total_minor,currency,items_json,created_at,shipping_json,discount_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,request_id) DO NOTHING',row.id,row.user_id,`stripe:${row.id}`,number,row.mode==='live'?'stripe':'stripe-test','paid',row.total_minor,row.currency,row.items_json,now(),row.shipping_json,row.discount_json||null));
 statements.push(...stockSettlementStatements(db,row));
 // Queue only; delivery is a separate, explicitly enabled operation. Test payments never become marketing events.
 if(row.mode==='live')statements.push(q(db,"INSERT INTO marketing_events(id,user_id,order_id,payload_json,status,created_at,updated_at) SELECT ?,?,?,?,?,?,? FROM marketing_preferences WHERE user_id=? AND status='subscribed' AND sync_status='synced' ON CONFLICT(order_id) DO NOTHING",crypto.randomUUID(),row.user_id,row.id,JSON.stringify({orderID:row.id,orderNumber:number,currency:row.currency,value:row.total_minor/100,items:JSON.parse(row.items_json)}),'pending',now(),now(),row.user_id));
 }
 if(status==='expired')statements.push(q(db,'DELETE FROM store_stock_reservations WHERE checkout_id=?',row.id));
 if(eventId)statements.push(q(db,'INSERT INTO payment_events(id,checkout_id,type,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING',eventId,row.id,eventType,now()));
 await db.batch(statements);if(paid||row.status==='paid')await ensureTrackingLink(db,row.id);return {status:row.status==='paid'?'paid':status,orderId:paid||row.status==='paid'?row.id:null,mode:row.mode,items:JSON.parse(row.items_json),guest:row.user_id.startsWith('guest:'),shipping:row.shipping_json?JSON.parse(row.shipping_json):null};
}
async function syncPreference(ctx,row){
 const {db,env,fetcher=fetch}=ctx;
 const payload={identifiers:[{type:'email',id:row.email,channels:{email:{status:row.status,statusChangedAt:row.changed_at}},...(row.status==='subscribed'?{consent:{source:'spice-laboratory-account',createdAt:row.changed_at}}:{})}]};
 let response;try{response=await fetcher('https://api.omnisend.com/api/contacts',{method:'POST',headers:{Authorization:`Omnisend-API-Key ${env.OMNISEND_API_KEY}`,'Omnisend-Version':'2026-03-15','Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});}catch{}
 const ok=response?.ok===true;
 await q(db,'UPDATE marketing_preferences SET sync_status=?,synced_at=? WHERE user_id=? AND revision=?',ok?'synced':'failed',ok?now():null,row.user_id,row.revision).run();
 return ok;
}
async function preferences(request,ctx,config){
 const {db,user}=ctx;
 if(request.method==='GET'){const row=await q(db,'SELECT status,sync_status,changed_at FROM marketing_preferences WHERE user_id=?',user.userId).first();return json({status:row?.status??'not-subscribed',syncStatus:row?.sync_status??null,changedAt:row?.changed_at??null,email:user.email,...config});}
 if(!config.newsletterEnabled)fail(503,'A hírlevél-feliratkozás még nincs aktiválva.');
 const input=await body(request);if(typeof input?.subscribed!=='boolean'||(input.subscribed&&input.consentVersion!==CONSENT_VERSION))fail(400,'A feliratkozáshoz külön hozzájárulás szükséges.');
 await customer(db,user);
 const previous=await q(db,'SELECT * FROM marketing_preferences WHERE user_id=?',user.userId).first();const status=input.subscribed?'subscribed':'unsubscribed';
 if(previous?.status===status&&previous.sync_status==='synced')return json({saved:true,status,synced:true});
 if(previous&&Date.now()-Date.parse(previous.changed_at)<15000)fail(429,'Várj néhány másodpercet az újrapróbálkozás előtt.');
 const revision=crypto.randomUUID();
 await q(db,'INSERT INTO marketing_preferences(user_id,email,status,consent_version,changed_at,sync_status,revision) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,status=excluded.status,consent_version=excluded.consent_version,changed_at=excluded.changed_at,sync_status=excluded.sync_status,revision=excluded.revision',user.userId,user.email,status,CONSENT_VERSION,now(),'pending',revision).run();
 const row=await q(db,'SELECT * FROM marketing_preferences WHERE user_id=?',user.userId).first();const synced=await syncPreference(ctx,row);
 return json({saved:true,status,synced},synced?200:202);
}
// Claim before delivery. Ambiguous responses stay in review; real-time Omnisend events
// do not promise remote deduplication, so we never automatically replay an uncertain send.
export async function deliverMarketingEvent(ctx,orderId){
 const {db,env={},fetcher=fetch}=ctx;
 if(!env.OMNISEND_API_KEY||env.OMNISEND_ENABLED!=='true'||env.OMNISEND_ORDER_EVENTS_ENABLED!=='true')return;
 const event=await q(db,"UPDATE marketing_events SET status='sending',updated_at=? WHERE order_id=? AND status='pending' RETURNING *",now(),orderId).first();if(!event)return;
 const preference=await q(db,"SELECT email FROM marketing_preferences WHERE user_id=? AND status='subscribed' AND sync_status='synced'",event.user_id).first();
 if(!preference){await q(db,"UPDATE marketing_events SET status='skipped',updated_at=? WHERE id=?",now(),event.id).run();return;}
 const payload={eventName:'spice laboratory paid order',origin:'api',eventID:event.id,eventTime:event.created_at,contact:{email:preference.email},properties:JSON.parse(event.payload_json)};
 let response;try{response=await fetcher('https://api.omnisend.com/api/events',{method:'POST',headers:{Authorization:`Omnisend-API-Key ${env.OMNISEND_API_KEY}`,'Omnisend-Version':'2026-03-15','Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});}catch{}
 await q(db,'UPDATE marketing_events SET status=?,updated_at=? WHERE id=?',response?.ok?'sent':'review',now(),event.id).run();
}
export async function handleCommerceRequest(request,ctx){
 try {
 const {db,user}=ctx,env=await runtimeEnv(db,ctx.env||{}),config=commerceConfig(env),url=new URL(request.url),path=url.pathname.replace(/^\/api\/commerce\/?/,'');
 ctx={...ctx,env};
 if(request.method==='GET'&&path==='config'){
  const store=db?await loadStore(db,{env}):null;
  return json({...config,upsell:publicUpsell(store?.settings,store?.catalogue),accountAvailable:!!user?.userId&&!!user?.email,...(url.searchParams.get('checkout')==='1'?{profile:await profileDefaults(db,user)}:{})});
 }
 if(request.method==='GET'&&path.startsWith('tracking/'))return json(await publicTracking(db,env,path.slice('tracking/'.length),ctx.fetcher));
 if(!db)fail(503,'A szolgáltatás átmenetileg nem elérhető.');
 if(path==='stock'&&request.method==='GET'){
  const {catalogue}=await loadStore(db,{env});
  if(ctx.background)ctx.background(()=>dispatchRestock(ctx,catalogue));else await dispatchRestock(ctx,catalogue);
  return json({enabled:true,products:catalogue.products.map(p=>({id:p.id,inStock:p.inStock,stockStatus:p.stockStatus}))});
 }
 if(path==='stripe-webhook'&&request.method==='POST'){
 const raw=await readLimited(request,262144);const event=await verifyStripeEvent(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET);
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired',...REFUND_EVENTS].includes(event.type))return json({received:true});
 if(!event.id?.startsWith('evt_'))fail(400,'Hibás esemény.');
 if(await q(db,'SELECT id FROM payment_events WHERE id=?',event.id).first())return json({received:true});
 if(REFUND_EVENTS.includes(event.type)){await syncRefundEvent(db,event,path=>stripe(env,path,{fetcher:ctx.fetcher}));return json({received:true});}
 const session=event.data?.object;const row=await q(db,'SELECT * FROM payment_checkouts WHERE session_id=?',session?.id??'').first();
 if(!row)return json({received:true,ignored:true});
 await applySession(db,row,session,event.id,event.type);try{await deliverMarketingEvent(ctx,row.id);await sendOrderConfirmation(db,row,env,ctx.fetcher);}catch{}return json({received:true});
 }
 if(!['GET','HEAD'].includes(request.method))assertSameOrigin(request);
 if(path==='restock'&&request.method==='POST')return json(await subscribeRestock(await body(request),request,ctx));
 if(path==='restock/cancel'&&request.method==='POST')return json(await cancelRestock(await body(request),ctx));
 if(path==='withdrawal'&&request.method==='POST')return await handleWithdrawal(request,ctx);
 if(path==='newsletter'&&request.method==='POST'){
  const result=await subscribeNewsletter(request,ctx,config,CONSENT_TEXT);return json(result,result.synced?200:202);
 }
 if(path==='coupon-quote'&&request.method==='POST'){
  const input=await body(request),{catalogue}=await loadStore(db,{env}),totals=validateItems(input.items,catalogue);
  return json({discount:await couponQuote(db,input.code,totals.totalMinor)});
 }
 if(path==='checkout-access'&&request.method==='POST'){
  if(!config.stripeEnabled)fail(503,'A Stripe-fizetés még nincs aktiválva.');
  await body(request);const cookie=await issueGuestCheckoutAccess(request,db);
  const response=json({ready:true});if(cookie)response.headers.set('Set-Cookie',cookie);return response;
 }
 if(path==='checkout'&&request.method==='POST'){
  const input=await body(request);if(!['guest','account'].includes(input?.checkoutMode))fail(400,'Válassz vásárlási módot.');
  const principal=input.checkoutMode==='guest'?await guestCheckoutAccess(request,db):user;
  if(!principal?.userId||(input.checkoutMode==='account'&&!principal.email))fail(401,input.checkoutMode==='guest'?'A vendégpénztárhoz engedélyezd a szükséges sütiket, majd próbáld újra.':'A fiókkal vásárláshoz jelentkezz be.');
  const store=await loadStore(db,{env});config.upsell=publicUpsell(store.settings,store.catalogue);return await createCheckout(request,{...ctx,user:principal,catalogue:store.catalogue},config,input);
 }
 if(path==='claim-order'&&request.method==='POST'){
  if(!user?.userId||!user?.email)fail(401,'A rendelés fiókhoz kapcsolásához jelentkezz be.');
  const input=await body(request),guest=await guestCheckoutAccess(request,db);if(!guest)fail(403,'A vendégrendelés hozzáférése lejárt.');
  const row=await q(db,"SELECT * FROM payment_checkouts WHERE session_id=? AND user_id=? AND status='paid'",typeof input?.sessionId==='string'?input.sessionId:'',guest.userId).first();if(!row){const own=await q(db,"SELECT id FROM payment_checkouts WHERE session_id=? AND user_id=? AND status='paid'",typeof input?.sessionId==='string'?input.sessionId:'',user.userId).first();if(own)return json({linked:true});fail(404,'A saját fizetett vendégrendelés nem található.');}
  await customer(db,user);
  await db.batch([
   q(db,'UPDATE customer_orders SET user_id=? WHERE id=? AND user_id=?',user.userId,row.id,guest.userId),
   q(db,'UPDATE payment_checkouts SET user_id=?,updated_at=? WHERE id=? AND user_id=?',user.userId,now(),row.id,guest.userId)
  ]);const linked=await q(db,'SELECT user_id FROM payment_checkouts WHERE id=?',row.id).first();if(linked?.user_id!==user.userId)fail(409,'A rendelés kapcsolata időközben megváltozott.');return json({linked:true});
 }
 if(path==='checkout-status'&&request.method==='GET'){
 const id=url.searchParams.get('session_id');if(!/^cs_[a-zA-Z0-9_]{1,200}$/.test(id||''))fail(400,'Hibás fizetésazonosító.');
 const guest=await guestCheckoutAccess(request,db);
 const row=await q(db,'SELECT * FROM payment_checkouts WHERE session_id=? AND (user_id=? OR user_id=?)',id,user?.userId||'',guest?.userId||'').first();if(!row)fail(404,'A fizetés nem található.');
 if(row.status==='paid'){try{await deliverMarketingEvent(ctx,row.id);}catch{}return json({status:'paid',orderId:row.id,mode:row.mode,items:JSON.parse(row.items_json),guest:row.user_id.startsWith('guest:'),shipping:row.shipping_json?JSON.parse(row.shipping_json):null});}
 if(!env.STRIPE_SECRET_KEY)fail(503,'A fizetés állapota most nem ellenőrizhető.');
 const session=await stripe(env,`checkout/sessions/${encodeURIComponent(id)}`,{fetcher:ctx.fetcher});const result=await applySession(db,row,session);try{await deliverMarketingEvent(ctx,row.id);await sendOrderConfirmation(db,row,env,ctx.fetcher);}catch{}return json(result);
 }
 if(!user?.userId||!user?.email)fail(401,'Ehhez jelentkezz be a fiókodba.');
 if(path==='marketing'&&['GET','PUT'].includes(request.method))return await preferences(request,ctx,config);
 return json({error:'Nem található művelet.'},404);
 }catch(error){return json({error:error instanceof CommerceError||error instanceof StoreError?error.message:error?.status===403?'Eltérő eredetű kérés.':'A művelet most nem sikerült. Próbáld újra később.'},error instanceof CommerceError||error instanceof StoreError?error.status:error?.status===403?403:500);}
}
