import {brandIcon} from '../public/brand-icons.mjs';
const names={profile:'profile',addresses:'pin',favorites:'heart',orders:'box',invoices:'receipt',settings:'settings'};
export function accountIcon(tab){return brandIcon(names[tab]||'profile',32,'account-entry-icon');}
