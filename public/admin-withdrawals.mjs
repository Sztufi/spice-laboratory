import {escapeHtml as h} from './html-escape.mjs';
export async function mountWithdrawals(root,api){
 let page=1;
 const load=async()=>{
  try{const result=await api('/withdrawals?page='+page);if(!root.isConnected)return;
   root.innerHTML=`<section class="admin-card"><h2>ELÁLLÁSI NYILATKOZATOK</h2><p>${result.total} nyilatkozat. Az űrlap nem ellenőrzi a rendelés tulajdonosát és nem indít pénzvisszatérítést. Az ügyintézés előtt azonosítsd az ügyet.</p>${result.mailReady?'':'<p class="admin-hint">Az e-mailes elismervények küldése még nincs aktiválva. A függő elismervényekről gondoskodj az ügyfélszolgálati levelezésben.</p>'}${result.requests.map(r=>`<article class="admin-card"><h3>${h(r.order_reference)}</h3><p>${h(r.name)} · ${h(r.email)}<br>${h(r.created_at)} · ${h(r.id)}</p><p>${h(r.content)}</p><p>Elismervény: ${h(r.email_status)}</p>${r.email_status!=='sent'?`<button class="small-button" type="button" data-resend="${h(r.id)}"${result.mailReady?'':' disabled'}>Elismervény újraküldése</button>`:''}</article>`).join('')}<div class="row-actions"><button class="button light" data-withdrawal-page="${page-1}"${page<=1?' disabled':''}>Előző</button><span>${page}. oldal</span><button class="button light" data-withdrawal-page="${page+1}"${page*50>=result.total?' disabled':''}>Következő</button></div><p role="status" data-withdrawal-notice></p></section>`;
  }catch(error){root.textContent=error.message;}
 };
 root.addEventListener('click',async event=>{
  const next=event.target.closest('[data-withdrawal-page]');if(next&&!next.disabled){page=Number(next.dataset.withdrawalPage);await load();return;}
  const resend=event.target.closest('[data-resend]');if(resend&&!resend.disabled){resend.disabled=true;try{const result=await api('/withdrawals/'+encodeURIComponent(resend.dataset.resend)+'/receipt','POST',{});await load();root.querySelector('[data-withdrawal-notice]').textContent=result.sent?'A levélküldő átvette az elismervényt.':'A küldés továbbra is függőben van.';}catch(error){resend.disabled=false;root.querySelector('[data-withdrawal-notice]').textContent=error.message;}}
 });
 await load();
}
