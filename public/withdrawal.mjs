const form=document.querySelector('[data-withdrawal-form]');
if(form){
 let requestId=crypto.randomUUID(),receiptUrl;
 const status=form.querySelector('[role="status"]'),button=form.querySelector('[type="submit"]'),download=document.querySelector('[data-withdrawal-receipt]');
 form.addEventListener('input',()=>{if(!button.disabled)requestId=crypto.randomUUID();});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const fields=new FormData(form);button.disabled=true;status.textContent='Nyilatkozat küldése…';
  try{
   const response=await fetch('/api/commerce/withdrawal',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,name:fields.get('name'),email:fields.get('email'),orderReference:fields.get('orderReference'),detail:fields.get('detail')||'',confirm:fields.has('confirm')}),signal:AbortSignal.timeout(20000)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'A küldés nem sikerült.');
   status.textContent=result.message+' Azonosító: '+result.id;
   if(receiptUrl)URL.revokeObjectURL(receiptUrl);receiptUrl=URL.createObjectURL(new Blob([result.receipt],{type:'text/plain;charset=utf-8'}));download.href=receiptUrl;download.download='elallas-'+result.id+'.txt';download.hidden=false;
  }catch(error){status.textContent=error.message+' Ha nincs visszaigazolás, az űrlap újraküldhető ugyanazzal az azonosítóval, vagy válaszd az e-mailes / postai utat.';}
  finally{button.disabled=false;}
 });
}
