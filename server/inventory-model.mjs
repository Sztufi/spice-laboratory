// SmartBill is the source of physical stock; reservations and unposted local
// sales are separate. Importing the same physical count must not replenish sales.
export const sourceKey=c=>JSON.stringify([c.email,c.companyVatCode,c.warehouseName]);
export const stockDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const labels={ok:'Szinkronban',zero:'Elfogyott',low:'Alacsony készlet',missing_sku:'Hiányzó SKU',missing:'Nincs készlettétel',duplicate:'Többszörös SKU',invalid:'Hibás mennyiség',unit:'Nem darab mértékegység',stale:'Elavult készlet',unverified:'Még nem ellenőrzött',changed:'Megváltozott párosítás',manual:'Kézi készlet'};
export function resolveConfig(saved={},env={}){
 return {email:saved.email??env.SMARTBILL_EMAIL??'',companyVatCode:saved.companyVatCode??env.SMARTBILL_COMPANY_VAT_CODE??'',seriesName:saved.seriesName??env.SMARTBILL_INVOICE_SERIES??'',warehouseName:saved.warehouseName??env.SMARTBILL_WAREHOUSE_NAME??'',tokenConfigured:!!env.SMARTBILL_API_TOKEN,v3TokenConfigured:!!env.SMARTBILL_V3_TOKEN,invoiceIssuing:false,stockSync:saved.stockSyncEnabled??(env.SMARTBILL_STOCK_SYNC_ENABLED==='true'),syncIntervalSeconds:60,maxStockAgeSeconds:300};
}
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
export async function inventoryProducts(db,products,config){
 if(!config.stockSync)return products;
 const [snapshots,held,reservations,state]=await Promise.all([
  all(db,'SELECT * FROM store_smartbill_stock'),
  all(db,'SELECT product_id,SUM(quantity) AS amount FROM store_stock_movements WHERE smartbill_confirmed_at IS NULL GROUP BY product_id'),
  all(db,'SELECT product_id,SUM(quantity) AS amount FROM store_stock_reservations WHERE expires_at>? GROUP BY product_id',Math.floor(Date.now()/1000)),
  db.prepare("SELECT * FROM store_inventory_sync WHERE id='smartbill'").bind().first()
 ]);
 const key=sourceKey(config),codes=new Map();for(const p of products)if(p.sku&&p.status!=='archived')codes.set(p.sku,(codes.get(p.sku)||0)+1);
 return products.map(p=>{
  if(p.status==='archived')return p;
  const s=snapshots.find(row=>row.product_id===p.id),pending=held.find(r=>r.product_id===p.id)?.amount||0,reserved=reservations.find(r=>r.product_id===p.id)?.amount||0;
  let status=!p.sku?'missing_sku':codes.get(p.sku)>1?'duplicate':!s?'unverified':s.sku!==p.sku||s.source_key!==key?'changed':s.generation!==state?.generation?'unverified':s.status;
  if(status==='ok'&&(Date.now()-Date.parse(s.checked_at)>config.maxStockAgeSeconds*1000||s.stock_date!==stockDate()))status='stale';
  const stock=status==='ok'?Math.max(0,s.quantity-pending-(p.safetyStock||0)):null,available=stock===null?null:Math.max(0,stock-reserved);
  if(status==='ok'&&available===0)status='zero';else if(status==='ok'&&available<=(p.lowStockThreshold??5))status='low';
  return {...p,manageStock:true,stockSource:'smartbill',stockQuantity:stock,availableQuantity:available,inventory:{status,label:labels[status],rawQuantity:s?.quantity??null,unit:s?.unit||'',checkedAt:s?.checked_at||null,pending,reserved,safetyStock:p.safetyStock||0}};
 });
}
// This predicate runs atomically with each reservation INSERT, including any
// concurrent paid sale or checkout reservation. The current checkout is excluded.
export const reservationPredicate=`EXISTS(SELECT 1 FROM store_smartbill_stock s JOIN store_inventory_sync sync ON sync.id='smartbill' AND sync.generation=s.generation
 WHERE s.product_id=p.id AND s.sku=json_extract(p.payload_json,'$.sku') AND s.source_key=? AND s.status='ok' AND s.checked_at>=? AND s.stock_date=?
 AND s.quantity-COALESCE((SELECT SUM(m.quantity) FROM store_stock_movements m WHERE m.product_id=p.id AND m.smartbill_confirmed_at IS NULL),0)-COALESCE(json_extract(p.payload_json,'$.safetyStock'),0)
 -COALESCE((SELECT SUM(r.quantity) FROM store_stock_reservations r WHERE r.product_id=p.id AND r.checkout_id<>? AND r.expires_at>?),0)>=?)`;
