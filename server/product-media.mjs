import {fail,text,imageUrl} from './store.mjs';
// Product-specific metadata is independent of a library asset's default text.
export function productMedia(input,original={}){
 let images=input.images??original.images;
 if(input.images===undefined&&original.images?.length&&input.image&&input.image!==original.image){
  const target=original.featuredImageId||original.images[0].id;
  images=original.images.map(item=>item.id===target?{...item,url:input.image,alt:input.imageAlt??item.alt}:item);
 }
 if(images===undefined)images=[{id:'legacy',url:input.image||original.image||'/assets/mascot.png',alt:input.imageAlt??original.imageAlt??input.name??original.name??''}];
 if(!Array.isArray(images)||images.length>12||!images.length)fail(400,'Legalább egy és legfeljebb 12 termékképet adj meg.');
 images=images.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))fail(400,'Hibás galériakép.');
  const id=text(item.id,80,true);if(!/^[A-Za-z0-9_-]+$/.test(id))fail(400,'Hibás képazonosító.');
  if(!item.url)fail(400,'Hiányzó képcím.');
  return {id,url:imageUrl(item.url),alt:text(item.alt,300),title:text(item.title,180),caption:text(item.caption,500)};
 });
 if(new Set(images.map(item=>item.id)).size!==images.length||new Set(images.map(item=>item.url)).size!==images.length)fail(400,'Ugyanaz a kép csak egyszer szerepelhet a galériában.');
 const featuredImageId=input.featuredImageId??original.featuredImageId??images[0].id,thumbnailImageId=input.thumbnailImageId??original.thumbnailImageId??featuredImageId;
 const featured=images.find(i=>i.id===featuredImageId),thumbnail=images.find(i=>i.id===thumbnailImageId);
 if(!featured||!thumbnail)fail(400,'A főképet és a bélyegképet a galériából válaszd ki.');
 return {images,featuredImageId,thumbnailImageId,image:featured.url,imageAlt:featured.alt,thumbnailImage:thumbnail.url,thumbnailAlt:thumbnail.alt};
}
