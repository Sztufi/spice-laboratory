import {query as q,all,fail,loadStore} from './store.mjs';
import {glsConfig,createGlsLabel} from './gls.mjs';

const now=()=>new Date().toISOString();
const eligible=`(o.kind IN ('stripe','manual') AND o.status='paid' OR o.kind='cod' AND o.status IN ('pending-payment','paid','pending')) AND NOT EXISTS(SELECT 1 FROM payment_refunds r WHERE r.checkout_id=o.id AND r.status='succeeded' AND r.amount_minor>0)`;
const joins=`FROM customer_orders o LEFT JOIN payment_checkouts p ON p.id=o.id LEFT JOIN customers c ON c.id=o.user_id LEFT JOIN store_order_operations ops ON ops.order_id=o.id LEFT JOIN gls_shipments g ON g.order_id=o.id LEFT JOIN store_records pack ON pack.kind='packing' AND pack.id=o.id`;
const columns=`o.*,p.customer_json,c.email,c.full_name,c.phone,ops.fulfillment_status,g.parcel_number,g.status AS label_status,pack.payload_json AS pack_json,pack.revision AS pack_revision`;
function actionable(order){return !['cancelled','shipped','completed','on-hold'].includes(order.fulfillment_status);}
function itemsOf(order){const items=JSON.parse(order.items_json);if(!Array.isArray(items)||!items.length||items.some(i=>!i.id||!Number.isInteger(i.quantity)||i.quantity<1))fail(409,'A rendelés tételei nem csomagolhatók.');return items;}
const fingerprint=items=>JSON.stringify(items.map(i=>[i.id,i.sku||'',i.quantity]));
function packingOf(row,items){const value=row.pack_json?JSON.parse(row.pack_json):{};return value.fingerprint===fingerprint(items)?{...value,revision:row.pack_revision}: {counts:items.map(()=>0),packedAt:null,revision:row.pack_revision||'new'};}
async function orderRow(db,id){const order=await q(db,`SELECT ${columns} ${joins} WHERE o.id=? AND ${eligible}`,id).first();if(!order)fail(404,'Nincs ilyen csomagolható éles rendelés.');return order;}
export async function packingQueue(db,url){
 const page=Math.max(1,Math.min(1000000,Math.floor(Number(url.searchParams.get('page'))||1))),view=url.searchParams.get('view')==='done'?'done':'open';
 const state=view==='done'?`ops.fulfillment_status IN ('shipped','completed')`:`COALESCE(ops.fulfillment_status,'processing') NOT IN ('cancelled','shipped','completed','on-hold')`;
 const rows=await all(db,`SELECT ${columns} ${joins} WHERE ${eligible} AND ${state} ORDER BY o.created_at ASC,o.id ASC LIMIT 30 OFFSET ?`,(page-1)*30);
 const total=await q(db,`SELECT COUNT(*) AS n ${joins} WHERE ${eligible} AND ${state}`).first();
 return {page,view,total:total.n,orders:rows.map(row=>{const customer=row.customer_json?JSON.parse(row.customer_json):{},items=itemsOf(row),pack=packingOf(row,items);return {id:row.id,number:row.number,createdAt:row.created_at,name:customer.shipping?.name||customer.billing?.name||row.full_name||'Vendég',units:items.reduce((n,i)=>n+i.quantity,0),packedAt:pack.packedAt,labelStatus:row.label_status,parcelNumber:row.parcel_number,fulfillmentStatus:row.fulfillment_status||'processing'};})};
}
export async function packingDetail(db,env,id){
 const row=await orderRow(db,id),items=itemsOf(row),store=await loadStore(db,{admin:true,withInventory:false}),config=await glsConfig(db,env),customer=row.customer_json?JSON.parse(row.customer_json):{};
 return {id:row.id,number:row.number,status:row.status,kind:row.kind,currency:row.currency,totalMinor:row.total_minor,customer,recipient:row.full_name,email:row.email,phone:row.phone,shipping:row.shipping_json?JSON.parse(row.shipping_json):null,fulfillmentStatus:row.fulfillment_status||'processing',actionable:actionable(row),packing:packingOf(row,items),labelStatus:row.label_status,parcelNumber:row.parcel_number,glsReady:config.ready,maxJarsPerBox:config.maxJarsPerBox,items:items.map(i=>{const p=store.catalogue.products.find(p=>p.id===i.id);return {...i,sku:i.sku||p?.sku||'',image:p?.thumbnailImage||p?.image||''};})};
}
export async function savePacking(db,user,id,input){
 const row=await orderRow(db,id);if(!actionable(row))fail(409,'Ez a rendelés várakozik, vagy már lezárták.');
 const items=itemsOf(row),previous=packingOf(row,items);
 if(input.revision!==previous.revision)fail(409,'A csomagolást másik munkamenet módosította. Nyisd meg újra.');
 if(!Array.isArray(input.counts)||input.counts.length!==items.length||input.counts.some((n,index)=>!Number.isInteger(n)||n<0||n>items[index].quantity))fail(400,'Ellenőrizd a becsomagolt darabszámokat.');
 if(row.label_status&&row.label_status!=='ready')fail(409,'A címkeigény ellenőrzésre vár; a csomag nem módosítható.');
 const complete=input.counts.every((n,index)=>n===items[index].quantity);
 if(!Number.isInteger(input.weightGrams)||input.weightGrams<50||input.weightGrams>30000)fail(400,'A lemért, teljes csomagtömeg 50–30000 g lehet.');
 if(row.label_status==='ready'&&!complete)fail(409,'Már van GLS-címke. A csomagolás nem állítható vissza.');
 const data={fingerprint:fingerprint(items),counts:input.counts,weightGrams:input.weightGrams,packedAt:complete?(previous.packedAt||now()):null,packedBy:user.userId};
 const revision=crypto.randomUUID(),result=await q(db,`INSERT INTO store_records(kind,id,payload_json,status,revision,created_at,updated_at) VALUES('packing',?,?,'published',?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload_json=excluded.payload_json,revision=excluded.revision,updated_at=excluded.updated_at WHERE store_records.revision=? RETURNING id`,id,JSON.stringify(data),revision,now(),now(),input.revision).first();
 if(!result)fail(409,'A csomagolás közben megváltozott. Nyisd meg újra.');
 return {saved:true,packing:{...data,revision}};
}
export async function packingLabel(ctx,id){
 const row=await orderRow(ctx.db,id),items=itemsOf(row),pack=packingOf(row,items);
 if(!actionable(row))fail(409,'Ez a rendelés már nem csomagolható.');
 if(!pack.packedAt||!pack.counts?.every((n,i)=>n===items[i]?.quantity)||pack.counts.length!==items.length)fail(409,'Előbb ellenőrizd és mentsd az összes tételt.');
 const config=await glsConfig(ctx.db,ctx.env);
 if(items.reduce((n,i)=>n+i.quantity,0)>config.maxJarsPerBox)fail(409,'Ez a rendelés több dobozt igényel. A többcsomagos feladást külön kell előkészíteni; nem készítünk hibás egycsomagos címkét.');
 return createGlsLabel({...ctx,orderId:id,printerType:'Thermo',weightGrams:pack.weightGrams});
}
