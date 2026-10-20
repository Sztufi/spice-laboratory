import {all,query as q,loadStore,recordDefaults,fail,StoreError,text} from './store.mjs';
import {smartbillConfig,providerGet} from './smartbill.mjs';
import {sourceKey,stockDate} from './inventory-model.mjs';
import {verifiedSkus,mappingNotes} from './product-skus.mjs';
const timestamp=()=>new Date().toISOString();
const currentState=db=>q(db,"SELECT * FROM store_inventory_sync WHERE id='smartbill'").first();
const pieceUnit=unit=>['buc','buc.','db'].includes(String(unit).trim().toLowerCase());
export async function syncInventory(db,env={},options={}){
 if(!db)return {enabled:false};
 const config=await smartbillConfig(db,env);if(!config.stockSync)return {enabled:false};
 const token=crypto.randomUUID(),now=Math.floor(Date.now()/1000),key=sourceKey(config);
 // A D1 lease bounds visitors and repeated admin clicks to one provider read per
 // minute across all isolates. No caller controls the provider URL or quantity.
 const claim=await q(db,`INSERT INTO store_inventory_sync(id,lease_token,lease_until,next_attempt_at,last_attempt_at,status)
 VALUES('smartbill',?,?,?,?, 'running') ON CONFLICT(id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until,next_attempt_at=excluded.next_attempt_at,last_attempt_at=excluded.last_attempt_at,status='running'
 WHERE store_inventory_sync.lease_until<=? AND store_inventory_sync.next_attempt_at<=? RETURNING id`,token,now+45,now+60,timestamp(),now,now).first();
 if(!claim)return {enabled:true,performed:false,state:await currentState(db)};
 try{
  if(!config.warehouseName)fail(503,'Hiányzik a SmartBill-raktár neve.');
  const {catalogue}=await loadStore(db,{admin:true,withInventory:false});const products=catalogue.products.filter(p=>p.status!=='archived');
  for(const p of products){
   const sku=verifiedSkus[p.id],seed=recordDefaults('product').find(s=>s.id===p.id);
   if(!sku||p.sku||!seed||p.name!==seed.name||p.weightGrams!==seed.weightGrams||products.some(other=>other.id!==p.id&&other.sku===sku))continue;
   const updated=await q(db,`UPDATE store_records SET payload_json=json_set(payload_json,'$.sku',?),revision=?,updated_at=? WHERE kind='product' AND id=? AND revision=? AND COALESCE(json_extract(payload_json,'$.sku'),'')=''
    AND NOT EXISTS(SELECT 1 FROM store_records other WHERE other.kind='product' AND other.id<>? AND json_extract(other.payload_json,'$.sku')=?)
    AND NOT EXISTS(SELECT 1 FROM store_stock_reservations WHERE product_id=? AND expires_at>?) AND NOT EXISTS(SELECT 1 FROM store_stock_movements WHERE product_id=? AND smartbill_confirmed_at IS NULL) RETURNING id`,sku,crypto.randomUUID(),timestamp(),p.id,p.revision,p.id,sku,p.id,Math.floor(Date.now()/1000),p.id).first();
   if(updated){p.sku=sku;await q(db,'INSERT INTO store_admin_audit(id,actor_id,action,entity,entity_id,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),'system:smartbill','map-verified-sku','product',p.id,timestamp()).run();}
  }
  if(products.length>2000)fail(503,'A katalógus túl nagy az egy lépéses készletszinkronhoz.');
  const date=stockDate(),rows=await providerGet(config,env,'stocks',{warehouseName:config.warehouseName,date},options.fetcher);
  const groups=rows.filter(row=>row.warehouse?.warehouseName===config.warehouseName);
  if(groups.some(row=>!Array.isArray(row.products)))fail(502,'A SmartBill készletválasza hiányos.');
  const byCode=new Map(),counts=new Map();
  for(const p of products)if(p.sku)counts.set(p.sku,(counts.get(p.sku)||0)+1);
  for(const p of groups.flatMap(row=>row.products))if(typeof p.productCode==='string'){const list=byCode.get(p.productCode)||[];list.push(p);byCode.set(p.productCode,list);}
  const latest=await smartbillConfig(db,env);if(latest.revision!==config.revision||sourceKey(latest)!==key||!latest.stockSync)fail(409,'A SmartBill-beállítások közben megváltoztak.');
  const checkedAt=timestamp(),statements=[];let matched=0;
  for(const p of products){
   // Seed products also need durable rows for atomic checkout reservations.
   const seed=recordDefaults('product').find(s=>s.id===p.id);
   if(seed)statements.push(q(db,"INSERT INTO store_records(kind,id,payload_json,status,revision,created_at,updated_at) VALUES('product',?,?,?,?,?,?) ON CONFLICT(kind,id) DO NOTHING",seed.id,JSON.stringify(seed),seed.status,crypto.randomUUID(),checkedAt,checkedAt));
   const matches=byCode.get(p.sku)||[],row=matches[0];
   const status=!p.sku?'missing_sku':counts.get(p.sku)>1||matches.length>1?'duplicate':!row?'missing':!pieceUnit(row.measuringUnit)?'unit':!Number.isSafeInteger(row.quantity)||row.quantity<0||row.quantity>1000000?'invalid':'ok';
   if(status==='ok')matched++;
   statements.push(q(db,`INSERT INTO store_smartbill_stock(product_id,sku,source_key,quantity,unit,status,generation,checked_at,stock_date)
    SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM store_inventory_sync WHERE id='smartbill' AND lease_token=? AND lease_until>?)
    ON CONFLICT(product_id) DO UPDATE SET sku=excluded.sku,source_key=excluded.source_key,quantity=excluded.quantity,unit=excluded.unit,status=excluded.status,generation=excluded.generation,checked_at=excluded.checked_at,stock_date=excluded.stock_date`,p.id,p.sku||'',key,status==='ok'?row.quantity:null,String(row?.measuringUnit||'').slice(0,40),status,token,checkedAt,date,token,Math.floor(Date.now()/1000)));
  }
  // Generation only becomes readable after all chunks succeed. A partial import
  // blocks affected stock rather than exposing a mixed or replenished snapshot.
  for(let i=0;i<statements.length;i+=80)await db.batch(statements.slice(i,i+80));
  const completed=await q(db,"UPDATE store_inventory_sync SET generation=?,source_key=?,last_success_at=?,status='ok',error=NULL,lease_token=NULL,lease_until=0 WHERE id='smartbill' AND lease_token=? AND lease_until>? RETURNING id",token,key,checkedAt,token,Math.floor(Date.now()/1000)).first();
  if(!completed)fail(409,'A készletszinkron zárolása lejárt.');
  console.info(JSON.stringify({component:'smartbill-stock-sync',status:'ok',products:products.length,matched}));
  return {enabled:true,performed:true,state:await currentState(db)};
 }catch(error){
  const message=error instanceof StoreError?error.message:'A készletszinkron nem fejeződött be. A korábbi készletet nem írtuk felül.';
  await q(db,"UPDATE store_inventory_sync SET status='error',error=?,lease_token=NULL,lease_until=0 WHERE id='smartbill' AND lease_token=?",message,token).run();
  console.warn(JSON.stringify({component:'smartbill-stock-sync',status:'error',message}));
  return {enabled:true,performed:true,state:await currentState(db)};
 }
}
export async function requireFreshInventory(db,env,fetcher){
 const result=await syncInventory(db,env,{fetcher});
 if(result.enabled&&(result.state?.status!=='ok'||!result.state.last_success_at||Date.now()-Date.parse(result.state.last_success_at)>300000))fail(503,'A raktárkészlet most nem ellenőrizhető. A kosarad megmaradt; próbáld újra egy perc múlva.');
}
export async function inventoryOverview(db,env){
 const [config,{catalogue},state,pending]=await Promise.all([smartbillConfig(db,env),loadStore(db,{admin:true,env}),currentState(db),all(db,`SELECT m.order_id,m.product_id,m.sku,m.quantity,m.created_at,o.number FROM store_stock_movements m LEFT JOIN customer_orders o ON o.id=m.order_id WHERE m.smartbill_confirmed_at IS NULL ORDER BY m.created_at LIMIT 200`)]);
 return {enabled:config.stockSync,warehouseName:config.warehouseName,intervalSeconds:60,maxAgeSeconds:300,state:state?{status:state.status,lastAttemptAt:state.last_attempt_at,lastSuccessAt:state.last_success_at,nextAttemptAt:state.next_attempt_at,error:state.error}:null,products:catalogue.products.map(p=>({id:p.id,name:p.name,sku:p.sku||'',mappingNote:!p.sku?mappingNotes[p.id]||'Add meg a késztermék SmartBill Cod produs értékét.':'',status:p.status,revision:p.revision,safetyStock:p.safetyStock||0,lowStockThreshold:p.lowStockThreshold??5,stockQuantity:p.stockQuantity,availableQuantity:p.availableQuantity??(p.manageStock?p.stockQuantity:null),inventory:p.inventory||{status:'manual',label:'Kézi készlet'}})),pending};
}
export async function assertMappingChange(db,original,sku){
 if(!original||original.sku===sku)return;
 const held=await q(db,`SELECT (SELECT COUNT(*) FROM store_stock_reservations WHERE product_id=? AND expires_at>?)+(SELECT COUNT(*) FROM store_stock_movements WHERE product_id=? AND smartbill_confirmed_at IS NULL) AS amount`,original.id,Math.floor(Date.now()/1000),original.id).first();
 if(held.amount)fail(409,'Aktív fizetés vagy SmartBillben még nem egyeztetett eladás mellett az SKU nem módosítható.');
}
export async function reconcileStock(db,env,user,input,fetcher){
 if(input.confirmed!==true)fail(400,'Erősítsd meg, hogy a SmartBill-bizonylat már levonta ezt a tételt a készletből.');
 const orderId=text(input.orderId,100,true),productId=text(input.productId,90,true),document=text(input.document,100,true);
 if(/[\r\n\t]/.test(document))fail(400,'Egy sorban add meg a SmartBill-bizonylat számát.');
 const movement=await q(db,'SELECT * FROM store_stock_movements WHERE order_id=? AND product_id=?',orderId,productId).first();
 if(!movement)fail(404,'Nincs ilyen készletmozgás.');if(movement.smartbill_confirmed_at)return {saved:true};
 const result=await syncInventory(db,env,{fetcher});
 // Release requires a new post-document provider read, never an old snapshot.
 if(!result.performed||result.state?.status!=='ok')fail(409,'Várd meg a következő lekérdezés idejét (legfeljebb 60 mp), majd próbáld újra. A feloldáshoz új SmartBill-válasz szükséges.');
 const config=await smartbillConfig(db,env),s=await q(db,'SELECT * FROM store_smartbill_stock WHERE product_id=?',productId).first();
 if(!s||s.status!=='ok'||s.sku!==movement.sku||s.source_key!==sourceKey(config)||s.generation!==result.state.generation)fail(409,'A tétel SKU-ja vagy friss SmartBill-készlete nem ellenőrizhető.');
 await db.batch([
  q(db,'UPDATE store_stock_movements SET smartbill_confirmed_at=?,smartbill_document=? WHERE order_id=? AND product_id=? AND smartbill_confirmed_at IS NULL',timestamp(),document,orderId,productId),
  q(db,'INSERT INTO store_admin_audit(id,actor_id,action,entity,entity_id,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),user.userId,'confirm-smartbill-stock','order',orderId,timestamp())
 ]);return {saved:true};
}
