import {fail} from './store.mjs';
const modeOf=env=>env.STRIPE_MODE==='live'?'live':'test';
const objectKey=mode=>'private-credentials/stripe-v1/'+mode;
const webhookKey=mode=>'private-credentials/stripe-webhook-v1/'+mode;
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
 const result={...env};
 for(const [id,field] of [[objectKey(modeOf(env)),'STRIPE_SECRET_KEY'],[webhookKey(modeOf(env)),'STRIPE_WEBHOOK_SECRET']]){
 const obj=await bucket.get(id);if(!obj)continue;
 try{const blob=await obj.json();if(blob.v!==1)throw Error();
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(blob.iv),additionalData:utf8.encode(id)},await master(env),decode(blob.cipher));
 result[field]=new TextDecoder().decode(bytes);
 }catch{fail(503,'A mentett Stripe-kulcs nem olvasható. Ellenőrizd a kulcstároló beállítását.');}
 }
 return result;
}
export async function saveStripeWebhook(env,bucket,value,mode){
 if(!bucket||!env.STRIPE_VAULT_KEY)fail(503,'A titkosított kulcstároló nem érhető el.');
 if(!['test','live'].includes(mode))fail(400,'Válaszd ki a teszt vagy éles környezetet.');
 if(typeof value!=='string'||value.length>512||!/^whsec_[A-Za-z0-9]{16,480}$/.test(value.trim()))fail(400,'whsec_ kezdetű Webhook Signing Secret szükséges.');
 const id=webhookKey(mode),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode(id)},await master(env),utf8.encode(value.trim()));
 await bucket.put(id,JSON.stringify({v:1,iv:encode(iv),cipher:encode(cipher)}));
 return {saved:true,mode,verified:false};
}
export async function stripeWebhookStatus(env,bucket){
 const configured=async mode=>!!(await bucket?.head(webhookKey(mode))||(mode===modeOf(env)&&env.STRIPE_WEBHOOK_SECRET));
 return {test:await configured('test'),live:await configured('live'),writable:!!(bucket&&env.STRIPE_VAULT_KEY)};
}
