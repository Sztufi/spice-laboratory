import {imageAttributes} from '../public/image-attrs.mjs';
export function optimizeImages(html){
 return html.replace(/<img\b[^>]*>/g,tag=>{
  if(tag.includes('srcset=')||tag.includes('data-gallery-zoom'))return tag;
  const src=tag.match(/\bsrc="([^"]+)"/)?.[1];if(!src)return tag;
  const large=tag.includes('fetchpriority="high"')||tag.includes('termékkép"');
  return tag.replace(/\bsrc="[^"]+"/,imageAttributes(src,{large,sizes:tag.includes('class="mascot"')?'(max-width: 800px) 48vw, 50vw':large?'(max-width: 800px) 90vw, 650px':undefined}));
 });
}
