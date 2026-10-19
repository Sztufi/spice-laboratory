import {query as q,fail} from './store.mjs';
export async function subscribeNewsletter(request,{db,env,fetcher=fetch},config,consentText){
 if(!config.newsletterEnabled)fail(503,'A hírlevél-feliratkozás még nincs aktiválva.');
 if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON kérés szükséges.');
 if(Number(request.headers.get('content-length')||0)>4096)fail(413,'Túl nagy kérés.');
 const reader=request.body?.getReader(),parts=[];let length=0;
 if(reader)try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();fail(413,'Túl nagy kérés.');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 const raw=new TextDecoder().decode(bytes);
 let input;try{input=JSON.parse(raw);}catch{fail(400,'Hibás kérés.');}
 if(input?.website)return {accepted:true,synced:true};
 const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||/[<>\u0000-\u001f]/.test(email))fail(400,'Adj meg egy érvényes e-mail-címet.');
 if(input.consent!==true||input.consentVersion!==config.consentVersion)fail(400,'A feliratkozáshoz külön hozzájárulás szükséges.');
 const stamp=new Date().toISOString(),seconds=Math.floor(Date.now()/1000),period=Math.floor(seconds/3600);
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
 const keys=[{id:await digest('ip:'+ip+':'+period),limit:ip==='unknown'?100:15},{id:await digest('email:'+email+':'+Math.floor(seconds/86400)),limit:3}];
 for(const key of keys){const row=await q(db,'INSERT INTO newsletter_throttle(id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key.id,seconds+172800).first();if(row.attempts>key.limit)fail(429,'Túl sok kérés. Próbáld újra később.');}
 await q(db,'DELETE FROM newsletter_throttle WHERE expires_at<?',seconds).run();
 const revision=crypto.randomUUID();
 await q(db,"INSERT INTO newsletter_subscribers(email,consent_version,consent_text,status,revision,created_at,updated_at) VALUES(?,?,?,'pending',?,?,?) ON CONFLICT(email) DO UPDATE SET consent_version=excluded.consent_version,consent_text=excluded.consent_text,status='pending',revision=excluded.revision,updated_at=excluded.updated_at",email,config.consentVersion,consentText,revision,stamp,stamp).run();
 const payload={identifiers:[{type:'email',id:email,channels:{email:{status:'subscribed',statusChangedAt:stamp}},consent:{source:'spice-laboratory-newsletter',createdAt:stamp}}]};
 let response;try{response=await fetcher('https://api.omnisend.com/api/contacts',{method:'POST',headers:{Authorization:`Omnisend-API-Key ${env.OMNISEND_API_KEY}`,'Omnisend-Version':'2026-03-15','Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});}catch{}
 const synced=response?.ok===true;
 await q(db,'UPDATE newsletter_subscribers SET status=?,updated_at=? WHERE email=? AND revision=?',synced?'synced':'failed',stamp,email,revision).run();
 return {accepted:true,synced};
}
