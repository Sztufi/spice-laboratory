import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {styleIcons,brandIcon} from '../public/brand-icons.mjs';
import {renderSitePage} from '../server/pages.mjs';
test('icon formatting preserves data, charts and readable multiplication and is idempotent',()=>{
 const protectedMarkup='<script type="application/json">{"name":"→ × +"}</script><style>.x:after{content:"→"}</style><textarea>→</textarea><input value="→"><svg viewBox="0 0 960 220" role="img"><path d="M0 0"/></svg><p>2 × 2750 Ft</p>';
 assert.equal(styleIcons(protectedMarkup),protectedMarkup);
 const html=styleIcons('<button aria-label="Bezárás">×</button><button>→</button><button>−</button>');
 assert.match(html,/data-brand-icon="close"/);assert.match(html,/data-brand-icon="arrow"/);assert.match(html,/data-brand-icon="minus"/);
 assert.equal(styleIcons(html),html);assert.match(brandIcon('heart'),/aria-hidden="true"/);
});
test('all storefront page types use the shared icon system including header, dialogs and menu',()=>{
 const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8');
 for(const pathname of ['/','/termekek','/termek/rooster-booster','/fiok','/blog','/gyik']){
  const {html}=renderSitePage(base,{pathname});
  assert.match(html,/brand-icons.css/);assert.match(html,/data-brand-icon="menu"/);assert.match(html,/data-brand-icon="bag"/);
  assert.ok(!/<svg[^>]*viewBox="0 0 24 24"/.test(html),pathname);
 }
});
