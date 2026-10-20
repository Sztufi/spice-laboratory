import {query as q,all,loadStore,fail} from './store.mjs';
import {escapeHtml} from '../public/html-escape.mjs';
export const RESTOCK_AUTOMATION='6ad743fd9a21c7aaedc000d5';
export const RESTOCK_EVENT='spice product available';
export async function restockOverview(db){
 const rows=await all(db,"SELECT product_id,status,COUNT(*) AS total FROM restock_requests WHERE expires_at>? GROUP BY product_id,status",stamp());
 return rows;
}
const stamp=()=>new Date().toISOString();
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const ready=env=>!!env.OMNISEND_API_KEY&&env.OMNISEND_ENABLED==='true';
async function throttle(db,key,period,max){
 const seconds=Math.floor(Date.now()/1000),id=await hash('restock:'+key+':'+Math.floor(seconds/period));
 const row=await q(db,'INSERT INTO newsletter_throttle(id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts',id,seconds+period*2).first();
 if(row.attempts>max)fail(429,'Túl sok kérés. Próbáld újra később.');
}
export async function subscribeRestock(input,request,{db,env}){
 if(!ready(env))fail(503,'A készletértesítő most nem elérhető. Próbáld újra később.');
 const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||/[<>\u0000-\u001f]/.test(email))fail(400,'Adj meg érvényes e-mail-címet.');
 if(input?.consent!==true)fail(400,'Erősítsd meg az egyszeri értesítés kérését.');
 if(input.website)return {accepted:true};
 await throttle(db,'ip:'+(request.headers.get('cf-connecting-ip')||'unknown'),3600,20);
 await throttle(db,'email:'+email,86400,10);
 const {catalogue}=await loadStore(db,{env}),product=catalogue.products.find(p=>p.id===input.productId);
 if(!product)fail(404,'A termék nem található.');
 if(product.inStock!==false)fail(409,'Ez a termék már elérhető. Nyisd meg újra a termékoldalt.');
 const now=stamp(),expires=new Date(Date.now()+180*86400000).toISOString();
 await q(db,`INSERT INTO restock_requests(id,product_id,email,status,cancel_token,created_at,expires_at) VALUES(?,?,?,'waiting',?,?,?)
 ON CONFLICT(product_id,email) DO UPDATE SET status='waiting',id=excluded.id,cancel_token=excluded.cancel_token,created_at=excluded.created_at,expires_at=excluded.expires_at,sent_at=NULL
 WHERE restock_requests.status IN ('sent','cancelled') OR restock_requests.expires_at<?`,crypto.randomUUID(),product.id,email,crypto.randomUUID(),now,expires,now).run();
 return {accepted:true};
}
export async function cancelRestock(input,{db}){
 if(typeof input?.token!=='string'||!/^[a-f0-9-]{36}$/.test(input.token))fail(400,'Érvénytelen lemondási hivatkozás.');
 await q(db,"UPDATE restock_requests SET status='cancelled' WHERE cancel_token=? AND status='waiting'",input.token).run();
 return {cancelled:true};
}
// Invoked after a real stock read. Atomic claims prevent concurrent requests
// sending twice; ambiguous provider outcomes need review, never blind retries.
export async function dispatchRestock({db,env,fetcher=fetch},catalogue){
 if(!db||!ready(env))return;
 const now=stamp();
 await q(db,'DELETE FROM restock_requests WHERE expires_at<?',now).run();
 const available=catalogue.products.filter(p=>p.inStock!==false).map(p=>p.id);
 if(!available.length)return;
 const rows=[];
 for(let i=0;i<available.length&&rows.length<20;i+=80){
  const ids=available.slice(i,i+80);
  rows.push(...await all(db,`SELECT * FROM restock_requests WHERE status='waiting' AND product_id IN (${ids.map(()=>'?').join(',')}) ORDER BY created_at LIMIT ?`,...ids,20-rows.length));
 }
 if(!rows.length)return;
 const headers={Authorization:'Omnisend-API-Key '+env.OMNISEND_API_KEY,'Omnisend-Version':'2026-03-15','Content-Type':'application/json'};
 let check;try{check=await fetcher('https://api.omnisend.com/api/automations/'+RESTOCK_AUTOMATION,{headers,redirect:'manual',signal:AbortSignal.timeout(12000)});}catch{return;}
 if(!check.ok){await check.body?.cancel();return;}
 const flow=await check.json();
 if(flow.isEnabled!==true||flow.trigger?.condition?.event!==RESTOCK_EVENT||flow.trigger?.condition?.origin!=='api')return;
 await Promise.all(rows.map(async row=>{
  const product=catalogue.products.find(p=>p.id===row.product_id);
  const claimed=await q(db,"UPDATE restock_requests SET status='sending' WHERE id=? AND status='waiting' RETURNING id",row.id).first();
  if(!claimed)return;
  let response;
  try{response=await fetcher('https://api.omnisend.com/api/events',{method:'POST',headers,redirect:'manual',body:JSON.stringify({eventName:RESTOCK_EVENT,origin:'api',eventID:row.id,eventTime:now,contact:{email:row.email},properties:{productId:product.id,productName:escapeHtml(product.name),productUrl:'https://spicelaboratory.eu/termek/'+encodeURIComponent(product.id),cancelUrl:'https://spicelaboratory.eu/termekek#restockCancel='+row.cancel_token}}),signal:AbortSignal.timeout(12000)});}catch{}
  const accepted=response?.status===202;await response?.body?.cancel();
  await q(db,"UPDATE restock_requests SET status=?,sent_at=? WHERE id=? AND status='sending'",accepted?'sent':'review',accepted?now:null,row.id).run();
 }));
}
