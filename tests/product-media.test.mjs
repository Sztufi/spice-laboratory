import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAdminRequest} from '../server/admin.mjs';
import {loadStore} from '../server/store.mjs';
import {productMedia} from '../server/product-media.mjs';
import {productExperience} from '../server/product-experience.mjs';
import {productCard} from '../public/product-markup.mjs';
const owner={userId:'owner',email:'owner@example.com'},env={ADMIN_EMAILS:owner.email};
function database(){const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));return {sqlite,db:{prepare(sql){return {bind(...args){return {async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};}};}}};}
const images=[{id:'front',url:'/assets/front.webp',alt:'Elölnézet „üveg”',title:'Elöl',caption:'210 g-os üveg'},{id:'detail',url:'/assets/detail.webp',alt:'Részlet & textúra',title:'Részlet',caption:'<script>alert(1)</script>'},{id:'back',url:'/assets/back.webp',alt:'Hátoldali összetevők'}];
const product={id:'gallery-product',sku:'GALLERY-01',name:'Galériás fűszer',priceMinor:275000,weightGrams:210,categories:['bbq'],ingredientIds:['garlic'],status:'published',images,featuredImageId:'detail',thumbnailImageId:'back'};
const request=(path,method='GET',body,origin='https://spice.test')=>new Request('https://spice.test/api/admin'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
test('gallery saves ordered images and independent main/thumbnail roles; alt/captions escape in catalogue and product page',async()=>{
 const {db}=database(),call=(path,method,body)=>handleAdminRequest(request(path,method,body),{db,user:owner,env});
 assert.equal((await call('/products','POST',product)).status,201);
 let p=(await loadStore(db,{admin:true})).catalogue.products.find(p=>p.id===product.id);
 assert.deepEqual(p.images.map(i=>i.id),['front','detail','back']);assert.equal(p.image,'/assets/detail.webp');assert.equal(p.thumbnailImage,'/assets/back.webp');
 const html=productExperience(p,{label:'BBQ'},{stripeEnabled:false,shippingMethods:[]});
 assert.match(html,/data-product-gallery/);assert.match(html,/data-gallery-index="2"/);assert.ok(html.includes('Részlet &amp; textúra'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert(1)'));
 assert.match(productCard({...p,ingredients:[]}),/src="\/assets\/back.webp"/);assert.match(productCard({...p,ingredients:[]}),/alt="Hátoldali összetevők"/);
 const updated={...p,images:[p.images[2],p.images[0]],featuredImageId:'front',thumbnailImageId:'back'};
 assert.equal((await call('/products/'+p.id,'PUT',updated)).status,200);assert.equal((await call('/products/'+p.id,'PUT',updated)).status,409);
 p=(await loadStore(db)).catalogue.products.find(p=>p.id===product.id);assert.deepEqual(p.images.map(i=>i.id),['back','front']);assert.equal(p.image,'/assets/front.webp');
});
test('gallery rejects duplicate, overlong, missing, malformed and unsafe image references without changing the product',async()=>{
 for(const input of [{images:[]},{images:[...images,images[0]]},{images:Array.from({length:13},(_,i)=>({...images[0],id:'i'+i,url:'/assets/'+i+'.webp'}))},{images:[{id:'bad',url:'javascript:alert(1)'}]},{images:[{id:'bad',url:'/assets/../secret'}]},{images:[{...images[0],alt:'x'.repeat(301)}]},{featuredImageId:'absent'},{thumbnailImageId:'absent'}])assert.throws(()=>productMedia({...product,...input}),e=>e.status===400);
 const fallback=productMedia({name:'Régi termék',image:'/assets/legacy.webp'});assert.equal(fallback.images.length,1);assert.equal(fallback.imageAlt,'Régi termék');
});
test('library metadata is revisioned, private and owner-only; used assets cannot be hidden and gallery removal does not delete files',async()=>{
 const {db,sqlite}=database();const asset={id:'asset-one',url:'/assets/front.webp',name:'front.webp',alt:'Régi',width:500,height:500};
 sqlite.prepare("INSERT INTO store_records VALUES('media',?,?,'published','asset-v1',?,?)").run(asset.id,JSON.stringify(asset),new Date().toISOString(),new Date().toISOString());
 const call=(path,method,body,user=owner,origin)=>handleAdminRequest(request(path,method,body,origin),{db,user,env});
 assert.equal((await call('/media/asset-one','PUT',{alt:'New',revision:'asset-v1'},null)).status,401);assert.equal((await call('/media/asset-one','PUT',{alt:'New',revision:'asset-v1'},owner,'https://evil.test')).status,403);
 assert.equal((await call('/media/asset-one','PUT',{alt:'Új alt',title:'Cím',caption:'Felirat',revision:'asset-v1'})).status,200);
 assert.equal((await call('/media/asset-one','PUT',{alt:'Stale',revision:'asset-v1'})).status,409);
 assert.equal((await call('/products','POST',product)).status,201);
 let row=sqlite.prepare("SELECT revision,payload_json FROM store_records WHERE kind='media' AND id='asset-one'").get();assert.equal(JSON.parse(row.payload_json).alt,'Új alt');
 assert.equal((await call('/media/asset-one','DELETE',{revision:row.revision})).status,409);
 const p=(await loadStore(db,{admin:true})).catalogue.products.find(p=>p.id===product.id);await call('/products/'+p.id,'PUT',{...p,images:p.images.filter(i=>i.id!=='front')});
 assert.equal((await call('/media/asset-one','DELETE',{revision:row.revision})).status,200);
 row=sqlite.prepare("SELECT status FROM store_records WHERE kind='media' AND id='asset-one'").get();assert.equal(row.status,'archived');
});
