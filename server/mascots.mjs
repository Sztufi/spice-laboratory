const figures={chef:[360,420],mail:[360,420],runner:[400,420]};
export function mascotArt(name,placement=''){
 const figure=figures[name];if(!figure)return '';
 return `<img class="brand-mascot mascot-${name}${placement?' '+placement:''}" src="/assets/mascot-${name}.svg" width="${figure[0]}" height="${figure[1]}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
}
