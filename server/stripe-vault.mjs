import {fail} from './store.mjs';
const modeOf=env=>env.STRIPE_MODE==='live'?'live':'test';
const objectKey=mode=>'private-credentials/stripe-v1/'+mode;
const utf8=new TextEncoder();
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function master(env){
 try{const bytes=decode(env.STRIPE_VAULT_KEY);if(bytes.length!==32)throw Error();return await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
 catch{fail(503,'A titkosított kulcstároló nincs beállítva.');}
}
export async function saveStripeKey(env,bucket,value){
 if(!bucket||!env.STRIPE_VAULT_KEY)fail(503,'A titkosított kulcstároló nem érhető el.');
 if(typeof value!=='string'||value.length>512)fail(400,'Érvényes Stripe Secret Key szükséges.');
 const key=value.trim(),match=/^sk_(test|live)_[A-Za-z0-9]{16,480}$/.exec(key);
 if(!match)fail(400,'sk_test_ vagy sk_live_ kezdetű titkos kulcsot adj meg. A publikus és a webhookkulcs ide nem használható.');
 const mode=match[1],id=objectKey(mode),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode(id)},await master(env),utf8.encode(key));
 await bucket.put(id,JSON.stringify({v:1,iv:encode(iv),cipher:encode(cipher)}));
 return {saved:true,mode};
}
export async function stripeKeyStatus(env,bucket){
 const configured=async mode=>!!(env.STRIPE_SECRET_KEY?.startsWith('sk_'+mode+'_')||await bucket?.head(objectKey(mode)));
 return {mode:modeOf(env),test:await configured('test'),live:await configured('live'),writable:!!(bucket&&env.STRIPE_VAULT_KEY)};
}
export async function stripeRuntime(env,bucket=env.BUCKET){
 if(!bucket||!env.STRIPE_VAULT_KEY)return env;
 const id=objectKey(modeOf(env)),obj=await bucket.get(id);if(!obj)return env;
 try{const blob=await obj.json();if(blob.v!==1)throw Error();
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(blob.iv),additionalData:utf8.encode(id)},await master(env),decode(blob.cipher));
 return {...env,STRIPE_SECRET_KEY:new TextDecoder().decode(bytes)};
 }catch{fail(503,'A mentett Stripe-kulcs nem olvasható. Ellenőrizd a kulcstároló beállítását.');}
}
