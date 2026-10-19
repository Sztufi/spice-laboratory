import {verifyGoogleIdentity} from './google-identity.mjs';
import {assertSameOrigin} from './account.mjs';
const SESSION='__Host-spice_google_session',CHALLENGE='__Host-spice_google_challenge',AGE=7*86400;
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const json=(data,status=200)=>Response.json(data,{status,headers});
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const now=()=>Math.floor(Date.now()/1000);
const random=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const cookie=(name,value,age)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function readCookie(request,name){
 const values=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));
 const value=values.length===1?values[0].slice(name.length+1):'';return /^[a-f0-9]{64}$/.test(value)?value:null;
}
export function googleConfig(env={},origin){
 let origins=[];try{origins=JSON.parse(env.GOOGLE_ALLOWED_ORIGINS_JSON||'[]');}catch{}
 const enabled=env.GOOGLE_AUTH_ENABLED==='true'&&typeof env.GOOGLE_CLIENT_ID==='string'&&/^[-\w.]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID)&&Array.isArray(origins)&&origins.includes(origin)&&new URL(origin).protocol==='https:';
 return {enabled,clientId:enabled?env.GOOGLE_CLIENT_ID:null};
}
export async function googleCustomer(request,db,env={}){
 if(!db||!googleConfig(env,new URL(request.url).origin).enabled)return null;
 const token=readCookie(request,SESSION);if(!token)return null;
 const row=await q(db,'SELECT c.id,c.email,c.full_name FROM google_customer_sessions s JOIN customers c ON c.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',await hash(token),now()).first();
 return row?{userId:row.id,email:row.email,fullName:row.full_name,provider:'google'}:null;
}
async function throttle(request,db,action){
 const id=await hash(action+'|'+(request.headers.get('cf-connecting-ip')||'unknown')+'|'+Math.floor(now()/900));
 const row=await q(db,'INSERT INTO google_login_throttle(id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts',id,now()+1800).first();
 if(row.attempts>20){const e=new Error('Túl sok belépési kísérlet. Próbáld később.');e.status=429;throw e;}
}
async function readBody(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json')){const e=new Error('JSON kérés szükséges.');e.status=415;throw e;}
 const reader=request.body?.getReader();let bytes=0,parts=[];
 if(reader)try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>20000){await reader.cancel();const e=new Error('Túl nagy belépési kérés.');e.status=413;throw e;}parts.push(value);}}finally{reader.releaseLock();}
 const data=new Uint8Array(bytes);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder().decode(data));}catch{const e=new Error('Hibás JSON.');e.status=400;throw e;}
}
/** @param {Request} request @param {{db:any,env?:Record<string,any>,keySet?:any}} ctx */
export async function handleGoogleAuth(request,{db,env={},keySet}){
 const path=new URL(request.url).pathname.replace(/^\/api\/auth\/google\/?/,'');
 const config=googleConfig(env,new URL(request.url).origin);
 if(request.method==='GET'&&path==='config')return json(config);
 try{
  if(request.method!=='POST')return json({error:'Nem található.'},404);
  assertSameOrigin(request);
  if(!db)return json({error:'A belépés átmenetileg nem érhető el.'},503);
  if(path==='logout'){
   const token=readCookie(request,SESSION);if(token)await q(db,'DELETE FROM google_customer_sessions WHERE token_hash=?',await hash(token)).run();
   const response=json({signedOut:true});response.headers.append('Set-Cookie',cookie(SESSION,'',0));response.headers.append('Set-Cookie',cookie(CHALLENGE,'',0));return response;
  }
  if(!config.enabled)return json({error:'A Google-belépés ezen a webcímen nincs aktiválva.'},503);
  if(!['challenge','login'].includes(path))return json({error:'Nem található.'},404);
  await throttle(request,db,path);
  if(path==='challenge'){
   const token=random(),nonce=random(),old=readCookie(request,CHALLENGE);
   const statements=[q(db,'DELETE FROM google_login_challenges WHERE expires_at<?',now()),q(db,'DELETE FROM google_customer_sessions WHERE expires_at<?',now()),q(db,'DELETE FROM google_login_throttle WHERE expires_at<?',now())];
   if(old)statements.push(q(db,'DELETE FROM google_login_challenges WHERE token_hash=?',await hash(old)));
   statements.push(q(db,'INSERT INTO google_login_challenges(token_hash,nonce,expires_at) VALUES(?,?,?)',await hash(token),nonce,now()+600));await db.batch(statements);
   const response=json({clientId:config.clientId,nonce});response.headers.set('Set-Cookie',cookie(CHALLENGE,token,600));return response;
  }
  const body=await readBody(request),challenge=readCookie(request,CHALLENGE);
  if(!challenge||typeof body?.credential!=='string'||body.credential.length>16384)return json({error:'Indítsd újra a Google-belépést.'},400);
  const row=await q(db,'DELETE FROM google_login_challenges WHERE token_hash=? AND expires_at>? RETURNING nonce',await hash(challenge),now()).first();
  if(!row)return json({error:'A belépési kérés lejárt vagy már felhasználták. Indítsd újra.'},401);
  let identity;try{identity=await verifyGoogleIdentity(body.credential,{clientId:config.clientId,nonce:row.nonce,keySet});}catch{return json({error:'A Google-belépést nem sikerült hitelesíteni. Indítsd újra.'},401);}
  const userId='google:'+identity.subject,token=random(),stamp=new Date().toISOString(),old=readCookie(request,SESSION);
  const statements=[q(db,'INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,updated_at=excluded.updated_at',userId,identity.email,identity.fullName?.slice(0,100)||'','',stamp,stamp)];
  if(old)statements.push(q(db,'DELETE FROM google_customer_sessions WHERE token_hash=?',await hash(old)));
  statements.push(q(db,'INSERT INTO google_customer_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)',await hash(token),userId,now()+AGE,now()));await db.batch(statements);
  const response=json({authenticated:true,provider:'google'});response.headers.append('Set-Cookie',cookie(SESSION,token,AGE));response.headers.append('Set-Cookie',cookie(CHALLENGE,'',0));return response;
 }catch(error){return json({error:error.status?error.message:'A Google-belépés átmenetileg nem érhető el.'},error.status||503);}
}
