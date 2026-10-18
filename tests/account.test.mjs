import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAccountRequest} from '../server/account.mjs';
import {verifyGoogleIdentity} from '../server/google-identity.mjs';
import {SignJWT,generateKeyPair,exportJWK,createLocalJWKSet} from 'jose';
const origin='https://spice.test';
const alice={userId:'user-alice',email:'alice@example.com',fullName:'Alice'};
const bob={userId:'user-bob',email:'bob@example.com',fullName:'Bob'};
function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const db={prepare(sql){return {bind(...values){return {async run(){return sqlite.prepare(sql).run(...values);},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 return {db,sqlite};
}
function request(path='',method='GET',body,customOrigin=origin){return new Request(origin+'/api/account'+path,{method,headers:{Origin:customOrigin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
async function call(db,user,path='',method='GET',body,bucket){return handleAccountRequest(request(path,method,body),{db,user,bucket});}
async function data(db,user,path=''){const response=await call(db,user,path);assert.equal(response.status,200);return response.json();}

test('authentication is required, missing storage fails closed, and writes reject cross-origin requests',async()=>{
 const {db}=database();
 assert.equal((await call(db,null)).status,401);
 assert.equal((await call(undefined,alice)).status,503);
 const response=await handleAccountRequest(request('/profile','PUT',{fullName:'attack'},'https://attacker.test'),{db,user:alice});
 assert.equal(response.status,403);
 assert.equal((await data(db,alice)).user.fullName,'Alice');
});

test('profiles and addresses are owner-scoped and the browser cannot change account identity',async()=>{
 const {db}=database();
 assert.equal((await call(db,alice,'/profile','PUT',{fullName:'Alice Saved',phone:'+36 123',userId:bob.userId,email:bob.email})).status,200);
 assert.equal((await data(db,alice)).user.email,alice.email);
 assert.equal((await data(db,alice)).user.fullName,'Alice Saved');
 assert.equal((await data(db,bob)).user.fullName,'Bob');
 const address={recipient:'Alice',company:'',taxId:'',country:'HU',line1:'Teszt utca 1',line2:'',city:'Budapest',postalCode:'1234'};
 assert.equal((await call(db,alice,'/addresses','PUT',{shipping:address,billing:address})).status,200);
 assert.equal((await data(db,alice)).addresses.shipping.line1,'Teszt utca 1');
 assert.deepEqual((await data(db,bob)).addresses,{});
 assert.equal((await call(db,alice,'/profile','PUT',{fullName:'x'.repeat(101)})).status,400);
 assert.equal((await call(db,alice,'/addresses','PUT',{shipping:{country:'invalid'},billing:address})).status,400);
});

test('favorites support idempotent add, removal and guest merge without crossing accounts',async()=>{
 const {db}=database();
 await call(db,alice,'/favorites/fries-salt','PUT');await call(db,alice,'/favorites/fries-salt','PUT');
 await call(db,alice,'/favorites/merge','POST',{productIds:['fries-salt','bulls-blaze','unknown']});
 assert.deepEqual(new Set((await data(db,alice)).favorites),new Set(['fries-salt','bulls-blaze']));
 assert.deepEqual((await data(db,bob)).favorites,[]);
 assert.equal((await call(db,bob,'/favorites/fries-salt','DELETE')).status,200);
 assert.equal((await data(db,alice)).favorites.length,2);
 await call(db,alice,'/favorites/fries-salt','DELETE');
 assert.deepEqual((await data(db,alice)).favorites,['bulls-blaze']);
 assert.equal((await call(db,alice,'/favorites/unknown','PUT')).status,404);
});

test('demo orders use server prices, preserve snapshots, remain private and deduplicate submissions',async()=>{
 const {db}=database(),requestId=crypto.randomUUID();
 const body={requestId,items:[{id:'fries-salt',quantity:2,priceMinor:1}],totalMinor:1,userId:bob.userId};
 assert.equal((await call(db,alice,'/demo-orders','POST',body)).status,201);
 assert.equal((await call(db,alice,'/demo-orders','POST',body)).status,200);
 const account=await data(db,alice);assert.equal(account.orders.length,1);assert.equal(account.orders[0].kind,'demo');
 assert.equal(account.orders[0].totalMinor,7800);assert.equal(account.orders[0].items[0].priceMinor,3900);
 assert.deepEqual((await data(db,bob)).orders,[]);
 assert.equal((await call(db,alice,'/demo-orders','POST',{requestId:crypto.randomUUID(),items:[]})).status,400);
 assert.deepEqual(account.invoices,[]);
});

test('invoice PDF access checks owner before reading private file storage',async()=>{
 const {db,sqlite}=database();await call(db,alice,'/profile','PUT',{fullName:'Alice'});await call(db,bob,'/profile','PUT',{fullName:'Bob'});
 sqlite.prepare('INSERT INTO customer_invoices(id,user_id,number,issued_at,total_minor,currency,object_key,created_at) VALUES(?,?,?,?,?,?,?,?)').run('invoice-private',alice.userId,'TEST-1','2026-10-18',3900,'RON','private/alice/test.pdf','2026-10-18');
 let reads=0;const bucket={async get(key){reads++;assert.equal(key,'private/alice/test.pdf');return {body:new TextEncoder().encode('%PDF-test')};}};
 assert.equal((await call(db,bob,'/invoices/invoice-private/download','GET',undefined,bucket)).status,404);assert.equal(reads,0);
 const response=await call(db,alice,'/invoices/invoice-private/download','GET',undefined,bucket);
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(reads,1);
 const account=await data(db,alice);assert.equal(account.invoices[0].objectKey,undefined);
 assert.deepEqual((await data(db,bob)).invoices,[]);
});

test('exports remain private and deletion requests are recorded once without claiming deletion',async()=>{
 const {db}=database();await call(db,alice,'/profile','PUT',{fullName:'Private Alice'});
 assert.equal((await call(db,alice,'/deletion-request','POST',{})).status,200);
 assert.equal((await call(db,alice,'/deletion-request','POST',{})).status,200);
 const account=await data(db,alice);assert.equal(account.requests.length,1);assert.equal(account.requests[0].status,'pending');
 const response=await call(db,alice,'/export');assert.ok(response.headers.get('content-disposition').includes('attachment'));
 const exported=await response.json();assert.equal(exported.user.fullName,'Private Alice');
 assert.notEqual((await data(db,bob)).user.fullName,'Private Alice');
});

test('Google verifier requires configuration, signed valid tokens, correct audience and a matching nonce',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';
 const keySet=createLocalJWKSet({keys:[jwk]});
 const clientId='1234567890-test.apps.googleusercontent.com',nonce='server-bound-test-nonce-123456';
 const sign=(audience=clientId,tokenNonce=nonce,expiry='5m')=>new SignJWT({nonce:tokenNonce,email:'alice@example.com',name:'Alice'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer('https://accounts.google.com').setSubject('google-stable-subject').setAudience(audience).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
 await assert.rejects(verifyGoogleIdentity('anything',{}));
 const verified=await verifyGoogleIdentity(await sign(),{clientId,nonce,keySet});assert.equal(verified.subject,'google-stable-subject');
 await assert.rejects(verifyGoogleIdentity(await sign('wrong-audience'),{clientId,nonce,keySet}));
 await assert.rejects(verifyGoogleIdentity(await sign(clientId,'wrong-nonce'),{clientId,nonce,keySet}));
 await assert.rejects(verifyGoogleIdentity(await sign(clientId,nonce,'-1m'),{clientId,nonce,keySet}));
 await assert.rejects(verifyGoogleIdentity('e30.e30.invalid',{clientId,nonce,keySet}));
});
