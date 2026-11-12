import {MAX_AVATAR_DATA_URL_LENGTH,isValidPhotoDataUrl,photoHeaderDimensions} from './model.mjs';
export const MAX_PHOTO_BYTES=30*1024*1024;
export const MAX_PHOTO_PIXELS=50*1000*1000;
const MAX_DECODE_EDGE=2048,MAX_FALLBACK_PIXELS=20*1000*1000;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function validatePhotoInput(file){
  const type=file?.type?.toLowerCase()||'',extension=file?.name?.split('.').pop()?.toLowerCase();
  if(type.includes('hei')||['heic','heif'].includes(extension))throw Error('暂不支持 HEIC / HEIF。请在 iPhone 照片中导出 JPEG，或在「设置 → 相机 → 格式」选择「兼容性最佳」后拍摄，再选择照片。照片不会上传转换。');
  const mime=type||({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'})[extension];
  if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('请选择 JPG、PNG 或 WebP 照片；暂不支持 GIF、SVG、RAW 等格式。');
  if(!Number.isFinite(file.size)||file.size<=0)throw Error('这张照片是空的，请重新选择。');
  if(file.size>MAX_PHOTO_BYTES)throw Error('照片不能超过 30 MB，请选一张小一些的照片。');
  return mime;
}
export function photoCrop(width,height,{zoom=1,x=.5,y=.5}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16384||height>16384||width*height>MAX_PHOTO_PIXELS)throw Error('照片尺寸过大或无效，请缩小到 5000 万像素以内后再试。');
  if(![zoom,x,y].every(Number.isFinite))throw Error('裁剪区域无效，请重新调整。');
  const side=Math.min(width,height)/clamp(zoom,1,4);
  return {sx:(width-side)*clamp(x,0,1),sy:(height-side)*clamp(y,0,1),side,size:Math.min(512,Math.max(1,Math.round(side)))};
}
// Only reads EXIF orientation; none of the input metadata is retained in the output.
export function photoOrientation(bytes){
  try{
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=2;
    while(p<bytes.length){
      if(bytes[p++]!==255)break;while(p<bytes.length&&bytes[p]===255)p++;
      const marker=bytes[p++];if([0,0xda,0xd9].includes(marker))break;
      if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
      if(p+2>bytes.length)break;const len=v.getUint16(p);if(len<2||p+len>bytes.length)break;
      if(marker===225&&String.fromCharCode(...bytes.subarray(p+2,p+8))==='Exif\0\0'){
        const start=p+8,end=p+len,little=v.getUint16(start)===0x4949;
        if(!little&&v.getUint16(start)!==0x4d4d)return 1;
        if(v.getUint16(start+2,little)!==42)return 1;
        const ifd=start+v.getUint32(start+4,little);if(ifd<start||ifd+2>end)return 1;
        const count=v.getUint16(ifd,little);for(let n=0;n<Math.min(count,256);n++){const at=ifd+2+n*12;if(at+12>end)break;if(v.getUint16(at,little)===0x112&&v.getUint16(at+2,little)===3&&v.getUint32(at+4,little)===1){const orientation=v.getUint16(at+8,little);return orientation>=1&&orientation<=8?orientation:1;}}
      }p+=len;
    }
  }catch{}return 1;
}
function aborted(signal){if(signal?.aborted)throw new DOMException('照片处理已取消','AbortError');}
async function rejectAnimatedPhoto(file,mime,bytes,signal){
  const animated=()=>{throw Error('暂不支持动态 PNG / WebP，请选择静态照片，或先导出一张 JPEG。');};
  if(mime==='image/webp'){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=12;
    while(offset+8<=bytes.length){const kind=String.fromCharCode(...bytes.subarray(offset,offset+4)),size=view.getUint32(offset+4,true);if(kind==='ANIM'||kind==='ANMF'||kind==='VP8X'&&(bytes[offset+8]&2))animated();offset+=8+size+size%2;}
  }
  if(mime==='image/png'){
    // Walk chunk headers, not compressed pixels, including chunks beyond the preview header.
    let offset=8,count=0;while(offset+8<=file.size){aborted(signal);if(++count>4096)throw Error('照片结构过于复杂，请先导出 JPEG 后重试。');
      const head=new Uint8Array(await file.slice(offset,offset+8).arrayBuffer());aborted(signal);const size=new DataView(head.buffer).getUint32(0),kind=String.fromCharCode(...head.subarray(4,8));
      if(['acTL','fcTL','fdAT'].includes(kind))animated();if(kind==='IEND')return;
      if(offset+12+size>file.size)break;offset+=12+size;
    }
  }
}
function decodeBitmap(file,options,signal){
  return new Promise((resolve,reject)=>{
    let worker,timer,settled=false;
    const finish=(error,bitmap)=>{if(settled){bitmap?.close();return;}settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker?.terminate();error?reject(error):resolve(bitmap);};
    const cancel=()=>finish(new DOMException('照片处理已取消','AbortError'));
    try{
      aborted(signal);worker=new Worker(new URL('./photo-decode-worker.mjs',import.meta.url),{type:'module'});
      worker.onmessage=event=>{const {bitmap,error}=event.data||{};if(error||!bitmap)finish(Error('浏览器无法解码这张照片。'));else finish(null,bitmap);};
      worker.onerror=event=>{event.preventDefault();finish(Error('浏览器无法解码这张照片。'));};
      signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>finish(Error('读取照片超时，请缩小照片后重试。')),20000);
      worker.postMessage({file,options});
    }catch(error){finish(error);}
  });
}
export async function openCompanionPhoto(file,{signal}={}){
  const mime=validatePhotoInput(file);aborted(signal);
  // JPEG/PNG dimensions are in the bounded header. WebP chunks are verified by the existing strict parser.
  let bytes=new Uint8Array(await (mime==='image/webp'?file:file.slice(0,1024*1024)).arrayBuffer());aborted(signal);
  const dimensions=photoHeaderDimensions(bytes,mime);photoCrop(dimensions.width,dimensions.height);
  const rotated=mime==='image/jpeg'&&photoOrientation(bytes)>=5;await rejectAnimatedPhoto(file,mime,bytes,signal);bytes=null;
  const width=rotated?dimensions.height:dimensions.width,height=rotated?dimensions.width:dimensions.height;
  const ratio=Math.min(1,MAX_DECODE_EDGE/Math.max(width,height));
  if(typeof Worker==='function'){
    let bitmap;
    try{bitmap=await decodeBitmap(file,{imageOrientation:'from-image',resizeWidth:Math.max(1,Math.round(width*ratio)),resizeHeight:Math.max(1,Math.round(height*ratio)),resizeQuality:'high'},signal);aborted(signal);
      if(bitmap.width>MAX_DECODE_EDGE||bitmap.height>MAX_DECODE_EDGE)throw Error('浏览器无法安全缩小这张照片，请先缩小后重试。');
      return {image:bitmap,width:bitmap.width,height:bitmap.height,dispose:()=>bitmap.close()};
    }catch(error){bitmap?.close();aborted(signal);if(width*height>MAX_FALLBACK_PIXELS)throw Error('当前浏览器无法安全处理这张高像素照片，请先缩小到 2000 万像素以内，或换一张 JPEG 照片。');}
  }
  if(width*height>MAX_FALLBACK_PIXELS)throw Error('当前浏览器无法安全处理这张高像素照片，请先缩小到 2000 万像素以内再试。');
  const url=URL.createObjectURL(file),img=new Image();let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;img.onload=null;img.onerror=null;img.src='';URL.revokeObjectURL(url);};
  try{
    await new Promise((resolve,reject)=>{let timer;const finish=error=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);img.onload=null;img.onerror=null;error?reject(error):resolve();};const cancel=()=>finish(new DOMException('照片处理已取消','AbortError'));img.onload=()=>finish();img.onerror=()=>finish(Error('无法读取这张照片，请换一张有效的 JPG、PNG 或 WebP 照片。'));signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>finish(Error('读取照片超时，请缩小照片后重试。')),20000);img.src=url;});
    aborted(signal);photoCrop(img.naturalWidth,img.naturalHeight);
    const scale=Math.min(1,MAX_DECODE_EDGE/Math.max(img.naturalWidth,img.naturalHeight));
    if(scale<1){
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const context=canvas.getContext('2d');if(!context){canvas.width=canvas.height=1;throw Error('当前浏览器无法处理照片，请换一个浏览器重试。');}
      try{context.drawImage(img,0,0,canvas.width,canvas.height);}catch(error){canvas.width=canvas.height=1;throw error;}
      dispose();return {image:canvas,width:canvas.width,height:canvas.height,dispose:()=>{canvas.width=canvas.height=1;}};
    }
    return {image:img,width:img.naturalWidth,height:img.naturalHeight,dispose};
  }catch(error){dispose();throw error;}
}
export function encodeCompanionPhoto(source,selection={}){
  const {sx,sy,side,size}=photoCrop(source.width,source.height,selection),canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  try{
    const context=canvas.getContext('2d');if(!context)throw Error('当前浏览器无法处理照片，请换一个浏览器重试。');
    context.fillStyle='#f7f0e6';context.fillRect(0,0,size,size);context.drawImage(source.image,sx,sy,side,side,0,0,size,size);
    for(const quality of [.88,.78,.65,.5,.35]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=MAX_AVATAR_DATA_URL_LENGTH&&isValidPhotoDataUrl(result))return result;}
    throw Error('照片压缩后仍然过大，请换一张照片。');
  }finally{canvas.width=canvas.height=1;}
}
export async function prepareCompanionPhoto(file,selection={}){const source=await openCompanionPhoto(file);try{return encodeCompanionPhoto(source,selection);}finally{source.dispose();}}
export function mountPhotoCrop(container,source,{onUse,onCancel,onError}){
  container.innerHTML=`<div class="photo-crop"><h3>选择想留下的画面</h3><p id="crop-help">拖动照片调整位置，滑动缩放。也可用位置滑杆或方向键调整。</p><div class="crop-frame"><canvas width="512" height="512" tabindex="0" role="img" aria-label="照片裁剪预览，可用方向键移动" aria-describedby="crop-help"></canvas><span class="crop-grid" aria-hidden="true"></span></div><label class="crop-control">缩放 <output id="crop-scale">1.0×</output><input type="range" min="1" max="4" step="0.05" value="1" data-crop="zoom" aria-label="照片缩放"></label><label class="crop-control">水平位置<input type="range" min="0" max="1" step="0.01" value="0.5" data-crop="x" aria-label="照片水平位置"></label><label class="crop-control">垂直位置<input type="range" min="0" max="1" step="0.01" value="0.5" data-crop="y" aria-label="照片垂直位置"></label><div class="crop-actions"><button type="button" class="button text" data-crop-reset>重置</button><button type="button" class="button secondary" data-crop-cancel>取消裁剪</button><button type="button" class="button primary" data-crop-use>使用此裁剪</button></div><p class="field-help">这里只做预览，最后点击下方「保存」才会更换陪伴照片。</p></div>`;
  const canvas=container.querySelector('canvas'),context=canvas.getContext('2d'),selection={zoom:1,x:.5,y:.5},controller=new AbortController(),opts={signal:controller.signal};let drag=null,frame=0,disposed=false;
  if(!context){source.dispose();container.innerHTML='';throw Error('当前浏览器无法显示裁剪预览。');}
  const render=()=>{frame=0;if(disposed)return;const c=photoCrop(source.width,source.height,selection);context.fillStyle='#f7f0e6';context.fillRect(0,0,512,512);context.drawImage(source.image,c.sx,c.sy,c.side,c.side,0,0,512,512);container.querySelector('#crop-scale').textContent=selection.zoom.toFixed(1)+'×';container.querySelectorAll('[data-crop]').forEach(el=>{el.value=selection[el.dataset.crop];});};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(render);};
  container.addEventListener('input',event=>{const key=event.target.dataset.crop;if(!key)return;selection[key]=Number(event.target.value);schedule();},opts);
  canvas.addEventListener('pointerdown',event=>{if(drag||event.button>0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);},opts);
  canvas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const c=photoCrop(source.width,source.height,selection),scale=c.side/canvas.getBoundingClientRect().width;selection.x=clamp(selection.x-(event.clientX-drag.x)*scale/Math.max(1,source.width-c.side),0,1);selection.y=clamp(selection.y-(event.clientY-drag.y)*scale/Math.max(1,source.height-c.side),0,1);drag.x=event.clientX;drag.y=event.clientY;schedule();},opts);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{drag=null;},opts);
  canvas.addEventListener('keydown',event=>{const keys={ArrowLeft:['x',-.02],ArrowRight:['x',.02],ArrowUp:['y',-.02],ArrowDown:['y',.02]};if(!keys[event.key])return;event.preventDefault();const [key,delta]=keys[event.key];selection[key]=clamp(selection[key]+delta,0,1);schedule();},opts);
  container.querySelector('[data-crop-reset]').addEventListener('click',()=>{Object.assign(selection,{zoom:1,x:.5,y:.5});schedule();},opts);
  container.querySelector('[data-crop-cancel]').addEventListener('click',onCancel,opts);
  container.querySelector('[data-crop-use]').addEventListener('click',()=>{try{onUse(encodeCompanionPhoto(source,selection));}catch(error){onError(error);}},opts);
  render();canvas.focus({preventScroll:true});container.scrollIntoView({block:'nearest',behavior:'instant'});
  return ()=>{if(disposed)return;disposed=true;controller.abort();cancelAnimationFrame(frame);source.dispose();canvas.width=canvas.height=1;container.innerHTML='';};
}
