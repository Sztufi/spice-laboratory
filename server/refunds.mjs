// Incoming Stripe synchronization only. This module never creates a monetary refund.
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const id=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'_[a-zA-Z0-9_]{1,200}$').test(value);
const objectId=value=>typeof value==='string'?value:value?.id;
function invalid(){const e=new Error('A visszatérítés adatai nem egyeznek.');e.status=400;throw e;}
export const REFUND_EVENTS=['refund.created','refund.updated','refund.failed','charge.refunded'];
export const refundColumns=(alias='o')=>`COALESCE((SELECT SUM(r.amount_minor) FROM payment_refunds r WHERE r.checkout_id=${alias}.id AND r.status='succeeded'),0) AS refunded_minor,COALESCE((SELECT SUM(r.amount_minor) FROM payment_refunds r WHERE r.checkout_id=${alias}.id AND r.status IN ('pending','requires_action')),0) AS refund_pending_minor`;
export async function syncRefundEvent(db,event,retrieve){
 if(!REFUND_EVENTS.includes(event.type))return {ignored:true};
 let chargeId;
 if(event.type==='charge.refunded')chargeId=event.data?.object?.id;
 else{
  const refundId=event.data?.object?.id;if(!id(refundId,'re'))invalid();
  const refund=await retrieve('refunds/'+encodeURIComponent(refundId));
  if(refund.id!==refundId)invalid();chargeId=objectId(refund.charge);
 }
 if(!id(chargeId,'ch'))invalid();
 const charge=await retrieve('charges/'+encodeURIComponent(chargeId)),pi=objectId(charge.payment_intent);
 if(charge.id!==chargeId||!id(pi,'pi')||charge.paid!==true||typeof charge.livemode!=='boolean'||event.livemode!==charge.livemode)invalid();
 let row=await q(db,'SELECT * FROM payment_checkouts WHERE payment_intent_id=?',pi).first();
 if(!row){
  const intent=await retrieve('payment_intents/'+encodeURIComponent(pi));
  if(intent.id!==pi||intent.livemode!==charge.livemode)invalid();
  row=await q(db,'SELECT * FROM payment_checkouts WHERE id=?',intent.metadata?.checkout_id||'').first();
  // Other applications may share the Stripe account; do not import their refunds.
  if(!row)return {ignored:true};
 }
 if(row.mode!==(charge.livemode?'live':'test')||row.currency.toLowerCase()!==charge.currency||row.total_minor!==charge.amount||row.payment_intent_id&&row.payment_intent_id!==pi)invalid();
 const refunds=[];let after='';
 for(let page=0;page<100;page++){
  const list=await retrieve('refunds?charge='+encodeURIComponent(chargeId)+'&limit=100'+(after?'&starting_after='+encodeURIComponent(after):''));
  if(!Array.isArray(list.data)||typeof list.has_more!=='boolean')invalid();
  refunds.push(...list.data);
  if(!list.has_more)break;
  const next=list.data.at(-1)?.id;if(!id(next,'re')||next===after||page===99)throw new Error('Incomplete refund pagination');after=next;
 }
 const ids=new Set();let sum=0;
 for(const r of refunds){
  if(!id(r.id,'re')||ids.has(r.id)||objectId(r.charge)!==chargeId||objectId(r.payment_intent)!==pi||r.currency!==charge.currency||!Number.isSafeInteger(r.amount)||r.amount<=0||!Number.isSafeInteger(r.created)||r.created<0||!['pending','requires_action','succeeded','failed','canceled'].includes(r.status))invalid();
  ids.add(r.id);if(r.status==='succeeded')sum+=r.amount;
 }
 if(!Number.isSafeInteger(sum)||sum>row.total_minor||!Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<sum||charge.amount_refunded>row.total_minor)throw new Error('Refund provider state is not reconciled; retry webhook');
 const stamp=new Date().toISOString();
 const statements=[q(db,'UPDATE payment_checkouts SET payment_intent_id=? WHERE id=? AND (payment_intent_id IS NULL OR payment_intent_id=?)',pi,row.id,pi)];
 for(const r of refunds)statements.push(q(db,`INSERT INTO payment_refunds(id,checkout_id,charge_id,amount_minor,currency,mode,status,reason,created_at,succeeded_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(id) DO UPDATE SET status=excluded.status,succeeded_at=COALESCE(payment_refunds.succeeded_at,excluded.succeeded_at),updated_at=excluded.updated_at
 WHERE payment_refunds.checkout_id=excluded.checkout_id AND payment_refunds.charge_id=excluded.charge_id AND payment_refunds.amount_minor=excluded.amount_minor AND payment_refunds.currency=excluded.currency
 AND payment_refunds.status NOT IN ('succeeded','failed','canceled')`,r.id,row.id,chargeId,r.amount,row.currency,row.mode,r.status,r.reason||null,new Date(r.created*1000).toISOString(),r.status==='succeeded'?stamp:null,stamp));
 // Event insertion and ledger changes are atomic. Refund ID is the financial deduplication key.
 statements.push(q(db,'INSERT INTO payment_events(id,checkout_id,type,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING',event.id,row.id,event.type,stamp));
 await db.batch(statements);return {checkoutId:row.id};
}
export function refundSummary(row){
 const refunded=Number(row.refunded_minor)||0,pending=Number(row.refund_pending_minor)||0;
 return {refundedMinor:refunded,refundPendingMinor:pending,retainedMinor:row.total_minor-refunded,refundStatus:refunded>=row.total_minor&&refunded>0?'full':refunded>0?'partial':pending>0?'pending':'none'};
}
