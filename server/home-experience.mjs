export function homeExperience(content){
 return content.replace('</h1></div></section>','</h1><div class="hero-decision"><p class="hero-description">Fűszerkeverékek grillhez, mártogatósokhoz és a hétköznapi kedvenceidhez.</p><div class="hero-actions"><a class="primary-button yellow" href="/termekek">MEGNÉZEM A FŰSZEREKET ↗</a><a class="hero-recipe-link" href="/blog">Mit főzzek velük? →</a></div><button class="motion-toggle" type="button" data-toggle-motion aria-pressed="false">Animáció szüneteltetése</button></div></div></section>')
 .replace('class="mascot" src="/assets/mascot.png"','class="mascot" src="/assets/mascot.png" width="1225" height="1284" fetchpriority="high"')
 .replace('MI KERÜL<br>A <span>TÁNYÉRODRA?</span>','TALÁLD MEG<br>A <span>SAJÁT ÍZED.</span>')
 .replace('Grill, mártogatós vagy egy ropogós csavar?<br>Találd meg a saját keveréked. Akár összetevőnként.','A termékeknél megtalálod az ízvilágot, a kiszerelést és az összetevőket. Válassz a következő fogáshoz.');
}
