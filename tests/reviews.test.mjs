import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleReviews,validateReview} from '../server/reviews.mjs';
test('reviews require real purchase, enforce origin, upsert once, escape via frontend and expose no identity',async()=>{
 const sql=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(s){return {bind(...a){return {async first(){return sql.prepare(s).get(...a)||null;},async all(){return {results:sql.prepare(s).all(...a)};},async run(){return sql.prepare(s).run(...a);}};}};},async batch(ops){for(const op of ops)await op.run();}};
 const user={userId:'buyer-secret-id',email:'private@example.com'},payload={rating:1,name:'Buyer',text:'Not my favourite flavour.'};
 const call=(method='GET',u=user,origin='https://shop.test',body=payload)=>handleReviews(new Request('https://shop.test/api/commerce/reviews?product=fries-salt',{method,headers:{origin,'content-type':'application/json'},body:method==='PUT'?JSON.stringify(body):undefined}),{db,user:u});
 assert.equal((await call('PUT',null)).status,401);assert.equal((await call('PUT')).status,403);assert.equal((await call('PUT',user,'https://evil.test')).status,403);
 sql.prepare('INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(user.userId,user.email,'Buyer','','now','now');
 sql.prepare('INSERT INTO customer_orders(id,user_id,request_id,number,kind,status,total_minor,currency,items_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('o',user.userId,'r','N','stripe-test','paid',100,'HUF','[{"id":"fries-salt"}]','now');
 assert.equal((await call('PUT')).status,403);sql.exec("UPDATE customer_orders SET kind='stripe'");
 assert.equal((await call('PUT')).status,200);assert.equal((await call('PUT')).status,200);
 const response=await call('GET',null),data=await response.json();assert.equal(data.count,1);assert.equal(data.average,1);assert.equal(data.counts[0],1);assert.equal(data.reviews[0].text,payload.text);assert.equal(data.mine,null);assert.ok(!JSON.stringify(data).includes(user.userId));assert.ok(!JSON.stringify(data).includes(user.email));
 assert.throws(()=>validateReview({...payload,rating:6}));assert.throws(()=>validateReview({...payload,text:'x'}));
});
