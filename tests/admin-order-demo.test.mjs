import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoOrder,createPackingDemoApi,demoOrderCard,demoOrderDetail} from '../public/admin-order-demo.mjs';
test('demo order is explicitly fictional, isolated from real API routes and requires complete packing',async()=>{
 const api=createPackingDemoApi(),path='/packing/'+demoOrder.id;
 const list=await api('/packing?page=1');assert.equal(list.orders[0].number,'SL-DEMO-001');
 await assert.rejects(api(path+'/label','POST',{}),/Előbb/);
 await assert.rejects(api('/packing/real-order','GET'),/Éles API-kérés nem indult/);
 await assert.rejects(api('/orders/real-order','PUT',{}),/Éles API-kérés nem indult/);
 await assert.rejects(api(path,'PUT',{revision:'demo-0',counts:[9,1],weightGrams:850}),/darabszám/);
 await api(path,'PUT',{revision:'demo-0',counts:[2,1],weightGrams:850});
 const label=await api(path+'/label','POST',{});assert.equal(label.parcelNumber,'DEMO-NEM-FELADHATO');assert.equal(label.labelUrl,'/demo/awb-a6.pdf');
 assert.equal((await api(path+'/label','POST',{})).created,false);
 const other=createPackingDemoApi();assert.equal((await other(path)).packing.counts[0],0);
 assert.match(demoOrderCard(),/NEM VALÓDI RENDELÉS/);assert.match(demoOrderDetail(),/nem GLS által kibocsátott/);
 assert.ok(!demoOrderDetail().includes('id="order-form"'));assert.ok(!demoOrderDetail().includes('data-gls-label'));
});
test('demo PDF exists, is a single A6 page and is never served as a live shipment',()=>{
 const pdf=readFileSync(new URL('../public/demo/awb-a6.pdf',import.meta.url));assert.equal(pdf.subarray(0,4).toString(),'%PDF');
 const source=readFileSync(new URL('../public/admin-order-demo.mjs',import.meta.url),'utf8');assert.ok(!source.includes('fetch('));
 const packing=readFileSync(new URL('../public/admin-packing.mjs',import.meta.url),'utf8');assert.match(packing,/if\(demo\)api=createPackingDemoApi\(\)/);
});
