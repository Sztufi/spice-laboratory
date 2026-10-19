import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutSelection} from '../public/checkout.mjs';
const config={shippingMethods:[{id:'hu-home',country:'HU',label:'Futár',feeMinor:99000,deliveryMinDays:2,deliveryMaxDays:4}]};
test('checkout follows the authenticated account and resets to guest on logout while retaining the shipping quote',()=>{
 const guest=checkoutSelection({...config,accountAvailable:false},275000);assert.equal(guest.checkoutMode,'guest');assert.equal(guest.quote.feeMinor,99000);
 const member=checkoutSelection({...config,accountAvailable:true},275000);assert.equal(member.checkoutMode,'account');assert.deepEqual(member.quote,guest.quote);
 assert.equal(checkoutSelection({...config,accountAvailable:true},550000).checkoutMode,'account');
 const logout=checkoutSelection({...config,accountAvailable:false},550000);assert.equal(logout.checkoutMode,'guest');assert.equal(logout.methodId,member.methodId);assert.equal(logout.quote.feeMinor,99000);
 const relogin=checkoutSelection({...config,accountAvailable:true},550000);assert.equal(relogin.checkoutMode,'account');
 checkoutSelection({...config,accountAvailable:false},275000);
});
