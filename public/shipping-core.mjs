export const SHIPPING_COUNTRIES=[{code:'HU',label:'Magyarország'},{code:'RO',label:'Románia'}];
export function shippingQuote(methods,{country,methodId},subtotalMinor){
 const method=methods.find(item=>item.country===country&&item.id===methodId);
 if(!method)return null;
 const feeMinor=method.freeAboveMinor!==undefined&&subtotalMinor>=method.freeAboveMinor?0:method.feeMinor;
 return {...method,feeMinor,currency:'HUF'};
}
