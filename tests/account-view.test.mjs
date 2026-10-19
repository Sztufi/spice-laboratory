import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSitePage} from '../server/pages.mjs';
const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8');
test('guest sees login entry and hidden account tools; signed-in customer sees account entry and tools',()=>{
 const guest=renderSitePage(base,{pathname:'/fiok',authenticated:false}).html;
 assert.match(guest,/id="account-page-login" data-login-root>/);
 assert.match(guest,/class="account-entry-grid" data-account-content hidden/);
 assert.match(guest,/aria-label="Belépés megnyitása"/);
 assert.match(guest,/<span>Belépés<\/span><svg[^>]*data-brand-icon="profile"/);
 const member=renderSitePage(base,{pathname:'/fiok',authenticated:true}).html;
 assert.match(member,/id="account-page-login" data-login-root hidden/);
 assert.match(member,/class="account-entry-grid" data-account-content>/);
 assert.match(member,/aria-label="Saját fiók megnyitása"/);
 assert.match(member,/<span>Saját fiók<\/span><svg[^>]*data-brand-icon="profile"/);
});
