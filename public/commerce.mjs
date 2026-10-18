let config={stripeEnabled:false,newsletterEnabled:false};
let checkoutAttempt=null;
const notice=message=>window.dispatchEvent(new CustomEvent('spice:notice',{detail:message}));
export function getCommerceConfig(){return config;}
export async function commerceApi(path,options={}){
 const response=await fetch('/api/commerce/'+path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:AbortSignal.timeout(18000)});
 const result=await response.json();if(!response.ok){const error=new Error(result.error||'A művelet most nem sikerült.');error.status=response.status;throw error;}return result;
}
export async function startStripeCheckout(cart,selection){
 const fingerprint=JSON.stringify({cart,checkoutMode:selection.checkoutMode,country:selection.country,shippingMethodId:selection.methodId});
 if(checkoutAttempt?.fingerprint!==fingerprint)checkoutAttempt={fingerprint,requestId:crypto.randomUUID()};
 try{
 if(selection.checkoutMode==='guest')await commerceApi('checkout-access',{method:'POST',body:'{}'});
 const result=await commerceApi('checkout',{method:'POST',body:JSON.stringify({items:cart,requestId:checkoutAttempt.requestId,checkoutMode:selection.checkoutMode,country:selection.country,shippingMethodId:selection.methodId})});
 if(!result.url?.startsWith('https://checkout.stripe.com/'))throw new Error('Hibás fizetési hivatkozás.');
 window.location.assign(result.url);
 }catch(error){if(error.status===409)checkoutAttempt=null;throw error;}
}
async function refreshMarketing(){
 const form=document.querySelector('#newsletter-form'),status=document.querySelector('#newsletter-status');if(!form||!status)return;
 const submit=form.querySelector('button'),check=form.querySelector('input');
 if(!config.newsletterEnabled){status.textContent='A hírlevél hamarosan indul. A feliratkozás még nem aktív.';submit.disabled=true;check.disabled=true;return;}
 try{const data=await commerceApi('marketing');
 form.dataset.authenticated='true';document.querySelector('#newsletter-email').textContent=data.email;
 const subscribed=data.status==='subscribed';
 if(subscribed){check.checked=true;submit.textContent=data.syncStatus==='synced'?'LEIRATKOZOM':'SZINKRONIZÁLÁS ÚJRA';status.textContent=data.syncStatus==='synced'?'Feliratkoztál. Bármikor leiratkozhatsz.':'A hozzájárulásod mentve, az Omnisend-szinkron még nem sikerült.';}
 else{check.checked=false;submit.textContent=data.status==='unsubscribed'&&data.syncStatus!=='synced'?'LEIRATKOZÁS ÚJRA':'FELIRATKOZOM';status.textContent=data.syncStatus==='failed'?'A leiratkozást elmentettük, de az Omnisend még nem igazolta vissza. Próbáld újra.':'';}
 form.dataset.status=data.status;form.dataset.subscribed=String(subscribed);form.dataset.synced=String(data.syncStatus==='synced');check.disabled=subscribed;
 submit.disabled=false;
 }catch(error){submit.disabled=true;check.disabled=true;status.textContent=error.status===401?'A feliratkozáshoz jelentkezz be a fiókodba.':'A feliratkozási beállítások most nem érhetők el.';}
}
export async function initCommerce(onPayment){
 document.querySelector('#newsletter-login')?.addEventListener('click',()=>document.querySelector('#open-account')?.click());
 document.querySelector('#newsletter-form')?.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.target,button=form.querySelector('button'),status=document.querySelector('#newsletter-status');
 const subscribed=form.dataset.subscribed==='true';const shouldSubscribe=form.dataset.status==='unsubscribed'&&form.dataset.synced!=='true'?false:subscribed&&form.dataset.synced!=='true'?true:!subscribed;
 if(shouldSubscribe&&!form.querySelector('input').checked){status.textContent='Jelöld be a hozzájárulást a feliratkozáshoz.';return;}
 button.disabled=true;status.textContent='Mentés…';
 try{const data=await commerceApi('marketing',{method:'PUT',body:JSON.stringify({subscribed:shouldSubscribe,consentVersion:config.consentVersion})});await refreshMarketing();if(!data.synced)status.textContent='A kérésedet elmentettük, de az Omnisend még nem igazolta vissza. Próbáld újra később.';}
 catch(error){status.textContent=error.message;button.disabled=false;}
 });
 try{config=await commerceApi('config');}catch{}
 if(config.stripeEnabled){
  const modeLabel=config.mode==='test'?'STRIPE TESZTMÓD':'WEBSHOP';
  const note=document.querySelector('.source-note');
  if(note)for(const node of note.childNodes)if(node.nodeType===3)node.textContent=node.textContent.replace('WEBSHOP DEMÓ',modeLabel).replace('A demó nem fogad valódi rendelést vagy fizetést.',config.mode==='test'?'A Stripe tesztmód nem mozgat valódi pénzt.':'Fizetés a Stripe felületén.');
  const footer=document.querySelector('.footer-links small');if(footer)footer.textContent='UNALMAS KAJA KIZÁRVA. · '+modeLabel;
 }
 window.dispatchEvent(new CustomEvent('spice:commerce-ready'));
 await refreshMarketing();
 const params=new URLSearchParams(window.location.search);
 if(params.get('payment')==='cancelled'){notice('A fizetést megszakítottad. A kosarad megmaradt.');params.delete('payment');history.replaceState(null,'',window.location.pathname+(params.size?'?'+params:'')+window.location.hash);}
 if(params.get('payment')==='success'){
 const session=params.get('session_id');
 try{const result=await commerceApi('checkout-status?session_id='+encodeURIComponent(session||''));await onPayment?.({...result,sessionId:session});if(result.status==='paid'){params.delete('payment');params.delete('session_id');history.replaceState(null,'',window.location.pathname+(params.size?'?'+params:'')+window.location.hash);}else notice('A fizetés még nincs visszaigazolva. A kosarad megmaradt.');}
 catch(error){notice('A fizetést még nem tudtuk ellenőrizni. Frissítsd az oldalt az újrapróbálkozáshoz. A kosarad megmaradt.');}
 }
}
