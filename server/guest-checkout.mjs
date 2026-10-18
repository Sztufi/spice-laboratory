// A short-lived checkout access capability. It cannot sign in or access account APIs.
const COOKIE='__Host-spice-checkout';
const AGE=24*60*60;
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function guestCheckoutAccess(request,db){
 const token=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!/^[a-f0-9]{64}$/.test(token||''))return null;
 const row=await q(db,'SELECT customer_id,expires_at FROM guest_checkout_access WHERE token_hash=? AND expires_at>?',await hash(token),Date.now()).first();
 return row?{userId:row.customer_id,email:'',guest:true,expiresAt:row.expires_at}:null;
}
export async function issueGuestCheckoutAccess(request,db){
 const existing=await guestCheckoutAccess(request,db);
 if(existing){
  if(existing.expiresAt>Date.now()+2*60*60*1000)return null;
  const token=request.headers.get('cookie').split(';').map(part=>part.trim()).find(part=>part.startsWith(COOKIE+'=')).slice(COOKIE.length+1);
  await q(db,'UPDATE guest_checkout_access SET expires_at=? WHERE token_hash=?',Date.now()+AGE*1000,await hash(token)).run();
  return `${COOKIE}=${token}; Path=/; Max-Age=${AGE}; HttpOnly; Secure; SameSite=Lax`;
 }
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
 const id='guest:'+crypto.randomUUID(),date=new Date().toISOString();
 await db.batch([
 q(db,'INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,'','','',date,date),
 q(db,'INSERT INTO guest_checkout_access(token_hash,customer_id,expires_at,created_at) VALUES(?,?,?,?)',await hash(token),id,Date.now()+AGE*1000,date)
 ]);
 return `${COOKIE}=${token}; Path=/; Max-Age=${AGE}; HttpOnly; Secure; SameSite=Lax`;
}
