import {all,query as q,loadStore,fail} from './store.mjs';
import {reportOptions,startOfDay,shiftDay,dayCount,buildAnalytics,normalizeOrder} from './analytics-core.mjs';
import {refundColumns} from './refunds.mjs';
import {attachRefundReport} from './refund-report.mjs';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const source=`WITH raw AS (
 SELECT o.*,${refundColumns()},(SELECT json_group_array(json_object('id',r.id,'amountMinor',r.amount_minor,'currency',r.currency,'status',r.status,'createdAt',r.created_at,'succeededAt',r.succeeded_at)) FROM payment_refunds r WHERE r.checkout_id=o.id) AS refunds_json,COALESCE(json_extract(CASE WHEN json_valid(p.customer_json) THEN p.customer_json ELSE '{}' END,'$.billing.email'),c.email,'') AS email,
 COALESCE(json_extract(CASE WHEN json_valid(p.customer_json) THEN p.customer_json ELSE '{}' END,'$.billing.name'),c.full_name,'') AS full_name,c.phone,
 p.customer_json,ops.fulfillment_status,ops.tracking_url,ops.note,ops.revision AS operation_revision
 FROM customer_orders o LEFT JOIN customers c ON c.id=o.user_id LEFT JOIN payment_checkouts p ON p.id=o.id LEFT JOIN store_order_operations ops ON ops.order_id=o.id
 ), source AS (SELECT raw.*,CASE WHEN trim(email) LIKE '%_@_%._%' AND email NOT LIKE '%.invalid' THEN 'email:'||lower(trim(email)) ELSE 'id:'||user_id END AS identity FROM raw)`;
const scopeSql=(scope,alias='o')=>scope==='all'?'1=1':scope==='live'?`${alias}.kind='stripe' AND ${alias}.status='paid'`:scope==='test'?`${alias}.kind='stripe-test'`:`${alias}.kind='demo'`;
const validPaidSql=`json_valid(s.items_json) AND json_type(s.items_json)='array' AND json_array_length(s.items_json)>0
 AND NOT EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(s.items_json) THEN s.items_json ELSE '[]' END) i WHERE i.type<>'object' OR COALESCE(json_type(CASE WHEN i.type='object' THEN i.value ELSE '{}' END,'$.quantity'),'')<>'integer' OR COALESCE(json_extract(CASE WHEN i.type='object' THEN i.value ELSE '{}' END,'$.quantity'),0)<=0 OR COALESCE(json_type(CASE WHEN i.type='object' THEN i.value ELSE '{}' END,'$.subtotalMinor'),'')<>'integer' OR COALESCE(json_extract(CASE WHEN i.type='object' THEN i.value ELSE '{}' END,'$.subtotalMinor'),-1)<0)
 AND typeof(s.total_minor)='integer' AND s.total_minor>=0
 AND (SELECT COALESCE(SUM(json_extract(CASE WHEN i.type='object' THEN i.value ELSE '{}' END,'$.subtotalMinor')),0) FROM json_each(CASE WHEN json_valid(s.items_json) THEN s.items_json ELSE '[]' END) i)
 - COALESCE(json_extract(CASE WHEN json_valid(s.discount_json) THEN s.discount_json ELSE '{}' END,'$.discountMinor'),0)
 + COALESCE(json_extract(CASE WHEN json_valid(s.shipping_json) THEN s.shipping_json ELSE '{}' END,'$.feeMinor'),0)=s.total_minor`;
