import {imageAttributes} from './image-attrs.mjs';
export function mountProductGallery(root,product,dialog){
 if(!root||!product)return;
 const images=product.images?.length?product.images:[{id:'legacy',url:product.image,alt:product.imageAlt??product.name,caption:''}];
 let index=Math.max(0,images.findIndex(i=>i.id===product.featuredImageId));
 const large=root.querySelector('[data-gallery-main]'),zoom=dialog?.querySelector('[data-gallery-zoom]');
 const setImage=(node,item)=>{if(!node)return;const template=document.createElement('template');template.innerHTML='<img '+imageAttributes(item.url,{large:true,sizes:'(max-width: 800px) 90vw, 650px'})+'>';const source=template.content.firstChild;for(const key of ['src','srcset','sizes']){if(source.hasAttribute(key))node.setAttribute(key,source.getAttribute(key));else node.removeAttribute(key);}node.alt=item.alt??product.name;node.fetchPriority='auto';};
 function show(next){
  index=(next+images.length)%images.length;const item=images[index];setImage(large,item);if(zoom){zoom.src=item.url;zoom.removeAttribute('srcset');zoom.removeAttribute('sizes');zoom.alt=item.alt??product.name;}
  root.querySelectorAll('[data-gallery-index]').forEach((button,i)=>{button.setAttribute('aria-pressed',String(i===index));if(i===index)button.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'instant'});});
  for(const container of [root,dialog].filter(Boolean)){const caption=container.querySelector('[data-gallery-caption]');if(caption){caption.textContent=item.caption||'';caption.hidden=!item.caption;}const count=container.querySelector('[data-gallery-count]');if(count)count.textContent=`${index+1} / ${images.length}`;}
 }
 for(const container of [root,dialog].filter(Boolean)){
  container.addEventListener('click',event=>{const thumb=event.target.closest('[data-gallery-index]');if(thumb)show(Number(thumb.dataset.galleryIndex));const step=event.target.closest('[data-gallery-step]');if(step)show(index+Number(step.dataset.galleryStep));});
  container.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key)||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;event.preventDefault();show(index+(event.key==='ArrowRight'?1:-1));});
  let start=null;container.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')start={x:event.clientX,y:event.clientY};});container.addEventListener('pointerup',event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)show(index+(dx<0?1:-1));});container.addEventListener('pointercancel',()=>{start=null;});
 }
}
