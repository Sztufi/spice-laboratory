import {escapeHtml as h} from './html-escape.mjs';
import {prepareImage} from './image-upload.mjs';
export function mountMediaLibrary(root,{media,api,onSaved}){
 let busy=false;
 root.innerHTML=`<section class="admin-card"><h2>MÉDIATÁR</h2><p>A cím, alt szöveg és képaláírás alapérték új galériába választáskor. A már mentett termékképek saját szövegei külön szerkeszthetők.</p><label>Több kép feltöltése<input type="file" data-library-files accept="image/jpeg,image/png,image/webp" multiple></label><label>Keresés<input type="search" data-library-search></label><p data-library-notice role="status" aria-live="polite"></p></section><div class="inventory-grid">${media.map(m=>`<form class="admin-card media-library-card editor-form" data-library-id="${h(m.id)}"><img src="${h(m.url)}" alt="${h(m.alt||'')}" width="240" height="240" loading="lazy"><h3>${h(m.name)}${m.status==='archived'?' · ELREJTVE':''}</h3><p class="admin-hint">${m.width||'—'} × ${m.height||'—'} px · ${m.storedBytes?Math.round(m.storedBytes/1024)+' kB':'Korábbi feltöltés'} · ${h(m.fit==='cover'?'Középre vágott méretváltozatok':'Teljes kép')}</p><label>Alt szöveg<input name="alt" value="${h(m.alt||'')}" maxlength="300"></label><label>Cím<input name="title" value="${h(m.title||'')}" maxlength="180"></label><label>Képaláírás<textarea name="caption" rows="2" maxlength="500">${h(m.caption||'')}</textarea></label><div class="row-actions"><button type="submit" class="button yellow">MENTÉS</button><a class="button light" href="${h(m.url)}" target="_blank" rel="noopener">MEGNYITÁS</a>${m.status==='archived'?'<button class="small-button" type="button" data-library-restore>VISSZAÁLLÍTÁS</button>':'<button class="small-button danger" type="button" data-library-archive>ELREJTÉS</button>'}</div><p role="status" aria-live="polite"></p></form>`).join('')||'<p>Még nincs feltöltött kép.</p>'}</div>`;
 root.addEventListener('input',event=>{if(!event.target.matches('[data-library-search]'))return;const value=event.target.value.toLocaleLowerCase('hu');for(const card of root.querySelectorAll('[data-library-id]'))card.hidden=![card.textContent,...card.querySelectorAll('input,textarea')].map(v=>v.value??v).join(' ').toLocaleLowerCase('hu').includes(value);});
 async function save(form,archive=false,restore=false){
  if(busy)return;busy=true;const node=form.querySelector('[role=status]'),record=media.find(m=>m.id===form.dataset.libraryId),values=new FormData(form),button=form.querySelector('[type=submit]');button.disabled=true;node.textContent='Mentés…';
  try{await api('/media/'+encodeURIComponent(record.id),archive?'DELETE':'PUT',{...Object.fromEntries(values),revision:record.revision,...(restore?{status:'published'}:{})});await onSaved();}catch(error){node.textContent=error.message;}finally{busy=false;button.disabled=false;}
 }
 root.addEventListener('submit',event=>{if(!event.target.matches('[data-library-id]'))return;event.preventDefault();save(event.target);});
 root.addEventListener('click',event=>{if(event.target.closest('[data-library-archive]'))save(event.target.closest('form'),true);if(event.target.closest('[data-library-restore]'))save(event.target.closest('form'),false,true);});
 root.querySelector('[data-library-files]').addEventListener('change',async event=>{
  if(busy)return;const files=[...event.target.files];if(files.length>12){root.querySelector('[data-library-notice]').textContent='Egyszerre legfeljebb 12 képet válassz.';return;}
  busy=true;event.target.disabled=true;const errors=[];
  for(const [index,file] of files.entries()){
   root.querySelector('[data-library-notice]').textContent=`Feltöltés ${index+1}/${files.length} · ${file.name}`;
   try{const form=new FormData();form.append('file',await prepareImage(file));form.append('profile','product');form.append('fit','contain');await api('/media','POST',form);}catch(error){errors.push(file.name+': '+error.message);}
  }
  busy=false;await onSaved(errors.length?errors.join(' · '):undefined);
 });
}
