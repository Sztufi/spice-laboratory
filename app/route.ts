import html from '../storefront/index.html?raw';
import { env } from 'cloudflare:workers';
import { renderSitePage } from '../server/pages.mjs';
import {loadStore,runtimeEnv,isStoreAdmin,adminPrincipal} from '../server/store.mjs';
import {adminPage} from '../server/admin-page.mjs';
import {getChatGPTUser} from './chatgpt-auth';
import {seoEndpoint,seoSetting,seoRedirect} from '../server/seo.mjs';
import {staticImageResponse} from '../server/image-response.mjs';
import {googleCustomer} from '../server/google-auth.mjs';
import {magicCustomer} from '../server/magic-auth.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 const url=new URL(request.url);
 const image=await staticImageResponse(request);if(image)return image;
 if(url.pathname.length>1&&url.pathname.endsWith('/')){url.pathname=url.pathname.replace(/\/+$/,'');return Response.redirect(url.href,308);}
 const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
 if(url.pathname.startsWith('/media/')){
  const filename=url.pathname.slice(7);if(!/^[a-f0-9-]{36}(?:-opt(?:-r)?(?:-(?:160|320|640|960))?)?\.(png|jpg|webp)$/.test(filename)||!env.BUCKET)return new Response('Nem található.',{status:404});
  const object=await env.BUCKET.get('store-media/'+filename);if(!object)return new Response('Nem található.',{status:404});
  return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
 }
 const googleUser=await googleCustomer(request,env.DB,env);
 const user=adminPrincipal(await getChatGPTUser(),googleUser,env),isAdmin=isStoreAdmin(user,env);
 if(url.pathname.replace(/\/+$/,'')==='/admin'){
  if(!user)return Response.redirect(url.origin+'/fiok?next=%2Fadmin',302);
  if(!isAdmin)return new Response('<!doctype html><html lang="hu"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Nincs jogosultság</title><h1>Nincs adminisztrátori jogosultságod.</h1><p>Jelentkezz be az adminjogosultságú Google-fiókkal vagy a tulajdonosi tárhelyfiókkal.</p><a href="/fiok?next=%2Fadmin">Fiók megnyitása / fiókváltás</a></html>',{status:403,headers});
  return new Response(adminPage(),{headers});
 }
 try{
  const store=await loadStore(env.DB);
  const shipping=store.settings.find((item:{id:string;methods:unknown})=>item.id==='shipping');
  const settings=shipping?{...env,SHIPPING_METHODS_JSON:JSON.stringify(shipping.methods)}:env;
  const redirect=seoRedirect(url.pathname,store.catalogue.categories);if(redirect){url.pathname=redirect;return Response.redirect(url.href,308);}
  const special=seoEndpoint(url.pathname,store,settings,url.origin);if(special)return special;
  const authenticated=Boolean(user||await magicCustomer(request,env.DB,env));
  const page=renderSitePage(html,{pathname:url.pathname,search:url.search,origin:url.origin,env:settings,catalogue:store.catalogue,recipes:store.recipes,seo:seoSetting(store),isAdmin,authenticated});
  return new Response(page.html,{status:page.status,headers});
 }catch{return new Response('<!doctype html><html lang="hu"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Átmenetileg nem elérhető</title><h1>Az oldal átmenetileg nem elérhető.</h1><p>Próbáld újra később.</p></html>',{status:503,headers});}
}
