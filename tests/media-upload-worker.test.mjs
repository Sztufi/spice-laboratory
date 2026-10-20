import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {basename,join} from 'node:path';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import sharp from 'sharp';
import {imageDimensions} from '../server/image-processing.mjs';

test('native Workers multipart upload accepts FilePond metadata + PNG, then writes real WebP variants and private media metadata',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),wasm=new Map();
 const bundle=await build({stdin:{resolveDir:root,contents:`
  import {handleAdminRequest} from './server/admin.mjs';
  export default {fetch(request,env){return handleAdminRequest(request,{db:env.DB,bucket:env.BUCKET,user:{userId:'test-owner',email:'owner@example.com'},env:{ADMIN_EMAILS:'owner@example.com'}});}};
 `},bundle:true,write:false,platform:'neutral',format:'esm',conditions:['workerd'],logLevel:'silent',plugins:[{name:'test-compiled-wasm',setup(build){build.onResolve({filter:/\.wasm$/},args=>{
  const path=createRequire(join(args.resolveDir,'entry.js')).resolve(args.path),name=basename(path);wasm.set(name,readFileSync(path));return {path:'./'+name,external:true};
 });}}]});
 assert.equal(wasm.size,2);
 const mf=new Miniflare({compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],cf:false,modulesRoot:root,modules:[{type:'ESModule',path:join(root,'__media-test-worker.mjs'),contents:bundle.outputFiles[0].text},...[...wasm].map(([name,contents])=>({type:'CompiledWasm',path:join(root,name),contents}))],d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const db=await mf.getD1Database('DB');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(sql).run();
  const png=await sharp({create:{width:500,height:500,channels:4,background:{r:230,g:120,b:40,alpha:.5}}}).png().toBuffer();
  const form=new FormData();form.append('file',JSON.stringify({resize:{size:{width:1280,height:1280}}}));form.append('file',new Blob([png],{type:'image/png'}),'iphone-upload.png');form.append('profile','product');form.append('fit','contain');form.append('alt','GRR Lick üveg');
  const request=new Request('https://spice.test/api/admin/media',{method:'POST',headers:{Origin:'https://spice.test'},body:form});
  const response=await mf.dispatchFetch(request.url,{method:'POST',headers:request.headers,body:await request.arrayBuffer()});
  const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));assert.equal(result.variants,5);assert.equal(result.media.alt,'GRR Lick üveg');assert.match(result.url,/\.webp$/);
  const bucket=await mf.getR2Bucket('BUCKET');
  for(const variant of result.media.variants){const object=await bucket.get('store-media/'+variant.url.split('/').pop());assert.ok(object);assert.equal(object.httpMetadata.contentType,'image/webp');const bytes=new Uint8Array(await object.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.slice(8,12)),'WEBP');assert.deepEqual(imageDimensions(bytes),{width:variant.width,height:variant.height});}
  const stored=await db.prepare("SELECT payload_json FROM store_records WHERE kind='media' AND id=?").bind(result.media.id).first();assert.equal(JSON.parse(stored.payload_json).alt,'GRR Lick üveg');
 }finally{await mf.dispose();}
});
