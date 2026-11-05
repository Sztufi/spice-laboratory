import {all,query as q,loadStore,fail} from './store.mjs';
import {restockOverview} from './restock.mjs';
export async function inventoryOverview(db,env){
 const [{catalogue},restock]=await Promise.all([loadStore(db,{admin:true,env}),restockOverview(db)]);
 return {restock,enabled:false,products:catalogue.products.map(p=>({
  id:p.id,name:p.name,sku:p.sku,status:p.status,revision:p.revision,stockQuantity:p.manageStock?p.stockQuantity:null,availableQuantity:p.manageStock?p.availableQuantity:null,
  inventory:{label:p.manageStock?'Kézi készlet':'Még nincs megadva',reserved:p.manageStock?p.stockQuantity-p.availableQuantity:0}
 }))};
}
export async function assertMappingChange(db,original,sku){
 if(!original||original.sku===sku)return;
 const held=await q(db,'SELECT COUNT(*) AS n FROM store_stock_reservations WHERE product_id=? AND expires_at>?',original.id,Math.floor(Date.now()/1000)).first();
 if(held.n)fail(409,'Aktív fizetés mellett az SKU nem módosítható.');
}