function archiveFilter(opt){
 const where=['o.created_at>=?','o.created_at<?',scopeSql(opt.scope)],args=[startOfDay(opt.from,opt.tz),startOfDay(shiftDay(opt.to,1),opt.tz)];
 if(opt.status){where.push('o.status=?');args.push(opt.status);}
 if(opt.fulfillment){where.push("COALESCE(o.fulfillment_status,'processing')=?");args.push(opt.fulfillment);}
 if(opt.product){where.push("EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.items_json) THEN o.items_json ELSE '[]' END) item WHERE COALESCE(json_extract(item.value,'$.productId'),json_extract(item.value,'$.id'))=?)");args.push(opt.product);}
 if(opt.country){where.push("json_extract(CASE WHEN json_valid(o.shipping_json) THEN o.shipping_json ELSE '{}' END,'$.country')=?");args.push(opt.country);}
 if(opt.query){where.push("instr(lower(o.number||' '||o.email||' '||o.full_name),lower(?))>0");args.push(opt.query);}
 return {where:where.join(' AND '),args};
}
export function publicArchiveOrder(row){
 const {items_json,shipping_json,discount_json,customer_json,refunds_json,...order}=normalizeOrder(row);
 if(!order.valid)order.rawItemsForReview=items_json;
 return order;
}
export async function analyticsReport(db,params,now=new Date()){
 const opt=reportOptions(params,now);if(opt.scope==='all')fail(400,'Az elemzéshez válaszd külön az éles, teszt- vagy próbavásárlásokat.');
 const previousFrom=shiftDay(opt.from,-dayCount(opt.from,opt.to)),historyFrom=shiftDay(opt.to,-90),from=previousFrom<historyFrom?previousFrom:historyFrom,end=startOfDay(shiftDay(opt.to,1),opt.tz);
 const paid=opt.scope==='demo'?"s.kind='demo' AND s.status='demo-completed'":opt.scope==='test'?"s.kind='stripe-test' AND s.status='paid'":"s.kind='stripe' AND s.status='paid'";
 const size=await q(db,source+` SELECT COUNT(*) AS amount,COALESCE(SUM(length(CAST(o.items_json AS BLOB))),0) AS bytes FROM source o WHERE o.created_at>=? AND o.created_at<? AND ${scopeSql(opt.scope)}`,startOfDay(from,opt.tz),end).first();
 if(size.amount>20000||size.bytes>12*1024*1024)fail(422,'Túl nagy elemzési ablak (20 000 rendelés vagy 12 MB tételadat fölött). Szűkítsd az időszakot. A teljes archívum letölthető; csonkolt riport nem készül.');
 const rows=await all(db,source+`, firsts AS (SELECT identity,MIN(created_at) AS first_paid_at,MIN(created_at||'|'||id) AS first_paid_key,MAX(created_at) AS last_paid_at,COUNT(*) AS lifetime_orders,SUM(total_minor) AS lifetime_paid_minor FROM source s WHERE ${paid} AND ${validPaidSql} AND s.currency='HUF' AND s.created_at<? GROUP BY identity)
 SELECT o.id,o.user_id,o.number,o.kind,o.status,o.total_minor,o.currency,o.items_json,o.shipping_json,o.discount_json,o.created_at,o.email,o.full_name,o.identity,o.fulfillment_status,f.first_paid_at,f.first_paid_key,f.last_paid_at,f.lifetime_orders,f.lifetime_paid_minor
 FROM source o LEFT JOIN firsts f ON f.identity=o.identity WHERE o.created_at>=? AND o.created_at<? AND ${scopeSql(opt.scope)} ORDER BY o.created_at,o.id LIMIT 20001`,end,startOfDay(from,opt.tz),end);
 if(rows.length>20000)fail(422,'Ez az elemzési ablak a biztonsági 20 000 rendeléses korlát fölött van. Szűkítsd az időszakot; a teljes archívum exportja ettől függetlenül elérhető. Nem készül csonkolt riport.');
 const first=await q(db,source+` SELECT MIN(s.created_at) AS first FROM source s WHERE ${paid} AND ${validPaidSql} AND s.currency='HUF' AND s.created_at<?`,end).first();
 const {catalogue}=await loadStore(db,{admin:true});
 const filter=archiveFilter(opt);
 const refunds=opt.scope==='demo'?[]:await all(db,source+` SELECT r.id,r.checkout_id,r.amount_minor,r.currency,r.status,r.created_at,r.succeeded_at,o.number FROM payment_refunds r JOIN source o ON o.id=r.checkout_id WHERE ${filter.where.replaceAll('o.created_at','r.created_at')} AND r.status='succeeded' AND o.currency='HUF' AND ${validPaidSql.replaceAll('s.','o.')} ORDER BY r.created_at,r.id LIMIT 20001`,...filter.args);
 if(refunds.length>20000)fail(422,'Túl sok visszatérítés az elemzési ablakban. Szűkítsd az időszakot; az archívum exportja teljes.');
 return attachRefundReport(buildAnalytics(rows,catalogue,opt,{generatedAt:now.toISOString(),firstPaidAt:first?.first||null,reportLimit:20000,historyFrom:from,identityBasis:'normalizált e-mail, ennek hiányában fiókazonosító'}),refunds);
}
export async function archivePage(db,params,now=new Date()){
 const opt=reportOptions(params,now,true),filter=archiveFilter(opt);
 const count=await q(db,source+' SELECT COUNT(*) AS total FROM source o WHERE '+filter.where,...filter.args).first();
 const rows=await all(db,source+' SELECT o.* FROM source o WHERE '+filter.where+' ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?',...filter.args,opt.pageSize,(opt.page-1)*opt.pageSize);
 return {filters:opt,total:count.total,page:opt.page,pageSize:opt.pageSize,pages:Math.ceil(count.total/opt.pageSize),orders:rows.map(publicArchiveOrder)};
}
export const csvCell=value=>{
 let text=typeof value==='number'&&Number.isFinite(value)?String(value).replace('.',','):String(value??'');if(/^[\s\uFEFF]*[=+@\-]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
};
export const csvText=rows=>'\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
const attachment=(body,name,type)=>new Response(body,{headers:{...headers,'Content-Type':type,'Content-Disposition':`attachment; filename="${name}"`}});
const exportFields=['Rendelés','Azonosító','Dátum (UTC)','Típus','Fizetés','Teljesítés','Vásárló','E-mail','Eredeti összeg','Pénznem','Termékérték','Kuponkedvezmény','Szállítás','Célország','Egyezik az összesítő','Belső megjegyzés','Sikeres visszatérítés','Visszatérítésre vár','Megtartott összeg','Visszatérítési állapot'];
const orderCells=o=>[o.number,o.id,o.created_at,o.kind,o.status,o.fulfillment_status||'processing',o.full_name,o.email,o.total_minor/100,o.currency,o.gross/100,o.discountMinor/100,o.shippingMinor/100,o.country,o.valid?'igen':'ellenőrzendő',o.note||'',o.refundedMinor/100,o.refundPendingMinor/100,o.retainedMinor/100,o.refundStatus];
export async function archiveExport(db,params,type,now=new Date()){
 if(!['orders','order-lines','archive'].includes(type))fail(404,'Ismeretlen archívumformátum.');
 const opt=reportOptions(params,now,true),filter=archiveFilter(opt),generatedAt=now.toISOString();
 // Keyset pagination, not the overview's latest-200 slice. No silent export row cap.
 const encoder=new TextEncoder();let cursor=null,started=false,first=true;
 const stream=new ReadableStream({async pull(controller){
  try{
   if(!started){started=true;controller.enqueue(encoder.encode(type==='archive'?JSON.stringify({schemaVersion:2,generatedAt,filters:opt,note:'Rendelési archívum, nem teljes adatbázis- vagy számlafájl-mentés. A visszatérítési naplót is tartalmazza; adóbontás és számlafájlok nélkül.'}).replace(/}$/,'')+',"orders":[':'\ufeff'+(type==='orders'?exportFields:[...exportFields,'Termékazonosító','Terméknév (rendelési pillanatkép)','Mennyiség','Egységár','Tételösszeg kupon előtt']).map(csvCell).join(';')+'\r\n'));return;}
   const extra=cursor?' AND (o.created_at<? OR (o.created_at=? AND o.id<?))':'';
   const rows=await all(db,source+' SELECT o.* FROM source o WHERE '+filter.where+' AND o.created_at<=?'+extra+' ORDER BY o.created_at DESC,o.id DESC LIMIT 100',...filter.args,generatedAt,...(cursor?[cursor.date,cursor.date,cursor.id]:[]));
   if(!rows.length){if(type==='archive')controller.enqueue(encoder.encode(']}'));controller.close();return;}
   let chunk='';for(const raw of rows){const order=publicArchiveOrder(raw);if(type==='archive'){chunk+=(first?'':',')+JSON.stringify(order);first=false;}else if(type==='orders')chunk+=orderCells(order).map(csvCell).join(';')+'\r\n';else for(const item of order.items)chunk+=[...orderCells(order),item.productId||item.id,item.name,item.quantity,Number.isFinite(item.priceMinor)?item.priceMinor/100:'',item.subtotalMinor/100].map(csvCell).join(';')+'\r\n';}
   cursor={date:rows.at(-1).created_at,id:rows.at(-1).id};controller.enqueue(encoder.encode(chunk));
  }catch(error){controller.error(error);}
 }});
 return attachment(stream,`spice-${type}-${opt.from}-${opt.to}.${type==='archive'?'json':'csv'}`,type==='archive'?'application/json; charset=utf-8':'text/csv; charset=utf-8');
}
export async function analyticsEndpoint(request,db,parts){
 const params=new URL(request.url).searchParams;
 try{
  if(parts[0]==='analytics'){
   const report=await analyticsReport(db,params);
   if(parts[1]==='export'){
    const kind=params.get('report')||'timeline';
    const definitions={timeline:[['Időszak','Rendelések','Darab','Fizetett összeg','Termékérték kupon után','Kedvezmény','Szállítás'],report.timeline.map(r=>[r.period,r.orders,r.units,r.paidMinor/100,r.productMinor/100,r.discountMinor/100,r.shippingMinor/100])],products:[['Termék','SKU','Darab','Rendelések','Termékérték kupon után','Kedvezmény','ABC'],report.products.map(r=>[r.name,r.sku,r.units,r.orders,r.productMinor/100,r.discountMinor/100,r.abc])],'product-time':[['Időszak','Termék','Darab','Termékérték kupon után'],report.productTime.map(r=>[r.period,r.name,r.units,r.productMinor/100])],customers:[['Név','E-mail','Időszaki rendelések','Időszaki fizetett összeg','Visszatérő','Első vásárlás az időszakban','Első vásárlás','Utolsó vásárlás','Összes korábbi rendelés','Összes korábbi fizetett összeg'],report.customers.map(c=>[c.name,c.email,c.orders,c.paidMinor/100,c.returning?'igen':'nem',c.newInPeriod?'igen':'nem',c.first,c.last,c.lifetimeOrders,c.lifetimePaidMinor/100])],inventory:[['Termék','Most rögzített készlet','28 nap eladás','Átlag db/nap','Becsült készletnap'],report.inventory.map(r=>[r.name,r.stock??'nem követett',r.sold28,r.perDay,r.daysRemaining??'nincs becslés'])]};
    if(kind==='forecast'){
     if(!report.forecast.orders.available)fail(422,'Nincs elegendő adat az előrejelzés exportjához.');
     definitions.forecast=[['Becsült nap','Becsült rendelések','Becsült fizetett összeg (Ft)','Becsült darab'],report.forecast.orders.days.map((d,i)=>[d.day,d.value,report.forecast.paid.days[i].value/100,report.forecast.units.days[i].value])];
    }
    definitions.refunds=[['Visszatérítés ID','Rendelés','Rendelés ID','Létrehozás (UTC)','Siker megfigyelve (UTC)','Összeg','Pénznem','Állapot'],report.refunds.map(r=>[r.id,r.number,r.checkout_id,r.created_at,r.succeeded_at,r.amount_minor/100,r.currency,r.status])];
    definitions.timeline[0].push('Sikeres visszatérítés','Megtartott összeg');report.timeline.forEach((r,i)=>definitions.timeline[1][i].push(r.refundedMinor/100,r.retainedMinor/100));
    if(!Object.hasOwn(definitions,kind))fail(404,'Ismeretlen riport.');const [head,rows]=definitions[kind];
    return attachment(csvText([['Időzóna','Adatforrás','Riport készült',...head],...rows.map(row=>[report.filters.tz,report.filters.scope,report.generatedAt,...row])]),`spice-${kind}-${report.filters.from}-${report.filters.to}.csv`,'text/csv; charset=utf-8');
   }
   return Response.json(report,{headers});
  }
  if(parts[0]==='archive'&&parts.length===2){const row=await q(db,source+' SELECT * FROM source WHERE id=?',parts[1]).first();if(!row)fail(404,'A rendelés nem található.');return Response.json(publicArchiveOrder(row),{headers});}
  if(parts[0]==='archive')return Response.json(await archivePage(db,params),{headers});
  return await archiveExport(db,params,parts[1]);
 }catch(error){return Response.json({error:Number.isInteger(error.status)?error.message:'Az elemzés nem tölthető be. Próbáld újra később.'},{status:Number.isInteger(error.status)?error.status:500,headers});}
}
