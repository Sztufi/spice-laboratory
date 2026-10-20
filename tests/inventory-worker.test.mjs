import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
test('native Workers/D1 imports SmartBill quantities, reserves once and retains paid holdbacks across a second import',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),bundle=await build({stdin:{resolveDir:root,contents:`
 import {syncInventory} from './server/inventory.mjs';
 import {loadStore,reserveStock,stockSettlementStatements} from './server/store.mjs';
 export default {async fetch(request,env){try{
  const path=new URL(request.url).pathname;
  if(path==='/sync')await syncInventory(env.DB,env);
  if(path==='/reserve')await reserveStock(env.DB,'native-checkout',[{id:'native-product',quantity:3}],{env});
  if(path==='/paid')await env.DB.batch(stockSettlementStatements(env.DB,{id:'native-checkout',mode:'live',items_json:JSON.stringify([{id:'native-product',sku:'NATIVE',quantity:3}])}));
  return Response.json((await loadStore(env.DB,{admin:true,env})).catalogue.products.find(p=>p.id==='native-product'));
 }catch(error){return Response.json({error:error.message},{status:error.status||500});}}};`},bundle:true,write:false,platform:'neutral',format:'esm',logLevel:'silent'});
 let calls=0;const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',cf:false,d1Databases:['DB'],bindings:{SMARTBILL_EMAIL:'test@example.com',SMARTBILL_API_TOKEN:'fake',SMARTBILL_COMPANY_VAT_CODE:'50028326',SMARTBILL_WAREHOUSE_NAME:'Stoc SL',SMARTBILL_STOCK_SYNC_ENABLED:'true'},outboundService:async request=>{calls++;assert.equal(new URL(request.url).origin,'https://ws.smartbill.ro');return Response.json({errorText:'',list:[{warehouse:{warehouseName:'Stoc SL'},products:[{productCode:'NATIVE',quantity:5,measuringUnit:'buc'}]}]});}});
 try{
  const db=await mf.getD1Database('DB');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){for(const sql of readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(sql).run();}
  await db.prepare("INSERT INTO store_records VALUES('product','native-product',?,'published','v1',?,?)").bind(JSON.stringify({id:'native-product',sku:'NATIVE',name:'Native',categories:['bbq'],ingredients:[],manageStock:false,priceMinor:10000}),new Date().toISOString(),new Date().toISOString()).run();
  let response=await mf.dispatchFetch('https://test/sync');assert.equal(response.status,200);assert.equal((await response.json()).availableQuantity,5);
  response=await mf.dispatchFetch('https://test/reserve');assert.equal(response.status,200);assert.equal((await response.json()).availableQuantity,2);
  response=await mf.dispatchFetch('https://test/paid');assert.equal(response.status,200);assert.equal((await response.json()).inventory.pending,3);
  await db.prepare('UPDATE store_inventory_sync SET next_attempt_at=0').run();response=await mf.dispatchFetch('https://test/sync');assert.equal(response.status,200);assert.equal((await response.json()).availableQuantity,2);assert.equal(calls,2);
 }finally{await mf.dispose();}
});
