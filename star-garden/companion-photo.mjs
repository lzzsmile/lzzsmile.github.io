import {MAX_AVATAR_DATA_URL_LENGTH,isValidPhotoDataUrl,photoHeaderDimensions} from './model.mjs';
export const MAX_PHOTO_BYTES=8*1024*1024;
export const MAX_PHOTO_PIXELS=40*1000*1000;
export function validatePhotoInput(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPG、PNG 或 WebP 照片。iPhone 的 HEIC 照片请先转换为 JPG。');
  if(!Number.isFinite(file.size)||file.size<=0)throw Error('这张照片是空的，请重新选择。');
  if(file.size>MAX_PHOTO_BYTES)throw Error('照片不能超过 8 MB，请选一张小一些的照片。');
}
export function photoCrop(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16384||height>16384||width*height>MAX_PHOTO_PIXELS)throw Error('照片尺寸过大或无效，请缩小照片后再试。');
  const side=Math.min(width,height);
  return {sx:(width-side)/2,sy:(height-side)/2,side,size:Math.min(512,side)};
}
// Decode locally and re-encode only pixels: no filename, EXIF or GPS metadata is retained.
export async function prepareCompanionPhoto(file){
  validatePhotoInput(file);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const dimensions=photoHeaderDimensions(bytes,file.type);
  photoCrop(dimensions.width,dimensions.height);
  const url=URL.createObjectURL(file);
  try {
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('无法读取这张照片，请换一张 JPG、PNG 或 WebP 照片。'));img.src=url;});
    const {sx,sy,side,size}=photoCrop(img.naturalWidth,img.naturalHeight);
    const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const context=canvas.getContext('2d');
    if(!context)throw Error('当前浏览器无法处理照片，请换一个浏览器重试。');
    context.fillStyle='#f7f0e6';context.fillRect(0,0,size,size);
    context.drawImage(img,sx,sy,side,side,0,0,size,size);
    for(const quality of [.88,.78,.65,.5,.35]){
      const result=canvas.toDataURL('image/jpeg',quality);
      if(result.length<=MAX_AVATAR_DATA_URL_LENGTH&&isValidPhotoDataUrl(result))return result;
    }
    throw Error('照片压缩后仍然过大，请换一张照片。');
  } finally {URL.revokeObjectURL(url);}
}
