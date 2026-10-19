import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAdminRequest} from '../server/admin.mjs';
import {handleCommerceRequest,CONSENT_VERSION} from '../server/commerce.mjs';
import {handleAccountRequest} from '../server/account.mjs';
import {loadStore,isStoreAdmin,reserveStock,stockSettlementStatements,couponQuote} from '../server/store.mjs';
import {renderSitePage} from '../server/pages.mjs';
const origin='https://spice.test',owner={userId:'owner-runtime-id',email:'owner@example.com'},buyer={userId:'buyer',email:'buyer@example.com'};
const env={ADMIN_EMAILS:owner.email,STRIPE_ENABLED:'true',STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fake',STRIPE_WEBHOOK_SECRET:'whsec_fake',STRIPE_WEBHOOK_READY:'true',MERCHANT_PRICES_APPROVED:'true',SHIPPING_METHODS_JSON:JSON.stringify([{id:'hu-home',country:'HU',label:'Házhozszállítás',feeMinor:99000,deliveryMinDays:2,deliveryMaxDays:4}]),OMNISEND_ENABLED:'true',OMNISEND_API_KEY:'fake-private-key'};
function database(){const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};return {db,sqlite};}
const request=(path,method='GET',body,customOrigin=origin)=>new Request(origin+path,{method,headers:{Origin:customOrigin,'Content-Type':'application/json','cf-connecting-ip':'192.0.2.8'},body:body===undefined?undefined:JSON.stringify(body)});
const admin=(db,path='',method='GET',body,user=owner,extra={})=>handleAdminRequest(request('/api/admin'+path,method,body),{db,user,env,...extra});
const commerce=(db,path,method='GET',body,extra={})=>handleCommerceRequest(request('/api/commerce/'+path,method,body),{db,user:buyer,env,...extra});
async function state(db){const response=await admin(db);assert.equal(response.status,200);return response.json();}
const product=(extra={})=>({id:'new-spice',name:'Teszt fűszer',priceMinor:300000,weightGrams:150,categories:['bbq'],ingredientIds:['garlic'],status:'published',manageStock:true,stockQuantity:5,...extra});
async function create(db,path,body){const response=await admin(db,path,'POST',body);assert.equal(response.status,201,await response.clone().text());return response.json();}
test('admin grants only explicit verified owner identity and rejects account, body, and origin escalation',async()=>{
 const {db}=database();assert.equal((await admin(db,'','GET',undefined,null)).status,401);assert.equal((await admin(db,'','GET',undefined,buyer)).status,403);assert.equal(isStoreAdmin(owner,{}),false);
 assert.equal((await admin(db,'/products','POST',{...product(),email:owner.email,role:'admin'},buyer)).status,403);
 assert.equal((await handleAdminRequest(request('/api/admin/products','POST',product(),'https://evil.test'),{db,user:owner,env})).status,403);
 const text=JSON.stringify(await state(db));assert.ok(!text.includes('fake-private-key'));assert.ok(!text.includes('sk_test_fake'));assert.ok(!text.includes('whsec_fake'));
});
test('categories, individual ingredients, and products persist, serve the storefront, and reject stale saves',async()=>{
 const {db}=database();await create(db,'/categories',{id:'new-category',label:'Új kategória',status:'published'});await create(db,'/ingredients',{id:'new-herb',label:'Új fűszernövény',status:'published'});
 await create(db,'/products',product({categories:['new-category'],ingredientIds:['new-herb']}));
 let store=await loadStore(db);assert.equal(store.catalogue.products.length,11);assert.equal(store.catalogue.products.find(p=>p.id==='new-spice').priceMinor,300000);
 const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8');const page=renderSitePage(base,{pathname:'/kategoria/new-category',...store});assert.equal(page.status,200);assert.equal((page.html.match(/class="product-card"/g)||[]).length,1);
 const original=(await state(db)).catalogue.products.find(p=>p.id==='new-spice');assert.equal((await admin(db,'/products/new-spice','PUT',{...original,priceMinor:320000})).status,200);assert.equal((await admin(db,'/products/new-spice','PUT',{...original,priceMinor:1})).status,409);
 store=await loadStore(db);assert.equal(store.catalogue.products.find(p=>p.id==='new-spice').priceMinor,320000);
 assert.equal((await admin(db,'/categories/new-category','DELETE',{...(await state(db)).catalogue.categories.find(c=>c.id==='new-category')})).status,409);
});
test('recipes keep product relationships, drafts stay private, and arbitrary markup cannot escape catalogue JSON',async()=>{
 const {db}=database();await create(db,'/products',product({manageStock:false,name:'X </script><script>alert(1)</script>'}));
 await create(db,'/recipes',{id:'new-recipe',title:'Új recept <script>',excerpt:'Saját ötlet',minutes:25,servings:2,productIds:['new-spice'],ingredients:['1 kanál fűszer'],steps:['Keverd össze.'],status:'draft'});
 let store=await loadStore(db);assert.ok(!store.recipes.some(r=>r.id==='new-recipe'));
 const original=(await state(db)).recipes.find(r=>r.id==='new-recipe');assert.equal((await admin(db,'/recipes/new-recipe','PUT',{...original,status:'published'})).status,200);
 store=await loadStore(db);const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8');
 const html=renderSitePage(base,{pathname:'/blog/new-recipe',...store}).html;assert.ok(html.includes('href="/termek/new-spice"'));assert.ok(!html.includes('<script>alert(1)</script>'));
 const embedded=html.match(/id="store-catalogue">([\s\S]*?)<\/script>/)[1];assert.equal(JSON.parse(embedded).products.find(p=>p.id==='new-spice').name,'X </script><script>alert(1)</script>');
 assert.ok(renderSitePage(base,{pathname:'/termek/new-spice',...store}).html.includes('/blog/new-recipe'));
});
test('server checkout uses edited prices and approved coupons, preserving the final discount in the order',async()=>{
 const {db,sqlite}=database();await create(db,'/products',product());await create(db,'/coupons',{id:'ten',code:'TEN',type:'percent',amount:10,minimumMinor:500000,status:'published'});
 let checkoutParams,couponParams;const session={id:'cs_test_admin',url:'https://checkout.stripe.com/c/pay/test',expires_at:Math.floor(Date.now()/1000)+3600,livemode:false,currency:'huf',status:'open',payment_status:'unpaid',amount_total:639000};
 const fetcher=async(url,options)=>{if(url.endsWith('/coupons')){couponParams=new URLSearchParams(options.body);return Response.json({id:'test_coupon'});}if(options.method==='POST'){checkoutParams=new URLSearchParams(options.body);session.metadata={checkout_id:checkoutParams.get('metadata[checkout_id]')};session.client_reference_id=checkoutParams.get('client_reference_id');}return Response.json(session);};
 const response=await commerce(db,'checkout','POST',{checkoutMode:'account',country:'HU',shippingMethodId:'hu-home',requestId:crypto.randomUUID(),items:[{id:'new-spice',quantity:2,priceMinor:1}],couponCode:'TEN',totalMinor:1},{fetcher});assert.equal(response.status,201,await response.clone().text());
 assert.equal(checkoutParams.get('line_items[0][price_data][unit_amount]'),'300000');assert.equal(couponParams.get('amount_off'),'60000');assert.equal(checkoutParams.get('discounts[0][coupon]'),'test_coupon');
 session.status='complete';session.payment_status='paid';assert.equal((await commerce(db,'checkout-status?session_id='+session.id,'GET',undefined,{fetcher})).status,200);
 const row=sqlite.prepare('SELECT * FROM customer_orders').get();assert.equal(row.total_minor,639000);assert.equal(JSON.parse(row.discount_json).discountMinor,60000);assert.equal(JSON.parse(row.items_json)[0].priceMinor,300000);
 assert.equal((await commerce(db,'coupon-quote','POST',{code:'TEN',items:[{id:'new-spice',quantity:1}]})).status,400);
});
test('stock reservations reject overselling and live settlement reduces stock exactly once',async()=>{
 const {db,sqlite}=database();await create(db,'/products',product());
 await reserveStock(db,'checkout-a',[{id:'new-spice',quantity:2}]);await reserveStock(db,'checkout-a',[{id:'new-spice',quantity:2}]);
 await assert.rejects(()=>reserveStock(db,'checkout-b',[{id:'new-spice',quantity:4}]),error=>error.status===409);
 const row={id:'checkout-a',mode:'live',items_json:JSON.stringify([{id:'new-spice',quantity:2}])};await db.batch(stockSettlementStatements(db,row));await db.batch(stockSettlementStatements(db,row));
 assert.equal((await state(db)).catalogue.products.find(p=>p.id==='new-spice').stockQuantity,3);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM store_stock_movements').get().n,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM store_stock_reservations').get().n,0);
 const publicProduct=(await loadStore(db)).catalogue.products.find(p=>p.id==='new-spice');assert.equal(publicProduct.stockQuantity,undefined);
});
test('shipping settings change public checkout configuration and invalid edits cannot replace saved rates',async()=>{
 const {db}=database(),methods=[{id:'hu-post',label:'Teszt kézbesítés',country:'HU',feeMinor:125000,deliveryMinDays:2,deliveryMaxDays:3}];
 assert.equal((await admin(db,'/settings/shipping','PUT',{id:'shipping',status:'published',revision:'new',methods})).status,200);
 assert.equal((await (await commerce(db,'config')).json()).shippingMethods[0].feeMinor,125000);
 const settings=(await state(db)).settings[0];assert.equal((await admin(db,'/settings/shipping','PUT',{...settings,methods:[{...methods[0],feeMinor:-1}]})).status,400);
 assert.equal((await (await commerce(db,'config')).json()).shippingMethods[0].feeMinor,125000);
});
test('guest newsletter requires valid email and consent, records provider failures, and throttles repeated requests',async()=>{
 const {db,sqlite}=database();let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.omnisend.com/api/contacts');const payload=JSON.parse(options.body);assert.equal(payload.identifiers[0].id,'guest@example.com');return Response.json({contactID:'mock'});};
 const input={email:' Guest@Example.com ',consent:true,consentVersion:CONSENT_VERSION};
 assert.equal((await commerce(db,'newsletter','POST',{...input,consent:false},{user:null,fetcher})).status,400);
 assert.equal((await commerce(db,'newsletter','POST',{...input,email:'bad'},{user:null,fetcher})).status,400);
 const result=await commerce(db,'newsletter','POST',input,{user:null,fetcher});assert.equal(result.status,200);assert.equal(calls,1);assert.equal(sqlite.prepare('SELECT status FROM newsletter_subscribers').get().status,'synced');
 await commerce(db,'newsletter','POST',input,{user:null,fetcher});await commerce(db,'newsletter','POST',input,{user:null,fetcher});assert.equal((await commerce(db,'newsletter','POST',input,{user:null,fetcher})).status,429);assert.equal(calls,3);
 const failed=await commerce(db,'newsletter','POST',{...input,email:'failure@example.com'},{user:null,fetcher:async()=>Response.json({}, {status:503})});assert.equal(failed.status,202);assert.equal((await failed.json()).synced,false);assert.equal(sqlite.prepare('SELECT status FROM newsletter_subscribers WHERE email=?').get('failure@example.com').status,'failed');
 const cross=await handleCommerceRequest(request('/api/commerce/newsletter','POST',input,'https://evil.test'),{db,env,fetcher});assert.equal(cross.status,403);
});
test('order fulfillment stays separate from payment and customer APIs never expose private order notes',async()=>{
 const {db}=database();const created=await handleAccountRequest(request('/api/account/demo-orders','POST',{requestId:crypto.randomUUID(),items:[{id:'fries-salt',quantity:1}]}),{db,user:buyer,env});assert.equal(created.status,201);const {id}=await created.json();
 assert.equal((await admin(db,'/orders/'+id,'PUT',{fulfillmentStatus:'paid'})).status,400);
 assert.equal((await admin(db,'/orders/'+id,'PUT',{fulfillmentStatus:'shipped',trackingUrl:'javascript:alert(1)'})).status,400);
 assert.equal((await admin(db,'/orders/'+id,'PUT',{fulfillmentStatus:'shipped',trackingUrl:'https://track.example.com/123',note:'private packing note',revision:'new',totalMinor:1})).status,200);
 const response=await handleAccountRequest(request('/api/account'),{db,user:buyer,env}),account=await response.json();assert.equal(account.orders[0].status,'demo-completed');assert.equal(account.orders[0].fulfillmentStatus,'shipped');assert.equal(account.orders[0].totalMinor,275000);assert.ok(!JSON.stringify(account).includes('private packing note'));
 const original=(await state(db)).catalogue.products.find(p=>p.id==='fries-salt');assert.equal((await admin(db,'/products/fries-salt','DELETE',original)).status,200);assert.ok(!(await loadStore(db)).catalogue.products.some(p=>p.id==='fries-salt'));
 assert.equal((await (await handleAccountRequest(request('/api/account'),{db,user:buyer,env})).json()).orders[0].items[0].name,'Fries Salt');
});
test('media uploads require real image signatures and private invoices remain admin-only',async()=>{
 const {db,sqlite}=database();let writes=0,reads=0;const bucket={async put(key){writes++;assert.match(key,/^store-media\/[a-f0-9-]{36}\.png$/);},async get(){reads++;return {body:new TextEncoder().encode('%PDF-test')};}};
 const upload=async(bytes,type='image/png')=>{const form=new FormData();form.append('file',new File([bytes],'test.png',{type}));return handleAdminRequest(new Request(origin+'/api/admin/media',{method:'POST',headers:{Origin:origin},body:form}),{db,user:owner,env,bucket});};
 assert.equal((await upload('<script>evil</script>')).status,400);assert.equal(writes,0);
 const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73]);assert.equal((await upload(png)).status,201);assert.equal(writes,1);
 await handleAccountRequest(request('/api/account/profile','PUT',{fullName:'Buyer'}),{db,user:buyer,env});sqlite.prepare('INSERT INTO customer_invoices(id,user_id,number,issued_at,total_minor,currency,object_key,created_at) VALUES(?,?,?,?,?,?,?,?)').run('private-invoice',buyer.userId,'I-1','2026-10-19',275000,'HUF','private/invoice.pdf','2026-10-19');
 assert.equal((await admin(db,'/invoices/private-invoice/download','GET',undefined,buyer,{bucket})).status,403);assert.equal(reads,0);assert.equal((await admin(db,'/invoices/private-invoice/download','GET',undefined,owner,{bucket})).status,200);assert.equal(reads,1);
});
test('manual orders use current server prices, remain unpaid, and do not charge or decrement stock',async()=>{
 const {db,sqlite}=database();await create(db,'/products',product());
 const input={email:'manual@example.com',fullName:'Kézi vásárló',requestId:crypto.randomUUID(),items:[{id:'new-spice',quantity:2,priceMinor:1}],status:'paid',totalMinor:1};
 const response=await admin(db,'/orders','POST',input);assert.equal(response.status,201);assert.equal((await admin(db,'/orders','POST',input)).status,200);
 const order=sqlite.prepare('SELECT * FROM customer_orders').get();assert.equal(order.total_minor,600000);assert.equal(order.kind,'manual');assert.equal(order.status,'pending-payment');assert.equal((await state(db)).catalogue.products.find(p=>p.id==='new-spice').stockQuantity,5);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_orders').get().n,1);
});
