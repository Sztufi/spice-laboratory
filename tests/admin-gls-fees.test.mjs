import test from 'node:test';
import assert from 'node:assert/strict';
import {withGlsFees} from '../public/admin-gls-fees.mjs';
const methods=[{id:'hu-home',country:'HU',feeMinor:230000,freeAboveMinor:1000000},{id:'hu-locker',country:'HU',deliveryType:'gls-locker',feeMinor:140000,deliveryMinDays:2,deliveryMaxDays:2},{id:'ro-home',country:'RO',feeMinor:350000}];
const values=(home,locker)=>new Map([['hu-home',home],['hu-locker',locker]]);
test('GLS editor changes just the two HU fees, preserving locker type, thresholds, times and unrelated methods',()=>{
 assert.deepEqual(withGlsFees(methods,values('2500','0')),[{...methods[0],feeMinor:250000},{...methods[1],feeMinor:0},methods[2]]);
 assert.equal(methods[0].feeMinor,230000);
});
test('GLS editor rejects invalid fees and missing methods',()=>{
 for(const bad of ['','1.5','-1','100001','abc'])assert.throws(()=>withGlsFees(methods,values('100',bad)));
 assert.throws(()=>withGlsFees(methods.slice(1),values('100','100')));
});
