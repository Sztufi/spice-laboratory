import encode,{init} from '@jsquash/webp/encode.js';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ready;
export async function encodeWebp(image){
 ready||=(async()=>{
  const bytes=await readFile(require.resolve('@jsquash/webp/codec/enc/webp_enc.wasm'));
  return init(await WebAssembly.compile(bytes));
 })();await ready;
 return new Uint8Array(await encode({data:image.get_raw_pixels(),width:image.get_width(),height:image.get_height()},{quality:82,method:4}));
}
