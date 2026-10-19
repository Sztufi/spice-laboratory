import {assertSameOrigin} from './account.mjs';
import {merchant} from './legal-pages.mjs';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function withdrawalMailReady(env={}){return !!env.RESEND_API_KEY&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.TRANSACTIONAL_EMAIL_FROM||'');}
export const withdrawalReceipt=row=>`ELÁLLÁSI NYILATKOZAT ÁTVÉTELI ELISMERVÉNYE\nSpice Laboratory\nCímzett: ${merchant.company}, ${merchant.address}\nAzonosító: ${row.id}\nBeérkezés (UTC): ${row.created_at}\nNév: ${row.name}\nE-mail: ${row.email}\nRendelés / szerződés: ${row.order_reference}\nNyilatkozat: ${row.content}\n\nAz átvételi elismervény a nyilatkozat beérkezését igazolja. Nem jelenti az elállás jogi elbírálását vagy a visszatérítés megtörténtét.\nVisszaküldési cím: ${merchant.company}, ${merchant.address}\nKapcsolat: ${merchant.email}\n`;
export async function sendWithdrawalReceipt(db,row,env,fetcher=fetch){
 if(row.email_status==='sent'||!withdrawalMailReady(env))return false;
 // Stable idempotency key; retry does not send duplicate mail within provider's window.
 let response;try{response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':'withdrawal-'+row.id},body:JSON.stringify({from:env.TRANSACTIONAL_EMAIL_FROM,to:[row.email],reply_to:merchant.email,subject:'Elállási nyilatkozat átvétele · '+row.id,text:withdrawalReceipt(row)}),signal:AbortSignal.timeout(12000)});}catch{}
 let sent=false;if(response?.ok){try{sent=typeof (await response.json()).id==='string';}catch{}}
 await q(db,"UPDATE customer_withdrawals SET email_status=? WHERE id=? AND email_status<>'sent'",sent?'sent':'failed',row.id).run();return sent;
}
export async function handleWithdrawal(request,{db,env={},fetcher=fetch}){
 try{
  assertSameOrigin(request);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON kérés szükséges.'},415);
  if(Number(request.headers.get('content-length')||0)>8192)return json({error:'Túl nagy kérés.'},413);
  const reader=request.body?.getReader();let raw='',bytes=0;if(reader){const decoder=new TextDecoder();try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();return json({error:'Túl nagy kérés.'},413);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}}
  let input;try{input=JSON.parse(raw);}catch{return json({error:'Hibás kérés.'},400);}
  const clean=(v,max,multiline=false)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v)?v.trim():null;
  const name=clean(input.name,150),email=clean(input.email,254)?.toLowerCase(),order=clean(input.orderReference,200),detail=input.detail===''?'':clean(input.detail,1500,true);
  if(!name||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!order||detail===null||input.confirm!==true||!/^[a-f0-9-]{36}$/.test(input.requestId||''))return json({error:'Add meg a neved, e-mail-címed és a rendelés azonosítóját, majd erősítsd meg az elállást.'},400);
  // No order-existence check: guests and consumers without access to their account can withdraw.
  // Nothing here changes an order, pays money, or discloses order/customer information.
  let row=await q(db,'SELECT * FROM customer_withdrawals WHERE request_id=?',input.requestId).first();
  if(row&&(row.email!==email||row.name!==name||row.order_reference!==order))return json({error:'Indíts új nyilatkozatot.'},409);
  {
   const minute=Math.floor(Date.now()/3600000),ip=request.headers.get('cf-connecting-ip')||'unavailable';
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))).map(x=>x.toString(16).padStart(2,'0')).join('');
   await q(db,'DELETE FROM withdrawal_throttle WHERE expires_at<?',Date.now()).run();
   for(const [key,limit] of [[hash,10],['global',200]]){
    const rate=await q(db,'INSERT INTO withdrawal_throttle(id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key+':'+minute,(minute+1)*3600000).first();
    if(rate.attempts>limit)return json({error:'Túl sok kérés. Az elállást e-mailben vagy postán is elküldheted: '+merchant.email},429);
   }
  }
  const content='Ezúton kijelentem, hogy elállok a megjelölt rendeléshez tartozó adásvételi szerződéstől.'+(detail?' Érintett termékek / pontosítás: '+detail:' A teljes rendelést érinti.');
  if(row&&row.content!==content)return json({error:'A módosított nyilatkozathoz új kérésazonosító szükséges.'},409);
  if(!row){
   const stamp=new Date().toISOString();
   await q(db,'INSERT INTO customer_withdrawals(id,request_id,name,email,order_reference,content,created_at,email_status,status) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING',crypto.randomUUID(),input.requestId,name,email,order,content,stamp,'pending','pending').run();
   row=await q(db,'SELECT * FROM customer_withdrawals WHERE request_id=?',input.requestId).first();
  }
  const sent=row.email_status==='sent'||await sendWithdrawalReceipt(db,row,env,fetcher);
  return json({received:true,id:row.id,createdAt:row.created_at,emailSent:sent,receipt:withdrawalReceipt(row),message:sent?'A nyilatkozatot átvettük, az átvételi elismervényt e-mailben elküldtük.':'A nyilatkozatot átvettük. Az e-mailes elismervény kézbesítése függőben van; töltsd le az elismervényt.'},sent?200:202);
 }catch(error){return json({error:error.status===403?'Eltérő eredetű kérés.':'A nyilatkozat átvételét most nem tudjuk megerősíteni. Elküldheted e-mailben vagy postán is.'},error.status===403?403:500);}
}
