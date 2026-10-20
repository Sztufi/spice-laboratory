import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productCard} from '../public/product-markup.mjs';
import {seedCatalogue} from '../public/catalogue.mjs';
import {renderSitePage} from '../server/pages.mjs';
const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8');
test('product images and names are native full-page links with separate cart and favorite buttons',()=>{
 for(const product of seedCatalogue.products){
  const card=productCard(product);
  assert.ok(card.includes(`<a class="product-visual" href="/termek/${product.id}"`));
  assert.ok(card.includes(`<a class="product-title" href="/termek/${product.id}"`));
  assert.ok(card.includes(`data-favorite="${product.id}"`));assert.ok(card.includes('data-action="add"'));
  assert.ok(!card.includes('data-action="detail"'));assert.ok(!card.includes('aria-haspopup'));assert.ok(!card.includes('product-peek'));
 }
});
test('quick-view modal and triggers are absent from home, listing, category, product and recipe pages',()=>{
 for(const path of ['/','/termekek','/kategoria/grill-bbq','/termek/rooster-booster','/blog/ropogos-krumpli-fokhagymas-dippel']){
  const {html,status}=renderSitePage(base,{pathname:path});assert.equal(status,200,path);
  assert.ok(!html.includes('id="product-dialog"'),path);assert.ok(!html.includes('data-action="detail"'),path);
  assert.ok(html.includes('<a class="product-visual" href="/termek/'),path);
 }
 const script=readFileSync(new URL('../public/shop.mjs',import.meta.url),'utf8');assert.ok(!script.includes('product-dialog'));assert.ok(!script.includes('showProduct'));
 const account=readFileSync(new URL('../public/account.mjs',import.meta.url),'utf8');assert.ok(account.includes('<a class="account-favorite-photo" href="/termek/'));assert.ok(!account.includes('data-action="detail"'));
});

test('product edit shortcut is owner-only and targets the exact product, without exposing it to shoppers',()=>{
 for(const product of seedCatalogue.products){
  const pathname='/termek/'+product.id;
  for(const options of [{},{authenticated:true,isAdmin:false}]){
   assert.ok(!renderSitePage(base,{pathname,...options}).html.includes('class="product-admin-edit"'));
  }
  const admin=renderSitePage(base,{pathname,authenticated:true,isAdmin:true}).html;
  assert.ok(admin.includes(`href="/admin?tab=products&amp;editProduct=${encodeURIComponent(product.id)}"`));
  assert.match(admin,/class="product-admin-edit"[^>]*>.*Termék szerkesztése/);
 }
 assert.ok(!renderSitePage(base,{pathname:'/termekek',isAdmin:true}).html.includes('class="product-admin-edit"'));
});
