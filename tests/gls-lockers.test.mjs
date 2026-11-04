import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveGlsLocker} from '../server/gls-lockers.mjs';
import {createGlsLabel} from '../server/gls.mjs';

test('locker validation fails closed for provider failures and wrong country',async()=>{
 await assert.rejects(resolveGlsLocker('id','RO',()=>{throw Error();}),/magyarországi/);
 await assert.rejects(resolveGlsLocker('id','HU',async()=>Response.json({}, {status:503})),/ellenőrzése/);
});
test('GLS label sends PSD id, locker address, recipient contacts and separate backup address',async()=>{
 const point={id:'HU-LOCKER-1',type:'parcel-locker',name:'Automata',country:'HU',postalCode:'1111',city:'Budapest',address:'Teszt út 2'};
 const customer={billing:{email:'buyer@example.com'},shipping:{name:'Vásárló',phone:'+36301234567',address:{line1:'Saját utca 1',postal_code:'1112',city:'Budapest',country:'HU'},pickupPoint:point}};
 const db={prepare(sql){return {bind(){return {async first(){if(sql.includes('store_records'))return {payload_json:JSON.stringify({enabled:true,senderPostalCode:'410000',senderContactPhone:'+40700000000'})};if(sql.includes('SELECT o.*'))return {id:'order',number:'SL-1',status:'paid',kind:'stripe',customer_json:JSON.stringify(customer)};if(sql.includes('RETURNING'))return {order_id:'order'};return null;},async run(){return {};}};}};}};
 let sent;await createGlsLabel({db,env:{GLS_ENABLED:'true',GLS_USERNAME:'test',GLS_PASSWORD:'test',GLS_CLIENT_NUMBER:'1'},bucket:{async put(){}},orderId:'order',fetcher:async(url,options)=>{sent=JSON.parse(options.body);return Response.json({PrintLabelsInfoList:[{ParcelNumber:123}],Labels:[37,80,68,70]});}});
 const p=sent.ParcelList[0];assert.deepEqual(p.ServiceList,[{Code:'PSD',PSDParameter:{StringValue:point.id}}]);
 assert.equal(p.DeliveryAddress.Street,point.address);assert.equal(p.DeliveryAddress.ContactEmail,'buyer@example.com');assert.equal(p.DeliveryAddress.ContactName,'Vásárló');assert.equal(p.FinalDeliveryAddress.Street,'Saját utca');assert.equal(p.DeliveryAddress.Contact,undefined);
});
