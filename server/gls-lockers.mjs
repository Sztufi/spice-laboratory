import {fail} from './store.mjs';

// GLS Map Widget data contract: id is the MyGLS PSD StringValue.
// Resolve on the server; never trust a browser-supplied address or point type.
export async function resolveGlsLocker(id,country,fetcher=fetch){
 if(country!=='HU'||typeof id!=='string'||!id.trim()||id.length>100)fail(400,'Válassz magyarországi GLS csomagautomatát.');
 let response,data;
 try{
  response=await fetcher('https://map.gls-hungary.com/data/deliveryPoints/hu.json',{signal:AbortSignal.timeout(12000),cf:{cacheTtl:300,cacheEverything:true}});
  if(!response.ok)throw new Error('GLS');
  data=await response.json();
 }catch{fail(503,'A GLS automaták ellenőrzése most nem sikerült. Próbáld újra, vagy válaszd a házhozszállítást.');}
 const point=data?.items?.find(p=>p.id===id&&p.type==='parcel-locker'&&p.contact?.countryCode?.toUpperCase()===country&&p.features?.includes('delivery'));
 if(!point)fail(400,'Ez a csomagautomata most nem választható. Válassz másik automatát.');
 return {id:point.id,name:point.name,country,postalCode:point.contact.postalCode,city:point.contact.city,address:point.contact.address,type:'parcel-locker'};
}
