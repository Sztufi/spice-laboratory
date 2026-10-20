import {escapeHtml as h} from './html-escape.mjs';
import {brandIcon} from './brand-icons.mjs';
import {mountFileUploader} from './file-uploader.mjs';
const icon=(name)=>brandIcon(name,18);
export function mountProductMedia(root,{product={},media=[],api,onMedia=()=>{}}){
 let images=structuredClone(product.images|| (product.image?[{id:'legacy',url:product.image,alt:product.imageAlt??product.name??'',title:'',caption:''}]:[]));
 let featured=product.featuredImageId||images[0]?.id||'',thumbnail=product.thumbnailImageId||featured,uploading=false,disposed=false,picker=false,query='',page=0,uploader=null;
 const selected=new Set();
 const status=(message,error=false)=>{const node=root.querySelector('[data-media-status]');if(node){node.textContent=message;node.classList.toggle('error',error);}};
 const options=()=>media.filter(m=>m.status!=='archived'&&!images.some(i=>i.url===m.url)&&[m.name,m.title,m.alt].join(' ').toLocaleLowerCase('hu').includes(query.toLocaleLowerCase('hu')));
 function renderPicker(){
  const node=root.querySelector('[data-media-picker]');if(!node)return;
  node.hidden=!picker;if(!picker)return;
  const rows=options(),pages=Math.max(1,Math.ceil(rows.length/12));page=Math.min(page,pages-1);
  node.innerHTML=`<div class="media-picker-top"><h4>MÉDIATÁR</h4><button type="button" class="small-button" data-media-action="close-picker">Bezárás</button></div><label>Kép keresése<input type="search" data-media-search value="${h(query)}" placeholder="Fájlnév, cím vagy alt szöveg"></label><div class="media-picker-grid">${rows.slice(page*12,page*12+12).map(m=>`<label class="media-picker-item"><input type="checkbox" data-pick-image="${h(m.id)}"${selected.has(m.id)?' checked':''}><img src="${h(m.url)}" alt="" width="100" height="100" loading="lazy"><span>${h(m.title||m.name||'Termékkép')}</span></label>`).join('')||'<p>Nincs kiválasztható kép.</p>'}</div><div class="row-actions"><button type="button" class="small-button" data-media-action="previous-page"${page===0?' disabled':''}>Előző</button><span>${page+1} / ${pages}</span><button type="button" class="small-button" data-media-action="next-page"${page+1>=pages?' disabled':''}>Következő</button><button type="button" class="button yellow" data-media-action="add-picked">KIJELÖLTEK HOZZÁADÁSA (${selected.size})</button></div>`;
 }
 function render(focusId,focusAction){
  const uploadElement=uploader?.element,fitValue=root.querySelector('#product-media-fit')?.value||'contain';
  root.innerHTML=`<fieldset class="product-media-editor"><legend>TERMÉKKÉPEK ÉS GALÉRIA <span>${images.length}/12</span></legend><p class="admin-hint">A főkép nyitja a termékoldalt, a bélyegkép a terméklistában jelenik meg. A galéria sorrendjét a nyilakkal módosíthatod. Az alt szöveget a képernyőolvasók és a keresők használják.</p><div class="media-upload-zone"><h4>KÉPEK FELTÖLTÉSE</h4><div data-filepond-uploader></div><p>JPG, PNG, WebP · maximum 25 MB/kép · automatikus tömörítés és több WebP-méret</p><label for="product-media-fit">Új képek automatikus kivágása<select id="product-media-fit"><option value="contain">Teljes kép megtartása</option><option value="cover">Négyzetes, középre vágott képméretek</option></select></label><button type="button" class="button light" data-media-action="picker"${uploading?' disabled':''}>${icon('grid')} VÁLASZTÁS A MÉDIATÁRBÓL</button></div><p data-media-status role="status" aria-live="polite"></p><div data-media-picker class="media-picker" hidden></div><div class="product-media-list">${images.map((img,index)=>`<article class="product-media-item" data-image-id="${h(img.id)}"><div class="product-media-preview"><img src="${h(img.url)}" alt="${h(img.alt)}" width="180" height="180" loading="lazy"><span>${index+1}. kép</span></div><div class="product-media-fields"><div class="row-actions"><button type="button" class="small-button${featured===img.id?' selected':''}" aria-pressed="${featured===img.id}" data-media-action="featured">${icon('eye')} ${featured===img.id?'FŐKÉP':'Legyen főkép'}</button><button type="button" class="small-button${thumbnail===img.id?' selected':''}" aria-pressed="${thumbnail===img.id}" data-media-action="thumbnail">${icon('grid')} ${thumbnail===img.id?'BÉLYEGKÉP':'Legyen bélyegkép'}</button></div><label>Alt szöveg<input data-image-field="alt" maxlength="300" value="${h(img.alt||'')}" placeholder="Pl. Fries Salt fűszerkeverék 210 g-os üvegben"></label><label>Kép címe<input data-image-field="title" maxlength="180" value="${h(img.title||'')}"></label><label>Nyilvános képaláírás<textarea data-image-field="caption" maxlength="500" rows="2">${h(img.caption||'')}</textarea></label><div class="row-actions"><button type="button" class="small-button" data-media-action="up" aria-label="${index+1}. kép előrébb"${index===0?' disabled':''}>${icon('up')} Előrébb</button><button type="button" class="small-button" data-media-action="down" aria-label="${index+1}. kép hátrébb"${index===images.length-1?' disabled':''}>${icon('down')} Hátrébb</button><a class="small-button" href="${h(img.url)}" target="_blank" rel="noopener">Eredeti megnyitása</a><button type="button" class="small-button danger" data-media-action="remove">${icon('close')} Eltávolítás</button></div></div></article>`).join('')||'<p class="empty">Még nincs kép. Tölts fel vagy válassz a médiatárból.</p>'}</div><p class="admin-hint">A képszövegek és a sorrend a termék mentésével lépnek életbe. Az eltávolítás csak ebből a galériából veszi ki a képet; a médiatárban megmarad.</p></fieldset>`;
  const placeholder=root.querySelector('[data-filepond-uploader]');
  root.querySelector('#product-media-fit').value=fitValue;
  if(uploadElement)placeholder.replaceWith(uploadElement);
  else uploader=mountFileUploader(placeholder,{remaining:()=>12-images.length,fit:()=>root.querySelector('#product-media-fit').value,alt:()=>product.name||'',onBusy:value=>{uploading=value;},onError:message=>status(message,true),onUploaded:item=>{
   if(disposed)return;if(!media.some(m=>m.id===item.id))media.push(item);onMedia(item);add([item]);render();status('A kép feltöltve. Mentsd a terméket a galéria véglegesítéséhez.');
  }});
  renderPicker();
  if(focusId)root.querySelector(`[data-image-id="${CSS.escape(focusId)}"] [data-media-action="${focusAction}"]`)?.focus();
 }
 function add(items){
  if(images.length+items.filter(item=>!images.some(i=>i.url===item.url)).length>12)throw new Error('Legfeljebb 12 képet adhatsz a termékhez.');
  for(const item of items){if(images.some(i=>i.url===item.url))continue;if(images.length===12)throw new Error('Legfeljebb 12 képet adhatsz a termékhez.');images.push({id:item.id||crypto.randomUUID(),url:item.url,alt:item.alt||product.name||'',title:item.title||'',caption:item.caption||''});}
  if(!featured)featured=images[0]?.id||'';if(!thumbnail)thumbnail=featured;
 }
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-media-action]');if(!button||uploading||disposed)return;
  const action=button.dataset.mediaAction,id=button.closest('[data-image-id]')?.dataset.imageId,index=images.findIndex(i=>i.id===id);
  try{
   if(action==='picker'){picker=!picker;renderPicker();return;}
   if(action==='close-picker'){picker=false;renderPicker();return;}
   if(action==='previous-page'||action==='next-page'){page+=action==='next-page'?1:-1;renderPicker();return;}
   if(action==='add-picked'){add(media.filter(m=>selected.has(m.id)));selected.clear();picker=false;render();return;}
   if(index<0)return;
   if(action==='featured')featured=id;
   if(action==='thumbnail')thumbnail=id;
   if(action==='remove'){images.splice(index,1);if(featured===id)featured=images[0]?.id||'';if(thumbnail===id)thumbnail=featured;}
   if(action==='up'&&index>0)[images[index-1],images[index]]=[images[index],images[index-1]];
   if(action==='down'&&index+1<images.length)[images[index+1],images[index]]=[images[index],images[index+1]];
   render(action==='remove'?null:id,action);
  }catch(error){status(error.message,true);}
 });
 root.addEventListener('input',event=>{
  if(disposed)return;
  if(event.target.matches('[data-media-search]')){const caret=event.target.selectionStart;query=event.target.value;page=0;renderPicker();const input=root.querySelector('[data-media-search]');input.focus();input.setSelectionRange(caret,caret);return;}
  const field=event.target.dataset.imageField,id=event.target.closest('[data-image-id]')?.dataset.imageId,img=images.find(i=>i.id===id);if(img&&['alt','title','caption'].includes(field))img[field]=event.target.value;
 });
 root.addEventListener('change',async event=>{
  if(disposed)return;
  if(event.target.matches('[data-pick-image]')){event.target.checked?selected.add(event.target.dataset.pickImage):selected.delete(event.target.dataset.pickImage);renderPicker();return;}

 });
 render();
 return {get busy(){return uploading;},value(){return {images:structuredClone(images),featuredImageId:featured,thumbnailImageId:thumbnail};},dispose(){disposed=true;uploader?.dispose();}};
}
