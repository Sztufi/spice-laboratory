import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

test('SmartBill uses native workerd fetch and D1: series/stock succeed, all redirect types are rejected without a second request',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const bundle=await build({stdin:{resolveDir:root,sourcefile:'smartbill-worker-entry.mjs',contents:`
  import {testSmartbill,smartbillStock} from './server/smartbill.mjs';
  export default {async fetch(request,env){try{
   if(new URL(request.url).pathname==='/stock')return Response.json(await smartbillStock(env.DB,env,{sku:'SKU-01',date:'2026-10-20'}));
   return Response.json(await testSmartbill(env.DB,env));
  }catch(error){return Response.json({error:error.status?error.message:'Worker failure'},{status:error.status||500});}}};
 `},bundle:true,write:false,platform:'neutral',format:'esm',logLevel:'silent'});
 let redirectStatus=0,calls=0;
 const outboundService=async request=>{
  calls++;const url=new URL(request.url);assert.equal(url.origin,'https://ws.smartbill.ro');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Basic '+btoa('worker@example.com:fake-worker-token'));
  if(redirectStatus)return new Response('private redirect body',{status:redirectStatus,headers:{location:'https://other.example/must-not-receive-auth'}});
  if(url.pathname.endsWith('/stocks')){assert.equal(url.searchParams.get('productCode'),'SKU-01');assert.equal(url.searchParams.get('warehouseName'),'Stoc SL');return Response.json({errorText:'',list:[{warehouse:{warehouseName:'Stoc SL'},products:[{productCode:'SKU-01',productName:'Worker test',measuringUnit:'buc',quantity:7}]}]});}
  return Response.json({errorText:'',list:[{name:'SL-HU',type:'f',nextNumber:1}]});
 };
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',cf:false,d1Databases:['DB'],bindings:{SMARTBILL_EMAIL:'worker@example.com',SMARTBILL_API_TOKEN:'fake-worker-token',SMARTBILL_COMPANY_VAT_CODE:'50028326',SMARTBILL_INVOICE_SERIES:'SL-HU',SMARTBILL_WAREHOUSE_NAME:'Stoc SL'},outboundService});
 try{
  const db=await mf.getD1Database('DB');await db.exec('CREATE TABLE store_records (kind TEXT,id TEXT,status TEXT,payload_json TEXT,revision TEXT)');
  let response=await mf.dispatchFetch('https://worker.test/series');assert.equal(response.status,200);const data=await response.json();assert.equal(data.connected,true);assert.equal(data.selectedSeriesFound,true);assert.equal(data.invoiceIssuing,false);
  response=await mf.dispatchFetch('https://worker.test/stock');assert.equal(response.status,200);const stock=await response.json();assert.equal(stock.products[0].quantity,7);assert.equal(stock.stockWritten,false);
  for(const status of [301,302,303,307,308]){
   redirectStatus=status;const before=calls;
   response=await mf.dispatchFetch('https://worker.test/series');assert.equal(response.status,502);const body=await response.text();assert.match(body,/átirányítást/);assert.ok(!body.includes('private redirect body'));assert.ok(!body.includes('must-not-receive-auth'));assert.equal(calls,before+1);
  }
  assert.equal(calls,7);
 }finally{await mf.dispose();}
});
