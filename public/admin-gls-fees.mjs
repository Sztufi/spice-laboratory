const rates=[
 {id:'hu-home',name:'GLS házhozszállítás'},
 {id:'hu-locker',name:'GLS csomagautomata'}
];
function target(method,rate){
 return method.country==='HU'&&method.id===rate.id&&
  (rate.id==='hu-locker'?method.deliveryType==='gls-locker':(!method.deliveryType||method.deliveryType==='home'));
}
export function withGlsFees(methods,values){
 const fees=new Map();
 for(const rate of rates){
  if(!methods.some(m=>target(m,rate)))throw new Error('Hiányzó GLS szállítási mód. Ellenőrizd a szállítási beállításokat.');
  const raw=values.get(rate.id);
  if(typeof raw!=='string'||!/^\d+$/.test(raw)||Number(raw)>100000)throw new Error('A szállítási díj 0 és 100 000 Ft közötti egész szám lehet.');
  fees.set(rate.id,Number(raw)*100);
 }
 return methods.map(m=>rates.some(rate=>target(m,rate))?{...m,feeMinor:fees.get(m.id)}:m);
}
export function mountGlsFees(panel,data,api,refresh,notice){
 const methods=data.config.shippingMethods;
 const section=document.createElement('section');
 section.className='admin-card';
 section.innerHTML='<h2>GLS szállítási díjak</h2><p>Magyarországi díjak rendelésenként. A mentett árakat a pénztár használja.</p>';
 panel.prepend(section);
 if(rates.some(rate=>!methods.some(m=>target(m,rate)))){
  section.insertAdjacentHTML('beforeend','<p>Az egyik szállítási mód hiányzik. Ellenőrizd a Beállítások → Szállítás részt.</p>');return;
 }
 section.insertAdjacentHTML('beforeend','<form class="editor-form settings-form"><div class="form-two">'+rates.map(rate=>{
  const method=methods.find(m=>target(m,rate));
  return '<label>'+rate.name+' (Ft)<input type="number" name="'+rate.id+'" inputmode="numeric" min="0" max="100000" step="1" required value="'+(method.feeMinor/100)+'"></label>';
 }).join('')+'</div><button type="submit" class="button yellow">Díjak mentése</button><p class="editor-error" role="alert" hidden></p></form>');
 const form=section.querySelector('form'),button=form.querySelector('button'),error=form.querySelector('[role=alert]');
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(button.disabled)return;button.disabled=true;error.hidden=true;
  try{
   const updated=withGlsFees(methods,new FormData(form));
   await api('/settings/shipping','PUT',{id:'shipping',status:'published',revision:data.settings.find(s=>s.id==='shipping')?.revision||'new',methods:updated});
   await refresh();notice('A GLS szállítási díjakat elmentettük.',true);
  }catch(e){error.textContent=e.message;error.hidden=false;}finally{button.disabled=false;}
 });
}
