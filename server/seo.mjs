import {escapeHtml as h} from '../public/product-markup.mjs';
import {seoPages} from '../public/seo-data.mjs';
import {categoryPages} from '../public/page-data.mjs';
const categorySlug=c=>c.slug||categoryPages.find(item=>item.id===c.id)?.slug||c.id;
export const seoSetting=store=>store.settings?.find(s=>s.id==='seo')||{};
export function seoRedirect(path,categories=[]){
 const cleanPath=path.length>1?path.replace(/\/+$/,''):path;
 const category=categories.find(c=>c.previousSlugs?.some(slug=>cleanPath==='/kategoria/'+slug));
 return category?'/kategoria/'+categorySlug(category):cleanPath!==path?cleanPath:null;
}
export function seoState(settings={},env={}){
 return {requested:settings.indexingEnabled===true,publicConfirmed:env.SEO_PUBLIC_SITE_CONFIRMED==='true',enabled:settings.indexingEnabled===true&&env.SEO_PUBLIC_SITE_CONFIRMED==='true'};
}
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const pageNoindex=(custom={},defaults={})=>custom.noindex??defaults.noindex??false;
const absolute=(path,origin)=>new URL(path,origin).href;
export function seoDocument({path,search='',status=200,title,description,catalogue,recipes=[],settings={},env={},origin,live=false}){
 const product=catalogue.products.find(p=>path==='/termek/'+p.id);
 const category=catalogue.categories.find(c=>path==='/kategoria/'+categorySlug(c));
 const recipe=recipes.find(r=>path==='/blog/'+r.id);
 const defaults=seoPages.find(p=>p.path===path)||{};
 const item=product||category||recipe;
 const custom=item?.seo||settings.pages?.[path]||{};
 const pageTitle=clean(custom.title||defaults.title||title);
 const pageDescription=clean(custom.description||defaults.description||description).slice(0,500);
 const filtered=[...new URLSearchParams(search)].some(([key])=>['q','category','ingredient','match','sort','product'].includes(key));
 const noindex=!seoState(settings,env).enabled||status!==200||path==='/fiok'||pageNoindex(custom,defaults)||filtered;
 const canonical=absolute(path,origin);
 // Never use a seasoning-pack shot as a photo of the cooked recipe.
 const image=product?.image||recipe?.image||(!recipe?'/assets/mascot.png':'');
 const graph=[{'@type':'Organization','@id':origin+'/#organization',name:'Spice Laboratory',url:origin+'/'},
  {'@type':'WebSite','@id':origin+'/#website',url:origin+'/',name:'Spice Laboratory',inLanguage:'hu-HU',publisher:{'@id':origin+'/#organization'}},
  {'@type':'WebPage','@id':canonical+'#webpage',url:canonical,name:pageTitle,description:pageDescription,inLanguage:'hu-HU',isPartOf:{'@id':origin+'/#website'}}];
 if(status===200&&path!=='/'&&path!=='/fiok'){
  const middle=product?[{name:'Termékek',url:origin+'/termekek'}]:recipe?[{name:'Receptek',url:origin+'/blog'}]:category?[{name:'Kategóriák',url:origin+'/kategoriak'}]:[];
  graph.push({'@type':'BreadcrumbList',itemListElement:[{name:'Főoldal',url:origin+'/'},...middle,{name:product?.name||recipe?.title||category?.label||defaults.label||pageTitle,url:canonical}].map((b,i)=>({'@type':'ListItem',position:i+1,name:b.name,item:b.url}))});
 }
 if(product){
  const node={'@type':'Product','@id':canonical+'#product',url:canonical,name:product.name,description:product.description,image:(product.images?.length?product.images.map(i=>absolute(i.url,origin)):[absolute(product.image,origin)]),brand:{'@type':'Brand',name:'Spice Laboratory'},...(product.sku?{sku:product.sku}:{})};
  // Demo/test prices aren't presented to Google as live merchant offers.
  if(live&&Number.isSafeInteger(product.priceMinor)&&product.priceMinor>0)node.offers={'@type':'Offer',url:canonical,price:(product.priceMinor/100).toFixed(2),priceCurrency:'HUF',availability:'https://schema.org/'+(product.inStock===false?'OutOfStock':'InStock'),seller:{'@id':origin+'/#organization'}};
  graph.push(node);
 }
 if(recipe?.image)graph.push({'@type':'Recipe','@id':canonical+'#recipe',url:canonical,name:recipe.title,description:recipe.excerpt,image:[absolute(recipe.image,origin)],totalTime:'PT'+recipe.minutes+'M',recipeYield:String(recipe.servings)+' adag',recipeIngredient:recipe.ingredients,recipeInstructions:recipe.steps.map(text=>({'@type':'HowToStep',text})),inLanguage:'hu-HU'});
 const robots=noindex?'noindex, follow':'index, follow, max-image-preview:large';
 const tags=`<meta name="robots" content="${robots}"><link rel="canonical" href="${h(canonical)}"><meta property="og:locale" content="hu_HU"><meta property="og:site_name" content="Spice Laboratory"><meta property="og:type" content="website"><meta property="og:title" content="${h(pageTitle)}"><meta property="og:description" content="${h(pageDescription)}"><meta property="og:url" content="${h(canonical)}">${image?`<meta property="og:image" content="${h(absolute(image,origin))}"><meta property="og:image:alt" content="${h(product?.imageAlt||product?.name||recipe?.title||'Spice Laboratory fűszertartó karakter')}">`:''}<meta name="twitter:card" content="${image?'summary_large_image':'summary'}"><meta name="twitter:title" content="${h(pageTitle)}"><meta name="twitter:description" content="${h(pageDescription)}">${settings.verification?`<meta name="google-site-verification" content="${h(settings.verification)}">`:''}${status===200&&path!=='/fiok'?`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c')}</script>`:''}`;
 return {title:pageTitle,description:pageDescription,canonical,noindex,tags};
}
export function sitemapEntries(store){
 const settings=seoSetting(store),entries=[...seoPages.map(p=>({path:p.path,seo:settings.pages?.[p.path],defaults:p})),...store.catalogue.products.map(p=>({path:'/termek/'+p.id,seo:p.seo})),...store.catalogue.categories.map(c=>({path:'/kategoria/'+categorySlug(c),seo:c.seo})),...store.recipes.map(r=>({path:'/blog/'+r.id,seo:r.seo}))];
 return entries.filter(e=>!pageNoindex(e.seo,e.defaults));
}
export function seoEndpoint(path,store,env,origin){
 if(!['/robots.txt','/sitemap.xml'].includes(path))return null;
 const enabled=seoState(seoSetting(store),env).enabled;
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff'};
 if(path==='/robots.txt')return new Response(enabled?`User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /fiok\nDisallow: /signin-with-chatgpt\nDisallow: /signout-with-chatgpt\nSitemap: ${origin}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n',{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
 return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${enabled?sitemapEntries(store).map(e=>`<url><loc>${h(absolute(e.path,origin))}</loc></url>`).join(''):''}</urlset>`,{headers:{...headers,'Content-Type':'application/xml; charset=utf-8'}});
}
