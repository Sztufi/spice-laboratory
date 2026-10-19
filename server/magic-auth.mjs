import {assertSameOrigin} from './account.mjs';
import {googleCustomer} from './google-auth.mjs';
const SESSION='__Host-spice_email_session',BROWSER='__Host-spice_email_browser',AGE=7*86400;
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(data,status=200)=>Response.json(data,{status,headers});
const q=(db,sql,...v)=>db.prepare(sql).bind(...v);
const now=()=>Math.floor(Date.now()/1000);
const random=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const cookie=(name,value,age)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function readCookie(request,name){const all=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));const v=all.length===1?all[0].slice(name.length+1):'';return /^[a-f0-9]{64}$/.test(v)?v:null;}
function fail(status,message){const e=new Error(message);e.status=status;throw e;}
export function magicConfig(env={},origin){
 let origins=[];try{origins=JSON.parse(env.MAGIC_ALLOWED_ORIGINS_JSON||'[]');}catch{}
 const from=typeof env.MAGIC_EMAIL_FROM==='string'?env.MAGIC_EMAIL_FROM:'';
 const provider=env.MAGIC_EMAIL_PROVIDER||'resend';
 const ready=provider==='omnisend'?env.OMNISEND_ENABLED==='true'&&typeof env.OMNISEND_API_KEY==='string'&&env.OMNISEND_API_KEY.length>0&&/^[a-f0-9]{24}$/.test(env.MAGIC_OMNISEND_AUTOMATION_ID||''):provider==='resend'&&typeof env.RESEND_API_KEY==='string'&&env.RESEND_API_KEY.startsWith('re_')&&from.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from);
 const enabled=env.MAGIC_AUTH_ENABLED==='true'&&Array.isArray(origins)&&origins.includes(origin)&&origin.startsWith('https://')&&ready;
 return {enabled};
}
export async function magicCustomer(request,db,env={}){
 if(!db||!magicConfig(env,new URL(request.url).origin).enabled)return null;
 const token=readCookie(request,SESSION);if(!token)return null;
 const row=await q(db,'SELECT c.id,c.email,c.full_name FROM email_customer_sessions s JOIN customers c ON c.id=s.user_id JOIN email_login_identities i ON i.user_id=c.id AND i.email=lower(c.email) WHERE s.token_hash=? AND s.expires_at>?',await hash(token),now()).first();
 return row?{userId:row.id,email:row.email,fullName:row.full_name,provider:'magic'}:null;
}
async function bodyJson(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'JSON kérés szükséges.');
 const reader=request.body?.getReader();let total=0,parts=[];
 if(reader)try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>4096){await reader.cancel();fail(413,'Túl nagy kérés.');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Hibás kérés.');return value;}catch{fail(400,'Hibás kérés.');}
}
async function limit(db,key,window,maximum){
 const id=await hash(key+'|'+Math.floor(now()/window));
 const row=await q(db,'INSERT INTO email_login_throttle(id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts',id,now()+window*2).first();
 if(row.attempts>maximum)fail(429,'Túl sok kérés. Próbáld újra később.');
}
async function sendEmail(env,email,link,fetcher){
 if(env.MAGIC_EMAIL_PROVIDER==='omnisend'){
  // Transactional server event: no optIns, consent, tags or contact properties.
  // Never retry automatically: real-time events are not deduplicated by Omnisend.
  const response=await fetcher('https://api.omnisend.com/api/events',{method:'POST',redirect:'manual',headers:{Authorization:'Omnisend-API-Key '+env.OMNISEND_API_KEY,'Omnisend-Version':'2026-03-15','Content-Type':'application/json'},body:JSON.stringify({eventName:'spice magic login requested',origin:'api',eventID:crypto.randomUUID(),contact:{email},properties:{loginUrl:link,expiresAt:new Date(Date.now()+600000).toISOString()}}),signal:AbortSignal.timeout(15000)});
  if(response.status!==202)fail(503,'A belépési levelet most nem sikerült elküldeni. Próbáld újra később.');
  await response.body?.cancel();
  return;
 }
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:'Spice Laboratory <'+env.MAGIC_EMAIL_FROM+'>',to:[email],subject:'Egy kattintás, és bent vagy – Spice Laboratory',text:`Itt a belépési linked:\n${link}\n\n10 percig, egyszer használható. Másik böngészőben még meg kell erősítened a belépést. Ha nem te kérted, hagyd figyelmen kívül ezt a levelet. A linket ne oszd meg senkivel.`,html:`<div style="background:#fff9e9;color:#17130f;padding:32px;font-family:Arial,sans-serif;max-width:520px"><h1>EZ A TE BELÉPŐD.</h1><p>A fűszereid, kedvenceid és rendeléseid várnak.</p><p><a href="${link}" style="display:inline-block;background:#ffd336;color:#17130f;padding:16px 22px;font-weight:bold;text-decoration:none">BELÉPEK A FIÓKOMBA</a></p><p>10 percig, egyszer használható. Másik böngészőben még meg kell erősítened a belépést.</p><p>Ha nem te kérted, hagyd figyelmen kívül ezt a levelet. A linket ne oszd meg senkivel.</p></div>`}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)fail(503,'A belépési levelet most nem sikerült elküldeni. Próbáld újra később.');
 const result=await response.json().catch(()=>null);if(typeof result?.id!=='string')fail(503,'A levélküldő nem igazolta vissza a küldést. Próbáld újra később.');
}
/** @param {Request} request @param {{db:any,env?:Record<string,any>,fetcher?:typeof fetch}} ctx */
export async function handleMagicAuth(request,{db,env={},fetcher=fetch}){
 const url=new URL(request.url),path=url.pathname.replace(/^\/api\/auth\/magic\/?/,'');
 let stage='request';
 if(request.method==='GET'&&path==='config')return json(magicConfig(env,url.origin));
 try{
  if(request.method!=='POST')return json({error:'Nem található.'},404);
  assertSameOrigin(request);if(!db)fail(503,'A belépés átmenetileg nem érhető el.');
  if(path==='logout'){
   const token=readCookie(request,SESSION);if(token)await q(db,'DELETE FROM email_customer_sessions WHERE token_hash=?',await hash(token)).run();
   const response=json({signedOut:true});response.headers.append('Set-Cookie',cookie(SESSION,'',0));response.headers.append('Set-Cookie',cookie(BROWSER,'',0));return response;
  }
  if(!magicConfig(env,url.origin).enabled)fail(503,'Az e-mailes belépés aktiválása folyamatban van.');
  if(!['request','preview','verify'].includes(path))return json({error:'Nem található.'},404);
  const body=await bodyJson(request);
  await limit(db,'ip|'+path+'|'+(request.headers.get('cf-connecting-ip')||'unknown'),3600,path==='request'?20:60);
  if(path==='request'){
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
   if(email.length>254||!/^[-\w.!#$%&'*+/=?^`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email))fail(400,'Adj meg egy érvényes e-mail-címet.');
   await limit(db,'email-minute|'+email,60,1);await limit(db,'email-hour|'+email,3600,5);await limit(db,'global-email',3600,200);
   stage='identity';
   let identity=await q(db,'SELECT user_id FROM email_login_identities WHERE email=?',email).first();
   let userId=identity?.user_id||'email:'+await hash(email);
   if(body.link===true){
    const user=await googleCustomer(request,db,env);if(!user||user.email.toLowerCase()!==email)fail(403,'A fiók összekapcsolásához előbb lépj be ugyanazzal a Google-fiókkal.');
    if(identity&&identity.user_id!==user.userId)fail(409,'Ehhez az e-mail-címhez már külön fiók tartozik. Automatikusan nem vonjuk össze az adatokat.');
    userId=user.userId;
   }
   const token=random(),browser=readCookie(request,BROWSER)||random(),tokenHash=await hash(token);
   stage='pending-link';
   await db.batch([q(db,'DELETE FROM email_login_links WHERE expires_at<?',now()),q(db,'DELETE FROM email_customer_sessions WHERE expires_at<?',now()),q(db,'DELETE FROM email_login_throttle WHERE expires_at<?',now()),q(db,'INSERT INTO email_login_links(token_hash,email,user_id,browser_hash,expires_at,ready) VALUES(?,?,?,?,?,0)',tokenHash,email,userId,await hash(browser),now()+600)]);
   try{stage='provider-send';await sendEmail(env,email,url.origin+'/fiok#magic='+token,fetcher);stage='activate-link';await q(db,'UPDATE email_login_links SET ready=1 WHERE token_hash=?',tokenHash).run();}
   catch(error){await q(db,'DELETE FROM email_login_links WHERE token_hash=?',tokenHash).run();throw error;}
   const response=json({sent:true,message:'Elküldtük a belépési linkedet. Nézd meg a postaládádat és a spam mappát is.'});response.headers.append('Set-Cookie',cookie(BROWSER,browser,600));return response;
  }
  if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))fail(400,'Hibás belépési link. Kérj újat.');
  const tokenHash=await hash(body.token),row=await q(db,'SELECT email,user_id,browser_hash FROM email_login_links WHERE token_hash=? AND expires_at>? AND ready=1',tokenHash,now()).first();
  if(!row)fail(401,'A belépési link lejárt vagy már felhasználták. Kérj újat.');
  const browser=readCookie(request,BROWSER),sameBrowser=Boolean(browser&&await hash(browser)===row.browser_hash);
  if(path==='preview')return json({email:row.email,sameBrowser});
  if(!sameBrowser&&body.confirm!==true)fail(409,'Erősítsd meg, hogy ezzel az e-mail-címmel szeretnél belépni.');
  if(row.user_id.startsWith('google:')){
   const current=await q(db,'SELECT email FROM customers WHERE id=?',row.user_id).first();
   const binding=await q(db,'SELECT user_id FROM email_login_identities WHERE email=?',row.email).first();
   if(current?.email.toLowerCase()!==row.email||(binding&&binding.user_id!==row.user_id))fail(409,'A fiók adatai időközben megváltoztak. Lépj be Google-fiókkal, és kérj új összekapcsoló linket.');
  }
  const used=await q(db,'DELETE FROM email_login_links WHERE token_hash=? AND expires_at>? AND ready=1 RETURNING email,user_id',tokenHash,now()).first();
  if(!used)fail(401,'A belépési link már nem használható. Kérj újat.');
  const token=random(),old=readCookie(request,SESSION),stamp=new Date().toISOString();
  const statements=[q(db,'INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',used.user_id,used.email,'','',stamp,stamp),q(db,'INSERT INTO email_login_identities(email,user_id) VALUES(?,?) ON CONFLICT(email) DO NOTHING',used.email,used.user_id)];
  if(old)statements.push(q(db,'DELETE FROM email_customer_sessions WHERE token_hash=?',await hash(old)));
  statements.push(q(db,'INSERT INTO email_customer_sessions(token_hash,user_id,expires_at,created_at) SELECT ?,user_id,?,? FROM email_login_identities WHERE email=?',await hash(token),now()+AGE,now(),used.email));await db.batch(statements);
  const response=json({authenticated:true,provider:'magic'});response.headers.append('Set-Cookie',cookie(SESSION,token,AGE));return response;
 }catch(error){if(!error.status)console.error(JSON.stringify({component:'magic-login',stage,errorType:['TypeError','AbortError','TimeoutError'].includes(error.name)?error.name:'Error'}));return json({error:error.status?error.message:'Az e-mailes belépés átmenetileg nem érhető el.'},error.status||503);}
}
