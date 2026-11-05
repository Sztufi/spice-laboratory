import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutSelection,prepareCheckoutProfile} from '../public/checkout.mjs';
const config={shippingMethods:[{id:'hu-home',country:'HU',label:'Futár',feeMinor:99000,deliveryMinDays:2,deliveryMaxDays:4}]};
test('profile prefills separate addresses, not consents, and clears them on logout or account change',()=>{
 const member={...config,accountAvailable:true};
 prepareCheckoutProfile({ownerId:'a',email:'a@example.hu',name:'Anna',phone:'+36300000000',addresses:{shipping:{name:'Címzett',line1:'Utca 1',city:'Budapest',postalCode:'1111',country:'HU'},billing:{name:'Cég',line1:'Tér 2',city:'Budapest',postalCode:'1112',country:'HU'}}});
 const c=checkoutSelection(member,275000).customer;
 assert.equal(c.email,'a@example.hu');assert.equal(c.shipping.name,'Címzett');assert.equal(c.shipping.phone,'+36300000000');assert.equal(c.billingSame,false);assert.equal(c.billing.address.line1,'Tér 2');assert.equal(c.termsAccepted,false);
 prepareCheckoutProfile({ownerId:'b',email:'b@example.hu',name:'Béla',addresses:{}});assert.equal(checkoutSelection(member,275000).customer.shipping.address.line1,'');
 prepareCheckoutProfile(null);assert.equal(checkoutSelection(config,275000).customer.email,'');
});
test('checkout follows the authenticated account and resets to guest on logout while retaining the shipping quote',()=>{
 const guest=checkoutSelection({...config,accountAvailable:false},275000);assert.equal(guest.checkoutMode,'guest');assert.equal(guest.quote.feeMinor,99000);
 const member=checkoutSelection({...config,accountAvailable:true},275000);assert.equal(member.checkoutMode,'account');assert.deepEqual(member.quote,guest.quote);
 assert.equal(checkoutSelection({...config,accountAvailable:true},550000).checkoutMode,'account');
 const logout=checkoutSelection({...config,accountAvailable:false},550000);assert.equal(logout.checkoutMode,'guest');assert.equal(logout.methodId,member.methodId);assert.equal(logout.quote.feeMinor,99000);
 const relogin=checkoutSelection({...config,accountAvailable:true},550000);assert.equal(relogin.checkoutMode,'account');
 checkoutSelection({...config,accountAvailable:false},275000);
});
