import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhotoInput,photoCrop,photoOrientation,openCompanionPhoto,MAX_PHOTO_BYTES,MAX_PHOTO_PIXELS} from '../star-garden/companion-photo.mjs';
const jpeg=(width=4032,height=3024)=>new Uint8Array([255,216,255,192,0,11,8,height>>8,height&255,width>>8,width&255,1,1,17,0,255,217]);
test('30 MiB boundary, MIME-less iPhone export, and clear unsupported format rejection',()=>{
 assert.equal(MAX_PHOTO_BYTES,30*1024*1024);assert.equal(validatePhotoInput({type:'image/jpeg',size:MAX_PHOTO_BYTES}),'image/jpeg');
 assert.throws(()=>validatePhotoInput({type:'image/jpeg',size:MAX_PHOTO_BYTES+1}),/30 MB/);
 assert.equal(validatePhotoInput({name:'IMG_1234.JPG',type:'',size:4}),'image/jpeg');
 for(const file of [{type:'image/heic',name:'a.heic'},{type:'',name:'a.HEIF'},{type:'image/jpeg',name:'a.heic'}])assert.throws(()=>validatePhotoInput({...file,size:10}),/HEIC.*HEIF/);
 for(const type of ['image/svg+xml','image/gif','image/tiff','application/octet-stream'])assert.throws(()=>validatePhotoInput({type,size:10}));
});
test('crop geometry honors every edge, zoom and bounds with no blank image region',()=>{
 assert.deepEqual(photoCrop(1000,500,{x:0,y:0}),{sx:0,sy:0,side:500,size:500});
 assert.deepEqual(photoCrop(1000,500,{x:1,y:1,zoom:2}),{sx:750,sy:250,side:250,size:250});
 for(const width of [1,300,4032,8064])for(const height of [1,400,3024])for(const zoom of [0,1,1.25,2,4,30])for(const x of [-1,0,.5,1,2])for(const y of [-1,.5,2]){const c=photoCrop(width,height,{zoom,x,y});assert(c.sx>=0&&c.sy>=0&&c.sx+c.side<=width&&c.sy+c.side<=height&&c.size>=1&&c.size<=512);}
 for(const selection of [{x:NaN},{zoom:Infinity},{y:'0.2'}])assert.throws(()=>photoCrop(100,200,selection));
 assert.equal(MAX_PHOTO_PIXELS,50e6);photoCrop(8064,6048);assert.throws(()=>photoCrop(9000,6000),/尺寸过大/);
});
test('EXIF orientations are bounded and never trust offsets beyond the APP segment',()=>{
 const app=Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');const file=Buffer.concat([Buffer.from([255,216]),app,jpeg().slice(2)]);assert.equal(photoOrientation(file),6);
 for(let i=0;i<file.length;i++)assert.doesNotThrow(()=>photoOrientation(file.subarray(0,i)));
 const corrupt=Buffer.from(file);corrupt.fill(255,14,18);assert.equal(photoOrientation(corrupt),1);
});
test('high-resolution photo decoding requests a bounded worker bitmap and terminates worker',async()=>{
 const original=globalThis.Worker;let options,closed=0,terminated=0;
 globalThis.Worker=class{postMessage(data){options=data.options;queueMicrotask(()=>this.onmessage({data:{bitmap:{width:options.resizeWidth,height:options.resizeHeight,close(){closed++;}}}}));}terminate(){terminated++;}};
 try{const source=await openCompanionPhoto(new Blob([jpeg(8064,6048)],{type:'image/jpeg'}));assert.equal(source.width,2048);assert.equal(source.height,1536);assert.equal(options.imageOrientation,'from-image');source.dispose();assert.equal(closed,1);assert.equal(terminated,1);}finally{globalThis.Worker=original;}
});
test('unsupported large decode is rejected rather than falling back to full-resolution Image',async()=>{
 const original=globalThis.Worker;globalThis.Worker=class{postMessage(){queueMicrotask(()=>this.onmessage({data:{error:true}}));}terminate(){}};
 try{await assert.rejects(openCompanionPhoto(new Blob([jpeg(8064,6048)],{type:'image/jpeg'})),/2000 万像素/);}finally{globalThis.Worker=original;}
});
test('abort terminates a stuck worker immediately and releases even a late bitmap',async()=>{
 const original=globalThis.Worker;let release,closed=0,terminated=0;globalThis.Worker=class{postMessage(){release=()=>this.onmessage({data:{bitmap:{width:500,height:500,close(){closed++;}}}});}terminate(){terminated++;}};
 try{const controller=new AbortController();const result=openCompanionPhoto(new Blob([jpeg()],{type:'image/jpeg'}),{signal:controller.signal});while(!release)await new Promise(r=>setTimeout(r,0));controller.abort();await assert.rejects(result,{name:'AbortError'});assert.equal(terminated,1);release();assert.equal(closed,1);}finally{globalThis.Worker=original;}
});
test('JPEG fill bytes preserve EXIF orientation before rotated resizing',()=>{
 const app=Buffer.from('ffffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');
 assert.equal(photoOrientation(Buffer.concat([Buffer.from([255,216]),app,jpeg().slice(2)])),6);
});
test('animated PNG chunks beyond 1MiB are rejected before bitmap or Image decode',async()=>{
 const signature=Buffer.from([137,80,78,71,13,10,26,10]);const chunk=(name,payload)=>{const bytes=Buffer.alloc(payload.length+12);bytes.writeUInt32BE(payload.length);bytes.write(name,4);payload.copy(bytes,8);return bytes;};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(128);ihdr.writeUInt32BE(128,4);ihdr[8]=8;ihdr[9]=2;
 const file=new Blob([signature,chunk('IHDR',ihdr),chunk('tEXt',Buffer.alloc(1024*1024)),chunk('acTL',Buffer.alloc(8))],{type:'image/png'});
 await assert.rejects(openCompanionPhoto(file),/动态 PNG/);
});
test('animated WebP flags are rejected before worker creation',async()=>{
 const bytes=new Uint8Array(30),view=new DataView(bytes.buffer);bytes.set(new TextEncoder().encode('RIFF'));view.setUint32(4,22,true);bytes.set(new TextEncoder().encode('WEBPVP8X'),8);view.setUint32(16,10,true);bytes[20]=2;bytes[24]=127;bytes[27]=127;
 await assert.rejects(openCompanionPhoto(new Blob([bytes],{type:'image/webp'})),/动态 PNG \/ WebP/);
});
test('stuck worker timeout terminates decoding and rejects unsafe fallback',async()=>{
 const original={Worker:globalThis.Worker,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};let terminate=0,delay;
 globalThis.Worker=class{postMessage(){}terminate(){terminate++;}};
 globalThis.setTimeout=(fn,ms)=>{delay=ms;queueMicrotask(fn);return 1;};globalThis.clearTimeout=()=>{};
 try{await assert.rejects(openCompanionPhoto(new Blob([jpeg(8064,6048)],{type:'image/jpeg'})),/2000 万像素/);assert.equal(delay,20000);assert.equal(terminate,1);}finally{Object.assign(globalThis,original);}
});
