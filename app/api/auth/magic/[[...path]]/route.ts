import {env} from 'cloudflare:workers';
import {handleMagicAuth} from '../../../../../server/magic-auth.mjs';
export const dynamic='force-dynamic';
function handle(request:Request){return handleMagicAuth(request,{db:env.DB,env});}
export const GET=handle;
export const POST=handle;
