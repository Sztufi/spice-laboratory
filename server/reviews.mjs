import {assertSameOrigin} from './account.mjs';
import {loadStore} from './store.mjs';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
export function validateReview(v){if(!Number.isInteger(v?.rating)||v.rating<1||v.rating>5||typeof v.text!=='string'||v.text.trim().length<5||v.text.length>2000||typeof v.name!=='string'||!v.name.trim()||v.name.length>50||/[\u0000-\u001f]/.test(v.name))throw Error('Adj meg 1–5 csillagot, nevet (max. 50 karakter) és 5–2000 karakteres véleményt.');return {rating:v.rating,text:v.text.trim(),name:v.name.trim()};}
export async function handleReviews(request,{db,user}){try{
 const url=new URL(request.url),product=url.searchParams.get('product');const {catalogue}=await loadStore(db);if(!catalogue.products.some(p=>p.id===product))return json({error:'Nincs ilyen termék.'},404);
 const buyer=user?.userId?await q(db,"SELECT id FROM customer_orders WHERE user_id=? AND kind='stripe' AND status='paid' AND EXISTS(SELECT 1 FROM json_each(items_json) j WHERE json_extract(j.value,'$.id')=?) LIMIT 1",user.userId,product).first():null;
 const id=user?.userId?product+':'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.userId))),b=>b.toString(16).padStart(2,'0')).join(''):null;
 if(request.method==='PUT'){
 if(!user?.userId)return json({error:'Jelentkezz be.'},401);assertSameOrigin(request);if(!buyer)return json({error:'Csak a fiókodhoz tartozó, kifizetett éles rendelés termékét értékelheted.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON szükséges.'},415);
 const reader=request.body.getReader(),decoder=new TextDecoder();let raw='',size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();return json({error:'Túl hosszú kérés.'},413);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
 let data;try{data=validateReview(JSON.parse(raw));}catch(e){return json({error:e.message},400);}
 const stamp=new Date().toISOString();await q(db,"INSERT INTO store_records(kind,id,payload_json,status,revision,created_at,updated_at) VALUES('review',?,?,'published',?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload_json=excluded.payload_json,revision=excluded.revision,updated_at=excluded.updated_at",id,JSON.stringify({...data,product}),crypto.randomUUID(),stamp,stamp).run();return json({saved:true});}
 if(request.method!=='GET')return json({error:'Nem támogatott művelet.'},405);
 const stats=await q(db,"SELECT json_extract(payload_json,'$.rating') rating,COUNT(*) count FROM store_records WHERE kind='review' AND status='published' AND json_extract(payload_json,'$.product')=? GROUP BY rating",product).all();const counts=[0,0,0,0,0];for(const r of stats.results)counts[r.rating-1]=r.count;const count=counts.reduce((a,b)=>a+b,0);
 const rating=Number(url.searchParams.get('rating'))||0,offset=Math.min(10000,Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0))),sort=url.searchParams.get('sort');const order=sort==='lowest'?"json_extract(payload_json,'$.rating') ASC,updated_at DESC":sort==='highest'?"json_extract(payload_json,'$.rating') DESC,updated_at DESC":'updated_at DESC';
 const rows=await q(db,`SELECT payload_json,updated_at FROM store_records WHERE kind='review' AND status='published' AND json_extract(payload_json,'$.product')=? AND (?=0 OR json_extract(payload_json,'$.rating')=?) ORDER BY ${order},id LIMIT 11 OFFSET ?`,product,rating,rating,offset).all();
 const mine=id?await q(db,"SELECT payload_json FROM store_records WHERE kind='review' AND id=?",id).first():null;
 return json({count,average:count?counts.reduce((n,c,i)=>n+c*(i+1),0)/count:null,counts,eligible:!!buyer,authenticated:!!user?.userId,mine:mine?JSON.parse(mine.payload_json):null,hasMore:rows.results.length>10,reviews:rows.results.slice(0,10).map(r=>({...JSON.parse(r.payload_json),date:r.updated_at}))});
 }catch(e){return json({error:e.status===403?'Eltérő eredetű kérés.':'Az értékelések átmenetileg nem érhetők el.'},e.status===403?403:500);}}
