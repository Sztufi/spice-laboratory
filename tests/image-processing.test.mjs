import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {imageDimensions,processImage} from '../server/image-processing.mjs';
import {imageAttributes} from '../public/image-attrs.mjs';
test('actual server encoder produces smaller mobile WebP images with exact dimensions and crop/contain support',async()=>{
 const source=fs.readFileSync(new URL('../public/assets/products/condiment-bagel-crisps-kick.jpg',import.meta.url));
 const output=await processImage(source);
 assert.deepEqual(imageDimensions(source),{width:500,height:500});
 for(const size of [160,320,640,960]){
  const image=output.files.find(f=>f.suffix==='-'+size);
  assert.deepEqual(imageDimensions(image.bytes),{width:size,height:size});
  assert.equal(new TextDecoder().decode(image.bytes.slice(8,12)),'WEBP');
 }
 assert.ok(output.files.find(f=>f.suffix==='-320').bytes.length<source.length);
 const photo=fs.readFileSync(new URL('../public/assets/mascot.png',import.meta.url));
 const cropped=await processImage(photo,{fit:'cover'});
 assert.equal(cropped.fit,'cover');assert.deepEqual(imageDimensions(cropped.files[2].bytes),{width:320,height:320});
 const recipe=await processImage(source,{profile:'recipe',fit:'cover'});
 assert.deepEqual(imageDimensions(recipe.files[2].bytes),{width:320,height:180});
});
test('oversized image headers and corrupt files fail before decoding; legacy images keep valid URLs',async()=>{
 const bytes=new Uint8Array(24);bytes.set([137,80,78,71]);const view=new DataView(bytes.buffer);view.setUint32(16,10000);view.setUint32(20,10000);
 await assert.rejects(processImage(bytes),/túl nagy/);await assert.rejects(processImage(new Uint8Array([0,1,2])),/Érvénytelen/);
 assert.equal(imageAttributes('/media/00000000-0000-4000-8000-000000000000.webp'),'src="/media/00000000-0000-4000-8000-000000000000.webp"');
 assert.ok(imageAttributes('/media/00000000-0000-4000-8000-000000000000-opt.webp').includes('srcset='));
});
