let scriptReady,initialization,challenge,successCallback,statusRoot;
async function api(path,body){
 const response=await fetch('/api/auth/google/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'A Google-belépés nem sikerült.');return data;
}
function loadScript(){
 if(window.google?.accounts?.id)return Promise.resolve();
 if(!scriptReady)scriptReady=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  const timeout=setTimeout(()=>{script.remove();scriptReady=null;reject(new Error('A Google-belépés betöltése nem sikerült. Próbáld újra.'));},15000);
  script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);script.remove();scriptReady=null;reject(new Error('A Google-belépés nem érhető el.'));};document.head.append(script);
 });
 return scriptReady;
}
function status(message){const node=statusRoot?.querySelector('[data-google-status]');if(node)node.textContent=message;}
async function initialize(){
 const config=await api('config');if(!config.enabled)throw new Error('A Google-belépés ezen a webcímen még nem érhető el.');
 await loadScript();
 challenge=await api('challenge',{});
 window.google.accounts.id.initialize({client_id:challenge.clientId,nonce:challenge.nonce,auto_select:false,ux_mode:'popup',callback:async response=>{
  status('Belépés ellenőrzése…');
  try{await api('login',{credential:response.credential});await successCallback?.();}
  catch(error){initialization=null;status(error.message+' Kattints az újrapróbálásra.');}
 }});
 return Date.now();
}
export async function mountGoogleLogin(root,onSuccess,reset=false){
 statusRoot=root;
 const button=root.querySelector('[data-google-button]');if(!button)return;
 if(button.dataset.googleMounted==='true'&&!reset)return;
 button.dataset.googleMounted='true';
 if(reset)initialization=null;
 const retry=root.querySelector('[data-google-retry]');if(retry)retry.disabled=true;
 successCallback=onSuccess;status('Google-belépés betöltése…');
 try{
  if(!initialization)initialization=initialize().catch(error=>{initialization=null;throw error;});
  const created=await initialization;
  if(Date.now()-created>8*60000){initialization=null;return mountGoogleLogin(root,onSuccess,true);}
  if(!button.isConnected)return;
  button.replaceChildren();
  window.google.accounts.id.renderButton(button,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',locale:'hu',width:Math.min(360,Math.max(200,root.clientWidth||300))});status('');
 }catch(error){button.dataset.googleMounted='false';if(button.isConnected)status(error.message);}
 finally{if(retry?.isConnected)retry.disabled=false;}
}
export async function logoutGoogle(){
 await api('logout',{});window.google?.accounts?.id.disableAutoSelect();initialization=null;
}
