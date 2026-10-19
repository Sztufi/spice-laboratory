export async function prepareImage(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG-, PNG- vagy WebP-kép szükséges.');
 if(file.size>25*1024*1024)throw new Error('Legfeljebb 25 MB-os képet válassz.');
 const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
 try{
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));
  if(!blob||blob.type!=='image/webp')throw new Error('A böngésző nem tud WebP-képet készíteni. Használj friss böngészőt.');
  return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
 }finally{bitmap.close();}
}
