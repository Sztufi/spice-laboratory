export const CONSENT_KEY='spice-lab:privacy-choice:v1';
const MAX_AGE=180*24*60*60*1000;
export function readChoice(raw,now=Date.now()){
 try{const value=JSON.parse(raw);return value?.version===1&&typeof value.marketing==='boolean'&&Number.isFinite(value.decidedAt)&&value.decidedAt<=now&&now-value.decidedAt<MAX_AGE?value:null;}catch{return null;}
}
export function trackingAllowed(url){
 const u=new URL(url),p=u.pathname.replace(/\/$/,'')||'/';
 return !u.search&&!u.hash&&(p==='/'||/^\/(termekek|termek|kategoria|blog)(\/|$)/.test(p)||['/rolunk','/kapcsolat','/gyik','/szallitas','/aszf','/adatkezeles','/sutik'].includes(p));
}
export function initPrivacy(win=document.defaultView){
 const doc=win.document,panel=doc.querySelector('#privacy-choice');if(!panel)return;
 let choice=null,loaded=false,api=null,returnFocus=null,timer=null,attempts=0;
 try{choice=readChoice(win.localStorage.getItem(CONSENT_KEY));}catch{}
 const clearTracking=()=>{
  const names=doc.cookie.split(';').map(x=>x.split('=')[0].trim()).filter(x=>/^omnisend/i.test(x)||x==='page-views');
  const host=win.location.hostname.split('.'),domains=['',...host.slice(0,-1).map((_,i)=>'; Domain='+host.slice(i).join('.'))];
  const parts=win.location.pathname.split('/'),paths=new Set(['/']);for(let i=1;i<=parts.length;i++)paths.add(parts.slice(0,i).join('/')||'/');
  for(const name of names)for(const domain of domains)for(const path of paths)doc.cookie=`${name}=; Max-Age=0; Path=${path}${domain}; SameSite=Lax; Secure`;
 };
 const signal=()=>api?.consentManager.setConsent({necessary:true,marketing:choice?.marketing===true,analytics:false,preferences:false});
 const load=()=>{
  if(loaded||!choice?.marketing||!trackingAllowed(win.location.href))return;
  loaded=true;
  win.omnisend=win.omnisend||[];
  win.omnisend.push(['brandID','6ad63163b4aa089441abd81f']);
  const script=doc.createElement('script');script.async=true;script.src='https://omnisnippet1.com/inshop/launcher-v2.js';
  // Consent is granted before either the SDK or its page-view event is queued.
  win.omnisend.push(['track','$pageViewed']);
  const connect=async()=>{
   if(!choice?.marketing)return;
   if(!win.__omnisendCookieConsent){if(++attempts<100)timer=win.setTimeout(connect,100);return;}
   try{api=await win.__omnisendCookieConsent.getConsentAPI({wait:true});signal();}catch{}
  };
  script.addEventListener('load',connect,{once:true});doc.head.append(script);
 };
 const show=()=>{returnFocus=doc.activeElement;panel.hidden=false;panel.querySelector('button')?.focus();};
 const save=marketing=>{
  choice={version:1,marketing,decidedAt:Date.now()};
  let saved=true;try{win.localStorage.setItem(CONSENT_KEY,JSON.stringify(choice));}catch{saved=false;}
  panel.hidden=true;returnFocus?.focus();signal();
  if(!marketing){win.clearTimeout(timer);clearTracking();if(loaded){win.location.reload();return;}}
  else load();
  if(!saved){const status=doc.querySelector('#privacy-storage-status');if(status){status.hidden=false;status.textContent='A böngésződ nem engedi a beállítás mentését. A választás ezen az oldalon érvényes; újratöltéskor újra megkérdezzük.';}}
 };
 panel.querySelector('[data-privacy-accept]').addEventListener('click',()=>save(true));
 panel.querySelector('[data-privacy-reject]').addEventListener('click',()=>save(false));
 doc.querySelectorAll('[data-privacy-settings]').forEach(button=>button.addEventListener('click',show));
 win.addEventListener('storage',event=>{if(event.key!==CONSENT_KEY)return;choice=readChoice(event.newValue);signal();if(!choice?.marketing){clearTracking();if(loaded){win.location.reload();return;}}else load();panel.hidden=!!choice;});
 panel.hidden=!!choice;if(choice?.marketing)load();else clearTracking();
}
if(typeof document!=='undefined')initPrivacy();
