export function domainRedirect(request){
 const url=new URL(request.url);
 if(url.hostname!=='www.spicelaboratory.eu')return null;
 url.hostname='spicelaboratory.eu';url.protocol='https:';url.port='';
 return new Response(null,{status:308,headers:{Location:url.href,'Cache-Control':'public, max-age=3600'}});
}
