import { GET as getPage } from '../route';
export const dynamic='force-dynamic';
export function GET(request:Request){return getPage(request);}
