import {create,FileStatus} from './vendor/filepond.mjs';
// FilePond owns selection, preview, orientation, image preparation, transport,
// progress, cancellation and retries. This adapter only maps our existing API.
export function mountFileUploader(root,{multiple=true,limit=12,remaining=()=>limit,profile=()=> 'product',fit=()=> 'contain',alt=()=>'',onUploaded=()=>{},onBusy=()=>{},onIdle=()=>{},onError=()=>{}}={}){
 const input=document.createElement('input');input.type='file';input.name='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=multiple;root.replaceChildren(input);
 let disposed=false,uploadResults=new Map(),notifiedBusy=false;
 const active=new Set([FileStatus.INIT,FileStatus.LOADING,FileStatus.IDLE,FileStatus.PROCESSING_QUEUED,FileStatus.PROCESSING]);
 const busy=()=>!disposed&&pond.getFiles().some(file=>active.has(file.status));
 const notify=()=>{if(disposed)return;const value=busy();if(value!==notifiedBusy){notifiedBusy=value;onBusy(value);}if(!value)onIdle({hasErrors:pond.getFiles().some(file=>[FileStatus.LOAD_ERROR,FileStatus.PROCESSING_ERROR].includes(file.status))});};
 const pond=create(input,{
  name:'file',allowMultiple:multiple,maxFiles:limit,maxParallelUploads:1,instantUpload:true,allowRevert:false,allowProcess:true,credits:false,
  acceptedFileTypes:['image/jpeg','image/png','image/webp'],maxFileSize:'25MB',
  imageResizeTargetWidth:1280,imageResizeTargetHeight:1280,imageResizeMode:'contain',imageResizeUpscale:false,
  // PNG is a required canvas output format. Safari WebP encoding is never needed.
  imageTransformOutputMimeType:'image/png',imageTransformOutputStripImageHead:true,
  imageTransformCanvasMemoryLimit:4096*4096,imagePreviewHeight:120,
  labelIdle:'Húzd ide a képeket, vagy <span class="filepond--label-action">válassz fájlt</span>',
  labelFileProcessing:'Feltöltés és WebP-feldolgozás',labelFileProcessingComplete:'Feltöltve',labelFileProcessingAborted:'Megszakítva',labelFileProcessingError:'A feltöltés nem sikerült',labelTapToRetry:'Koppints az újrapróbáláshoz',labelTapToCancel:'Megszakítás',labelTapToUndo:'Eltávolítás a feltöltési listából',labelButtonRemoveItem:'Eltávolítás',labelButtonAbortItemProcessing:'Megszakítás',labelButtonRetryItemProcessing:'Újrapróbálás',labelButtonProcessItem:'Feltöltés',labelFileLoadError:'A kép nem olvasható',labelFileTypeNotAllowed:'JPG-, PNG- vagy WebP-képet válassz',fileValidateTypeLabelExpectedTypes:'Elfogadott típusok: JPG, PNG, WebP',labelMaxFileSizeExceeded:'Túl nagy képfájl',labelMaxFileSize:'Maximum {filesize}',
  beforeAddFile:item=>{
   const pending=pond.getFiles().filter(file=>file.id!==item.id&&file.status!==FileStatus.PROCESSING_COMPLETE).length;
   if(pending>=remaining()){onError('A galériában legfeljebb 12 kép lehet.');return false;}return true;
  },
  server:{process:{url:'/api/admin/media',method:'POST',withCredentials:true,timeout:60000,
   ondata:form=>{form.set('profile',profile());form.set('fit',fit());form.set('alt',alt());return form;},
   onload:response=>{const result=JSON.parse(response);if(!result.media?.id||!result.media?.url)throw new Error('Hiányos feltöltési válasz.');uploadResults.set(result.media.id,result.media);return result.media.id;},
   onerror:response=>{let message='A kép feltöltése nem sikerült. Próbáld újra.';try{message=JSON.parse(response).error||message;}catch{}onError(message);return message;}
  },revert:null,restore:null,load:null,fetch:null,remove:null}
 });
 for(const event of ['addfilestart','addfile','processfilestart','processfileabort','removefile','updatefiles'])pond.on(event,()=>queueMicrotask(notify));
 pond.on('error',error=>{if(!disposed)onError(typeof error?.body==='string'?error.body:'A kép nem tölthető fel. Ellenőrizd a fájlt.');queueMicrotask(notify);});
 pond.on('processfile',(error,file)=>{
  if(disposed)return;
  if(!error){const media=uploadResults.get(file.serverId);uploadResults.delete(file.serverId);if(media){try{onUploaded(media);}catch(e){onError(e.message);}}queueMicrotask(()=>{if(!disposed)pond.removeFile(file.id,{revert:false});});}
  queueMicrotask(notify);
 });
 return {element:root,get busy(){return busy();},dispose(){if(disposed)return;disposed=true;for(const file of pond.getFiles())file.abortProcessing();pond.destroy();uploadResults.clear();onBusy(false);}};
}
