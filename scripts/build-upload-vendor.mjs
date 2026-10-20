import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('public/vendor/',root);
await mkdir(out,{recursive:true});
await build({stdin:{resolveDir:new URL('../',import.meta.url).pathname,contents:`
 import {create,registerPlugin,FileStatus,Status} from 'filepond';
 import ValidateType from 'filepond-plugin-file-validate-type';
 import ValidateSize from 'filepond-plugin-file-validate-size';
 import Orientation from 'filepond-plugin-image-exif-orientation';
 import Preview from 'filepond-plugin-image-preview';
 import Resize from 'filepond-plugin-image-resize';
 import Transform from 'filepond-plugin-image-transform';
 registerPlugin(ValidateType,ValidateSize,Orientation,Preview,Resize,Transform);
 export {create,FileStatus,Status};
 `},bundle:true,format:'esm',platform:'browser',target:['safari14','chrome90','firefox90'],minify:true,legalComments:'eof',outfile:new URL('filepond.mjs',out).pathname});
const files=['filepond/dist/filepond.min.css','filepond-plugin-image-preview/dist/filepond-plugin-image-preview.min.css'];
await writeFile(new URL('filepond.css',out),(await Promise.all(files.map(file=>readFile(new URL('node_modules/'+file,root),'utf8')))).join('\n'));
const packages=['filepond','filepond-plugin-file-validate-type','filepond-plugin-file-validate-size','filepond-plugin-image-exif-orientation','filepond-plugin-image-preview','filepond-plugin-image-resize','filepond-plugin-image-transform'];
const licenses=[];for(const pkg of packages){const dir=new URL('node_modules/'+pkg+'/',root),meta=JSON.parse(await readFile(new URL('package.json',dir),'utf8'));let license;for(const name of ['LICENSE','LICENSE.md','LICENSE.txt']){try{license=await readFile(new URL(name,dir),'utf8');break;}catch{}}if(!license)throw new Error('Missing third-party license: '+pkg);licenses.push(pkg+' '+meta.version+'\n'+license);}
await writeFile(new URL('FILEPOND-LICENSES.txt',out),licenses.join('\n\n'));
