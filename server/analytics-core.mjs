import {refundSummary} from './refunds.mjs';
const DAY=86400000;
export const TIMEZONES=['Europe/Budapest','Europe/Bucharest','UTC'];
export function dayKey(value,tz='Europe/Budapest'){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
export const shiftDay=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
export const dayCount=(from,to)=>Math.round((Date.parse(to)-Date.parse(from))/DAY)+1;
export function startOfDay(day,tz){
 const target=Date.parse(day+'T00:00:00Z');let guess=target;
 for(let i=0;i<3;i++){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
  const v=type=>parts.find(p=>p.type===type).value;
  const local=Date.parse(`${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}:${v('second')}Z`);
  guess+=target-local;
 }
 return new Date(guess).toISOString();
}
export function reportOptions(params,now=new Date(),archive=false){
 const error=message=>{const e=new Error(message);e.status=400;throw e;};
 const tz=params.get('tz')||'Europe/Budapest';if(!TIMEZONES.includes(tz))error('Nem támogatott időzóna.');
 const today=dayKey(now,tz),to=params.get('to')||(archive?today:shiftDay(today,-1)),from=params.get('from')||(archive?'1970-01-01':shiftDay(to,-29));
 for(const day of [from,to])if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)error('Érvényes kezdő és záró dátum szükséges.');
 if(from>to||to>today||!archive&&dayCount(from,to)>731)error('Az elemzésben legfeljebb 731 napos, nem jövőbeli időszak választható.');
 const scope=params.get('scope')||(archive?'all':'live');if(!['live','test','demo','all'].includes(scope))error('Ismeretlen adatforrás.');
 const group=params.get('group')||'day';if(!['day','week','month'].includes(group))error('Ismeretlen időbontás.');
 const status=params.get('status')||'',fulfillment=params.get('fulfillment')||'',country=params.get('country')||'';
 if(status&&!['paid','pending-payment','demo-completed'].includes(status))error('Ismeretlen fizetési állapot.');
 if(fulfillment&&!['processing','packing','shipped','completed','on-hold','cancelled'].includes(fulfillment))error('Ismeretlen teljesítési állapot.');
 if(country&&!['HU','RO'].includes(country))error('Ismeretlen célország.');
 const page=Number(params.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>1000000)error('Hibás oldalszám.');
 return {from,to,tz,scope,group,status,fulfillment,country,product:(params.get('product')||'').slice(0,90),query:(params.get('q')||'').slice(0,150),page,pageSize:50,today,partial:to===today};
}
const parse=(value,fallback)=>{if(!value)return fallback;try{return JSON.parse(value);}catch{return fallback;}};
const integer=value=>Number.isSafeInteger(value)&&value>=0;
export function normalizeOrder(row){
 const items=row.items||parse(row.items_json,null),shipping=row.shipping||parse(row.shipping_json,null),discount=row.discount||parse(row.discount_json,null),customer=row.customer||parse(row.customer_json,null);
 const valid=Array.isArray(items)&&items.length>0&&items.every(i=>integer(i.quantity)&&i.quantity>0&&integer(i.subtotalMinor))&&integer(row.total_minor);
 const gross=valid?items.reduce((sum,i)=>sum+i.subtotalMinor,0):0,discountMinor=discount?.discountMinor||0,shippingMinor=shipping?.feeMinor||0;
 const reconciled=valid&&integer(gross)&&integer(discountMinor)&&integer(shippingMinor)&&discountMinor<=gross&&gross-discountMinor+shippingMinor===row.total_minor;
 const email=String(customer?.billing?.email||row.email||'').trim().toLowerCase();
 const identity=row.identity||(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!/@(?:guest|checkout)\.invalid$/i.test(email)?'email:'+email:'id:'+row.user_id);
 return {...row,...refundSummary(row),refunds:parse(row.refunds_json,[]),items:Array.isArray(items)?items:[],shipping,discount,customer,identity,email:customer?.billing?.email||row.email||'',full_name:customer?.billing?.name||row.full_name||'',country:shipping?.country||customer?.shipping?.address?.country||customer?.billing?.address?.country||'',valid:reconciled,gross,discountMinor,shippingMinor,units:valid?items.reduce((sum,i)=>sum+i.quantity,0):0};
}
// Largest remainder allocation: allocated coupon cents always reconcile to the order.
export function allocateDiscount(items,discount){
 const gross=items.reduce((s,i)=>s+i.subtotalMinor,0);if(!gross)return items.map(()=>0);
 const raw=items.map((i,index)=>({index,value:discount*i.subtotalMinor/gross}));
 const values=raw.map(i=>Math.floor(i.value));let left=discount-values.reduce((a,b)=>a+b,0);
 for(const part of raw.sort((a,b)=>(b.value%1)-(a.value%1)||a.index-b.index)){if(!left)break;values[part.index]++;left--;}
 return values;
}
const blank=()=>({orders:0,units:0,grossMinor:0,discountMinor:0,productMinor:0,shippingMinor:0,paidMinor:0});
const add=(total,o)=>{total.orders++;total.units+=o.units;total.grossMinor+=o.gross;total.discountMinor+=o.discountMinor;total.productMinor+=o.gross-o.discountMinor;total.shippingMinor+=o.shippingMinor;total.paidMinor+=o.total_minor;};
const bucket=(day,group)=>group==='month'?day.slice(0,7):group==='week'?shiftDay(day,-((new Date(day+'T12:00Z').getUTCDay()+6)%7)):day;
const ratio=(a,b)=>b?a/b:null;
function matches(o,opt){return (!opt.product||o.items.some(i=>(i.productId||i.id)===opt.product))&&(!opt.country||o.country===opt.country)&&(!opt.fulfillment||(o.fulfillment_status||'processing')===opt.fulfillment);}
export function forecastSeries(series,key,minOrders){
 const active=series.reduce((n,r)=>n+r.orders,0);
 if(series.length<70||active<minOrders)return {available:false,reason:'Legalább 70 teljes nap és 20 fizetett rendelés szükséges. Ez óvatossági termékszabály, nem általános statisztikai küszöb.'};
 const predict=(rows,model,h)=>model==='mean28'?rows.slice(-28).reduce((s,r)=>s+r[key],0)/28:rows[rows.length-7+(h-1)%7][key];
 const checks=['mean28','seasonal7'].map(model=>{
  let error=0,actual=0;for(let i=series.length-14;i<series.length;i++){error+=Math.abs(series[i][key]-predict(series.slice(0,i),model,1));actual+=series[i][key];}
  return {model,mae:error/14,wape:actual?error/actual:null};
 });
 const best=checks.reduce((a,b)=>a.mae<=b.mae?a:b);
 const days=Array.from({length:30},(_,i)=>({day:shiftDay(series.at(-1).day,i+1),value:predict(series,best.model,i+1)}));
 return {available:true,...best,checks,days,next7:days.slice(0,7).reduce((s,d)=>s+d.value,0),next30:days.reduce((s,d)=>s+d.value,0),validationDays:14,validationHorizon:1};
}
export function buildAnalytics(rawOrders,catalogue,opt,meta={}){
 const all=rawOrders.map(normalizeOrder),eligible=all.filter(o=>o.currency==='HUF'&&o.valid&&(opt.scope==='demo'?o.kind==='demo'&&o.status==='demo-completed':o.status==='paid'&&(opt.scope==='test'?o.kind==='stripe-test':o.kind==='stripe')));
 for(const o of eligible)o.day=dayKey(o.created_at,opt.tz);
 const days=dayCount(opt.from,opt.to),previousTo=shiftDay(opt.from,-1),previousFrom=shiftDay(previousTo,-days+1);
 const selected=eligible.filter(o=>o.day>=opt.from&&o.day<=opt.to&&matches(o,opt)),previous=eligible.filter(o=>o.day>=previousFrom&&o.day<=previousTo&&matches(o,opt));
 const totals=blank(),before=blank(),timeline=new Map(),products=new Map(),productTime=new Map(),customers=new Map(),pairs=new Map();
 for(let d=opt.from;d<=opt.to;d=shiftDay(d,1)){const k=bucket(d,opt.group);if(!timeline.has(k))timeline.set(k,{period:k,...blank()});}
 const selectedIds=new Set();
 for(const o of selected){
  selectedIds.add(o.id);add(totals,o);add(timeline.get(bucket(o.day,opt.group)),o);
  const c=customers.get(o.identity)||{identity:o.identity,email:o.email,name:o.full_name,orders:0,paidMinor:0,first:o.first_paid_at||o.created_at,last:o.last_paid_at||o.created_at,lifetimeOrders:Number(o.lifetime_orders)||0,lifetimePaidMinor:Number(o.lifetime_paid_minor)||0,returning:false};
  c.orders++;c.paidMinor+=o.total_minor;const repeat=o.first_paid_key?o.created_at+'|'+o.id>o.first_paid_key:eligible.some(p=>p.identity===o.identity&&(p.created_at+'|'+p.id)<(o.created_at+'|'+o.id));c.returning||=repeat;c.newInPeriod||=!repeat;customers.set(o.identity,c);
  const allocations=allocateDiscount(o.items,o.discountMinor);
  o.items.forEach((item,index)=>{
   const id=item.productId||item.id,product=catalogue.products.find(p=>p.id===id),net=item.subtotalMinor-allocations[index];
   const row=products.get(id)||{id,name:item.name||product?.name||id,sku:product?.sku||'',units:0,orders:0,grossMinor:0,discountMinor:0,productMinor:0};
   row.units+=item.quantity;row.orders++;row.grossMinor+=item.subtotalMinor;row.discountMinor+=allocations[index];row.productMinor+=net;products.set(id,row);
   const period=bucket(o.day,opt.group),key=period+'|'+id,point=productTime.get(key)||{period,id,name:row.name,units:0,productMinor:0};point.units+=item.quantity;point.productMinor+=net;productTime.set(key,point);
  });
  const ids=[...new Set(o.items.map(i=>i.productId||i.id))].sort();for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const key=ids[i]+'|'+ids[j],pair=pairs.get(key)||{a:ids[i],b:ids[j],orders:0};pair.orders++;pairs.set(key,pair);}
 }
 for(const o of previous)add(before,o);
 const customerList=[...customers.values()].map(c=>({...c,daysSinceLast:Math.max(0,dayCount(dayKey(c.last,opt.tz),opt.to)-1),averagePaidMinor:ratio(c.paidMinor,c.orders)})).sort((a,b)=>b.paidMinor-a.paidMinor);
 const returning=customerList.filter(c=>c.returning).length;
 const productList=[...products.values()].sort((a,b)=>b.productMinor-a.productMinor||a.id.localeCompare(b.id));let cumulative=0;
 for(const p of productList){p.share=ratio(p.productMinor,totals.productMinor);p.abc=totals.productMinor?(cumulative<.8?'A':cumulative<.95?'B':'C'):'—';cumulative+=p.share||0;}
 const cutoff=opt.partial?shiftDay(opt.to,-1):opt.to;
 const first=meta.firstPaidAt?dayKey(meta.firstPaidAt,opt.tz):eligible.map(o=>o.day).sort()[0];
 const forecastFrom=first&&first>shiftDay(cutoff,-89)?first:shiftDay(cutoff,-89),series=[];
 for(let d=forecastFrom;d<=cutoff;d=shiftDay(d,1))series.push({day:d,...blank()});
 const map=new Map(series.map(r=>[r.day,r]));
 for(const o of eligible)if(o.day>=forecastFrom&&o.day<=cutoff&&matches(o,opt))add(map.get(o.day),o);
 const forecast=opt.scope!=='live'?{orders:{available:false,reason:'Előrejelzés csak valódi fizetett rendelésekből készül.'},paid:{available:false},units:{available:false}}:{orders:forecastSeries(series,'orders',20),paid:forecastSeries(series,'paidMinor',20),units:forecastSeries(series,'units',20)};
 const recentFrom=shiftDay(cutoff,-27),recent=eligible.filter(o=>o.day>=recentFrom&&o.day<=cutoff&&matches(o,opt));
 const inventory=catalogue.products.filter(p=>p.status!=='archived'&&(!opt.product||p.id===opt.product)).map(p=>{const sold=recent.reduce((s,o)=>s+o.items.filter(i=>(i.productId||i.id)===p.id).reduce((a,i)=>a+i.quantity,0),0),stock=p.manageStock?p.stockQuantity:null;return {id:p.id,name:p.name,stock,sold28:sold,perDay:opt.scope==='live'&&first&&first<=recentFrom?sold/28:null,daysRemaining:opt.scope==='live'&&stock!==null&&sold&&first&&first<=recentFrom?stock/(sold/28):null};}).sort((a,b)=>(a.daysRemaining??Infinity)-(b.daysRemaining??Infinity));
 const cohorts=new Map();for(const c of customerList){const month=dayKey(c.first,opt.tz).slice(0,7),row=cohorts.get(month)||{month,customers:0,returning:0,paidMinor:0};row.customers++;row.returning+=Number(c.returning);row.paidMinor+=c.paidMinor;cohorts.set(month,row);}
 const currentRows=all.filter(o=>dayKey(o.created_at,opt.tz)>=opt.from&&dayKey(o.created_at,opt.tz)<=opt.to);
 return {generatedAt:meta.generatedAt||new Date().toISOString(),filters:opt,previous:{from:previousFrom,to:previousTo,...before},totals:{...totals,customers:customerList.length,newCustomers:customerList.filter(c=>c.newInPeriod).length,returningCustomers:returning,returningRate:ratio(returning,customerList.length),aovProductMinor:ratio(totals.productMinor,totals.orders),aovPaidMinor:ratio(totals.paidMinor,totals.orders),unitsPerOrder:ratio(totals.units,totals.orders)},changes:{paid:!opt.partial&&before.paidMinor?(totals.paidMinor-before.paidMinor)/before.paidMinor:null,orders:!opt.partial&&before.orders?(totals.orders-before.orders)/before.orders:null},timeline:[...timeline.values()],products:productList,productTime:[...productTime.values()].sort((a,b)=>a.period.localeCompare(b.period)||b.units-a.units),customers:customerList,cohorts:[...cohorts.values()].sort((a,b)=>a.month.localeCompare(b.month)),pairs:[...pairs.values()].sort((a,b)=>b.orders-a.orders).slice(0,10),inventory,forecast,forecastCutoff:cutoff,coverage:{...meta,loadedOrders:all.length,excludedCurrency:currentRows.filter(o=>o.currency!=='HUF').length,invalidOrders:currentRows.filter(o=>!o.valid).length,selectedOrders:selectedIds.size,refundsAvailable:false,costsAvailable:false,taxBreakdownAvailable:false,trafficAvailable:false},definitions:{paid:'Rögzített fizetett összeg szállítással, visszatérítések levonása előtt. Nem könyvelési vagy profitriport.',aov:'Kedvezmény utáni termékérték / fizetett rendelések. Nem áfa nélküli nettó.',returning:'Az időszakban vásárlók közül azok, akiknek az időszak végéig volt korábbi fizetett rendelésük. Azonosítás normalizált e-maillel, ennek hiányában fiókazonosítóval. Az első és egy későbbi vásárlásával ugyanaz a vevő az időszakban új és visszatérő is lehet; a visszatérő arányban csak egyszer számoljuk.',productFilter:'Termékszűrőnél az azt tartalmazó teljes kosarakat elemezzük. A terméktáblában a kosár összes tétele látszik.',cohort:'Az időszakban aktív vásárlók első vásárlási hónap szerint, nem teljes kohorszmegtartási ráta.',inventory:'Most rögzített készlet / az elemzés zárónapjáig mért 28 nap napi eladási átlaga. Foglalásokkal nem korrigált. Historikus készlet és sell-through nem áll rendelkezésre.',forecast:'28 napos átlag és heti szezonális naiv modell összehasonlítása az utolsó 14 teljes nap gördülő, egynapos tesztjén. A kisebb MAE dönt. A hibamutató nem a 30 napos előrejelzés garantált pontossága. Kampányt, készlethiányt és éves szezonalitást nem modellez.'}};
}
