import test from 'node:test';
import assert from 'node:assert/strict';
import {startStripeCheckout} from '../public/commerce.mjs';

test('browser sends customer details and regenerates the payment attempt when the address changes',async()=>{
 const originalFetch=globalThis.fetch,originalWindow=globalThis.window,requests=[];
 globalThis.window={location:{assign(url){assert.ok(url.startsWith('https://checkout.stripe.com/'));}}};
 globalThis.fetch=async(url,options)=>{if(url.endsWith('/checkout'))requests.push(JSON.parse(options.body));return Response.json(url.endsWith('/checkout')?{url:'https://checkout.stripe.com/test'}:{ready:true});};
 try{
  const selection={checkoutMode:'guest',country:'HU',methodId:'hu-home',customer:{email:'test@example.com',shipping:{name:'Test Buyer',phone:'+3612345678',address:{country:'HU',postalCode:'1111',city:'Budapest',line1:'Test utca 1'}},billingSame:true,termsAccepted:true,privacyAccepted:true}};
  await startStripeCheckout([{id:'fries-salt',quantity:1}],selection);
  await startStripeCheckout([{id:'fries-salt',quantity:1}],selection);
  assert.deepEqual(requests[0].customer,selection.customer);
  assert.equal(requests[0].requestId,requests[1].requestId);
  selection.customer.shipping.address.line1='Test utca 2';
  await startStripeCheckout([{id:'fries-salt',quantity:1}],selection);
  assert.notEqual(requests[1].requestId,requests[2].requestId);
 }finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
});
