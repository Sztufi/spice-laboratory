import { SHIPPING_COUNTRIES } from '../public/shipping-core.mjs';
export { SHIPPING_COUNTRIES, shippingQuote } from '../public/shipping-core.mjs';
export function shippingMethods(env={}) {
 if(typeof env.SHIPPING_METHODS_JSON!=='string'||env.SHIPPING_METHODS_JSON.length>16000)return [];
 try{
  const input=JSON.parse(env.SHIPPING_METHODS_JSON);if(!Array.isArray(input)||input.length>10)return [];
  const ids=new Set(),methods=[];
  for(const item of input){
   if(!item||typeof item.id!=='string'||!/^[a-z0-9-]{1,50}$/.test(item.id)||ids.has(item.id)||typeof item.label!=='string'||!item.label.trim()||item.label.length>80||!SHIPPING_COUNTRIES.some(c=>c.code===item.country)||!Number.isSafeInteger(item.feeMinor)||item.feeMinor<0||item.feeMinor>10000000)return [];
   const min=item.deliveryMinDays,max=item.deliveryMaxDays;
   if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>60)return [];
   if(item.freeAboveMinor!==undefined&&(!Number.isSafeInteger(item.freeAboveMinor)||item.freeAboveMinor<0||item.freeAboveMinor>100000000))return [];
   ids.add(item.id);methods.push({id:item.id,label:item.label.trim(),country:item.country,feeMinor:item.feeMinor,deliveryMinDays:min,deliveryMaxDays:max,...(item.freeAboveMinor!==undefined?{freeAboveMinor:item.freeAboveMinor}:{})});
  }return methods;
 }catch{return [];}
}
