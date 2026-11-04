const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let loading;
function loadMap(){
 if(customElements.get('gls-dpm'))return Promise.resolve();
 if(!loading)loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://map.gls-hungary.com/widget/gls-dpm.js';script.type='module';
  const timer=setTimeout(()=>reject(new Error('A GLS térkép nem töltődött be. Próbáld újra, vagy válaszd a házhozszállítást.')),20000);
  script.onerror=()=>{clearTimeout(timer);reject(new Error('A GLS térkép most nem érhető el.'));};
  customElements.whenDefined('gls-dpm').then(()=>{clearTimeout(timer);resolve();});document.head.append(script);
 }).catch(error=>{loading=null;throw error;});
 return loading;
}
export function mountLockerPicker({form,footer,selection,quote}){
 if(quote?.deliveryType!=='gls-locker'){delete selection.customer.pickupPoint;return;}
 const shippingField=form.querySelector('#shipping-name')?.closest('fieldset');
 if(shippingField){shippingField.querySelector('legend').textContent='SAJÁT CÍMED';shippingField.insertAdjacentHTML('afterbegin','<p class="demo-note">A számlázáshoz és tartalék kézbesítési címként kérjük. A csomagod a kiválasztott automatába érkezik.</p>');}
 const field=form.querySelector('[name="shipping-method"]')?.closest('fieldset');if(!field)return;
 const panel=document.createElement('section');panel.className='locker-picker';panel.setAttribute('aria-label','GLS csomagautomata kiválasztása');
 panel.innerHTML='<p><strong>HOL VESZED ÁT?</strong></p><p data-locker-selected role="status">Még nem választottál csomagautomatát.</p><button type="button" class="secondary-button" data-locker-open>AUTOMATA KIVÁLASZTÁSA</button><p class="demo-note">A térképet a GLS szolgáltatja. Megnyitásakor a böngésződ kapcsolatba lép a GLS-sel.</p><p data-locker-error role="alert" hidden></p><div data-locker-map hidden style="height:480px;max-height:65vh;min-height:320px;width:100%;margin-top:16px"></div>';
 field.append(panel);
 const summary=panel.querySelector('[data-locker-selected]'),button=panel.querySelector('button'),host=panel.querySelector('[data-locker-map]'),error=panel.querySelector('[data-locker-error]');
 const valid=()=>!!selection.customer.pickupPoint?.id&&selection.customer.pickupPoint.country===selection.country;
 const update=()=>{const p=selection.customer.pickupPoint;if(valid())summary.innerHTML=`<strong>${h(p.name)}</strong><br>${h(p.postalCode)} ${h(p.city)}, ${h(p.address)}`;else summary.textContent='Még nem választottál csomagautomatát.';button.textContent=valid()?'MÁSIK AUTOMATÁT VÁLASZTOK':'AUTOMATA KIVÁLASZTÁSA';};update();
 const guard=e=>{if(valid())return;e.preventDefault();e.stopImmediatePropagation();error.hidden=false;error.textContent='A folytatáshoz válassz csomagautomatát.';button.focus();};
 form.addEventListener('submit',guard,true);footer.querySelector('#stripe-pay')?.addEventListener('click',guard,true);
 button.addEventListener('click',async()=>{
  button.disabled=true;error.hidden=true;
  try{await loadMap();if(!panel.isConnected)return;host.hidden=false;host.innerHTML='<gls-dpm country="hu" language="hu" filter-type="parcel-locker" style="display:block;height:100%;width:100%"></gls-dpm>';
   host.firstElementChild.addEventListener('change',event=>{
    const p=event.detail;if(!p?.id||p.contact?.countryCode?.toUpperCase()!=='HU'){error.hidden=false;error.textContent='Válassz magyarországi GLS automatát.';return;}
    selection.customer.pickupPoint={id:p.id,name:p.name,country:'HU',postalCode:p.contact.postalCode,city:p.contact.city,address:p.contact.address};
    update();error.hidden=true;host.hidden=true;host.replaceChildren();button.focus();
   });
  }catch(e){error.hidden=false;error.textContent=e.message;}finally{button.disabled=false;}
 });
}
