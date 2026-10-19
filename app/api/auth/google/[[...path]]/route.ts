import {env} from 'cloudflare:workers';
import {handleGoogleAuth} from '../../../../../server/google-auth.mjs';
export const dynamic='force-dynamic';
function handle(request:Request){return handleGoogleAuth(request,{db:env.DB,env});}
export const GET=handle;
export const POST=handle;
