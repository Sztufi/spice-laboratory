// One repetition is the wrap boundary: direction changes never reset the text.
export function marqueePhase(phase,delta,width){
 if(!(width>0)||!Number.isFinite(delta))return 0;
 return ((phase-delta*.45)%width+width)%width;
}

export function mountScrollMarquee(root,win=window){
 const track=root?.querySelector('[data-marquee-track]');
 const unit=track?.firstElementChild;
 if(!unit)return ()=>{};
 const preference=win.matchMedia('(prefers-reduced-motion: reduce)');
 let width=0,phase=0,lastY=win.scrollY,frame=0,disposed=false;
 const paused=()=>preference.matches||root.ownerDocument.body.classList.contains('motion-paused');
 function paint(){track.style.transform=paused()?'':`translate3d(${phase-width}px,0,0)`;}
 function measure(){
  if(disposed)return;
  const oldWidth=width;
  width=unit.getBoundingClientRect().width;
  if(oldWidth&&width)phase=phase/oldWidth*width;
  while(track.children.length>1)track.lastElementChild.remove();
  if(width>0&&!paused()){
   const copies=Math.ceil(root.getBoundingClientRect().width/width)+2;
   for(let i=1;i<copies;i++){
    const clone=unit.cloneNode(true);
    clone.setAttribute('aria-hidden','true');
    track.append(clone);
   }
  }
  paint();
 }
 function update(){
  frame=0;
  const y=Math.max(0,win.scrollY);
  // Ignore offscreen travel; don't spend frames animating invisible content.
  const rect=root.getBoundingClientRect();
  if(!paused()&&rect.bottom>0&&rect.top<win.innerHeight)phase=marqueePhase(phase,y-lastY,width);
  lastY=y;
  paint();
 }
 function scroll(){if(!frame)frame=win.requestAnimationFrame(update);}
 function motion(){lastY=Math.max(0,win.scrollY);measure();}
 const observer=win.ResizeObserver?new win.ResizeObserver(measure):null;
 observer?.observe(root);observer?.observe(unit);
 win.addEventListener('scroll',scroll,{passive:true});
 win.addEventListener('resize',measure);
 win.addEventListener('spice:motion-change',motion);
 preference.addEventListener('change',motion);
 root.ownerDocument.fonts?.ready.then(measure);
 measure();
 return ()=>{
  disposed=true;observer?.disconnect();win.cancelAnimationFrame(frame);
  win.removeEventListener('scroll',scroll);win.removeEventListener('resize',measure);
  win.removeEventListener('spice:motion-change',motion);preference.removeEventListener('change',motion);
 };
}
