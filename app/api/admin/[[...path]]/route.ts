import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {handleAdminRequest} from '../../../../server/admin.mjs';
import {googleCustomer} from '../../../../server/google-auth.mjs';
import {adminPrincipal} from '../../../../server/store.mjs';
export const dynamic='force-dynamic';
async function handle(request:Request){
 const user=adminPrincipal(await getChatGPTUser(),await googleCustomer(request,env.DB,env),env);
 return handleAdminRequest(request,{db:env.DB,bucket:env.BUCKET,env,user});
}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
export const DELETE=handle;
