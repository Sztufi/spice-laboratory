import {query,loadStore,fail,text} from './store.mjs';
import {resolveConfig} from './inventory-model.mjs';

export async function smartbillConfig(db,env={}){
 const row=await query(db,"SELECT payload_json,revision FROM store_records WHERE kind='setting' AND id='smartbill' AND status='published'").first();
 const saved=row?JSON.parse(row.payload_json):{};
 return {...resolveConfig(saved,env),revision:row?.revision||'new'};
}

export function validateSmartbillSettings(input){
 const email=text(input.email,254,true),companyVatCode=text(input.companyVatCode,30,true),seriesName=text(input.seriesName,50,true),warehouseName=text(input.warehouseName,100,true);
 if(!/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~@-]+$/.test(email)||!/^\S+@[^@.]+(?:\.[^@.]+)+$/.test(email))fail(400,'Érvényes SmartBill-fiók e-mail-cím szükséges.');
 if(!/^(?:RO)?[0-9]{2,20}$/.test(companyVatCode)||/[\r\n\t]/.test(seriesName+warehouseName))fail(400,'Ellenőrizd a CIF, sorozat és raktár értékét.');
 if(['token','apiKey','apiToken','password'].some(key=>key in input))fail(400,'Az API-token kizárólag titkos szerverbeállításban tárolható.');
 if('stockSyncEnabled' in input&&typeof input.stockSyncEnabled!=='boolean')fail(400,'Hibás készletszinkron-beállítás.');
 return {email,companyVatCode,seriesName,warehouseName,...('stockSyncEnabled' in input?{stockSyncEnabled:false}:{})};
}

export async function providerGet(config,env,path,params,fetcher=fetch){
 if(!config.tokenConfigured||!config.email||!config.companyVatCode)fail(503,'Hiányzik a SmartBill V1-token, a fiók e-mail-címe vagy a CIF.');
 if(env.SMARTBILL_API_TOKEN.startsWith('sb_live_'))fail(400,'A számlázási V1-kapcsolathoz a SmartBill API v1 szakaszában található token szükséges.');
 const url=new URL('https://ws.smartbill.ro/SBORO/api/'+path);url.searchParams.set('cif',config.companyVatCode);
 for(const [key,value] of Object.entries(params||{}))url.searchParams.set(key,value);
 let response;
 try{response=await fetcher(url.href,{method:'GET',headers:{Authorization:'Basic '+btoa(config.email+':'+env.SMARTBILL_API_TOKEN),Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});}catch{fail(502,'A SmartBill nem válaszolt. Próbáld újra később.');}
 // Workers supports manual redirects, not redirect:error. Reject every redirect
 // without reading its body or forwarding the Basic credential to Location.
 if(response.status>=300&&response.status<400){await response.body?.cancel();fail(502,'A SmartBill átirányítást küldött. Biztonsági okból nem követtük.');}
 if(!response.ok){
  const message=response.status===401?'A SmartBill elutasította az e-mail-címet vagy a V1-tokent.':response.status===403?'A SmartBill-felhasználó jogosultsága nem elegendő.':response.status===429?'A SmartBill kérési korlátja elérve. Várj a következő próbáig.':'A SmartBill lekérdezése sikertelen. Ellenőrizd a cég- és raktárbeállításokat.';
  fail(response.status===429?429:502,message);
 }
 let data;
 try{
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1024*1024){await reader.cancel();throw new Error();}chunks.push(part.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}data=JSON.parse(new TextDecoder().decode(bytes));
 }catch{fail(502,'A SmartBill válasza hibás vagy túl nagy. Szűkítsd a lekérdezést.');}
 // Provider error bodies may contain HTML, account data or reflected input; never expose them.
 if(data.errorText)fail(502,'A SmartBill hibát jelzett. Ellenőrizd a CIF-et, a raktár nevét és a felhasználó hozzáférését.');
 if(!Array.isArray(data.list))fail(502,'A SmartBill válaszának formátuma nem megfelelő.');
 return data.list;
}

export async function smartbillStatus(db,env){
 const config=await smartbillConfig(db,env),{catalogue}=await loadStore(db,{admin:true});
 const products=catalogue.products.filter(p=>p.status!=='archived'),codes=new Map();
 for(const p of catalogue.products){if(p.sku){const ids=codes.get(p.sku)||[];ids.push(p.id);codes.set(p.sku,ids);}}
 return {...config,skuAudit:{total:products.length,missing:products.filter(p=>!p.sku).map(p=>({id:p.id,name:p.name})),duplicates:[...codes].filter(([,ids])=>ids.length>1).map(([sku,ids])=>({sku,ids}))}};
}

export async function testSmartbill(db,env,fetcher){
 const config=await smartbillConfig(db,env);
 const rows=await providerGet(config,env,'series',{},fetcher);
 const series=rows.filter(row=>row.type==='f').map(row=>({name:String(row.name||''),nextNumber:row.nextNumber,type:'invoice'}));
 return {connected:true,checkedAt:new Date().toISOString(),series,selectedSeriesFound:series.some(row=>row.name===config.seriesName),warehouseVerified:false,invoiceIssuing:false,stockSync:false};
}

export async function smartbillStock(db,env,input,fetcher){
 const sku=text(input.sku,80,true),date=text(input.date,10,true);
 if(/[\r\n\t]/.test(sku)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail(400,'Érvényes SKU és dátum szükséges.');
 const config=await smartbillConfig(db,env);if(!config.warehouseName)fail(400,'Előbb add meg és mentsd a raktár nevét.');
 const rows=await providerGet(config,env,'stocks',{warehouseName:config.warehouseName,productCode:sku,date},fetcher);
 const products=rows.filter(row=>row.warehouse?.warehouseName===config.warehouseName).flatMap(row=>(Array.isArray(row.products)?row.products:[]).filter(p=>p.productCode===sku).map(p=>({sku:String(p.productCode),name:String(p.productName||''),unit:String(p.measuringUnit||''),quantity:typeof p.quantity==='number'&&Number.isFinite(p.quantity)?p.quantity:null})));
 return {sku,date,warehouseName:config.warehouseName,products,checkedAt:new Date().toISOString(),purchasePriceAvailable:false,stockWritten:false};
}
