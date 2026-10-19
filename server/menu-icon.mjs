import {brandIcon} from '../public/brand-icons.mjs';
const names={'/':'home','/termekek':'jar','/blog':'book','/rolunk':'info','/kapcsolat':'mail','/fiok':'profile','/gyik':'help','/szallitas-es-fizetes':'truck','/admin':'grid'};
export function menuIcon(path){return brandIcon(names[path]||'home',26,'menu-item-icon');}
