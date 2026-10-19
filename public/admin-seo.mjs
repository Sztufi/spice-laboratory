import {styleIcons} from './brand-icons.mjs';
import {seoPages} from './seo-data.mjs';
import {escapeHtml as h} from './product-markup.mjs';
export function seoFields(value={},prefix='edit'){
return `<fieldset class="seo-fields"><legend>SEO / keresési megjelenés</legend><p class="admin-hint">Üres cím és leírás esetén az oldal tartalmából készül alapérték. A Google átírhatja a megjelenített címet és kivonatot. A karakterszám nem rangsorolási pontszám.</p><label class="field" for="${prefix}-seoTitle">SEO-cím<input id="${prefix}-seoTitle" name="seoTitle" maxlength="120" value="${h(value.title||'')}" data-seo-title></label><small data-seo-title-count></small><label class="field" for="${prefix}-seoDescription">Metaleírás<textarea id="${prefix}-seoDescription" name="seoDescription" maxlength="500" rows="3" data-seo-description>${h(value.description||'')}</textarea></label><small data-seo-description-count></small><label class="field" for="${prefix}-focusKeyword">Célkulcsszó / keresési szándék – belső szerkesztői jegyzet<input id="${prefix}-focusKeyword" name="focusKeyword" maxlength="160" value="${h(value.focusKeyword||'')}"></label><p class="admin-hint">Nem meta keywords. A Google nem használja ezt a mezőt rangsorolásra. A témát természetesen a látható címsorban, szövegben és leírásban dolgozd fel.</p><label class="check-field"><input type="checkbox" name="seoNoindex"${value.noindex?' checked':''}>Ne kerüljön keresőindexbe (noindex)</label><div class="seo-preview" aria-label="Szemléltető keresési előnézet"><small>ELŐNÉZET · nem tényleges Google-találat</small><strong data-seo-preview-title></strong><p data-seo-preview-description></p></div></fieldset>`;
}
export const seoInput=values=>({title:String(values.get('seoTitle')||''),description:String(values.get('seoDescription')||''),focusKeyword:String(values.get('focusKeyword')||''),noindex:values.has('seoNoindex')});
export function mountSeoPreview(root,fallback={}){
 const title=root.querySelector('[data-seo-title]'),description=root.querySelector('[data-seo-description]');
 if(!title||!description)return;
 const paint=()=>{
  root.querySelector('[data-seo-title-count]').textContent=title.value.length+' karakter · a megjelenítés képernyőszélességtől függ';
  root.querySelector('[data-seo-description-count]').textContent=description.value.length+' karakter';
  root.querySelector('[data-seo-preview-title]').textContent=title.value||fallback.title||'Automatikus oldal-cím';
  root.querySelector('[data-seo-preview-description]').textContent=description.value||fallback.description||'Az oldal tartalmából készülő leírás.';
 };
 title.addEventListener('input',paint);description.addEventListener('input',paint);paint();
}
const setting=data=>data.settings.find(s=>s.id==='seo')||{};
export function seoPanel(data){
 const settings=setting(data),state=data.seoState||{},rows=[
  ...seoPages.map(page=>({path:page.path,name:page.label,seo:settings.pages?.[page.path],defaults:page})),
  ...data.catalogue.products.filter(p=>p.status==='published').map(p=>({path:'/termek/'+p.id,name:p.name,seo:p.seo,edit:'products',id:p.id})),
  ...data.catalogue.categories.filter(c=>c.status==='published').map(c=>({path:'/kategoria/'+(c.slug||c.id),name:c.label,seo:c.seo,edit:'categories',id:c.id})),
  ...data.recipes.filter(r=>r.status==='published').map(r=>({path:'/blog/'+r.id,name:r.title,seo:r.seo,edit:'recipes',id:r.id,missingImage:!r.image}))
 ];
 const titles=rows.map(r=>r.seo?.title||r.defaults?.title||'');
 return `<section class="admin-card"><h2>KERESŐLÁTHATÓSÁG</h2><p class="seo-status">${state.enabled?'Az alkalmazás engedélyezi az indexelést. Ez nem bizonyítja, hogy a Google már indexelte az oldalt.':'Az indexelés jelenleg tiltott. A privát előnézet nem alkalmas Google-indexelésre.'}</p><p>Az élesítés két külön feltétele: nyilvános tárhelyhozzáférés szerveroldali megerősítéssel és az alábbi engedély. Ez az űrlap nem teszi nyilvánossá az oldalt.</p><form id="seo-settings-form" class="editor-form"><label class="check-field"><input type="checkbox" name="indexingEnabled"${settings.indexingEnabled?' checked':''}>Kérem a nyilvános oldal indexelésének engedélyezését</label><p class="admin-hint">Nyilvános tárhely megerősítése: ${state.publicConfirmed?'beállítva':'nincs beállítva – az engedély önmagában nem aktiválja az indexelést'}.</p><label class="field" for="seo-verification">Google Search Console HTML-ellenőrzőkód – csak a content értéke<input id="seo-verification" name="verification" maxlength="200" pattern="[A-Za-z0-9_-]*" value="${h(settings.verification||'')}"></label><button type="submit" class="button yellow">SEO-BEÁLLÍTÁSOK MENTÉSE</button><p role="status" data-seo-status></p></form><div class="row-actions"><a class="button light" href="/sitemap.xml" target="_blank" rel="noopener">XML oldaltérkép ↗</a><a class="button light" href="/robots.txt" target="_blank" rel="noopener">robots.txt ↗</a><a class="button light" href="https://search.google.com/search-console" target="_blank" rel="noopener">Search Console ↗</a></div></section><section class="admin-card"><h2>OLDALANKÉNTI SEO</h2><p>A főoldal és a tájékoztató oldalak itt szerkeszthetők. A termékek, kategóriák és receptek SEO-mezői a saját szerkesztőjükben találhatók. Az alábbi ellenőrzések a mentett adatokra vonatkoznak, nem külső rangsorokra.</p><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th scope="col">Oldal</th><th scope="col">SEO-beállítás</th><th scope="col">Tartalmi ellenőrzés</th><th scope="col">Művelet</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td><a href="${h(r.path)}" target="_blank" rel="noopener">${h(r.name)}</a><small>${h(r.path)}</small></td><td>${h(r.seo?.title||r.defaults?.title||'Automatikus cím a tartalomból')}<small>${h(r.seo?.focusKeyword||r.defaults?.focusKeyword||'Célkulcsszó nincs megadva')}</small></td><td>${(r.seo?.noindex??r.defaults?.noindex)?'Oldalszintű noindex':'A globális indexelési engedélyt követi'}${r.missingImage?'<small>Hiányzik az ételfotó: Recipe rich result nincs bekapcsolva.</small>':''}${titles[i]&&titles.filter(t=>t===titles[i]).length>1?'<small>Ismétlődő egyedi SEO-cím: ellenőrizd.</small>':''}</td><td>${r.edit?`<button type="button" class="small-button" data-edit="${r.edit}" data-id="${h(r.id)}">Szerkesztés</button>`:`<button type="button" class="small-button" data-seo-page="${h(r.path)}">SEO szerkesztése</button>`}</td></tr>`).join('')}</tbody></table></div></section><section class="admin-card" id="seo-page-editor" hidden></section><section class="admin-card"><h2>ÉLESÍTÉS UTÁNI MÉRÉS</h2><ol><li>Search Console-tulajdon igazolása, majd a /sitemap.xml beküldése.</li><li>URL Inspection: indexelhetőség és ténylegesen kiválasztott canonical ellenőrzése.</li><li>Rich Results Test: termékek és ételfotós receptek ellenőrzése.</li><li>PageSpeed Insights: LCP, INP és CLS vizsgálata mobilon; nincs jelenleg igazolt sebességpontszám.</li><li>Havonta: nem márkás keresések, megjelenések, kattintások, CTR, organikus rendelés és bevétel. Search Console-adatimport még nincs bekötve.</li></ol><p>Az indexelés és a rich result nem garantált. Nincs kitalált értékelés, keresési volumen, SEO-pontszám vagy forgalmi ígéret.</p></section>`;
}
const mounts=new WeakMap();
export function mountSeoPanel(root,data,api,refresh){
 mounts.get(root)?.();
 const settings=setting(data);
 const onClick=event=>{
  const button=event.target.closest('[data-seo-page]');if(!button)return;
  const path=button.dataset.seoPage,defaults=seoPages.find(p=>p.path===path);if(!defaults)return;
  const value={...defaults,...settings.pages?.[path]};
  const editor=root.querySelector('#seo-page-editor');editor.hidden=false;
  editor.innerHTML=styleIcons(`<h2>${h(defaults.label)} · SEO</h2><form id="seo-page-form" data-path="${h(path)}" class="editor-form">${seoFields(value,'seo-page')}<button type="submit" class="button yellow">OLDAL SEO MENTÉSE</button><p role="status" data-seo-status></p></form>`);
  mountSeoPreview(editor,defaults);editor.querySelector('input')?.focus();
 };
 const onSubmit=async event=>{
  const form=event.target;if(!['seo-settings-form','seo-page-form'].includes(form.id))return;event.preventDefault();
  const button=form.querySelector('button[type=submit]'),status=form.querySelector('[data-seo-status]'),values=new FormData(form);button.disabled=true;
  const input={...settings,id:'seo',status:'published',revision:settings.revision||'new',pages:{...settings.pages}};
  if(form.id==='seo-page-form')input.pages[form.dataset.path]=seoInput(values);
  else Object.assign(input,{indexingEnabled:values.has('indexingEnabled'),verification:String(values.get('verification')||'')});
  try{await api('/settings/seo','PUT',input);await refresh();}catch(error){status.textContent=error.message;button.disabled=false;}
 };
 root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);
 mounts.set(root,()=>{root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);});
}
