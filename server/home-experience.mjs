export function homeExperience(content){
 return content.replace('</h1></div></section>','</h1><div class="hero-decision"><p class="hero-description">Grill, sült krumpli, mártogatós. Fűszerkeverékek, hogy ne megint ugyanaz legyen a vacsora.</p><div class="hero-actions"><a class="primary-button yellow" href="/termekek">MUTASD A FŰSZEREKET ↗</a><a class="hero-recipe-link" href="/blog">Jöhet egy recept →</a></div><button class="motion-toggle" type="button" data-toggle-motion aria-pressed="false">Animáció szüneteltetése</button></div></div></section>')
 .replace('class="mascot" src="/assets/mascot.png"','class="mascot" src="/assets/mascot.png" width="1225" height="1284" fetchpriority="high"')
 .replace('MI KERÜL<br>A <span>TÁNYÉRODRA?</span>','MIT DOBNÁL<br><span>FEL MA?</span>')
 .replace('Grill, mártogatós vagy egy ropogós csavar?<br>Találd meg a saját keveréked. Akár összetevőnként.','A csirkét, a krumplit vagy a mártogatóst? A nevek mögött ott a lényeg: milyen íz, mire való, mi van benne.');
}
