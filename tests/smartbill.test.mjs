import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAdminRequest} from '../server/admin.mjs';
const origin='https://spice.test',owner={userId:'owner',email:'owner@example.com'};
const env={ADMIN_EMAILS:owner.email,SMARTBILL_EMAIL:'hello@example.com',SMARTBILL_API_TOKEN:'test-private-token',SMARTBILL_COMPANY_VAT_CODE:'50028326',SMARTBILL_INVOICE_SERIES:'SL-HU',SMARTBILL_WAREHOUSE_NAME:'Stoc SL'};
function database(){const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));return {sqlite,db:{prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};}}};}
const req=(path,method='GET',body,from=origin)=>new Request(origin+'/api/admin'+path,{method,headers:{Origin:from,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const settings={id:'smartbill',status:'published',revision:'new',email:'changed@example.com',companyVatCode:'50028326',seriesName:'SL-HU',warehouseName:'Stoc SL'};
test('SmartBill settings are owner-only, secrets never leave the server, and saves are versioned',async()=>{
 const {db,sqlite}=database(),call=(request,extra={})=>handleAdminRequest(request,{db,user:owner,env,...extra});
 assert.equal((await call(req('/smartbill'),{user:null})).status,401);
 assert.equal((await call(req('/smartbill'),{user:{userId:'buyer',email:'buyer@example.com'}})).status,403);
 assert.equal((await call(req('/smartbill/test','POST',{},'https://evil.test'))).status,403);
 const status=await call(req('/smartbill'));assert.equal(status.status,200);assert.match(status.headers.get('cache-control'),/no-store/);
 const config=await status.json();assert.equal(config.tokenConfigured,true);assert.equal(config.seriesName,'SL-HU');assert.equal(config.stockSync,false);assert.ok(config.skuAudit.missing.length>0);assert.ok(!JSON.stringify(config).includes(env.SMARTBILL_API_TOKEN));
 assert.equal((await call(req('/settings/smartbill','PUT',{...settings,token:'accidentally-pasted-secret'}))).status,400);
 assert.equal((await call(req('/settings/smartbill','PUT',settings))).status,200);
 const saved=await (await call(req('/smartbill'))).json();assert.equal(saved.email,'changed@example.com');assert.notEqual(saved.revision,'new');
 assert.equal((await call(req('/settings/smartbill','PUT',settings))).status,409);
 assert.ok(!sqlite.prepare("SELECT payload_json FROM store_records WHERE id='smartbill'").get().payload_json.includes(env.SMARTBILL_API_TOKEN));
 const overview=await (await call(req(''))).text();assert.ok(!overview.includes(env.SMARTBILL_API_TOKEN));
});
test('connection test uses saved settings and read-only fixed provider URL; provider errors are redacted',async()=>{
 const {db}=database();const call=(request,extra={})=>handleAdminRequest(request,{db,user:owner,env,...extra});
 await call(req('/settings/smartbill','PUT',settings));
 let count=0;
 const fetcher=async(url,options)=>{count++;assert.equal(new URL(url).origin,'https://ws.smartbill.ro');assert.equal(new URL(url).pathname,'/SBORO/api/series');assert.equal(new URL(url).searchParams.get('cif'),'50028326');assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(atob(options.headers.Authorization.slice(6)),'changed@example.com:'+env.SMARTBILL_API_TOKEN);return Response.json({errorText:'',list:[{name:'SL-HU',type:'f',nextNumber:1},{name:'NIR',type:'n',nextNumber:5}]});};
 const response=await call(req('/smartbill/test','POST',{}),{fetcher});assert.equal(response.status,200);const result=await response.json();assert.equal(result.connected,true);assert.equal(result.selectedSeriesFound,true);assert.equal(result.series.length,1);assert.equal(result.warehouseVerified,false);assert.equal(count,1);
 const error=await call(req('/smartbill/test','POST',{}),{fetcher:async()=>Response.json({errorText:'<script>'+env.SMARTBILL_API_TOKEN+'</script>',list:[]})});assert.equal(error.status,502);assert.ok(!(await error.text()).includes(env.SMARTBILL_API_TOKEN));
 const denied=await call(req('/smartbill/test','POST',{}),{fetcher:async()=>new Response(env.SMARTBILL_API_TOKEN,{status:401})});assert.equal(denied.status,502);assert.ok(!(await denied.text()).includes(env.SMARTBILL_API_TOKEN));
 const missing=await call(req('/smartbill/test','POST',{}),{env:{...env,SMARTBILL_API_TOKEN:''},fetcher});assert.equal(missing.status,503);assert.equal(count,1);
});
test('redirects never forward credentials or expose their destination/body',async()=>{
 const {db}=database();
 for(const status of [301,302,303,307,308]){
  let calls=0;
  const response=await handleAdminRequest(req('/smartbill/test','POST',{}),{db,user:owner,env,fetcher:async(url,options)=>{calls++;assert.equal(new URL(url).origin,'https://ws.smartbill.ro');assert.equal(options.redirect,'manual');return new Response('private-provider-body-'+env.SMARTBILL_API_TOKEN,{status,headers:{Location:'https://other.example/private-destination'}});}});
  assert.equal(response.status,502);assert.equal(calls,1);const body=await response.text();assert.match(body,/átirányítást/);assert.ok(!body.includes(env.SMARTBILL_API_TOKEN));assert.ok(!body.includes('private-destination'));
 }
});
test('stock query filters by exact SKU and warehouse without changing stock; empty results are not invented zeroes',async()=>{
 const {db,sqlite}=database();const call=(request,extra={})=>handleAdminRequest(request,{db,user:owner,env,...extra});
 const before=sqlite.prepare('SELECT count(*) AS n FROM store_records').get().n;
 const sku='Fries&Code-01',fetcher=async(url,options)=>{const u=new URL(url);assert.equal(u.pathname,'/SBORO/api/stocks');assert.equal(u.searchParams.get('productCode'),sku);assert.equal(u.searchParams.get('warehouseName'),'Stoc SL');assert.equal(u.searchParams.get('date'),'2026-10-19');assert.equal(options.method,'GET');return Response.json({errorText:'',list:[{warehouse:{warehouseName:'Stoc SL'},products:[{productCode:sku,productName:'Fries Salt',measuringUnit:'buc',quantity:12},{productCode:'wrong',quantity:999}]},{warehouse:{warehouseName:'Other'},products:[{productCode:sku,quantity:999}]}]});};
 const response=await call(req('/smartbill/stock','POST',{sku,date:'2026-10-19'}),{fetcher});assert.equal(response.status,200);const result=await response.json();assert.equal(result.products.length,1);assert.equal(result.products[0].quantity,12);assert.equal(result.stockWritten,false);assert.equal(result.purchasePriceAvailable,false);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM store_records').get().n,before);
 const empty=await call(req('/smartbill/stock','POST',{sku,date:'2026-10-19'}),{fetcher:async()=>Response.json({errorText:'',list:[]})});assert.deepEqual((await empty.json()).products,[]);
 assert.equal((await call(req('/smartbill/stock','POST',{sku,date:'2026-02-30'}),{fetcher})).status,400);
 assert.equal((await call(req('/smartbill/stock','POST',{sku:'',date:'2026-10-19'}),{fetcher})).status,400);
 assert.equal((await call(req('/smartbill/issue','POST',{}),{fetcher})).status,404);
});
