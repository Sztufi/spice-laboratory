// Validate dimensions before the WASM decoder allocates the full pixel buffer.
export function imageDimensions(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(a,b)=>new TextDecoder().decode(bytes.slice(a,b));
 if(bytes.length>=24&&ascii(1,4)==='PNG')return {width:v.getUint32(16),height:v.getUint32(20)};
 if(bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'){
  if(ascii(12,16)==='VP8X')return {width:1+(bytes[24]|bytes[25]<<8|bytes[26]<<16),height:1+(bytes[27]|bytes[28]<<8|bytes[29]<<16)};
  if(ascii(12,16)==='VP8 ')return {width:v.getUint16(26,true)&16383,height:v.getUint16(28,true)&16383};
  if(ascii(12,16)==='VP8L')return {width:1+(bytes[21]|(bytes[22]&63)<<8),height:1+((bytes[22]>>6)|bytes[23]<<2|(bytes[24]&15)<<10)};
 }
 if(bytes[0]===255&&bytes[1]===216){
  let at=2;while(at+4<bytes.length){
   if(bytes[at++]!==255)break;while(bytes[at]===255)at++;
   const marker=bytes[at++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;
   const length=v.getUint16(at);if(length<2||at+length>bytes.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7)return {width:v.getUint16(at+5),height:v.getUint16(at+3)};
   at+=length;
  }
 }
 throw new Error('Érvénytelen vagy nem támogatott kép.');
}
let busy=false;
export async function processImage(bytes,{fit='contain',profile='product',codec}={}){
 const dimensions=imageDimensions(bytes);
 if(!dimensions.width||!dimensions.height||dimensions.width*dimensions.height>3000000||Math.max(dimensions.width,dimensions.height)>6000)throw new Error('A kép túl nagy. Legfeljebb 3 megapixeles képet tölts fel; a webes feltöltő automatikusan méretezi.');
 if(busy)throw new Error('Egy másik kép feldolgozása folyamatban van. Próbáld újra.');
 busy=true;
 let input;
 try{
  const {PhotonImage,resize,crop,watermark,SamplingFilter}=codec||await import('#photon');
  const {encodeWebp}=await import('#webp-encoder');
  input=PhotonImage.new_from_byteslice(bytes);
  if(input.get_width()*input.get_height()>3000000)throw new Error('A kép tényleges mérete túl nagy.');
  const files=[],width=input.get_width(),height=input.get_height();
  const master=resize(input,Math.max(1,Math.round(width*Math.min(1,1600/Math.max(width,height)))),Math.max(1,Math.round(height*Math.min(1,1600/Math.max(width,height)))),SamplingFilter.Lanczos3);
  try{files.push({suffix:'',bytes:await encodeWebp(master),width:master.get_width(),height:master.get_height()});}finally{master.free();}
  for(const size of [160,320,640,960]){
   const targetHeight=profile==='recipe'?Math.round(size*9/16):size;
   let cropped,resized,canvas;
   try{
    let source=input;
    if(fit==='cover'){
     const ratio=size/targetHeight,cropWidth=Math.min(width,Math.floor(height*ratio)),cropHeight=Math.min(height,Math.floor(width/ratio)),x=Math.floor((width-cropWidth)/2),y=Math.floor((height-cropHeight)/2);
     cropped=crop(input,x,y,x+cropWidth,y+cropHeight);source=cropped;
    }
    const factor=Math.min(size/source.get_width(),targetHeight/source.get_height(),1);
    const w=Math.max(1,Math.round(source.get_width()*factor)),h=Math.max(1,Math.round(source.get_height()*factor));
    resized=resize(source,w,h,SamplingFilter.Lanczos3);
    canvas=new PhotonImage(new Uint8Array(size*targetHeight*4),size,targetHeight);
    watermark(canvas,resized,BigInt(Math.floor((size-w)/2)),BigInt(Math.floor((targetHeight-h)/2)));
    files.push({suffix:'-'+size,bytes:await encodeWebp(canvas),width:size,height:targetHeight});
   }finally{canvas?.free();resized?.free();cropped?.free();}
  }
  return {files,originalWidth:width,originalHeight:height,fit};
 }finally{input?.free();busy=false;}
}
