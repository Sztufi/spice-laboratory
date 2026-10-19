import test from 'node:test';
import assert from 'node:assert/strict';
import {domainRedirect} from '../server/domain-redirect.mjs';
test('www redirect preserves path and query and never redirects unrelated hosts',()=>{
 for(const method of ['GET','POST']){
  const response=domainRedirect(new Request('https://www.spicelaboratory.eu/termek/rooster-booster?utm_source=test',{method}));
  assert.equal(response.status,308);
  assert.equal(response.headers.get('Location'),'https://spicelaboratory.eu/termek/rooster-booster?utm_source=test');
 }
 for(const host of ['spicelaboratory.eu','spice-lab-unalmas-kaja.sztufi.chatgpt.site','www.spicelaboratory.eu.evil.test'])assert.equal(domainRedirect(new Request('https://'+host)),null);
});
