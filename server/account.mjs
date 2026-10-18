import { catalogue } from '../public/catalogue.mjs';
import { sanitizeCart, cartTotals } from '../public/shop-core.mjs';
const productIds = new Set(catalogue.products.map(product => product.id));
const headers = { 'Cache-Control':'private, no-store', 'Vary':'Cookie', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin' };
const json = (body, status = 200) => Response.json(body, { status, headers });
class RequestError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new RequestError(status, message); };
const field = (value, max) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400,'Hibás vagy túl hosszú adat.');
  return value.trim();
};
export function validateProfile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400,'Hibás profiladatok.');
  return { fullName:field(body.fullName,100), phone:field(body.phone,40) };
}
export function validateAddress(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400,'Hibás címadatok.');
  const country = field(body.country,2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) fail(400,'Kétbetűs országkód szükséges.');
  return { recipient:field(body.recipient,100), company:field(body.company,160), taxId:field(body.taxId,40), country,
    line1:field(body.line1,160), line2:field(body.line2,160), city:field(body.city,100), postalCode:field(body.postalCode,20) };
}
async function bodyJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) fail(415,'JSON kérés szükséges.');
  if (Number(request.headers.get('content-length') || 0) > 32768) fail(413,'Túl nagy kérés.');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 32768) fail(413,'Túl nagy kérés.');
  try { return JSON.parse(text); } catch { fail(400,'Hibás JSON.'); }
}
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403,'Eltérő eredetű kérés.');
}
const query = (db, sql, ...values) => db.prepare(sql).bind(...values);
const rows = async (db, sql, ...values) => (await query(db,sql,...values).all()).results || [];
async function ensureCustomer(db, user) {
  const now = new Date().toISOString();
  await query(db,'INSERT INTO customers(id,email,full_name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',user.userId,user.email,user.fullName || '', '',now,now).run();
}
function addressDto(row) {
  return { recipient:row.recipient, company:row.company, taxId:row.tax_id, country:row.country, line1:row.line1, line2:row.line2, city:row.city, postalCode:row.postal_code };
}
async function accountData(db,user) {
  const [profile,addressRows,favoriteRows,orderRows,invoiceRows,requests] = await Promise.all([
    query(db,'SELECT full_name,phone,created_at,updated_at FROM customers WHERE id = ?',user.userId).first(),
    rows(db,'SELECT * FROM customer_addresses WHERE user_id = ?',user.userId),
    rows(db,'SELECT product_id FROM customer_favorites WHERE user_id = ? ORDER BY created_at',user.userId),
    rows(db,'SELECT id,number,kind,status,total_minor,currency,items_json,created_at FROM customer_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',user.userId),
    rows(db,'SELECT id,number,issued_at,total_minor,currency,order_id FROM customer_invoices WHERE user_id = ? ORDER BY issued_at DESC LIMIT 100',user.userId),
    rows(db,'SELECT kind,status,created_at FROM customer_account_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',user.userId)
  ]);
  return {
    authenticated:true, authenticationProvider:'sites-preview',
    user:{ fullName:profile?.full_name ?? user.fullName ?? '', email:user.email, phone:profile?.phone ?? '' },
    addresses:Object.fromEntries(addressRows.map(row => [row.kind,addressDto(row)])),
    favorites:favoriteRows.map(row=>row.product_id).filter(id=>productIds.has(id)),
    orders:orderRows.map(row=>({ id:row.id,number:row.number,kind:row.kind,status:row.status,totalMinor:row.total_minor,currency:row.currency,items:JSON.parse(row.items_json),createdAt:row.created_at })),
    invoices:invoiceRows.map(row=>({ id:row.id,number:row.number,issuedAt:row.issued_at,totalMinor:row.total_minor,currency:row.currency,orderId:row.order_id,downloadUrl:`/api/account/invoices/${encodeURIComponent(row.id)}/download` })),
    requests, capabilities:{ googleSignIn:false, liveOrders:false, invoiceIssuing:false },
    signInUrl:'/signin-with-chatgpt?return_to=%2F%23fiok', signOutUrl:'/signout-with-chatgpt?return_to=%2F'
  };
}
export async function handleAccountRequest(request,{db,bucket,user}) {
  try {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/account\/?/,'').split('/').filter(Boolean).map(part=>decodeURIComponent(part));
    if (!user?.userId || !user?.email) return json({ authenticated:false, signInUrl:'/signin-with-chatgpt?return_to=%2F%23fiok', capabilities:{googleSignIn:false}, error:'A művelethez bejelentkezés szükséges.' },401);
    if (!db) return json({error:'A fiók adatbázisa átmenetileg nem elérhető.'},503);
    if (!['GET','HEAD'].includes(request.method)) assertSameOrigin(request);
    if (request.method === 'GET' && !route.length) return json(await accountData(db,user));
    if (request.method === 'PUT' && route[0] === 'profile' && route.length === 1) {
      const body=validateProfile(await bodyJson(request));await ensureCustomer(db,user);
      await query(db,'UPDATE customers SET full_name = ?,phone = ?,email = ?,updated_at = ? WHERE id = ?',body.fullName,body.phone,user.email,new Date().toISOString(),user.userId).run();
      return json({saved:true});
    }
    if (request.method === 'PUT' && route[0] === 'addresses' && route.length === 1) {
      const body=await bodyJson(request);
      const shipping=validateAddress(body?.shipping),billing=validateAddress(body?.billing);await ensureCustomer(db,user);
      const now=new Date().toISOString();
      await db.batch([['shipping',shipping],['billing',billing]].map(([kind,address])=>query(db,
        'INSERT INTO customer_addresses(id,user_id,kind,recipient,company,tax_id,country,line1,line2,city,postal_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET recipient=excluded.recipient,company=excluded.company,tax_id=excluded.tax_id,country=excluded.country,line1=excluded.line1,line2=excluded.line2,city=excluded.city,postal_code=excluded.postal_code,updated_at=excluded.updated_at',
        crypto.randomUUID(),user.userId,kind,address.recipient,address.company,address.taxId,address.country,address.line1,address.line2,address.city,address.postalCode,now)));
      return json({saved:true});
    }
    if (route[0] === 'favorites') {
      if (route.length === 2 && ['PUT','DELETE'].includes(request.method)) {
        if(!productIds.has(route[1])) fail(404,'Ismeretlen termék.');
        if(request.method === 'PUT') {await ensureCustomer(db,user);await query(db,'INSERT INTO customer_favorites(user_id,product_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id,product_id) DO NOTHING',user.userId,route[1],new Date().toISOString()).run();}
        else await query(db,'DELETE FROM customer_favorites WHERE user_id = ? AND product_id = ?',user.userId,route[1]).run();
        return json({saved:true});
      }
      if(route.length===2 && route[1]==='merge' && request.method==='POST') {
        const body=await bodyJson(request);if(!Array.isArray(body?.productIds)||body.productIds.length>100)fail(400,'Hibás kedvenclista.');
        const ids=[...new Set(body.productIds.filter(id=>productIds.has(id)))];await ensureCustomer(db,user);
        if(ids.length)await db.batch(ids.map(id=>query(db,'INSERT INTO customer_favorites(user_id,product_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id,product_id) DO NOTHING',user.userId,id,new Date().toISOString())));
        return json({saved:true});
      }
    }
    if (request.method==='POST' && route.length===1 && route[0]==='demo-orders') {
      const body=await bodyJson(request);
      if(!/^[0-9a-f-]{36}$/i.test(body?.requestId||''))fail(400,'Hibás kérésazonosító.');
      if(!Array.isArray(body.items)||body.items.length>100)fail(400,'Hibás kosár.');
      const safe=sanitizeCart(body.items,catalogue.products);const total=cartTotals(safe,catalogue.products);
      if(!total.count||safe.length!==body.items.length)fail(400,'Üres vagy hibás kosár.');
      await ensureCustomer(db,user);
      const previous=await query(db,'SELECT id,number FROM customer_orders WHERE user_id = ? AND request_id = ?',user.userId,body.requestId).first();
      if(previous)return json({saved:true,...previous});
      const id=crypto.randomUUID(),number=`DEMO-${id.slice(0,8).toUpperCase()}`;
      const items=total.lines.map(line=>({productId:line.id,name:line.product.name,quantity:line.quantity,priceMinor:line.product.priceMinor,subtotalMinor:line.subtotalMinor}));
      await query(db,'INSERT INTO customer_orders(id,user_id,request_id,number,kind,status,total_minor,currency,items_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,request_id) DO NOTHING',id,user.userId,body.requestId,number,'demo','demo-completed',total.totalMinor,'RON',JSON.stringify(items),new Date().toISOString()).run();
      const saved=await query(db,'SELECT id,number FROM customer_orders WHERE user_id = ? AND request_id = ?',user.userId,body.requestId).first();
      return json({saved:true,...saved},201);
    }
    if(request.method==='GET' && route[0]==='invoices' && route.length===3 && route[2]==='download') {
      const invoice=await query(db,'SELECT object_key,number FROM customer_invoices WHERE id = ? AND user_id = ?',route[1],user.userId).first();
      if(!invoice)fail(404,'A számla nem található.');
      if(!bucket)fail(503,'A számlatár nem elérhető.');
      const object=await bucket.get(invoice.object_key);if(!object)fail(404,'A számlafájl nem található.');
      const filename=String(invoice.number).replace(/[^a-zA-Z0-9_-]/g,'_');
      return new Response(object.body,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="szamla-${filename}.pdf"`}});
    }
    if(request.method==='GET' && route.length===1 && route[0]==='export') {
      const data=await accountData(db,user);
      return new Response(JSON.stringify({exportedAt:new Date().toISOString(),...data},null,2),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="spice-laboratory-fiok.json"'}});
    }
    if(request.method==='POST' && route.length===1 && route[0]==='deletion-request') {
      await bodyJson(request);await ensureCustomer(db,user);
      const previous=await query(db,"SELECT id FROM customer_account_requests WHERE user_id = ? AND kind = 'deletion' AND status = 'pending'",user.userId).first();
      if(!previous)await query(db,'INSERT INTO customer_account_requests(id,user_id,kind,status,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),user.userId,'deletion','pending',new Date().toISOString()).run();
      return json({requested:true});
    }
    return json({error:'Nem található művelet.'},404);
  } catch(error) {
    if(error instanceof RequestError)return json({error:error.message},error.status);
    if(error instanceof URIError)return json({error:'Hibás útvonal.'},400);
    return json({error:'A fiókművelet most nem hajtható végre. Próbáld újra később.'},500);
  }
}
