import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {handleGoogleAuth,googleCustomer} from '../server/google-auth.mjs';
import {handleAccountRequest} from '../server/account.mjs';
import {handleAdminRequest} from '../server/admin.mjs';
import {isStoreAdmin,adminPrincipal} from '../server/store.mjs';
const origin='https://spice.test',clientId='123-test.apps.googleusercontent.com';
const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='test-key';
const keySet=createLocalJWKSet({keys:[jwk]});
function context(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 return {db,sqlite,keySet,env:{GOOGLE_AUTH_ENABLED:'true',GOOGLE_CLIENT_ID:clientId,GOOGLE_ALLOWED_ORIGINS_JSON:JSON.stringify([origin]),ADMIN_EMAILS:'owner@example.com'}};
}
const req=(path,method='GET',body,cookie='',from=origin)=>new Request(origin+path,{method,headers:{Origin:from,Cookie:cookie,'Content-Type':'application/json','cf-connecting-ip':'192.0.2.20'},body:body===undefined?undefined:JSON.stringify(body)});
const call=(ctx,path,method='POST',body={},cookie='',from=origin)=>handleGoogleAuth(req('/api/auth/google/'+path,method,method==='GET'?undefined:body,cookie,from),ctx);
const cookies=response=>response.headers.getSetCookie().map(c=>c.split(';')[0]).filter(c=>!c.endsWith('=')).join('; ');
const sign=(nonce,extra={},audience=clientId)=>new SignJWT({nonce,email:'alice@example.com',email_verified:true,name:'Alice',...extra}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer('https://accounts.google.com').setSubject('stable-subject').setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
async function login(ctx,extra={}){
 const challenge=await call(ctx,'challenge'),data=await challenge.json();assert.equal(challenge.status,200);
 const response=await call(ctx,'login','POST',{credential:await sign(data.nonce,extra)},cookies(challenge));return {response,challenge,nonce:data.nonce};
}
test('Google login verifies signed identity, sets an opaque HttpOnly cookie and does not inherit Sites owner grants',async()=>{
 const ctx=context();const {response}=await login(ctx,{email:'owner@example.com'});assert.equal(response.status,200);
 assert.ok(response.headers.get('Set-Cookie').includes('HttpOnly'));assert.ok(response.headers.get('Set-Cookie').includes('Secure'));assert.ok(response.headers.get('Set-Cookie').includes('SameSite=Lax'));
 const cookie=cookies(response),request=req('/api/account', 'GET',undefined,cookie),user=await googleCustomer(request,ctx.db,ctx.env);
 assert.equal(user.userId,'google:stable-subject');assert.equal(user.provider,'google');
 const stored=ctx.sqlite.prepare('SELECT token_hash FROM google_customer_sessions').get().token_hash;assert.ok(!cookie.includes(stored));assert.equal(stored.length,64);
 const account=await handleAccountRequest(request,{...ctx,user});assert.equal(account.status,200);assert.equal((await account.json()).authenticationProvider,'google');
 const admin=await handleAdminRequest(req('/api/admin'),{...ctx,user:null});assert.equal(admin.status,401);
 assert.equal((await handleAdminRequest(req('/api/admin'),{...ctx,user})).status,403);
 const accountRoute=readFileSync(new URL('../app/api/admin/[[...path]]/route.ts',import.meta.url),'utf8');assert.ok(accountRoute.includes('getChatGPTUser()'));assert.ok(accountRoute.includes('googleCustomer'));assert.ok(accountRoute.includes('adminPrincipal'));
});
test('login CSRF, mismatched nonce/audience, unverified email, missing cookie and replay cannot establish a session',async()=>{
 const ctx=context();assert.equal((await call(ctx,'challenge','POST',{},'','https://evil.test')).status,403);
 for(const kind of ['nonce','audience','email']){
  const challenge=await call(ctx,'challenge'),data=await challenge.json();
  const token=await sign(kind==='nonce'?'wrong-nonce-12345678901234567890':data.nonce,kind==='email'?{email_verified:false}:{},kind==='audience'?'wrong.apps.googleusercontent.com':clientId);
  assert.equal((await call(ctx,'login','POST',{credential:token},cookies(challenge))).status,401);
 }
 const challenge=await call(ctx,'challenge'),data=await challenge.json(),token=await sign(data.nonce);
 assert.equal((await call(ctx,'login','POST',{credential:token})).status,400);
 assert.equal((await call(ctx,'login','POST',{credential:token},cookies(challenge))).status,200);
 assert.equal((await call(ctx,'login','POST',{credential:token},cookies(challenge))).status,401);
 assert.equal(ctx.sqlite.prepare('SELECT count(*) n FROM google_customer_sessions').get().n,1);
});
test('logout revokes the current session; expiry and fabricated tokens fail closed without email-based account merging',async()=>{
 const ctx=context(),stamp=new Date().toISOString();
 ctx.sqlite.prepare('INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('sites-existing','alice@example.com','Old Name','',stamp,stamp);
 const {response}=await login(ctx),cookie=cookies(response),request=req('/api/account','GET',undefined,cookie);
 assert.equal(ctx.sqlite.prepare('SELECT count(*) n FROM customers').get().n,2);
 assert.equal((await googleCustomer(request,ctx.db,ctx.env)).userId,'google:stable-subject');
 assert.equal(await googleCustomer(req('/api/account','GET',undefined,'__Host-spice_google_session='+'a'.repeat(64)),ctx.db,ctx.env),null);
 const logout=await call(ctx,'logout','POST',{},cookie);assert.equal(logout.status,200);assert.ok(logout.headers.get('Set-Cookie').includes('Max-Age=0'));assert.equal(await googleCustomer(request,ctx.db,ctx.env),null);
 const second=await login(ctx);ctx.sqlite.prepare('UPDATE google_customer_sessions SET expires_at=0').run();assert.equal(await googleCustomer(req('/api/account','GET',undefined,cookies(second.response)),ctx.db,ctx.env),null);
});
test('Google config is origin-bound and disabled without configuration, and anonymous challenge requests are throttled',async()=>{
 const ctx=context();assert.equal((await (await call({...ctx,env:{}},'config','GET')).json()).enabled,false);
 assert.equal((await (await call({...ctx,env:{...ctx.env,GOOGLE_ALLOWED_ORIGINS_JSON:'[]'}},'config','GET')).json()).enabled,false);
 assert.equal((await call({...ctx,env:{}},'challenge')).status,503);
 for(let i=0;i<20;i++)assert.equal((await call(ctx,'challenge')).status,200);
 assert.equal((await call(ctx,'challenge')).status,429);
});
test('only a separately granted verified Google session gains admin, and revocation is immediate',async()=>{
 const ctx=context();ctx.env.GOOGLE_ADMIN_EMAILS=' LabOwner@gmail.com ';
 const {response}=await login(ctx,{email:'labowner@gmail.com'});assert.equal(response.status,200);
 const cookie=cookies(response),request=req('/api/admin','GET',undefined,cookie),user=await googleCustomer(request,ctx.db,ctx.env);
 assert.equal(isStoreAdmin(user,ctx.env),true);assert.equal(adminPrincipal(null,user,ctx.env),user);
 const overview=await handleAdminRequest(request,{...ctx,user});assert.equal(overview.status,200);assert.equal((await overview.json()).user.provider,'google');
 const create=await handleAdminRequest(req('/api/admin/categories','POST',{id:'granted-category',label:'Teszt kategória',status:'published'},cookie),{...ctx,user});assert.equal(create.status,201);
 assert.equal(ctx.sqlite.prepare("SELECT actor_id FROM store_admin_audit WHERE entity_id='granted-category'").get().actor_id,user.userId);
 const cross=await handleAdminRequest(req('/api/admin/categories','POST',{id:'blocked',label:'Tiltott',status:'published'},cookie,'https://evil.test'),{...ctx,user});assert.equal(cross.status,403);
 assert.equal((await handleAdminRequest(request,{...ctx,env:{...ctx.env,GOOGLE_ADMIN_EMAILS:''},user})).status,403);
 assert.equal(isStoreAdmin({...user,provider:'magic'},ctx.env),false);
 assert.equal(isStoreAdmin({...user,provider:undefined,userId:'sites-other'},ctx.env),false);
 assert.equal(isStoreAdmin({...user,userId:'invalid-namespace'},ctx.env),false);
 assert.equal(isStoreAdmin({...user,email:'other@gmail.com'},ctx.env),false);
 const expired=await googleCustomer(req('/api/admin','GET',undefined,'__Host-spice_google_session='+'f'.repeat(64)),ctx.db,ctx.env);assert.equal(expired,null);
 const owner={userId:'sites-owner',email:'owner@example.com'};assert.equal(adminPrincipal(owner,{...user,email:'other@gmail.com'},ctx.env),owner);
 await call(ctx,'logout','POST',{},cookie);assert.equal(await googleCustomer(request,ctx.db,ctx.env),null);
});
