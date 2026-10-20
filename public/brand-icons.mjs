// Shared by server-rendered pages and interactive storefront/admin panels.
const shapes={
 cart:'<path fill-rule="evenodd" d="m0 1 7 1 2 5 22-1-4 15-16 2 1 3h16v4H9L4 7 0 6Zm11 11 2 6 10-1 2-6Z"/><path d="M11 26a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>',
 profile:'<path d="M10 3 18 2l5 5-1 8-6 4-7-4-1-7Zm-7 27 2-8 8-3 6 1 9 5 1 5Z"/>',
 pin:'<path fill-rule="evenodd" d="M16 1C8 1 3 7 4 14c1 6 8 13 13 17 4-5 11-13 11-19C28 5 23 0 16 1Zm0 7a5 5 0 1 0 1 10 5 5 0 0 0-1-10Z"/>',
 heart:'<path d="M16 7C9-3 0 3 1 12c1 7 9 13 16 19 6-7 14-13 14-21C31 1 20-2 16 7Z"/>',
 box:'<path fill-rule="evenodd" d="m2 7 14-6 14 7-1 18-13 6L2 25Zm5 2 9 4 9-4-9-4Zm7 8-8-4v10l8 4Zm5-1-1 11 7-4 1-10Z"/>',
 receipt:'<path fill-rule="evenodd" d="m5 1 4 2 4-2 4 2 4-2 5 2 1 28-6-3-4 3-4-3-4 3-5-2Zm4 7v3l13-1V7Zm0 7v3l13-1v-3Zm1 7v3l8-1v-3Z"/>',
 settings:'<path fill-rule="evenodd" d="m12 0 8 1 1 5 4 2 5-1 2 8-4 3-1 4 2 5-7 5-4-3-4 1-4 2-6-6 2-5-1-4-5-3 3-8 5 1 3-2Zm4 10a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"/>',
 menu:'<path d="m3 5 26-1 1 5-27 1Zm-1 9 25-1 1 5-26 1Zm2 10 26-1-1 5-25 1Z"/>',
 bag:'<path fill-rule="evenodd" d="m5 10 23-1 3 21-29 1Zm6 5 2-8c1-4 6-4 7 0l1 8 5-1-2-8C22-3 9-2 8 6l-2 8Z"/>',
 close:'<path d="m5 2 11 10L27 1l4 5-10 10 10 11-5 4-10-10L5 31l-4-5 11-10L1 6Z"/>',
 plus:'<path d="m13 2 6-1v12l12-1v7l-12 1v11l-7-1 1-10H1l1-7h11Z"/>',
 minus:'<path d="m2 13 28-1 1 7-30 1Z"/>',
 arrow:'<path d="m2 13 18-1-6-7 5-4 13 15-14 15-5-5 7-7-18 1Z"/>',
 external:'<path d="m8 2 22-1 1 22-7 1-1-11L6 31l-5-5L19 8 8 9Z"/>',
 down:'<path d="m13 1 7 1-1 18 7-7 5 5-15 14L1 18l5-5 6 7Z"/>',
 up:'<path d="M19 31 12 30l1-18-7 7-5-5L16 0l15 14-5 5-6-7Z"/>',
 left:'<path d="m30 19-18 1 6 7-5 4L0 16 14 1l5 5-7 7 18-1Z"/>',
 check:'<path d="m1 16 6-5 7 8L26 2l6 5-18 25Z"/>',
 search:'<path fill-rule="evenodd" d="M13 1C-4 0-3 25 13 25l5-1 9 8 5-5-9-9C28 8 21 0 13 1Zm0 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"/>',
 filters:'<path d="m1 5 5-1V1h7v3l18-1v6L13 10v3H6v-3H1Zm0 16 18-1v-4h7v4h5v6h-5v5h-7v-5L1 27Z"/>',
 home:'<path fill-rule="evenodd" d="M0 14 16 0l16 13-4 4-1 14H5L4 17Zm13 7v10h7V20Z"/>',
 jar:'<path fill-rule="evenodd" d="m7 1 19 1-1 6H7Zm-1 9 20-1 4 7-1 15-27-1 1-15Zm2 9v6l16-1v-6Z"/>',
 book:'<path fill-rule="evenodd" d="m3 1 25 1 2 29-25-1-3-5Zm6 6v4l14-1V6Zm0 9v4l12-1v-4Zm-3 9v2l19 1v-3Z"/>',
 mail:'<path fill-rule="evenodd" d="m2 4 28-1 2 25-30 1Zm4 5 10 9L27 8l-3-2-8 7-7-7Z"/>',
 info:'<path fill-rule="evenodd" d="M15 0C-5 1-4 32 17 32 38 31 36-1 15 0Zm-2 6v6l6-1V6Zm0 9-1 11 8-1-1-11Z"/>',
 help:'<path fill-rule="evenodd" d="M15 0C-5 1-4 32 17 32 38 31 36-1 15 0Zm-6 8 4-4h7l5 5-1 6-6 4v2h-6v-5l6-4V9h-4l-1 3-5-1Zm4 15v5h6v-5Z"/>',
 truck:'<path fill-rule="evenodd" d="m1 4 19-1v8h6l6 8v9h-4a5 5 0 0 1-10 0h-6a5 5 0 0 1-10 0H0Zm21 11v5h6l-4-5Z"/>',
 grid:'<path d="m1 2 13-1v13L1 15Zm18-1 12 1v13l-13-1ZM2 19l12-1 1 13H1Zm17 0 12-1 1 13-14-1Z"/>',
 burst:'<path d="m13 0 6 1-1 9 8-8 4 5-9 7 11-1-1 6-10-1 9 9-5 4-8-10 1 11-6-1 1-10-9 9-4-5 10-8-10 1 1-6 9 1-8-9 5-4 7 10Z"/>',
 eye:'<path fill-rule="evenodd" d="M0 15C8-2 25-1 32 16 22 34 7 31 0 15Zm16-7a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/>'
 ,cow:'<path d="M3 14 0 9l3-3 4 5 4-5 8-1 4 4 4-5 4 3-3 6 3 4-2 8-5 1-1 7h-5l-1-7h-6l-1 7H7l-1-8-4-2Zm17-4 3 3-2 4-4-1-1-4Z"/>'
 ,pig:'<path d="M4 13 1 10l2-3 5 3 3-5 11 1 3 4 5-2 2 4-4 3 1 7-5 5h-4l-1-4-9 1-1 4H5l-1-6-3-2Zm17-5 1-5 4 4Zm-8 7h8v5h-8Zm2 2 2 1 2-1v2l-2 1-2-1Z"/>'
 ,fish:'<path d="m1 16 9-10 5 5c7-5 15-3 17 5-3 8-11 10-17 5l-5 5Zm17-2 5 2-4 3-5-2Zm0-4 3 2-2 3-3-2Z"/>'
 ,vegetable:'<path d="M14 9 7 2l4-2 5 5 4-5 4 2-5 7 4 3-6 18H9L3 12Zm-3 6 5 10 3-10Z"/>'
 ,chicken:'<path d="m7 11-4-5 5-2 2 4 2-6 4 5 4-4 2 6 5 1-4 4 6 3-5 4 2 7-7 4-11-1-5-7 5-4-5-4 5-2Zm6 8 4 2-2 4-4-2Zm-1 9 2 4-4-1Zm8 0 3 3-4 1Z"/>'
};
export function brandIcon(name,size=24,className=''){
 const key=Object.hasOwn(shapes,name)?name:'grid';
 const safeClass=String(className).replace(/[^a-zA-Z0-9_ -]/g,'');
 return `<svg data-brand-icon="${key}" class="brand-icon ${safeClass}" xmlns="http://www.w3.org/2000/svg" width="${Number(size)||24}" height="${Number(size)||24}" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" focusable="false">${shapes[key]}</svg>`;
}
const glyphs={'↗':'external','→':'arrow','←':'left','↓':'down','↑':'up','✓':'check','✳':'burst','✦':'burst','♡':'heart','♥':'heart'};
// Only our known legacy SVGs and visible icon glyphs are changed. Charts, user
// attributes, scripts, styles, textareas and numeric multiplication remain intact.
export function styleIcons(markup){
 const held=[];
 let html=String(markup).replace(/<(script|style|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi,s=>`\u0001${held.push(s)-1}\u0002`);
 html=html.replace(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi,(svg,attrs,body)=>{
  if(attrs.includes('data-brand-icon')||!/(?:0 0 24 24)/.test(attrs))return svg;
  let name=body.includes('20.8 4.6')?'heart':body.includes('M6 8h12')?'bag':body.includes('M4 7h16M4 12')?'menu':body.includes('m6 6 12 12')?'close':body.includes('M12 5v14')?'plus':body.includes('10.5')?'search':body.includes('M4 7h16M4 17')?'filters':body.includes('M12 4v16')?'down':body.includes('M12 2v20')?'burst':body.includes('7.5 7.5')?'profile':body.includes('M3 12s')?'eye':body.includes('x="4" y="4"')?'grid':null;
  if(!name)return svg;
  const cls=attrs.match(/class="([^"]*)"/)?.[1]||'';
  return brandIcon(name,attrs.match(/width="(\d+)"/)?.[1]||24,cls);
 });
 html=html.split(/(<[^>]*>)/g).map((part,i)=>i%2?part:part.replace(/[↗→←↓↑✓✳✦♡♥]/g,g=>brandIcon(glyphs[g],18)).replace(/^(\s*)[×✕](\s*)$/,'$1'+brandIcon('close',18)+'$2').replace(/^(\s*)\+(\s*)$/,'$1'+brandIcon('plus',18)+'$2').replace(/^(\s*)−(\s*)$/,'$1'+brandIcon('minus',18)+'$2').replace(/(\p{L} )([+×])(?=\s*$)/u,(_,prefix,g)=>prefix+brandIcon(g==='+'?'plus':'close',18))).join('');
 return html.replace(/\u0001(\d+)\u0002/g,(_,i)=>held[Number(i)]);
}
