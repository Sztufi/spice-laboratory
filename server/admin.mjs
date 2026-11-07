import {loadStore,query as q,all,StoreError,fail,text,slug,imageUrl,recordDefaults,isStoreAdmin,runtimeEnv} from './store.mjs';
import {shippingMethods} from './shipping.mjs';
import {saveStripeKey,stripeKeyStatus,stripeRuntime,saveStripeWebhook,stripeWebhookStatus} from './stripe-vault.mjs';
import {analyticsEndpoint} from './admin-analytics.mjs';
import {refundColumns,refundSummary} from './refunds.mjs';
import {sendWithdrawalReceipt,withdrawalMailReady} from './withdrawals.mjs';
import {seoState,seoSetting} from './seo.mjs';
import {seoPages} from '../public/seo-data.mjs';
import {processImage} from './image-processing.mjs';
import {commerceConfig} from './commerce.mjs';
import {assertSameOrigin} from './account.mjs';
import {cartTotals} from '../public/shop-core.mjs';
import {assertAvailable} from './store.mjs';
import {shippingQuote} from './shipping.mjs';
import {validateSmartbillSettings,smartbillStatus,testSmartbill,smartbillStock,smartbillConfig} from './smartbill.mjs';
import {omnisendRead,omnisendWrite} from './admin-omnisend.mjs';
import {inventoryOverview,assertMappingChange} from './inventory.mjs';
import {productMedia} from './product-media.mjs';
import {validateGlsSettings,glsStatus,createGlsLabel,glsLabel,ensureTrackingLinks} from './gls.mjs';
import {packingQueue,packingDetail,savePacking,packingLabel} from './packing.mjs';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const json=(body,status=200)=>Response.json(body,{status,headers});
const kinds={products:'product',categories:'category',ingredients:'ingredient',recipes:'recipe',coupons:'coupon',settings:'setting'};
const states=['draft','published','archived'];
const productUses=new Set(['beef','pork','fish','vegetable','chicken']);
const time=()=>new Date().toISOString();
const int=(value,min,max)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail(400,'Hibás számérték.');return value;};
const list=(value,max=100)=>{if(!Array.isArray(value)||value.length>max)fail(400,'Hibás lista.');return value;};
const strings=(value,max=100)=>[...new Set(list(value,max).map(item=>text(item,100,true)))];
function validateSeo(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Hibás SEO-adat.');
 return {title:text(value.title,120),description:text(value.description,500),focusKeyword:text(value.focusKeyword,160),noindex:value.noindex===true};
}
async function limited(request,limit=100000){
 if(Number(request.headers.get('content-length')||0)>limit)fail(413,'Túl nagy feltöltés.');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();const parts=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail(413,'Túl nagy feltöltés.');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
async function body(request){if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON kérés szükséges.');try{return JSON.parse(new TextDecoder().decode(await limited(request)));}catch(error){if(error instanceof StoreError)throw error;fail(400,'Hibás JSON.');}}
function validate(kind,input,store){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Hibás űrlapadat.');
 const id=text(input.id,90,true);if(!/^[a-z0-9][a-z0-9-]{0,89}$/.test(id))fail(400,'Az azonosító kisbetűt, számot és kötőjelet tartalmazhat.');
 const status=input.status||'draft';if(!states.includes(status))fail(400,'Hibás közzétételi állapot.');
 let data;
 if(kind==='product'){
  const categories=strings(input.categories||[]),ingredientIds=strings(input.ingredientIds||input.ingredients?.map(item=>item.id)||[]),uses=strings(input.uses||[]);
  if(uses.some(item=>!productUses.has(item)))fail(400,'Ismeretlen felhasználási szűrő.');
  if(categories.some(key=>!store.catalogue.categories.some(item=>item.id===key&&item.status!=='archived'))||ingredientIds.some(key=>!store.catalogue.ingredients.some(item=>item.id===key&&item.status!=='archived')))fail(400,'Ismeretlen kategória vagy összetevő.');
  if(status==='published'&&(!categories.length||!ingredientIds.length||categories.some(key=>!store.catalogue.categories.some(item=>item.id===key&&item.status==='published'))||ingredientIds.some(key=>!store.catalogue.ingredients.some(item=>item.id===key&&item.status==='published'))))fail(400,'Közzétételhez aktív kategória és aktív összetevőlista is szükséges.');
  const original=store.catalogue.products.find(item=>item.id===id)||{};
  const ingredients=ingredientIds.map(key=>({id:key,sourceLabel:input.ingredients?.find(item=>item.id===key)?.sourceLabel||store.catalogue.ingredients.find(item=>item.id===key).label}));
  const sku=text(input.sku,80);if(!sku||/[\r\n\t]/.test(sku))fail(400,'A SKU / SmartBill Cod produs kötelező, egy sorban megadva.');
  data={id,name:text(input.name,120,true),subtitle:text(input.subtitle,180),description:text(input.description,5000),sku,currency:'HUF',priceMinor:int(input.priceMinor,1,100000000),weightGrams:int(input.weightGrams,1,100000),categories,uses,ingredients,image:imageUrl(input.image),color:/^#[0-9a-f]{6}$/i.test(input.color)?input.color:'#f2b4d0',manageStock:true,stockQuantity:int(input.stockQuantity??0,0,1000000),salePriceMinor:input.salePriceMinor?int(input.salePriceMinor,1,input.priceMinor):null,
   safetyStock:int(input.safetyStock??original.safetyStock??0,0,1000000),lowStockThreshold:int(input.lowStockThreshold??original.lowStockThreshold??5,0,1000000),sourceIngredientText:text(input.sourceIngredientText,5000)||ingredients.map(item=>item.sourceLabel).join(', '),traceStatementOriginal:text(input.traceStatementOriginal,1500),sourceUrl:original.sourceUrl||'',sourceAttributeIngredientText:original.sourceAttributeIngredientText||'',sourceConflict:original.sourceConflict||false};
  Object.assign(data,productMedia(input,original));
 }else if(kind==='category'){
  const parentId=text(input.parentId,90);if(parentId&&(parentId===id||!store.catalogue.categories.some(item=>item.id===parentId&&item.status!=='archived')))fail(400,'Hibás szülőkategória.');
  let parent=parentId;const seen=new Set([id]);while(parent){if(seen.has(parent))fail(400,'Körkörös kategóriahierarchia.');seen.add(parent);parent=store.catalogue.categories.find(item=>item.id===parent)?.parentId||'';}
  data={id,label:text(input.label,100,true),description:text(input.description,800),headline:text(input.headline,160),slug:text(input.slug,90)||id,parentId,color:/^#[0-9a-f]{6}$/i.test(input.color)?input.color:'#e6c9f0'};
  if(!/^[a-z0-9-]+$/.test(data.slug)||store.catalogue.categories.some(item=>item.id!==id&&(item.slug===data.slug||item.previousSlugs?.includes(data.slug))&&item.status!=='archived'))fail(400,'Ez a kategória-webcím már foglalt vagy érvénytelen.');
  const previous=store.catalogue.categories.find(item=>item.id===id);
  data.previousSlugs=[...new Set([...(previous?.previousSlugs||[]),...(previous?.slug&&previous.slug!==data.slug?[previous.slug]:[])])].filter(value=>value!==data.slug);
  if(status==='archived'&&store.catalogue.products.some(item=>item.status!=='archived'&&item.categories.includes(id)))fail(409,'Előbb sorold át a kategóriában lévő termékeket.');
 }else if(kind==='ingredient'){
  data={id,label:text(input.label,100,true)};
  if(status==='archived'&&store.catalogue.products.some(item=>item.status!=='archived'&&item.ingredients.some(ingredient=>ingredient.id===id)))fail(409,'Ezt az összetevőt még használja egy termék.');
 }else if(kind==='recipe'){
  const productIds=strings(input.productIds||[],30);if(productIds.some(key=>!store.catalogue.products.some(item=>item.id===key&&item.status!=='archived')))fail(400,'Ismeretlen kapcsolódó termék.');
  const ingredients=list(input.ingredients||[],60).map(item=>text(item,300,true)),steps=list(input.steps||[],30).map(item=>text(item,1500,true));
  if(status==='published'&&(!ingredients.length||!steps.length||!productIds.length))fail(400,'A recepthez hozzávalók, elkészítési lépések és kapcsolódó termék szükséges.');
  data={id,title:text(input.title,160,true),excerpt:text(input.excerpt,600),minutes:int(input.minutes??30,1,1440),servings:int(input.servings??2,1,100),productIds,ingredients,steps,tip:text(input.tip,1500),image:input.image?imageUrl(input.image):'',color:/^#[0-9a-f]{6}$/i.test(input.color)?input.color:'#ffe383'};
 }else if(kind==='coupon'){
  const type=input.type;if(!['percent','fixed'].includes(type))fail(400,'Hibás kupontípus.');
  const code=text(input.code,40,true).toUpperCase();if(slug(code)!==id||!/^[A-Z0-9-]{2,40}$/.test(code))fail(400,'A kuponkód nagybetűt, számot és kötőjelet tartalmazhat.');
  const expiresAt=text(input.expiresAt,40);if(expiresAt&&!Number.isFinite(Date.parse(expiresAt)))fail(400,'Hibás lejárati dátum.');
  data={id,code,type,amount:int(input.amount,1,type==='percent'?100:10000000),minimumMinor:int(input.minimumMinor||0,0,100000000),expiresAt};
 }else if(kind==='setting'&&id==='seo'){
  if(status!=='published')fail(400,'A SEO-beállításokat közzétett állapotban kell menteni.');
  const pages=input.pages||{};
  if(typeof pages!=='object'||Array.isArray(pages)||Object.keys(pages).some(path=>!seoPages.some(p=>p.path===path)))fail(400,'Ismeretlen SEO-oldal.');
  const verification=text(input.verification,200);if(verification&&!/^[A-Za-z0-9_-]+$/.test(verification))fail(400,'Csak a Google ellenőrzőkódját add meg, ne HTML-t.');
  data={id,indexingEnabled:input.indexingEnabled===true,verification,pages:Object.fromEntries(Object.entries(pages).map(([path,value])=>[path,validateSeo(value)]))};
 }else if(kind==='setting'&&id==='smartbill'){
  if(status!=='published')fail(400,'A SmartBill-beállítás csak aktív állapotban menthető.');
  data={id,...validateSmartbillSettings(input)};
 }else if(kind==='setting'&&id==='shipping'){
  const methods=list(input.methods,10);const valid=shippingMethods({SHIPPING_METHODS_JSON:JSON.stringify(methods)});if(valid.length!==methods.length)fail(400,'Ellenőrizd a szállítási díjakat és kézbesítési időket.');data={id,methods:valid};
 }else if(kind==='setting'&&id==='upsell'){
  const enabled=input.enabled===true,productId=text(input.productId,90),product=store.catalogue.products.find(item=>item.id===productId&&item.status==='published');
  if(enabled&&!product)fail(400,'Aktív upsellhez válassz egy közzétett terméket.');
  data={id,enabled,thresholdMinor:int(input.thresholdMinor,0,100000000),productId:product?.id||'',discountPercent:int(input.discountPercent,1,90),title:text(input.title,120,true),copy:text(input.copy,500,true)};
 }else if(kind==='setting'&&id==='gls'){
  if(status!=='published')fail(400,'A GLS-beállítás csak aktív állapotban menthető.');
  data={id,...validateGlsSettings(input)};
 }else fail(404,'Ismeretlen adattípus.');
 if(['product','category','recipe'].includes(kind))data.seo=validateSeo(input.seo);
 return {...data,status,revision:text(input.revision,100)||'new'};
}
async function audit(db,user,action,kind,id){await q(db,'INSERT INTO store_admin_audit(id,actor_id,action,entity,entity_id,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),user.userId,action,kind,id,time()).run();}
async function save(db,user,kind,data,isNew){
 const {status,revision,...payload}=data;
 if(isNew&&(recordDefaults(kind).some(item=>item.id===data.id)||await q(db,'SELECT id FROM store_records WHERE kind=? AND id=?',kind,data.id).first()))fail(409,'Ez az azonosító már létezik.');
 const previous=await q(db,'SELECT revision FROM store_records WHERE kind=? AND id=?',kind,data.id).first();
 if(!isNew&&(!previous&&!recordDefaults(kind).some(item=>item.id===data.id))&&!(kind==='setting'&&['shipping','seo','smartbill','upsell','gls'].includes(data.id)))fail(404,'Nem található bejegyzés.');
 if(previous&&previous.revision!==revision)fail(409,'Másik mentés óta megváltozott az adat. Frissítsd a listát.');
 if(!previous&&revision!=='seed'&&revision!=='new')fail(409,'Elavult adatverzió.');
 const updated=await q(db,`INSERT INTO store_records(kind,id,payload_json,status,revision,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (?<>'product' OR NOT EXISTS(SELECT 1 FROM store_records WHERE kind='product' AND id<>? AND json_extract(payload_json,'$.sku')=?))
 AND (?<>'product' OR ?>=(SELECT COALESCE(SUM(quantity),0) FROM store_stock_reservations WHERE product_id=? AND expires_at>?))
 ON CONFLICT(kind,id) DO UPDATE SET payload_json=excluded.payload_json,status=excluded.status,revision=excluded.revision,updated_at=excluded.updated_at WHERE store_records.revision=?
 AND (?<>'product' OR json_extract(store_records.payload_json,'$.sku')=? OR (NOT EXISTS(SELECT 1 FROM store_stock_reservations WHERE product_id=? AND expires_at>?) )) RETURNING id`,kind,data.id,JSON.stringify(payload),status,crypto.randomUUID(),time(),time(),kind,data.id,data.sku||'',kind,data.stockQuantity??0,data.id,Math.floor(Date.now()/1000),revision,kind,data.sku||'',data.id,Math.floor(Date.now()/1000)).first();
 if(!updated)fail(409,'Az adat időközben megváltozott, vagy a SKU már használatban van. Frissítsd a listát.');
 await audit(db,user,isNew?'create':'update',kind,data.id);
}
async function overview(db,user,env){
 const [store,orders,customers,subscribers,auditRows]=await Promise.all([
  loadStore(db,{admin:true,env}),
  all(db,`SELECT o.*,${refundColumns()},c.email,c.full_name,c.phone,p.customer_json,ops.fulfillment_status,ops.tracking_url,ops.note,ops.revision AS operation_revision,g.parcel_number AS gls_parcel_number,g.status AS gls_status FROM customer_orders o LEFT JOIN customers c ON c.id=o.user_id LEFT JOIN payment_checkouts p ON p.id=o.id LEFT JOIN store_order_operations ops ON ops.order_id=o.id LEFT JOIN gls_shipments g ON g.order_id=o.id ORDER BY o.created_at DESC LIMIT 200`),
  all(db,`SELECT c.id,c.email,c.full_name,c.phone,c.created_at,COUNT(o.id) AS order_count FROM customers c LEFT JOIN customer_orders o ON o.user_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200`),
  all(db,'SELECT email,status,created_at,updated_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 200'),
  all(db,'SELECT action,entity,entity_id,created_at FROM store_admin_audit ORDER BY created_at DESC LIMIT 50')
 ]);
 const totals=await q(db,"SELECT COUNT(*) AS orders,COALESCE(SUM(total_minor),0) AS revenue,(SELECT COALESCE(SUM(r.amount_minor),0) FROM payment_refunds r JOIN customer_orders o ON o.id=r.checkout_id WHERE r.status='succeeded' AND o.kind='stripe' AND o.status='paid' AND o.currency='HUF') AS refunded FROM customer_orders WHERE kind='stripe' AND status='paid' AND currency='HUF'").first();
 await ensureTrackingLinks(db,orders);const origin='https://spicelaboratory.eu';
 return {user:{email:user.email,name:user.fullName||user.email,provider:user.provider||'sites'},...store,orders:orders.map(row=>({...row,...refundSummary(row),trackingPageUrl:row.trackingToken?origin+'/kovetes/'+row.trackingToken:'',items:JSON.parse(row.items_json),shipping:row.shipping_json?JSON.parse(row.shipping_json):null,customer:row.customer_json?JSON.parse(row.customer_json):null,items_json:undefined,shipping_json:undefined,customer_json:undefined,trackingToken:undefined})),customers,subscribers,audit:auditRows,totals,seoState:seoState(seoSetting(store),env),config:commerceConfig(await stripeRuntime(await runtimeEnv(db,env)))};
}
async function upload(request,{db,bucket,user}){
 if(!bucket)fail(503,'A képtár nem érhető el.');
 const bytes=await limited(request,8*1024*1024),type=request.headers.get('content-type')||'';
 if(!type.startsWith('multipart/form-data'))fail(415,'Képfájl feltöltése szükséges.');
 const form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();
 // FilePond sends its metadata JSON and the binary file under the same name.
 const files=form.getAll('file').filter(item=>typeof item?.arrayBuffer==='function'),file=files[0];
 if(files.length!==1||file.size>7*1024*1024)fail(400,'Egy legfeljebb 7 MB-os, előkészített képfájl szükséges.');
 const data=new Uint8Array(await file.arrayBuffer());let extension,mime;
 if(data.length>12&&data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71){extension='png';mime='image/png';}
 else if(data.length>3&&data[0]===255&&data[1]===216&&data[2]===255){extension='jpg';mime='image/jpeg';}
 else if(new TextDecoder().decode(data.slice(0,4))==='RIFF'&&new TextDecoder().decode(data.slice(8,12))==='WEBP'){extension='webp';mime='image/webp';}
 else fail(400,'JPG-, PNG- vagy WebP-képfájl szükséges.');
 const profile=form.get('profile')==='recipe'?'recipe':'product';
 let processed;try{processed=await processImage(data,{fit:form.get('fit')==='cover'?'cover':'contain',profile});}catch(error){fail(400,error.message||'A képet nem sikerült feldolgozni.');}
 const id=crypto.randomUUID(),prefix=id+'-opt'+(profile==='recipe'?'-r':''),filename=prefix+'.webp',url='/media/'+filename;
 for(const image of processed.files)await bucket.put('store-media/'+prefix+image.suffix+'.webp',image.bytes,{httpMetadata:{contentType:'image/webp',cacheControl:'public, max-age=31536000, immutable'}});
 const originalBytes=data.length,storedBytes=processed.files[0].bytes.length;
 const media={id,url,name:text(file.name,180)||filename,alt:text(form.get('alt'),300),title:text(form.get('title'),180),caption:text(form.get('caption'),500),width:processed.files[0].width,height:processed.files[0].height,originalBytes,storedBytes,fit:processed.fit,profile,variants:processed.files.map(({suffix,width,height,bytes})=>({url:'/media/'+prefix+suffix+'.webp',width,height,bytes:bytes.length})),status:'published',revision:'new'};
 await save(db,user,'media',media,true);
 const row=await q(db,"SELECT revision FROM store_records WHERE kind='media' AND id=?",id).first();
 return json({saved:true,url,originalBytes,storedBytes,variants:processed.files.length,media:{...media,revision:row.revision}},201);
}
const csvCell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
export async function handleAdminRequest(request,ctx){
 const {db,user,env={},bucket}=ctx;
 try{
  if(!user?.userId||!user?.email)return json({error:'Jelentkezz be a tulajdonosi fiókkal.'},401);
  if(!isStoreAdmin(user,env))return json({error:'Ehhez a felülethez nincs adminisztrátori jogosultságod.'},403);
  if(!db)fail(503,'Az adminisztráció adatbázisa nem érhető el.');
  if(!['GET','HEAD'].includes(request.method))assertSameOrigin(request);
  const parts=new URL(request.url).pathname.replace(/^\/api\/admin\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);
  if(parts[0]==='packing'){
   if(request.method==='GET'&&parts.length===1)return json(await packingQueue(db,new URL(request.url)));
   if(request.method==='GET'&&parts.length===2)return json(await packingDetail(db,env,parts[1]));
   if(request.method==='PUT'&&parts.length===2){const result=await savePacking(db,user,parts[1],await body(request));await audit(db,user,'pack','order',parts[1]);return json(result);}
   if(request.method==='POST'&&parts.length===3&&parts[2]==='label'){await body(request);const result=await packingLabel({...ctx,env},parts[1]);await audit(db,user,'pack-label','order',parts[1]);return json(result,result.created?201:200);}
   fail(405,'Nincs ilyen csomagolási művelet.');
  }
  if(parts.length===1&&parts[0]==='stripe-key'){
   if(request.method==='GET')return json(await stripeKeyStatus(env,bucket));
   if(request.method==='PUT')return json(await saveStripeKey(env,bucket,(await body(request))?.secretKey));
   fail(405,'Nem támogatott művelet.');
  }
  if(parts.length===1&&parts[0]==='stripe-webhook-key'){
   if(request.method==='GET')return json(await stripeWebhookStatus(env,bucket));
   if(request.method==='PUT'){const data=await body(request);return json(await saveStripeWebhook(env,bucket,data?.secretKey,data?.mode));}
   fail(405,'Nem támogatott művelet.');
  }
  if(parts[0]==='withdrawals'){
   if(request.method==='GET'){
    const page=Math.floor(Math.max(1,Math.min(1000000,Number(new URL(request.url).searchParams.get('page'))||1)));
    const rows=await all(db,'SELECT * FROM customer_withdrawals ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?',(page-1)*50);
    const count=await q(db,'SELECT COUNT(*) AS total FROM customer_withdrawals').first();
    return json({requests:rows,page,total:count.total,mailReady:withdrawalMailReady(env)});
   }
   if(request.method==='POST'&&parts.length===3&&parts[2]==='receipt'){
    const row=await q(db,'SELECT * FROM customer_withdrawals WHERE id=?',parts[1]).first();if(!row)fail(404,'Nincs ilyen nyilatkozat.');
    const sent=row.email_status==='sent'||await sendWithdrawalReceipt(db,row,env,ctx.fetcher);return json({sent},sent?200:202);
   }
  }
  if(parts[0]==='omnisend'){
   if(request.method==='GET')return json(await omnisendRead(request,ctx,parts.slice(1)));
   if(['POST','PATCH'].includes(request.method))return json(await omnisendWrite(ctx,parts.slice(1),await body(request),request.method));
   return json({error:'Nincs ilyen Omnisend-művelet.'},404);
  }
  if(parts[0]==='smartbill'){
   if(request.method==='GET'&&parts.length===1)return json(await smartbillStatus(db,env));
   if(request.method==='POST'&&parts.length===2&&parts[1]==='test'){await body(request);return json(await testSmartbill(db,env,ctx.fetcher));}
   if(request.method==='POST'&&parts.length===2&&parts[1]==='stock')return json(await smartbillStock(db,env,await body(request),ctx.fetcher));
   return json({error:'Nem található SmartBill-művelet.'},404);
  }
  if(parts[0]==='gls'&&request.method==='GET'&&parts.length===1)return json(await glsStatus(db,env));
  if(parts[0]==='inventory'){
   if(request.method==='GET'&&parts.length===1)return json(await inventoryOverview(db,env));
   if(request.method==='GET'&&parts.length===2&&parts[1]==='export'){
    const data=await inventoryOverview(db,env),rows=[['Termék','SKU','Állapot','Webshopkészlet (db)','Eladható (db)','Foglalt (db)'],...data.products.map(p=>[p.name,p.sku,p.inventory.label,p.stockQuantity??'',p.availableQuantity??'',p.inventory.reserved??''])];
    return new Response('\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="spice-raktar.csv"'}});
   }
   if(request.method==='POST'&&['sync','reconcile'].includes(parts[1]))fail(410,'A webshop kézi készletet használ.');

   if(request.method==='PUT'&&parts.length===2){
    const input=await body(request),store=await loadStore(db,{admin:true,withInventory:false}),original=store.catalogue.products.find(p=>p.id===parts[1]);if(!original)fail(404,'Nincs ilyen termék.');
    const stockQuantity=int(input.stockQuantity,0,1000000);
    const reserved=await q(db,'SELECT COALESCE(SUM(quantity),0) AS n FROM store_stock_reservations WHERE product_id=? AND expires_at>?',original.id,Math.floor(Date.now()/1000)).first();
    if(stockQuantity<reserved.n)fail(409,'A készlet nem lehet kisebb a lefoglalt mennyiségnél.');
    await save(db,user,'product',{...original,manageStock:true,stockQuantity,revision:input.revision},false);
    return json({saved:true});
   }
   return json({error:'Nincs ilyen raktárművelet.'},404);
  }
  if(request.method==='GET'&&!parts.length)return json(await overview(db,user,env));
  if(request.method==='GET'&&(['analytics','archive'].includes(parts[0])||parts[0]==='export'&&['orders','order-lines','archive'].includes(parts[1])))return await analyticsEndpoint(request,db,parts);
  if(request.method==='GET'&&parts[0]==='customers'&&parts.length===2){
   const profile=await q(db,'SELECT id,email,full_name,phone,created_at FROM customers WHERE id=?',parts[1]).first();if(!profile)fail(404,'A vásárló nem található.');
   const [addresses,invoices]=await Promise.all([all(db,'SELECT kind,recipient,company,tax_id,country,line1,line2,city,postal_code FROM customer_addresses WHERE user_id=?',parts[1]),all(db,'SELECT id,number,issued_at,total_minor,currency FROM customer_invoices WHERE user_id=? ORDER BY issued_at DESC LIMIT 100',parts[1])]);
   return json({profile,addresses,invoices});
  }
  if(request.method==='GET'&&parts[0]==='invoices'&&parts.length===3&&parts[2]==='download'){
   const invoice=await q(db,'SELECT object_key,number FROM customer_invoices WHERE id=?',parts[1]).first();if(!invoice)fail(404,'A számla nem található.');
   const object=await ctx.bucket?.get(invoice.object_key);if(!object)fail(404,'A számlafájl nem érhető el.');
   const name=String(invoice.number).replace(/[^a-zA-Z0-9_-]/g,'_');
   return new Response(object.body,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="szamla-${name}.pdf"`}});
  }
  if(parts[0]==='orders'&&parts.length===3&&parts[2]==='gls-label'&&request.method==='POST'){
   await body(request);const result=await createGlsLabel({db,env,bucket,fetcher:ctx.fetcher,orderId:parts[1]});await audit(db,user,'gls-label','order',parts[1]);return json(result,result.created?201:200);
  }
  if(parts[0]==='orders'&&parts.length===3&&parts[2]==='gls-label'&&request.method==='GET'){
   const label=await glsLabel(db,bucket,parts[1]);return new Response(label.object.body,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`${new URL(request.url).searchParams.get('inline')==='1'?'inline':'attachment'}; filename="gls-${label.parcelNumber}.pdf"`,'X-GLS-Printer-Type':label.object.customMetadata?.printerType||'unknown'}});
  }
  if(parts[0]==='media'&&request.method==='POST'&&parts.length===1)return await upload(request,ctx);
  if(parts[0]==='media'&&parts.length===2&&['PUT','DELETE'].includes(request.method)){
   const input=await body(request),row=await q(db,"SELECT payload_json,status,revision FROM store_records WHERE kind='media' AND id=?",parts[1]).first();if(!row)fail(404,'A kép nem található.');
   const media=JSON.parse(row.payload_json);
   if(request.method==='DELETE'){
    const store=await loadStore(db,{admin:true,withInventory:false});
    if(store.catalogue.products.some(p=>p.image===media.url||p.thumbnailImage===media.url||p.images?.some(i=>i.url===media.url))||store.recipes.some(r=>r.image===media.url)||store.catalogue.categories.some(c=>c.image===media.url))fail(409,'A képet még használja egy termék, kategória vagy recept. Előbb ott távolítsd el.');
   }
   await save(db,user,'media',{...media,id:parts[1],alt:text(input.alt??media.alt,300),title:text(input.title??media.title,180),caption:text(input.caption??media.caption,500),status:request.method==='DELETE'?'archived':input.status==='published'?'published':row.status,revision:input.revision},false);
   return json({saved:true});
  }
  if(parts[0]==='orders'&&parts.length===1&&request.method==='POST'){
   const input=await body(request),email=text(input.email,254,true).toLowerCase();
   if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||!/^[-a-f0-9]{36}$/.test(input.requestId||''))fail(400,'Érvényes e-mail-cím és kérésazonosító szükséges.');
   const items=list(input.items,100),{catalogue}=await loadStore(db);
   if(!items.length||new Set(items.map(item=>item?.id)).size!==items.length||items.some(item=>!Number.isInteger(item?.quantity)||item.quantity<1||item.quantity>99||!catalogue.products.some(p=>p.id===item.id)))fail(400,'Válassz terméket és érvényes mennyiséget.');
   assertAvailable(items,catalogue);const total=cartTotals(items,catalogue.products);
   const shipping=input.shippingMethodId?shippingQuote(shippingMethods(await runtimeEnv(db,env)),{country:input.country,methodId:input.shippingMethodId},total.totalMinor):null;
   if(input.shippingMethodId&&!shipping)fail(400,'Érvénytelen szállítási mód.');
   const previous=await q(db,'SELECT id FROM customer_orders WHERE request_id=? AND kind=?','admin:'+input.requestId,'manual').first();if(previous)return json({saved:true,id:previous.id});
   const existing=await q(db,"SELECT id FROM customers WHERE email=? AND id NOT LIKE 'guest:%' ORDER BY created_at LIMIT 1",email).first();
   const customerId=existing?.id||'guest:manual:'+crypto.randomUUID(),id=crypto.randomUUID(),number='MAN-'+id.slice(0,8).toUpperCase(),fullName=text(input.fullName,100);
   await db.batch([
    q(db,'INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',customerId,email,fullName,'',time(),time()),
    q(db,'INSERT INTO customer_orders(id,user_id,request_id,number,kind,status,total_minor,currency,items_json,created_at,shipping_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,customerId,'admin:'+input.requestId,number,'manual','pending-payment',total.totalMinor+(shipping?.feeMinor||0),'HUF',JSON.stringify(total.lines.map(line=>({productId:line.id,sku:line.product.sku||'',name:line.product.name,priceMinor:line.product.priceMinor,quantity:line.quantity,subtotalMinor:line.subtotalMinor}))),time(),shipping?JSON.stringify(shipping):null),
    q(db,'INSERT INTO store_order_operations(order_id,fulfillment_status,tracking_url,note,revision,updated_at) VALUES(?,?,?,?,?,?)',id,'on-hold','',text(input.note,3000),crypto.randomUUID(),time())
   ]);
   await audit(db,user,'create-manual-order','order',id);return json({saved:true,id,number},201);
  }
  if(parts[0]==='export'&&request.method==='GET'&&['products','orders'].includes(parts[1])){
   const data=await overview(db,user,env),rows=parts[1]==='products'?[['Azonosító','Név','SKU','Ár (Ft)','Készlet','Állapot'],...data.catalogue.products.map(p=>[p.id,p.name,p.sku,p.priceMinor/100,p.manageStock?p.stockQuantity:'Nem követett',p.status])]:[['Rendelésszám','Típus','Fizetési állapot','Teljesítés','Összeg','Pénznem','Létrehozva'],...data.orders.map(o=>[o.number,o.kind,o.status,o.fulfillment_status||'',o.total_minor/100,o.currency,o.created_at])];
   return new Response('\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="spice-${parts[1]}.csv"`}});
  }
  if(parts[0]==='orders'&&parts.length===2&&request.method==='PUT'){
   if(!await q(db,'SELECT id FROM customer_orders WHERE id=?',parts[1]).first())fail(404,'Nincs ilyen rendelés.');
   const input=await body(request);if(!['processing','packing','shipped','completed','on-hold','cancelled'].includes(input.fulfillmentStatus))fail(400,'Hibás teljesítési állapot.');
   const tracking=text(input.trackingUrl,600);if(tracking){let url;try{url=new URL(tracking);}catch{}if(url?.protocol!=='https:'||url.username||url.password)fail(400,'HTTPS csomagkövetési cím szükséges.');}
   const previous=await q(db,'SELECT revision FROM store_order_operations WHERE order_id=?',parts[1]).first();
   if(previous&&input.revision!==previous.revision)fail(409,'A rendelést közben másik mentés módosította.');
   const updated=await q(db,'INSERT INTO store_order_operations(order_id,fulfillment_status,tracking_url,note,revision,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET fulfillment_status=excluded.fulfillment_status,tracking_url=excluded.tracking_url,note=excluded.note,revision=excluded.revision,updated_at=excluded.updated_at WHERE store_order_operations.revision=? RETURNING order_id',parts[1],input.fulfillmentStatus,tracking,text(input.note,3000),crypto.randomUUID(),time(),input.revision||'new').first();
   if(!updated)fail(409,'A rendelés időközben megváltozott.');
   await audit(db,user,'fulfillment','order',parts[1]);return json({saved:true});
  }
  const kind=kinds[parts[0]];
  if(kind&&['POST','PUT','DELETE'].includes(request.method)&&parts.length<=2){
   const input=await body(request),store=await loadStore(db,{admin:true,withInventory:false});
   if(request.method==='POST'&&parts.length!==1)fail(400,'Hibás létrehozási útvonal.');
   if(request.method!=='POST'&&(parts.length!==2||input.id!==parts[1]))fail(400,'Az azonosító nem egyezik.');
   if(request.method==='DELETE')input.status='archived';
   const data=validate(kind,input,store);

   if(kind==='product'&&store.catalogue.products.some(p=>p.id!==data.id&&p.sku===data.sku))fail(409,'Ez a cikkszám már használatban van.');
   if(kind==='product')await assertMappingChange(db,store.catalogue.products.find(p=>p.id===data.id),data.sku);
   if(kind==='product'&&data.manageStock){const reserved=await q(db,'SELECT COALESCE(SUM(quantity),0) AS amount FROM store_stock_reservations WHERE product_id=? AND expires_at>?',data.id,Math.floor(Date.now()/1000)).first();if(data.stockQuantity<reserved.amount)fail(409,'A készlet nem lehet kisebb az aktív fizetésekhez lefoglalt mennyiségnél.');}
   await save(db,user,kind,data,request.method==='POST');return json({saved:true,id:data.id},request.method==='POST'?201:200);
  }
  return json({error:'Nem található adminművelet.'},404);
 }catch(error){return json({error:error instanceof StoreError?error.message:error?.status===403?'Eltérő eredetű kérés.':'A mentés nem sikerült. Frissítsd a listát, majd próbáld újra.'},error instanceof StoreError?error.status:error?.status===403?403:500);}
}
