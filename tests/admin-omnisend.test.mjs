import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAdminRequest} from '../server/admin.mjs';
const origin='https://spice.test',owner={userId:'owner',email:'owner@example.com'},key='private-omnisend-key',aid='a'.repeat(24),fid='b'.repeat(24);
function setup(){
 const sql=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(s){return {bind(...v){return {async run(){return sql.prepare(s).run(...v);},async first(){return sql.prepare(s).get(...v)||null;},async all(){return {results:sql.prepare(s).all(...v)};}};}};}};
 const state={a:{id:aid,name:'Welcome',isEnabled:false,updatedAt:'2026-10-19T12:00:00Z',settings:{sendingThresholds:{email:'subscribed',sms:'subscribed'}},trigger:{condition:{event:'subscribed to marketing'}},exitConditions:[],blocks:[{action:{sendWebhook:{headers:[{key:'secret',value:key}]}}}]},f:{id:fid,name:'Newsletter',status:'disabled',updatedAt:'2026-10-19T12:00:00Z',targeting:{secret:key}},calls:[]};
 const env={ADMIN_EMAILS:owner.email,OMNISEND_API_KEY:key,OMNISEND_ENABLED:'true',MAGIC_EMAIL_PROVIDER:'omnisend',MAGIC_AUTH_ENABLED:'true',MAGIC_ALLOWED_ORIGINS_JSON:JSON.stringify([origin]),MAGIC_OMNISEND_AUTOMATION_ID:'c'.repeat(24)};
 const fetcher=async(url,options)=>{
  state.calls.push({url,options});assert.equal(new URL(url).origin,'https://api.omnisend.com');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Omnisend-API-Key '+key);assert.equal(options.headers['Omnisend-Version'],'2026-03-15');
  const u=new URL(url),p=u.pathname;
  if(p==='/api/brands/current')return Response.json({name:'Spice',brandID:aid,currency:'RON',connected:true,secret:key});
  if(p==='/api/automations'&&options.method==='GET'){const {blocks,...summary}=state.a;return Response.json({automations:[summary],paging:{hasMore:true,cursors:{after:'opaque+next/='}}});}
  if(p==='/api/forms'&&options.method==='GET')return Response.json({forms:[state.f],paging:{hasMore:false}});
  if(p==='/api/email-templates')return Response.json({templates:[{id:fid,name:'Template',sections:[{secret:key}]}],paging:{hasMore:false}});
  const a=p.includes('/automations/'),current=a?state.a:state.f;
  if(options.method==='GET')return Response.json(current);
  const body=options.body?JSON.parse(options.body):{};
  if(options.method==='PATCH'){current.name=body.name;current.settings={...current.settings,...body.settings};}
  else if(p.endsWith('/enable')){if(a)current.isEnabled=true;else current.status='enabled';}
  else if(p.endsWith('/disable')){if(a)current.isEnabled=false;else current.status='disabled';}
  current.updatedAt=new Date(Date.parse(current.updatedAt)+1000).toISOString();return options.method==='POST'?new Response(null,{status:204}):Response.json(current);
 };
 const ctx={db,user:owner,env,fetcher},req=(path,method='GET',body,from=origin)=>new Request(origin+'/api/admin/omnisend'+path,{method,headers:{Origin:from,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {ctx,state,sql,req,call:(path,method='GET',body,extra={})=>handleAdminRequest(req(path,method,body),{...ctx,...extra})};
}
test('Omnisend admin is owner-only, CSRF protected, bounded and never returns API keys or webhook/template content',async()=>{
 const {call,ctx,req,state}=setup();assert.equal((await call('', 'GET',undefined,{user:null})).status,401);assert.equal((await call('', 'GET',undefined,{user:{userId:'buyer',email:'buyer@example.com'}})).status,403);
 assert.equal((await handleAdminRequest(req('/automations/'+aid+'/state','POST',{},'https://evil.test'),ctx)).status,403);
 for(const path of ['','/brand','/automations','/forms','/templates']){const r=await call(path);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.ok(!(await r.text()).includes(key));}
 const r=await call('/automations?after='+encodeURIComponent('opaque+next/='));assert.equal(r.status,200);const u=new URL(state.calls.at(-1).url);assert.equal(u.searchParams.get('after'),'opaque+next/=');assert.equal(u.searchParams.get('limit'),'20');assert.equal(u.searchParams.get('view'),'summary');
 assert.equal((await call('/automations/https%3Aevil')).status,400);
});
test('automation list revisions match full detail, writes are partial and stale edits fail without mutation',async()=>{
 const {call,state,sql}=setup(),item=(await (await call('/automations')).json()).items[0];
 const input={revision:item.revision,name:'New name',emailAudience:'subscribed',smsAudience:'subscribed',frequencyMode:'interval',frequencyAmount:2,frequencyUnits:'d',apiKey:'must-not-forward'};
 const saved=await call('/automations/'+aid,'PATCH',input);assert.equal(saved.status,200);assert.equal(state.a.name,'New name');assert.equal(state.a.blocks[0].action.sendWebhook.headers[0].value,key);
 const patch=state.calls.find(x=>x.options.method==='PATCH');assert.deepEqual(Object.keys(JSON.parse(patch.options.body)).sort(),['name','settings']);assert.equal(sql.prepare('SELECT count(*) n FROM store_admin_audit').get().n,1);
 assert.equal((await call('/automations/'+aid,'PATCH',input)).status,409);
 const current=(await saved.json()).item;
 assert.equal((await call('/automations/'+aid,'PATCH',{...input,revision:current.revision,emailAudience:'all'})).status,400);
 assert.equal((await call('/automations/'+aid,'PATCH',{...input,revision:current.revision,frequencyAmount:366})).status,400);
});
test('automation lifecycle needs an explicit in-flight choice, never enrolls history, and protects magic login',async()=>{
 const {call,state}=setup();let item=(await (await call('/automations')).json()).items[0];
 let r=await call('/automations/'+aid+'/state','POST',{revision:item.revision,enabled:true});assert.equal(r.status,200);assert.deepEqual(JSON.parse(state.calls.find(x=>x.url.endsWith('/enable')).options.body),{enrollExisting:false});
 item=(await r.json()).item;assert.equal((await call('/automations/'+aid+'/state','POST',{revision:item.revision,enabled:false})).status,400);
 r=await call('/automations/'+aid+'/state','POST',{revision:item.revision,enabled:false,contactsInWorkflow:'keep'});assert.equal(r.status,200);
 state.a.trigger.condition.event='spice magic login requested';item=(await (await call('/automations')).json()).items[0];assert.equal(item.protectedLogin,true);
 assert.equal((await call('/automations/'+aid+'/state','POST',{revision:item.revision,enabled:false,contactsInWorkflow:'exit'})).status,409);
 assert.equal((await call('/automations/'+aid,'PATCH',{revision:item.revision,name:'Break login'})).status,409);
});
test('forms require review before publication, preserve targeting and block A/B lifecycle changes',async()=>{
 const {call,state}=setup();let item=(await (await call('/forms')).json()).items[0];
 assert.equal((await call('/forms/'+fid+'/state','POST',{revision:item.revision,enabled:true})).status,400);
 const r=await call('/forms/'+fid+'/state','POST',{revision:item.revision,enabled:true,reviewed:true});assert.equal(r.status,200);assert.equal(state.f.targeting.secret,key);
 state.f.abSetupID=aid;item=(await (await call('/forms')).json()).items[0];assert.equal((await call('/forms/'+fid+'/state','POST',{revision:item.revision,enabled:false})).status,409);
});
test('missing scopes, provider errors, redirects and oversized replies are explicit and redact response bodies',async()=>{
 const {call}=setup();for(const status of [401,403,404,409,429,500,302]){const r=await call('/automations','GET',undefined,{fetcher:async()=>Response.json({secret:key},{status})});assert.equal(r.status,status===500||status===302?502:status);assert.ok(!(await r.text()).includes(key));}
 const r=await call('/automations','GET',undefined,{fetcher:async()=>new Response('x'.repeat(2*1024*1024+1))});assert.equal(r.status,502);
});
