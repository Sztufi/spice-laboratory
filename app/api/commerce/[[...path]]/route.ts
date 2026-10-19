import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { handleCommerceRequest } from '../../../../server/commerce.mjs';
import {googleCustomer} from '../../../../server/google-auth.mjs';
import {magicCustomer} from '../../../../server/magic-auth.mjs';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  return handleCommerceRequest(request,{db:env.DB,user:await magicCustomer(request,env.DB,env)||await googleCustomer(request,env.DB,env)||await getChatGPTUser(),env});
}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
