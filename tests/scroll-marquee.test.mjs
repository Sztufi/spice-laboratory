import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marqueePhase,mountScrollMarquee} from '../public/scroll-marquee.mjs';
import {renderSitePage} from '../server/pages.mjs';

test('marquee follows scroll direction, wraps seamlessly and reverses without resetting',()=>{
 assert.equal(marqueePhase(100,20,1000),91);
 assert.equal(marqueePhase(91,-20,1000),100);
 assert.equal(marqueePhase(0,20,1000),991);
 assert.equal(marqueePhase(991,-20,1000),0);
 assert.equal(marqueePhase(0,10000,1000),500);
 assert.equal(marqueePhase(10,2,0),0);
});

test('marquee fills wide screens, pauses, respects reduced motion and cleans up listeners',()=>{
 let paused=false,viewport=2500;
 const listeners=new Map();let scheduled;
 const preference={matches:false,addEventListener(_,fn){this.change=fn;},removeEventListener(){}};
 const track={children:[],style:{},append(node){node.parent=this;this.children.push(node);},get firstElementChild(){return this.children[0];},get lastElementChild(){return this.children.at(-1);}};
 function node(){return {getBoundingClientRect:()=>({width:1000}),cloneNode:node,setAttribute(k,v){this[k]=v;},remove(){this.parent.children.pop();}};}
 track.append(node());
 const root={querySelector:()=>track,ownerDocument:{body:{classList:{contains:()=>paused}}},getBoundingClientRect:()=>({width:viewport,top:100,bottom:250})};
 const win={scrollY:0,innerHeight:900,matchMedia:()=>preference,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),requestAnimationFrame(fn){scheduled=fn;return 1;},cancelAnimationFrame(){}};
 const dispose=mountScrollMarquee(root,win);
 assert.equal(track.children.length,5);
 assert.ok(track.children.slice(1).every(n=>n['aria-hidden']==='true'));
 win.scrollY=20;listeners.get('scroll')();scheduled();assert.equal(track.style.transform,'translate3d(-9px,0,0)');
 win.scrollY=0;listeners.get('scroll')();scheduled();assert.equal(track.style.transform,'translate3d(-1000px,0,0)');
 paused=true;listeners.get('spice:motion-change')();assert.equal(track.style.transform,'');assert.equal(track.children.length,1);
 paused=false;listeners.get('spice:motion-change')();assert.equal(track.children.length,5);
 preference.matches=true;preference.change();assert.equal(track.style.transform,'');assert.equal(track.children.length,1);
 preference.matches=false;preference.change();viewport=400;listeners.get('resize')();assert.equal(track.children.length,3);
 dispose();assert.equal(listeners.size,0);
});

test('only the homepage renders the scroll band, with a single accessible original message',()=>{
 const base=readFileSync(new URL('../storefront/index.html',import.meta.url),'utf8');
 const home=renderSitePage(base,{pathname:'/'}).html;
 assert.equal((home.match(/data-scroll-marquee/g)||[]).length,1);
 assert.equal((home.match(/A FŰSZER A MIÉNK\. A KONYHA A TIÉD\./g)||[]).length,1);
 assert.ok(!renderSitePage(base,{pathname:'/termekek'}).html.includes('data-scroll-marquee'));
});
