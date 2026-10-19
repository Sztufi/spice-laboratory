import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {handleAdminRequest} from '../../../../server/admin.mjs';
export const dynamic='force-dynamic';
async function handle(request:Request){return handleAdminRequest(request,{db:env.DB,bucket:env.BUCKET,env,user:await getChatGPTUser()});}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
export const DELETE=handle;
