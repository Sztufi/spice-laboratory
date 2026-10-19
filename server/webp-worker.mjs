import encode,{init} from '@jsquash/webp/encode.js';
import wasm from '@jsquash/webp/codec/enc/webp_enc.wasm';
let ready;
export async function encodeWebp(image){
 ready||=init(wasm);await ready;
 return new Uint8Array(await encode({data:image.get_raw_pixels(),width:image.get_width(),height:image.get_height()},{quality:82,method:4}));
}
