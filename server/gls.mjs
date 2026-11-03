import {query,all,fail,text} from './store.mjs';

const now=()=>new Date().toISOString();
const defaults={enabled:false,country:'HU',senderName:'Spice Laboratory SRL',senderCountry:'RO',senderCity:'Saldabagiu de Munte',senderStreet:'Petofi Sandor',senderHouseNumber:'325',senderPostalCode:'',senderContactName:'Gergo Sztuchlak',senderContactPhone:'',senderContactEmail:'hello@spicelaboratory.ro',boxWeightGrams:10,boxLengthCm:15,boxWidthCm:15,boxHeightCm:15,maxJarsPerBox:12,printerType:'A4_4x1',codEnabled:true};
const countries=new Set(['HU','RO']);
const printers=new Set(['A4_4x1','A4_2x2','Thermo','Thermo_4x6']);

export function validateGlsSettings(input={}){
 if(['username','password','clientNumber','apiKey','token'].some(key=>key in input))fail(400,'A GLS belépési adatai kizárólag titkos szerverbeállításban tárolhatók.');
 const country=String(input.country||'').toUpperCase(),senderCountry=String(input.senderCountry||'').toUpperCase();
 if(!countries.has(country)||!countries.has(senderCountry))fail(400,'A GLS API országa és a feladó országa csak HU vagy RO lehet.');
 const senderHouseNumber=text(input.senderHouseNumber,20,true);if(!/^\d+$/.test(senderHouseNumber))fail(400,'A GLS feladói házszám csak szám lehet.');
 const senderPostalCode=text(input.senderPostalCode,16,true);if(!/^[A-Za-z0-9 -]{3,16}$/.test(senderPostalCode))fail(400,'Érvényes feladói irányítószám szükséges.');
 const senderContactPhone=text(input.senderContactPhone,40,true);if(!/^\+?[0-9 ()-]{6,40}$/.test(senderContactPhone))fail(400,'Érvényes feladói telefonszám szükséges.');
 const senderContactEmail=text(input.senderContactEmail,254,true);if(!/^\S+@[^\s@]+\.[^\s@]+$/.test(senderContactEmail))fail(400,'Érvényes feladói e-mail-cím szükséges.');
 const printerType=text(input.printerType,30,true);if(!printers.has(printerType))fail(400,'Nem támogatott címkenyomtató-típus.');
 const number=(value,min,max)=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)fail(400,'Hibás GLS csomagérték.');return n;};
 return {id:'gls',enabled:input.enabled===true,country,senderName:text(input.senderName,100,true),senderCountry,senderCity:text(input.senderCity,80,true),senderStreet:text(input.senderStreet,120,true),senderHouseNumber,senderPostalCode,senderContactName:text(input.senderContactName,100,true),senderContactPhone,senderContactEmail,boxWeightGrams:number(input.boxWeightGrams,1,30000),boxLengthCm:number(input.boxLengthCm,1,200),boxWidthCm:number(input.boxWidthCm,1,200),boxHeightCm:number(input.boxHeightCm,1,200),maxJarsPerBox:number(input.maxJarsPerBox,1,100),printerType,codEnabled:input.codEnabled===true};
}
export async function glsConfig(db,env={}){
 const row=await query(db,"SELECT payload_json,revision FROM store_records WHERE kind='setting' AND id='gls' AND status='published'").first();
 const setting={...defaults,...(row?JSON.parse(row.payload_json):{})};
 const credentialsReady=env.GLS_ENABLED==='true'&&!!env.GLS_USERNAME&&!!env.GLS_CLIENT_NUMBER&&!!env.GLS_PASSWORD;
 return {...setting,revision:row?.revision||'new',credentialsReady,ready:setting.enabled&&credentialsReady};
}
export async function glsStatus(db,env){const config=await glsConfig(db,env);return {...config,username:undefined,clientNumber:undefined,password:undefined};}
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
export async function ensureTrackingLink(db,orderId){let row=await query(db,'SELECT tracking_token FROM order_tracking_links WHERE order_id=?',orderId).first();if(row)return row.tracking_token;const value=token();await query(db,'INSERT INTO order_tracking_links(order_id,tracking_token,created_at) VALUES(?,?,?) ON CONFLICT(order_id) DO NOTHING',orderId,value,now()).run();row=await query(db,'SELECT tracking_token FROM order_tracking_links WHERE order_id=?',orderId).first();if(!row)fail(503,'A követési link most nem hozható létre.');return row.tracking_token;}
export async function ensureTrackingLinks(db,orders=[]){for(const order of orders.filter(order=>order.status==='paid'||order.kind==='cod'))order.trackingToken=await ensureTrackingLink(db,order.id);return orders;}
function endpoint(country,method){return `https://api.mygls.${country.toLowerCase()}/ParcelService.svc/json/${method}`;}
async function passwordBytes(password){return [...new Uint8Array(await crypto.subtle.digest('SHA-512',new TextEncoder().encode(password)))];}
function splitAddress(line){
 const value=String(line||'').trim().replace(/\s+/g,' '),match=value.match(/^(.*?)[,\s]+(\d+)(?:\s*([A-Za-z][A-Za-z0-9/-]*))?$/);
 if(!match||!match[1])fail(400,'A címzett utcájából nem állapítható meg biztosan a házszám. A GLS-címkéhez a rendelésnél külön utca és házszám szükséges.');
 return {street:match[1].trim(),houseNumber:match[2],houseNumberInfo:match[3]||''};
}
function contact(name,phone,email){if(!name||!phone||!email)fail(400,'A GLS-címkéhez címzettnév, telefonszám és e-mail-cím szükséges.');return {Name:name,Phone:phone,Email:email};}
function address(value,recipient,phone,email){
 const a=value?.address||value||{},parts=splitAddress(a.line1);
 if(!a.city||!a.postal_code||!a.country)fail(400,'A GLS-címkéhez teljes kézbesítési cím szükséges.');
 return {Name:recipient,Street:parts.street,HouseNumber:parts.houseNumber,HouseNumberInfo:parts.houseNumberInfo,City:String(a.city),ZipCode:String(a.postal_code),CountryIsoCode:String(a.country).toUpperCase(),Contact:contact(recipient,phone,email)};
}
function bytes(labels){
 if(Array.isArray(labels)&&labels.every(value=>Number.isInteger(value)&&value>=0&&value<256))return new Uint8Array(labels);
 if(typeof labels==='string'){const raw=atob(labels),output=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)output[i]=raw.charCodeAt(i);return output;}
 fail(502,'A GLS-címke formátuma nem értelmezhető.');
}
function providerError(data){
 const error=data?.ErrorList?.[0]||data?.Error||data?.error;
 if(error)fail(502,'A GLS elutasította a címkeigényt. Ellenőrizd a címzettet, a szerződéses adatokat és az utánvét beállítását.');
}
export async function createGlsLabel({db,env,bucket,fetcher=fetch,orderId}){
 if(!bucket)fail(503,'A címketároló nem érhető el.');
 const config=await glsConfig(db,env);if(!config.ready)fail(503,'A GLS nincs aktiválva. Ellenőrizd az admin beállítást és a titkos GLS-környezetváltozókat.');
 const order=await query(db,`SELECT o.*,c.email,c.full_name,c.phone,p.customer_json FROM customer_orders o LEFT JOIN customers c ON c.id=o.user_id LEFT JOIN payment_checkouts p ON p.id=o.id WHERE o.id=?`,orderId).first();
 if(!order)fail(404,'A rendelés nem található.');
 if(order.status!=='paid'&&order.kind!=='cod')fail(409,'GLS-címke csak fizetett vagy utánvétes rendeléshez hozható létre.');
 const prior=await query(db,'SELECT parcel_number,label_key,status FROM gls_shipments WHERE order_id=?',orderId).first();
 if(prior?.status==='ready')return {created:false,parcelNumber:prior.parcel_number,labelUrl:`/api/admin/orders/${encodeURIComponent(orderId)}/gls-label`};
 if(prior)fail(409,'Ehhez a rendeléshez GLS-címke létrehozása már folyamatban van.');
 const claimed=await query(db,"INSERT INTO gls_shipments(order_id,parcel_number,label_key,status,created_at,updated_at) VALUES(?,?,?,'creating',?,?) ON CONFLICT(order_id) DO NOTHING RETURNING order_id",orderId,'','',now(),now()).first();
 if(!claimed)fail(409,'Ehhez a rendeléshez GLS-címke létrehozása már folyamatban van.');
 try{
  const customer=order.customer_json?JSON.parse(order.customer_json):{};
  const shipping=customer.shipping||customer.collected_information?.shipping_details||customer.billing;
  const billing=customer.billing||{};
  const recipient=shipping?.name||billing?.name||order.full_name;
  const phone=shipping?.phone||billing?.phone||order.phone;
  const email=billing?.email||order.email;
  const pickup={Name:config.senderName,Street:config.senderStreet,HouseNumber:config.senderHouseNumber,City:config.senderCity,ZipCode:config.senderPostalCode,CountryIsoCode:config.senderCountry,Contact:contact(config.senderContactName,config.senderContactPhone,config.senderContactEmail)};
  const parcel={ClientNumber:Number(env.GLS_CLIENT_NUMBER),ClientReference:order.number,PickupAddress:pickup,DeliveryAddress:address(shipping,recipient,phone,email),Content:'Fűszerek',Weight:config.boxWeightGrams/1000};
  if(order.kind==='cod'){if(!config.codEnabled)fail(409,'Az utánvét a GLS-beállításokban nincs engedélyezve.');Object.assign(parcel,{CODAmount:Math.round(order.total_minor/100),CODCurrency:'HUF',CODReference:order.number});}
  const payload={Username:env.GLS_USERNAME,Password:await passwordBytes(env.GLS_PASSWORD),ParcelList:[parcel],WebshopEngine:'Spice Laboratory',PrintPosition:1,ShowPrintDialog:false,TypeOfPrinter:config.printerType};
  let response;try{response=await fetcher(endpoint(config.country,'PrintLabels'),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});}catch{fail(502,'A GLS nem válaszolt. Próbáld újra később.');}
  if(!response.ok)fail(502,response.status===401||response.status===403?'A GLS elutasította a belépési adatokat.':'A GLS címkeigény sikertelen. Próbáld újra később.');
  let result;try{result=await response.json();}catch{fail(502,'A GLS válasza nem feldolgozható.');}providerError(result);
  const info=result?.PrintLabelsInfoList?.[0];if(!info?.ParcelNumber||!result?.Labels)fail(502,'A GLS nem adott vissza csomagszámot vagy címkét.');
  const key=`gls-labels/${orderId}/${String(info.ParcelNumber)}.pdf`;await bucket.put(key,bytes(result.Labels),{httpMetadata:{contentType:'application/pdf',contentDisposition:`attachment; filename="gls-${String(order.number).replace(/[^A-Za-z0-9_-]/g,'_')}.pdf"`}});
  await query(db,"UPDATE gls_shipments SET parcel_number=?,label_key=?,status='ready',updated_at=? WHERE order_id=?",String(info.ParcelNumber),key,now(),orderId).run();
  return {created:true,parcelNumber:String(info.ParcelNumber),labelUrl:`/api/admin/orders/${encodeURIComponent(orderId)}/gls-label`};
 }catch(error){await query(db,"DELETE FROM gls_shipments WHERE order_id=? AND status='creating'",orderId).run();throw error;}
}
export async function glsLabel(db,bucket,orderId){const shipment=await query(db,"SELECT label_key,parcel_number FROM gls_shipments WHERE order_id=? AND status='ready'",orderId).first();if(!shipment)fail(404,'Ehhez a rendeléshez még nincs GLS-címke.');const object=await bucket?.get(shipment.label_key);if(!object)fail(404,'A GLS-címke fájlja nem érhető el.');return {object,parcelNumber:shipment.parcel_number};}
async function parcelStatus(config,env,parcelNumber,fetcher){const payload={Username:env.GLS_USERNAME,Password:await passwordBytes(env.GLS_PASSWORD),ClientNumberList:[Number(env.GLS_CLIENT_NUMBER)],ParcelNumber:Number(parcelNumber),ReturnPOD:false,LanguageIsoCode:'HU'};let response;try{response=await fetcher(endpoint(config.country,'GetParcelStatuses'),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});}catch{fail(502,'A GLS követési szolgáltatása most nem válaszol.');}if(!response.ok)fail(502,'A GLS követési szolgáltatása nem elérhető.');let result;try{result=await response.json();}catch{fail(502,'A GLS követési válasza hibás.');}providerError(result);return result;}
export async function publicTracking(db,env,value,fetcher=fetch){if(value==='demo')return {demo:true,orderNumber:'DEMO-2026-GLS',createdAt:'2026-11-03T10:15:00.000Z',fulfillmentStatus:'shipped',parcelNumber:'DEMO-GLS-123456',shipmentReady:true,statuses:[{code:'20',date:'2026-11-03T10:15:00.000Z',description:'A csomagot a GLS átvette.',info:'DEMO – nem valós küldemény',depot:'Budapest'},{code:'10',date:'2026-11-03T08:50:00.000Z',description:'A címke elkészült.',info:'DEMO – nem valós küldemény',depot:'Spice Laboratory'}]};if(!/^[a-f0-9]{64}$/.test(value||''))fail(404,'A követési link nem található.');const row=await query(db,`SELECT o.number,o.kind,o.created_at,ops.fulfillment_status,g.parcel_number,g.status AS shipment_status,g.status_json,g.status_checked_at FROM order_tracking_links l JOIN customer_orders o ON o.id=l.order_id LEFT JOIN store_order_operations ops ON ops.order_id=o.id LEFT JOIN gls_shipments g ON g.order_id=o.id WHERE l.tracking_token=?`,value).first();if(!row)fail(404,'A követési link nem található.');let statuses=[];const config=await glsConfig(db,env),fresh=row.status_checked_at&&Date.now()-Date.parse(row.status_checked_at)<15*60*1000;if(row.parcel_number&&config.ready){if(!fresh){try{const result=await parcelStatus(config,env,row.parcel_number,fetcher);statuses=Array.isArray(result.ParcelStatusList)?result.ParcelStatusList:[];await query(db,'UPDATE gls_shipments SET status_json=?,status_checked_at=?,updated_at=? WHERE parcel_number=?',JSON.stringify(statuses),now(),now(),row.parcel_number).run();}catch{statuses=row.status_json?JSON.parse(row.status_json):[];}}else statuses=row.status_json?JSON.parse(row.status_json):[];}return {orderNumber:row.number,createdAt:row.created_at,fulfillmentStatus:row.fulfillment_status||'processing',parcelNumber:row.parcel_number||'',shipmentReady:row.shipment_status==='ready',statuses:statuses.map(item=>({code:String(item.StatusCode||''),date:String(item.StatusDate||''),description:String(item.StatusDescription||''),info:String(item.StatusInfo||''),depot:String(item.DepotCity||'')})).slice(-20)};}
