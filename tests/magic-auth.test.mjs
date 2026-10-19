import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleMagicAuth,magicCustomer,magicConfig} from '../server/magic-auth.mjs';
import {handleAccountRequest} from '../server/account.mjs';
import {isStoreAdmin} from '../server/store.mjs';
const origin='https://spice.test';
const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
function context(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const sent=[];return {db,sqlite,sent,env:{MAGIC_AUTH_ENABLED:'true',MAGIC_ALLOWED_ORIGINS_JSON:JSON.stringify([origin]),MAGIC_EMAIL_FROM:'login@spice.test',RESEND_API_KEY:'re_test',ADMIN_EMAILS:'owner@example.com'},fetcher:async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(init.body));return Response.json({id:'mail-'+sent.length});}};
}
const req=(path,body,cookie='',from=origin)=>new Request(origin+'/api/auth/magic/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:from,Cookie:cookie,'Content-Type':'application/json','cf-connecting-ip':'192.0.2.1'},body:body===undefined?undefined:JSON.stringify(body)});
const call=(ctx,path,body,cookie='',from=origin)=>handleMagicAuth(req(path,body,cookie,from),ctx);
const cookies=r=>r.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>!x.endsWith('=')).join('; ');
const token=ctx=>ctx.sent.at(-1).text.match(/#magic=([a-f0-9]{64})/)[1];
test('email login creates a private customer session only after delivery and proof, preserves one-use semantics and revokes logout',async()=>{
 const ctx=context(),requested=await call(ctx,'request',{email:'OWNER@EXAMPLE.COM'});assert.equal(requested.status,200);
 const t=token(ctx),browser=cookies(requested),preview=await call(ctx,'preview',{token:t},browser);assert.equal((await preview.json()).sameBrowser,true);
 assert.equal(ctx.sqlite.prepare('SELECT count(*) AS n FROM email_customer_sessions').get().n,0);
 const verified=await call(ctx,'verify',{token:t},browser);assert.equal(verified.status,200);const session=cookies(verified);
 assert.match(verified.headers.get('Set-Cookie'),/Secure; HttpOnly; SameSite=Lax/);
 const user=await magicCustomer(req('config',undefined,session),ctx.db,ctx.env);assert.equal(user.provider,'magic');assert.equal(user.email,'owner@example.com');assert.equal(isStoreAdmin(user,ctx.env),false);
 const account=await handleAccountRequest(new Request(origin+'/api/account'),{...ctx,user});assert.equal(account.status,200);assert.equal((await account.json()).authenticationProvider,'magic');
 const stored=ctx.sqlite.prepare('SELECT token_hash FROM email_customer_sessions').get().token_hash;assert.ok(!session.includes(stored));assert.equal(stored.length,64);
 assert.equal((await call(ctx,'verify',{token:t},browser)).status,401);
 assert.equal((await call(ctx,'logout',{},session)).status,200);assert.equal(await magicCustomer(req('config',undefined,session),ctx.db,ctx.env),null);
});
test('scanner reads do not log in; different browsers need explicit confirmation; expiry, CSRF, forged tokens and wrong origins fail',async()=>{
 const ctx=context(),requested=await call(ctx,'request',{email:'alice@example.com'}),t=token(ctx);
 assert.equal((await call(ctx,'verify',undefined)).status,404);
 assert.equal((await (await call(ctx,'preview',{token:t})).json()).sameBrowser,false);
 assert.equal((await call(ctx,'verify',{token:t})).status,409);
 assert.equal((await call(ctx,'verify',{token:t,confirm:true},'','https://evil.test')).status,403);
 assert.equal((await call(ctx,'verify',{token:'0'.repeat(64),confirm:true})).status,401);
 assert.equal((await call(ctx,'verify',{token:t,confirm:true})).status,200);
 const requested2=await call(ctx,'request',{email:'bob@example.com'}),t2=token(ctx);ctx.sqlite.exec('UPDATE email_login_links SET expires_at=0');
 assert.equal((await call(ctx,'verify',{token:t2},cookies(requested2))).status,401);
 assert.equal(magicConfig(ctx.env,'https://evil.test').enabled,false);
 assert.equal((await call({...ctx,env:{}},'request',{email:'alice@example.com'})).status,503);
 assert.equal((await call(ctx,'request',{email:'bad\r\n@example.com'})).status,400);
});
test('provider failure never claims delivery or leaves a usable link; email throttling limits abuse and tokens are never returned',async()=>{
 const ctx=context();const failed=await call({...ctx,fetcher:async()=>Response.json({error:'provider-secret-details'},{status:500})},'request',{email:'failed@example.com'});
 assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('provider-secret-details'));
 assert.equal(ctx.sqlite.prepare('SELECT count(*) AS n FROM email_login_links').get().n,0);
 const result=await call(ctx,'request',{email:'alice@example.com'});assert.equal(result.status,200);assert.ok(!(await result.text()).includes(token(ctx)));
 assert.equal((await call(ctx,'request',{email:'alice@example.com'})).status,429);assert.equal(ctx.sent.length,1);
});
test('Google account linking needs the matching Google session plus email proof and cannot merge existing distinct accounts',async()=>{
 const ctx=context();ctx.env={...ctx.env,GOOGLE_AUTH_ENABLED:'true',GOOGLE_CLIENT_ID:'123.apps.googleusercontent.com',GOOGLE_ALLOWED_ORIGINS_JSON:JSON.stringify([origin])};
 assert.equal((await call(ctx,'request',{email:'owner@example.com',link:true})).status,403);
 const stamp=new Date().toISOString(),googleToken='1'.repeat(64);
 ctx.sqlite.prepare('INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('google:subject','google@example.com','Google user','',stamp,stamp);
 ctx.sqlite.prepare('INSERT INTO google_customer_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await hash(googleToken),'google:subject',Math.floor(Date.now()/1000)+600,0);
 const requested=await call(ctx,'request',{email:'google@example.com',link:true},'__Host-spice_google_session='+googleToken);assert.equal(requested.status,200);
 const verified=await call(ctx,'verify',{token:token(ctx)},cookies(requested));const user=await magicCustomer(req('config',undefined,cookies(verified)),ctx.db,ctx.env);assert.equal(user.userId,'google:subject');
 const another=await call(ctx,'request',{email:'separate@example.com'});await call(ctx,'verify',{token:token(ctx)},cookies(another));
 assert.notEqual(ctx.sqlite.prepare('SELECT user_id FROM email_login_identities WHERE email=?').get('separate@example.com').user_id,'google:subject');
});
