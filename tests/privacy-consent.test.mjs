import test from 'node:test';
import assert from 'node:assert/strict';
import {readChoice,trackingAllowed,initPrivacy,CONSENT_KEY} from '../public/privacy-consent.mjs';
test('consent rejects corrupt, expired and future decisions',()=>{
 const now=Date.now();
 for(const raw of ['bad','null',JSON.stringify({version:1,marketing:'true',decidedAt:now}),JSON.stringify({version:1,marketing:true,decidedAt:now-181*86400000}),JSON.stringify({version:1,marketing:true,decidedAt:now+1000})])assert.equal(readChoice(raw,now),null);
 assert.equal(readChoice(JSON.stringify({version:1,marketing:false,decidedAt:now}),now).marketing,false);
});
test('tracking excludes account, checkout, callbacks and token-bearing URLs',()=>{
 for(const path of ['/fiok','/admin','/kosar','/api/auth/google','/termek/paprika?token=secret','/?payment=success','/#magic=secret','/blog/recept?utm_source=mail'])assert.equal(trackingAllowed('https://spicelaboratory.eu'+path),false,path);
 for(const path of ['/','/termek/paprika','/termekek','/blog/recept'])assert.equal(trackingAllowed('https://spicelaboratory.eu'+path),true,path);
});
test('no external script before grant; single load; withdrawal prevents reload tracking',async()=>{
 const buttons={},scripts=[],saved=new Map(),events={};let reloads=0;
 const button=key=>buttons[key]??={addEventListener:(_,fn)=>buttons[key].click=fn,focus(){}};
 const panel={hidden:true,querySelector:selector=>button(selector)};
 const doc={cookie:'',activeElement:null,querySelector:s=>s==='#privacy-choice'?panel:null,querySelectorAll:()=>[],head:{append:s=>scripts.push(s)},createElement:()=>({addEventListener:(name,fn)=>events[name]=fn})};
 const win={document:doc,location:{href:'https://spicelaboratory.eu/',hostname:'spicelaboratory.eu',pathname:'/',reload:()=>reloads++},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},addEventListener(){},setTimeout,clearTimeout};
 initPrivacy(win);assert.equal(scripts.length,0);assert.equal(panel.hidden,false);
 buttons['[data-privacy-reject]'].click();assert.equal(scripts.length,0);assert.equal(readChoice(saved.get(CONSENT_KEY)).marketing,false);
 buttons['[data-privacy-accept]'].click();buttons['[data-privacy-accept]'].click();assert.equal(scripts.length,1);
 assert.deepEqual(win.omnisend,[['brandID','6ad63163b4aa089441abd81f'],['track','$pageViewed']]);
 const flags=[];win.__omnisendCookieConsent={getConsentAPI:async()=>({consentManager:{setConsent:v=>flags.push(v)}})};
 await events.load();assert.equal(flags.at(-1).marketing,true);
 buttons['[data-privacy-reject]'].click();assert.equal(flags.at(-1).marketing,false);assert.equal(reloads,1);
 scripts.length=0;initPrivacy(win);assert.equal(scripts.length,0);
});
