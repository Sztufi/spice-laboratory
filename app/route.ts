import html from '../storefront/index.html?raw';
import { env } from 'cloudflare:workers';
import { renderSitePage } from '../server/pages.mjs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
 const url=new URL(request.url);
 const page=renderSitePage(html,{pathname:url.pathname,search:url.search,origin:url.origin,env});
 return new Response(page.html,{status:page.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
