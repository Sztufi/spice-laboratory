import {imageManifest} from './image-manifest.mjs';
import {escapeHtml as h} from './html-escape.mjs';
export function imageAttributes(src,{sizes='(max-width: 600px) 46vw, (max-width: 1000px) 30vw, 300px',large=false}={}){
 const staticImage=imageManifest[src];
 let variants=staticImage?Object.values(staticImage.variants):null;
 if(/^\/media\/[a-f0-9-]{36}-opt(?:-r)?\.webp$/.test(src))variants=[160,320,640,960].map(width=>({width,url:src.replace('.webp','-'+width+'.webp')}));
 if(!variants)return `src="${h(src)}"`;
 const unique=[...new Map(variants.map(v=>[v.width,v])).values()];
 const selected=unique.find(v=>v.width>=(large?960:320))||unique.at(-1);
 return `src="${h(selected.url)}" srcset="${unique.map(v=>h(v.url)+' '+v.width+'w').join(', ')}" sizes="${h(sizes)}"`;
}
