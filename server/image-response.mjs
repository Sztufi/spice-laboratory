export async function staticImageResponse(request){
 const url=new URL(request.url);if(!url.pathname.startsWith('/img/'))return null;
 const name=url.pathname.slice(5);
 if(!/^[a-f0-9]{16}-(160|320|640|960)\.webp$/.test(name))return new Response('Not found',{status:404});
 const {imageBytes}=await import('./image-bytes.mjs');const data=imageBytes[name];
 if(!data)return new Response('Not found',{status:404});
 const etag='"'+name+'"',headers={'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','ETag':etag,'X-Content-Type-Options':'nosniff'};
 if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
 const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
 return new Response(bytes,{headers:{...headers,'Content-Length':String(bytes.length)}});
}
