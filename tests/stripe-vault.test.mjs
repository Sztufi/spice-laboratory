import test from 'node:test';
import assert from 'node:assert/strict';
import {saveStripeKey,stripeKeyStatus,stripeRuntime} from '../server/stripe-vault.mjs';
import {handleAdminRequest} from '../server/admin.mjs';
const env={STRIPE_VAULT_KEY:btoa('a'.repeat(32)),ADMIN_EMAILS:'owner@example.com'};
const fake=mode=>'sk_'+mode+'_'+'X'.repeat(24);
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
