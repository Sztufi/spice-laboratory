import {seedCatalogue} from '../public/catalogue.mjs';
import {recipeSeeds} from '../public/recipe-data.mjs';
import {categoryPages as initialCategories} from '../public/page-data.mjs';
export const query=(db,sql,...args)=>db.prepare(sql).bind(...args);
export const all=async(db,sql,...args)=>(await query(db,sql,...args).all()).results||[];
export class StoreError extends Error{constructor(status,message){super(message);this.status=status;}}
export const fail=(status,message)=>{throw new StoreError(status,message);};
export const slug=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
export function isStoreAdmin(user,env={}){
 if(['google','magic'].includes(user?.provider))return false;
 if(!user?.userId||!user?.email||typeof env.ADMIN_EMAILS!=='string')return false;
 return env.ADMIN_EMAILS.split(',').map(item=>item.trim().toLowerCase()).filter(Boolean).includes(user.email.trim().toLowerCase());
}
export const defaultCategories=seedCatalogue.categories.map(category=>({...initialCategories.find(item=>item.id===category.id),...category,status:'published',parentId:'',revision:'seed'}));
const initial={product:seedCatalogue.products.map(product=>({...product,sku:'',status:'published',manageStock:false,stockQuantity:0,revision:'seed'})),category:defaultCategories,ingredient:seedCatalogue.ingredients.map(item=>({...item,status:'published',revision:'seed'})),recipe:recipeSeeds,coupon:[],setting:[],media:[]};
export async function loadStore(db,{admin=false}={}){
 const records=db?await all(db,'SELECT kind,id,payload_json,status,revision,updated_at FROM store_records ORDER BY created_at,id LIMIT 5000'):[];
 const merged={};
 for(const kind of Object.keys(initial)){
  const map=new Map(initial[kind].map(item=>[item.id,{...item}]));
  for(const row of records.filter(item=>item.kind===kind))map.set(row.id,{...JSON.parse(row.payload_json),id:row.id,status:row.status,revision:row.revision,updatedAt:row.updated_at});
  merged[kind]=[...map.values()].filter(item=>admin||item.status==='published');
 }
 const validCategories=new Set(merged.category.map(item=>item.id));
 const products=merged.product.filter(product=>admin||product.categories.some(id=>validCategories.has(id))).map(product=>{
  const {revision,status,stockQuantity,...rest}=product;
  const price=product.salePriceMinor>0&&product.salePriceMinor<product.priceMinor?product.salePriceMinor:product.priceMinor;
  return admin?product:{...rest,priceMinor:price,regularPriceMinor:product.priceMinor,inStock:!product.manageStock||stockQuantity>0};
 });
 const catalogue={...seedCatalogue,products,categories:merged.category.map(item=>{if(admin)return item;const {revision,status,updatedAt,...rest}=item;return rest;}),ingredients:merged.ingredient.map(item=>({id:item.id,label:item.label,...(admin?{revision:item.revision,status:item.status}:{})}))};
 return {catalogue,recipes:merged.recipe,coupons:merged.coupon,settings:merged.setting,media:merged.media,records:admin?merged:undefined};
}
export async function runtimeEnv(db,env={}){
 if(!db)return env;
 const row=await query(db,"SELECT payload_json FROM store_records WHERE kind='setting' AND id='shipping' AND status='published'").first();
 return row?{...env,SHIPPING_METHODS_JSON:JSON.stringify(JSON.parse(row.payload_json).methods)}:env;
}
export const recordDefaults=kind=>initial[kind]||[];
export const text=(value,max=200,required=false)=>{
 if(value===undefined||value===null)value='';
 if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail(400,'Hibás vagy túl hosszú szöveges adat.');
 const result=value.trim();if(required&&!result)fail(400,'Töltsd ki a kötelező mezőket.');return result;
};
export function imageUrl(value){
 const result=text(value,600);if(!result)return '/assets/mascot.png';
 if(/^\/(assets\/[a-zA-Z0-9_./-]+|media\/[a-zA-Z0-9_.-]+)$/.test(result)&&!result.includes('..'))return result;
 try{const url=new URL(result);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;}catch{}
 fail(400,'HTTPS-képcím vagy feltöltött kép szükséges.');
}
export function assertAvailable(items,catalogue){
 for(const item of items){const product=catalogue.products.find(p=>p.id===item.id);if(!product||product.inStock===false)fail(409,'Egy kiválasztott termék már nem elérhető. Frissítsd a kosarat.');}
}
export async function reserveStock(db,checkoutId,items){
 const expires=Math.floor(Date.now()/1000)+3900,now=new Date().toISOString();
 const statements=[];
 for(const item of items)statements.push(query(db,`INSERT INTO store_stock_reservations(checkout_id,product_id,quantity,expires_at)
 SELECT ?,?,?,? FROM store_records p WHERE p.kind='product' AND p.id=? AND p.status='published' AND json_extract(p.payload_json,'$.manageStock')=1
 AND json_extract(p.payload_json,'$.stockQuantity')-COALESCE((SELECT SUM(r.quantity) FROM store_stock_reservations r WHERE r.product_id=p.id AND r.checkout_id<>? AND r.expires_at>?),0)>=?
 ON CONFLICT(checkout_id,product_id) DO UPDATE SET expires_at=excluded.expires_at`,checkoutId,item.id,item.quantity,expires,item.id,checkoutId,Math.floor(Date.now()/1000),item.quantity));
 if(statements.length)await db.batch(statements);
 const tracked=await all(db,"SELECT id FROM store_records WHERE kind='product' AND status='published' AND json_extract(payload_json,'$.manageStock')=1");
 const reserved=await all(db,'SELECT product_id,quantity FROM store_stock_reservations WHERE checkout_id=?',checkoutId);
 if(items.some(item=>tracked.some(p=>p.id===item.id)&&!reserved.some(r=>r.product_id===item.id&&r.quantity===item.quantity))){await query(db,'DELETE FROM store_stock_reservations WHERE checkout_id=?',checkoutId).run();fail(409,'A kiválasztott mennyiségből nincs elegendő készlet.');}
}
export function stockSettlementStatements(db,row){
 if(row.mode!=='live')return [];
 const statements=[];
 for(const item of JSON.parse(row.items_json)){
  statements.push(query(db,`UPDATE store_records SET payload_json=json_set(payload_json,'$.stockQuantity',MAX(0,json_extract(payload_json,'$.stockQuantity')-?)),revision=?,updated_at=?
 WHERE kind='product' AND id=? AND json_extract(payload_json,'$.manageStock')=1 AND NOT EXISTS(SELECT 1 FROM store_stock_movements WHERE order_id=? AND product_id=?)`,item.quantity,crypto.randomUUID(),new Date().toISOString(),item.id,row.id,item.id));
  statements.push(query(db,"INSERT INTO store_stock_movements(order_id,product_id,quantity,created_at) SELECT ?,?,?,? FROM store_records WHERE kind='product' AND id=? AND json_extract(payload_json,'$.manageStock')=1 ON CONFLICT(order_id,product_id) DO NOTHING",row.id,item.id,item.quantity,new Date().toISOString(),item.id));
 }
 statements.push(query(db,'DELETE FROM store_stock_reservations WHERE checkout_id=?',row.id));return statements;
}
export async function couponQuote(db,code,subtotal){
 const normalized=text(code,50).toUpperCase();if(!normalized)return null;
 const row=await query(db,"SELECT payload_json,status FROM store_records WHERE kind='coupon' AND id=?",slug(normalized)).first();
 const coupon=row?JSON.parse(row.payload_json):null;
 if(!coupon||row.status!=='published'||(coupon.expiresAt&&Date.parse(coupon.expiresAt)<Date.now())||subtotal<(coupon.minimumMinor||0))fail(400,'A kupon nem érvényes erre a kosárra.');
 const discountMinor=Math.min(subtotal,coupon.type==='percent'?Math.round(subtotal*coupon.amount/100):coupon.amount);
 if(discountMinor<=0)fail(400,'A kupon nem alkalmazható.');
 return {code:coupon.code,discountMinor};
}
