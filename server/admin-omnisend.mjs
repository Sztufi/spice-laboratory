import {fail,query} from './store.mjs';
import {magicConfig} from './magic-auth.mjs';
const clean=(value,max=250)=>typeof value==='string'?value.slice(0,max):'';
const id=value=>{if(!/^[a-f0-9]{24}$/.test(value||''))fail(400,'Hibás Omnisend-azonosító.');return value;};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const externalLink=value=>{try{const u=new URL(value);return u.origin==='https://app.omnisend.com'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
export function omnisendStatus(env,origin){return {keyConfigured:!!env.OMNISEND_API_KEY,integrationEnabled:env.OMNISEND_ENABLED==='true',orderEventsEnabled:env.OMNISEND_ORDER_EVENTS_ENABLED==='true',magicEnabled:magicConfig(env,origin).enabled,magicProvider:env.MAGIC_EMAIL_PROVIDER||'resend',magicAutomationId:clean(env.MAGIC_OMNISEND_AUTOMATION_ID),apiVersion:'2026-03-15'};}
async function provider(env,path,{method='GET',body}={},fetcher=fetch){
 if(!env.OMNISEND_API_KEY)fail(503,'Nincs beállítva Omnisend API-kulcs a szerveren.');
 let response;try{response=await fetcher('https://api.omnisend.com/api/'+path,{method,redirect:'manual',headers:{Authorization:'Omnisend-API-Key '+env.OMNISEND_API_KEY,'Omnisend-Version':'2026-03-15',Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});}catch{fail(502,'Az Omnisend nem válaszolt. Frissítsd az állapotot az újrapróbálás előtt.');}
 if(!response.ok){await response.body?.cancel();const status=response.status;fail([400,401,403,404,409,429].includes(status)?status:502,({400:'Az Omnisend elutasította a módosítást. Ellenőrizd a beállításokat és az űrlap A/B tesztjét.',401:'Az Omnisend API-kulcs érvénytelen vagy lejárt.',403:'Az API-kulcsnak nincs jogosultsága ehhez az Omnisend-művelethez.',404:'Ez az Omnisend-erőforrás vagy API-művelet nem érhető el ezzel a kulccsal és API-verzióval.',409:'Az Omnisend állapota megváltozott, vagy az automatizmus aktív. Frissítsd az adatokat.',429:'Elérted az Omnisend kérési korlátját. Próbáld újra később.'})[status]||'Az Omnisend művelete sikertelen. Frissítsd az állapotot.');}
 if(response.status===204)return null;
 const reader=response.body?.getReader();if(!reader)fail(502,'Üres Omnisend-válasz.');const parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();fail(502,'Túl nagy Omnisend-válasz. Szűkítsd a lekérdezést.');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(502,'Az Omnisend válasza nem értelmezhető.');}
}
function protectedLogin(a,env){return a.id===env.MAGIC_OMNISEND_AUTOMATION_ID||a.trigger?.condition?.event==='spice magic login requested';}
const revision=(kind,value)=>digest(kind==='automations'?{id:value.id,name:value.name,isEnabled:value.isEnabled,updatedAt:value.updatedAt,settings:value.settings,trigger:value.trigger,exitConditions:value.exitConditions}:{id:value.id||value.formID,name:value.name,status:value.status,updatedAt:value.updatedAt,abSetupID:value.abSetupID});
async function automation(a,env){
 const f=a.settings?.frequencyLimiter;
 return {id:id(a.id),name:clean(a.name),enabled:a.isEnabled===true,event:clean(a.trigger?.condition?.event),origin:clean(a.trigger?.condition?.origin),emailAudience:clean(a.settings?.sendingThresholds?.email)||'subscribed',smsAudience:clean(a.settings?.sendingThresholds?.sms)||'subscribed',frequencyMode:['once','interval'].includes(f?.mode)?f.mode:'off',frequencyAmount:f?.duration?.amount||1,frequencyUnits:f?.duration?.units||'d',protectedLogin:protectedLogin(a,env),updatedAt:clean(a.updatedAt),url:externalLink(a.url),revision:await revision('automations',a)};
}
async function form(f){return {id:id(f.id||f.formID),name:clean(f.name),status:clean(f.status),abTest:!!f.abSetupID,updatedAt:clean(f.updatedAt),url:externalLink(f.url),revision:await revision('forms',f)};}
function page(data,key){if(!Array.isArray(data?.[key]))fail(502,'Az Omnisend listaformátuma nem megfelelő.');return data[key];}
function cursor(value){if(!value)return '';if(value.length>2048||/[\u0000-\u001f]/.test(value))fail(400,'Hibás lapozási hivatkozás.');return value;}
const paging=data=>({after:clean(data?.paging?.cursors?.after,2048),hasMore:data?.paging?.hasMore===true});
async function audit(db,user,action,entityId){await query(db,'INSERT INTO store_admin_audit(id,actor_id,action,entity,entity_id,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),user.userId,action,'omnisend',entityId,new Date().toISOString()).run();}
export async function omnisendRead(request,ctx,parts){
 const {env={},fetcher=fetch}=ctx,url=new URL(request.url);
 if(!parts.length)return omnisendStatus(env,url.origin);
 if(parts[0]==='brand'&&parts.length===1){const b=await provider(env,'brands/current',{},fetcher);return {brandID:clean(b.brandID),name:clean(b.name),website:clean(b.website,500),currency:clean(b.currency),timezone:clean(b.timezone),connected:b.connected===true,checkedAt:new Date().toISOString()};}
 const kind=parts[0];if(!['automations','forms','templates'].includes(kind)||parts.length>2)fail(404,'Nincs ilyen Omnisend-művelet.');
 const path=kind==='templates'?'email-templates':kind;
 if(parts.length===2){if(kind==='templates')fail(404,'Nincs ilyen művelet.');const value=await provider(env,path+'/'+id(parts[1]),{},fetcher);return kind==='automations'?automation(value,env):form(value);}
 const params=new URLSearchParams({limit:'20'});if(kind==='automations')params.set('view','summary');const after=cursor(url.searchParams.get('after'));if(after)params.set('after',after);
 const data=await provider(env,path+'?'+params,{},fetcher),rows=page(data,kind==='templates'?'templates':kind);
 return {items:await Promise.all(rows.map(value=>kind==='automations'?automation(value,env):kind==='forms'?form(value):{id:id(value.id),name:clean(value.name),updatedAt:clean(value.updatedAt)})),paging:paging(data)};
}
export async function omnisendWrite(ctx,parts,input,method){
 const {env={},db,user}=ctx,transport=ctx.fetcher||fetch;
 // Three sequential provider calls must fit the admin client's 20-second budget.
 const fetcher=(url,options)=>transport(url,{...options,signal:AbortSignal.timeout(5000)});
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Hibás Omnisend-kérés.');
 if(!['automations','forms'].includes(parts[0])||![2,3].includes(parts.length))fail(404,'Nincs ilyen Omnisend-művelet.');
 const kind=parts[0],key=id(parts[1]),current=await provider(env,kind+'/'+key,{},fetcher);
 if(input.revision!==await revision(kind,current))fail(409,'Az Omnisend-adat időközben megváltozott. Frissítsd a listát.');
 if(kind==='automations'&&protectedLogin(current,env)){
  if(!(method==='POST'&&parts[2]==='state'&&input.enabled===true))fail(409,'A Magic link belépés automatizmusa védett. Ezen a felületen nem állítható le vagy írható át.');
 }
 if(method==='POST'&&parts.length===3&&parts[2]==='state'){
  if(typeof input.enabled!=='boolean')fail(400,'Válassz érvényes állapotot.');
  let payload;
  if(kind==='automations'){
   if(!input.enabled&&!['keep','exit'].includes(input.contactsInWorkflow))fail(400,'Válaszd ki, mi történjen a folyamatban lévő címzettekkel.');
   payload=input.enabled?{enrollExisting:false}:{contactsInWorkflow:input.contactsInWorkflow};
  }else{
   if(current.abSetupID)fail(409,'Az A/B teszthez tartozó űrlapot az Omnisendben kezeld.');
   if(input.enabled&&input.reviewed!==true)fail(400,'Aktiválás előtt ellenőrizd az űrlap tartalmát és célzását.');
  }
  await provider(env,kind+'/'+key+'/'+(input.enabled?'enable':'disable'),{method:'POST',body:payload},fetcher);
  await audit(db,user,input.enabled?'omnisend-enable':'omnisend-disable',kind+':'+key);
 }else if(method==='PATCH'&&kind==='automations'&&parts.length===2){
  if(current.isEnabled)fail(409,'Szerkesztés előtt állítsd le az automatizmust. A mentés nem kapcsolja vissza automatikusan.');
  const name=typeof input.name==='string'?input.name.trim():'';
  if(!name||name.length>200||/[\u0000-\u001f]/.test(name))fail(400,'Adj meg egy legfeljebb 200 karakteres nevet.');
  if(!['subscribed','nonSubscribed','all'].includes(input.emailAudience)||!['subscribed','nonSubscribed','all'].includes(input.smsAudience))fail(400,'Hibás címzetti beállítás.');
  if((input.emailAudience!=='subscribed'||input.smsAudience!=='subscribed')&&input.transactionalConfirmed!==true)fail(400,'A feliratkozáson kívüli küldés csak külön megerősített ügyleti üzenetnél választható.');
  let frequencyLimiter=null;
  if(input.frequencyMode==='once')frequencyLimiter={mode:'once'};
  else if(input.frequencyMode==='interval'){
   const amount=input.frequencyAmount,units=input.frequencyUnits,max={h:8760,d:365,w:52}[units];
   if(!Number.isInteger(amount)||!max||amount<1||amount>max)fail(400,'Érvénytelen ismétlési időköz.');frequencyLimiter={mode:'interval',duration:{amount,units}};
  }else if(input.frequencyMode!=='off')fail(400,'Hibás ismétlési beállítás.');
  await provider(env,kind+'/'+key,{method:'PATCH',body:{name,settings:{sendingThresholds:{email:input.emailAudience,sms:input.smsAudience},frequencyLimiter}}},fetcher);
  await audit(db,user,'omnisend-settings',kind+':'+key);
 }else fail(404,'Nincs ilyen Omnisend-művelet.');
 return {saved:true,item:kind==='automations'?await automation(await provider(env,kind+'/'+key,{},fetcher),env):await form(await provider(env,kind+'/'+key,{},fetcher))};
}
