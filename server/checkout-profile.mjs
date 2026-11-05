import {fail} from './store.mjs';
const now=()=>new Date().toISOString();
function checkoutText(value,label,max,{email=false,phone=false}={}){
 const text=typeof value==='string'?value.trim():'';
 if(!text||text.length>max)fail(400,`Érvényes ${label} szükséges.`);
 if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text))fail(400,'Érvényes e-mail-cím szükséges.');
 if(phone&&!/^\+?[0-9 ()-]{6,40}$/.test(text))fail(400,'Érvényes telefonszám szükséges.');
 return text;
}
function checkoutAddress(input,countries,label){
 const value=input&&typeof input==='object'?input:{},country=String(value.country||'').toUpperCase();
 if(!countries.has(country))fail(400,`A ${label} országa nem támogatott.`);
 return {country,postal_code:checkoutText(value.postalCode,`${label} irányítószám`,20),city:checkoutText(value.city,`${label} település`,100),line1:checkoutText(value.line1,`${label} utca és házszám`,160),line2:typeof value.line2==='string'?value.line2.trim().slice(0,160):''};
}
export function checkoutCustomer(input,countries){
 const raw=input?.customer;if(!raw||typeof raw!=='object')fail(400,'Add meg a rendelési adatokat.');
 if(raw.termsAccepted!==true||raw.privacyAccepted!==true)fail(400,'Az ÁSZF és az adatkezelési tájékoztató elfogadása szükséges.');
 const email=checkoutText(raw.email,'e-mail-cím',254,{email:true}),shippingRaw=raw.shipping||{},shipping={name:checkoutText(shippingRaw.name,'szállítási név',120),phone:checkoutText(shippingRaw.phone,'telefonszám',40,{phone:true}),address:checkoutAddress(shippingRaw.address,countries,'szállítási cím')};
 const same=raw.billingSame!==false,billing=same?{name:shipping.name,email,address:{...shipping.address}}:{name:checkoutText(raw.billing?.name,'számlázási név',120),email,address:checkoutAddress(raw.billing?.address,countries,'számlázási cím')};
 return {billing,shipping,consent:{termsAccepted:true,privacyAccepted:true,version:'checkout-v1',acceptedAt:now()}};
}

export async function profileDefaults(db,user){
 if(!db||!user?.userId||!user?.email||user.userId.startsWith('guest:'))return null;
 const [p,rows]=await Promise.all([db.prepare('SELECT full_name,phone FROM customers WHERE id=?').bind(user.userId).first(),db.prepare('SELECT kind,recipient,country,postal_code,city,line1,line2 FROM customer_addresses WHERE user_id=?').bind(user.userId).all()]);
 return {ownerId:user.userId,email:user.email,name:p?.full_name||user.fullName||'',phone:p?.phone||'',addresses:Object.fromEntries(rows.results.map(r=>[r.kind,{name:r.recipient,country:r.country,postalCode:r.postal_code,city:r.city,line1:r.line1,line2:r.line2}]))};
}
// Fill only missing profile fields. A different recipient on a particular
// order must never overwrite existing saved data, company or tax details.
export function missingProfileWrites(db,user,data){
 if(!user?.userId||user.userId.startsWith('guest:'))return [];
 const stamp=now(),q=(sql,...args)=>db.prepare(sql).bind(...args);
 const out=[q("UPDATE customers SET full_name=COALESCE(NULLIF(full_name,''),?),phone=COALESCE(NULLIF(phone,''),?),updated_at=? WHERE id=? AND (full_name='' OR phone='')",data.shipping.name,data.shipping.phone,stamp,user.userId)];
 for(const kind of ['shipping','billing']){
  const {name,address:a}=data[kind];
  const cols=['recipient','line1','line2','city','postal_code'];
  const merge=cols.map(c=>c+"=COALESCE(NULLIF(customer_addresses."+c+",''),excluded."+c+")").join(',');
  out.push(q('INSERT INTO customer_addresses(id,user_id,kind,recipient,company,tax_id,country,line1,line2,city,postal_code,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET '+merge+",country=CASE WHEN customer_addresses.line1='' AND customer_addresses.city='' AND customer_addresses.postal_code='' THEN excluded.country ELSE customer_addresses.country END,updated_at=excluded.updated_at WHERE customer_addresses.country=excluded.country OR (customer_addresses.line1='' AND customer_addresses.city='' AND customer_addresses.postal_code='')",crypto.randomUUID(),user.userId,kind,name,'','',a.country,a.line1,a.line2,a.city,a.postal_code,stamp));
 }
 return out;
}
