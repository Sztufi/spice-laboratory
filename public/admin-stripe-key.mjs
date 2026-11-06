export function mountStripeKey(root,api){
 const section=document.createElement('section');section.className='admin-card';
 section.innerHTML='<h2>Stripe fizetési kulcs</h2><p>Az új kulcs az azonos típusú korábbi kulcsot cseréli le. A mentés nem vált fizetési módot.</p><form class="editor-form"><label>Stripe Secret Key<input type="password" name="secretKey" autocomplete="new-password" autocapitalize="none" spellcheck="false" required maxlength="512" placeholder="sk_test_… vagy sk_live_…"></label><button class="button yellow" disabled>Kulcs mentése</button><p role="status" aria-live="polite">Állapot betöltése…</p></form>';
 root.prepend(section);const form=section.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]');
 const describe=s=>'Tesztkulcs: '+(s.test?'beállítva':'hiányzik')+' · Éles kulcs: '+(s.live?'beállítva':'hiányzik')+'.';
 const refresh=async(prefix='')=>{const s=await api('/stripe-key');status.textContent=prefix+describe(s)+(s.writable?'':' A titkosított tároló nem elérhető.');button.disabled=!s.writable;};
 refresh().catch(()=>{status.textContent='Nem sikerült betölteni a kulcstároló állapotát.';});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(button.disabled)return;button.disabled=true;
  const input=form.elements.secretKey;const value=input.value.trim();input.value='';
  try{await api('/stripe-key','PUT',{secretKey:value});await refresh('Kulcs mentve. ');}
  catch(error){status.textContent=error.message;button.disabled=false;}
 });
}
