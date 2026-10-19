import {escapeHtml as h} from './html-escape.mjs';
let configPromise;
async function api(path,body){
 const response=await fetch('/api/auth/magic/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Az e-mailes belépés nem sikerült.');return data;
}
export async function mountMagicForms(root){
 if(!root)return;
 for(const form of root.querySelectorAll('[data-magic-form]')){
  if(form.dataset.magicMounted==='true')continue;form.dataset.magicMounted='true';
  const button=form.querySelector('[type="submit"]'),status=form.querySelector('[data-magic-status]');
  try{
   if(!configPromise)configPromise=api('config').catch(error=>{configPromise=null;throw error;});
   const config=await configPromise;if(!form.isConnected)continue;
   button.disabled=!config.enabled;form.dataset.magicAvailable=String(config.enabled);status.textContent=config.enabled?'':'Az e-mailes belépés még nem aktív.';
   form.addEventListener('submit',async event=>{
    event.preventDefault();if(button.disabled)return;button.disabled=true;status.textContent='Küldjük a belépési linkedet…';
    try{const result=await api('request',{email:form.querySelector('[data-magic-email]').value,link:form.hasAttribute('data-link-account')});status.textContent=result.message;setTimeout(()=>{if(button.isConnected)button.disabled=false;},60000);}
    catch(error){status.textContent=error.message;button.disabled=false;}
   });
  }catch(error){if(form.isConnected){status.textContent=error.message;button.disabled=true;}}
 }
}
export async function redeemMagicLink(onSuccess){
 const match=location.hash.match(/^#magic=([a-f0-9]{64})$/);if(!match)return false;
 const token=match[1];history.replaceState(null,'',location.pathname+location.search);
 const root=document.querySelector('#account-page-login');if(!root)return false;
 root.dataset.magicPending='true';root.hidden=false;root.innerHTML='<p role="status">Belépési link ellenőrzése…</p>';
 try{
  const preview=await api('preview',{token});
  const verify=async confirm=>{await api('verify',{token,confirm});await onSuccess();};
  if(preview.sameBrowser){await verify(false);return true;}
  root.innerHTML=`<div class="account-welcome"><h3>EZ A TE FIÓKOD?</h3><p>Ezzel az e-mail-címmel fogsz belépni:</p><p><strong>${h(preview.email)}</strong></p><button class="primary-button yellow" type="button" data-confirm-magic>BELÉPEK EZZEL A CÍMMEL</button><p data-magic-confirm-status role="status"></p><a href="/fiok">Másik e-mail-címet használok</a></div>`;
  root.querySelector('[data-confirm-magic]').addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await verify(true);}catch(error){root.querySelector('[data-magic-confirm-status]').textContent=error.message;}});
 }catch(error){root.innerHTML=`<div class="account-welcome"><h3>EZ A LINK MÁR NEM JÁTSZIK.</h3><p role="alert">${h(error.message)}</p><a class="secondary-button" href="/fiok">ÚJ BELÉPÉSI LINKET KÉREK</a></div>`;}
 return true;
}
export async function logoutMagic(){await api('logout',{});}
