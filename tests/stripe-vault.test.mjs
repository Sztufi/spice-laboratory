import test from 'node:test';
import assert from 'node:assert/strict';
import {saveStripeKey,stripeKeyStatus,stripeRuntime,saveStripeWebhook,stripeWebhookStatus} from '../server/stripe-vault.mjs';
import {verifyStripeEvent} from '../server/commerce.mjs';
import {handleAdminRequest} from '../server/admin.mjs';
const env={STRIPE_VAULT_KEY:btoa('a'.repeat(32)),ADMIN_EMAILS:'owner@example.com'};
const fake=mode=>'sk_'+mode+'_'+'X'.repeat(24);
test('webhook secrets are encrypted, mode-separated, private, and used for signature verification',async()=>{
 const b=bucket(),secret='whsec_'+'Y'.repeat(32),testSecret='whsec_'+'Z'.repeat(32);
 await saveStripeWebhook(env,b,secret,'live');await saveStripeWebhook(env,b,testSecret,'test');
 assert.deepEqual(await stripeWebhookStatus(env,b),{test:true,live:true,writable:true});
 assert.ok([...b.objects.values()].every(x=>!x.includes('whsec_')));
 const runtime=await stripeRuntime({...env,STRIPE_MODE:'live'},b);
 assert.equal(runtime.STRIPE_WEBHOOK_SECRET,secret);assert.equal(runtime.STRIPE_ENABLED,undefined);assert.equal(runtime.STRIPE_WEBHOOK_READY,undefined);
 assert.equal((await stripeRuntime(env,b)).STRIPE_WEBHOOK_SECRET,testSecret);
 const raw=JSON.stringify({type:'checkout.session.completed'}),timestamp=Math.floor(Date.now()/1000),enc=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(timestamp+'.'+raw))),x=>x.toString(16).padStart(2,'0')).join('');
 assert.equal((await verifyStripeEvent(raw,`t=${timestamp},v1=${signature}`,runtime.STRIPE_WEBHOOK_SECRET)).type,'checkout.session.completed');
 await assert.rejects(saveStripeWebhook(env,b,fake('live'),'live'),/whsec_/);
 await assert.rejects(saveStripeWebhook(env,b,secret,'unknown'),/környezetet/);
 b.objects.set('private-credentials/stripe-webhook-v1/live',b.objects.get('private-credentials/stripe-webhook-v1/test'));
 await assert.rejects(stripeRuntime({...env,STRIPE_MODE:'live'},b),/nem olvasható/);
});
test('webhook admin endpoint rejects guests, customers and cross-origin writes; never returns secret',async()=>{
 const b=bucket(),owner={userId:'owner',email:'owner@example.com'},secret='whsec_'+'W'.repeat(32);
 const call=(user,method='GET',origin='https://shop.test',value=secret)=>handleAdminRequest(new Request('https://shop.test/api/admin/stripe-webhook-key',{method,headers:{origin,'content-type':'application/json'},body:method==='PUT'?JSON.stringify({secretKey:value,mode:'live'}):undefined}),{env,user,db:{},bucket:b});
 assert.equal((await call(null)).status,401);
 assert.equal((await call({...owner,email:'customer@example.com'},'PUT')).status,403);
 assert.equal((await call(owner,'PUT','https://wrong.test')).status,403);
 assert.equal((await call(owner,'PUT','https://shop.test',fake('live'))).status,400);
 assert.deepEqual(await (await call(owner,'PUT')).json(),{saved:true,mode:'live',verified:false});
 const response=await call(owner);assert.match(response.headers.get('cache-control'),/no-store/);
 const raw=await response.text();assert.ok(!raw.includes(secret));assert.equal(JSON.parse(raw).live,true);
});
function bucket(){const objects=new Map();return {objects,put:(id,v)=>objects.set(id,v),head:id=>objects.has(id),get:id=>objects.has(id)?{json:()=>JSON.parse(objects.get(id))}:null};}
test('vault keeps separate authenticated ciphertext per mode and never exposes saved values',async()=>{
 const b=bucket();
 for(const mode of ['test','live'])await saveStripeKey(env,b,fake(mode));
 assert.equal(b.objects.size,2);
 for(const value of b.objects.values())assert.ok(!value.includes('sk_'));
 assert.deepEqual(await stripeKeyStatus(env,b),{test:true,live:true,writable:true,mode:'test'});
 assert.equal((await stripeRuntime(env,b)).STRIPE_SECRET_KEY,fake('test'));
 assert.equal((await stripeRuntime({...env,STRIPE_MODE:'live'},b)).STRIPE_SECRET_KEY,fake('live'));
 b.objects.set('private-credentials/stripe-v1/live',b.objects.get('private-credentials/stripe-v1/test'));
 await assert.rejects(stripeRuntime({...env,STRIPE_MODE:'live'},b),/nem olvasható/);
});
test('admin key access requires authenticated admin, same-origin writes and valid secret format',async()=>{
 const b=bucket(),origin='https://shop.test',owner={userId:'owner',email:'owner@example.com'};
 const call=(user,method='GET',val,from=origin)=>handleAdminRequest(new Request(origin+'/api/admin/stripe-key',{method,headers:{origin:from,'content-type':'application/json'},body:method==='PUT'?JSON.stringify({secretKey:val}):undefined}),{env,user,db:{},bucket:b});
 assert.equal((await call(null)).status,401);assert.equal((await call({...owner,email:'buyer@example.com'},'PUT',fake('test'))).status,403);
 assert.equal((await call(owner,'PUT',fake('test'),'https://wrong.test')).status,403);
 assert.equal((await call(owner,'PUT','pk_live_not_a_secret')).status,400);
 assert.deepEqual(await (await call(owner,'PUT',fake('live'))).json(),{saved:true,mode:'live'});
 assert.equal((await (await call(owner)).json()).live,true);
 await assert.rejects(saveStripeKey({},b,fake('test')),/nem érhető el/);
});
