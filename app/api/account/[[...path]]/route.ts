import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { handleAccountRequest } from '../../../../server/account.mjs';
import {googleCustomer} from '../../../../server/google-auth.mjs';
import {magicCustomer} from '../../../../server/magic-auth.mjs';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  return handleAccountRequest(request, { env, db: env.DB, bucket: env.BUCKET, user: await magicCustomer(request,env.DB,env)||await googleCustomer(request,env.DB,env)||await getChatGPTUser() });
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
