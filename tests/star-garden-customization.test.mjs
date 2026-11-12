import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,addWish,checkIn,finishCelebration,deleteWish,validateState,parseBackup,exportData,isValidAvatar,photoHeaderDimensions,MAX_AVATAR_DATA_URL_LENGTH} from '../star-garden/model.mjs';
import {companion,person} from '../star-garden/art.mjs';
import {validatePhotoInput,photoCrop,prepareCompanionPhoto,MAX_PHOTO_BYTES} from '../star-garden/companion-photo.mjs';
const create=s=>addWish(s,{title:'小愿望',category:'self',kind:'once'});
const complete=(s,w)=>checkIn(s,w.id,'',new Date('2026-11-12T12:00:00Z')).celebration;
function jpegBytes(width=128,height=128){return new Uint8Array([255,216,255,225,0,8,69,120,105,102,0,0,255,192,0,11,8,height>>8,height&255,width>>8,width&255,1,1,17,0,255,217]);}
function pngBytes(width=128,height=128){const b=new Uint8Array(33);b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const v=new DataView(b.buffer);v.setUint32(16,width);v.setUint32(20,height);b[24]=8;b[25]=2;return b;}
function webpBytes(kind='VP8X',width=128,height=128){const size=kind==='VP8L'?6:10,b=new Uint8Array(20+size),v=new DataView(b.buffer);b.set(new TextEncoder().encode('RIFF'));v.setUint32(4,b.length-8,true);b.set(new TextEncoder().encode('WEBP'+kind),8);v.setUint32(16,kind==='VP8L'?5:size,true);if(kind==='VP8X'){v.setUint32(24,width-1,true);b[27]=(height-1)&255;b[28]=((height-1)>>8)&255;b[29]=((height-1)>>16)&255;}else if(kind==='VP8L'){b[20]=47;v.setUint32(21,(width-1)|((height-1)<<14),true);}else{b.set([0,0,0,157,1,42],20);v.setUint16(26,width,true);v.setUint16(28,height,true);}return b;}
const dataUrl=(mime,bytes)=>`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const jpeg=dataUrl('image/jpeg',jpegBytes());
test('deleting a wish cascades only its pending celebrations and stamps',()=>{
  for(const stamp of [false,true]){
    const s=emptyState(),w=create(s),other=create(s),third=create(s);
    const a=complete(s,w),b=complete(s,other);complete(s,third);
    finishCelebration(s,b.id,'dance');if(stamp)finishCelebration(s,a.id,'hug');
    const before=structuredClone({wish:other,stamp:s.stamps.find(x=>x.wishId===other.id),pending:s.pending.find(x=>x.wishId===third.id)});
    assert.equal(deleteWish(s,w.id),w);assert(!s.wishes.includes(w));assert(!s.pending.some(x=>x.wishId===w.id));assert(!s.stamps.some(x=>x.wishId===w.id));
    assert.deepEqual(other,before.wish);assert.deepEqual(s.stamps.find(x=>x.wishId===other.id),before.stamp);assert.deepEqual(s.pending.find(x=>x.wishId===third.id),before.pending);validateState(s);
    const after=structuredClone(s);assert.throws(()=>deleteWish(s,w.id),/不存在/);assert.throws(()=>deleteWish(s,'missing'),/不存在/);assert.deepEqual(s,after);
  }
});
test('legacy v1 settings remain unchanged without an avatar',()=>{const s=emptyState(),before=structuredClone(s);assert(!Object.hasOwn(s.settings,'avatar'));assert.deepEqual(validateState(s),before);assert.deepEqual(parseBackup(JSON.stringify(exportData(s))),before);assert.deepEqual(s,before);});
test('every preset and supported photo format round-trips in v1 backup',()=>{
  const png=dataUrl('image/png',pngBytes());const webp=dataUrl('image/webp',webpBytes());
  for(const avatar of [...['friend','cat','bunny'].map(id=>({type:'preset',id})),...[jpeg,png,webp].map(dataUrl=>({type:'photo',dataUrl}))]){const s=emptyState();s.settings.avatar=avatar;assert(isValidAvatar(avatar));assert.deepEqual(parseBackup(JSON.stringify(exportData(s))),s);}
});
test('invalid and malicious avatars are rejected without mutating source',()=>{
  const bad=[null,{},[],{type:'preset',id:'__proto__'},{type:'preset',id:'constructor'},{type:'preset',id:'toString'},{type:'preset',id:'cat',extra:1},{type:'photo',dataUrl:'https://evil.test/photo.jpg'},{type:'photo',dataUrl:'javascript:alert(1)'},{type:'photo',dataUrl:'data:image/svg+xml;base64,PHN2Zz4='},{type:'photo',dataUrl:'data:image/jpeg;base64,'+btoa('<svg/>')},{type:'photo',dataUrl:jpeg+'" onerror="alert(1)'},{type:'photo',dataUrl:jpeg+'A'.repeat(MAX_AVATAR_DATA_URL_LENGTH)},{type:'photo',dataUrl:'data:image/jpeg;base64,/9j/!'}];
  for(const avatar of bad){const s=emptyState();s.settings.avatar=avatar;const before=structuredClone(s);assert.equal(isValidAvatar(avatar),false);assert.throws(()=>validateState(s));assert.deepEqual(s,before);}
});
test('companion defaults to existing friend and renders only validated image sources',()=>{assert.equal(companion(emptyState().settings),person());assert.match(companion({avatar:{type:'preset',id:'cat'}}),/companion-cat/);assert.match(companion({avatar:{type:'preset',id:'bunny'}}),/companion-bunny/);assert.match(companion({avatar:{type:'photo',dataUrl:jpeg}}),/class="person companion-photo/);assert(!companion({avatar:{type:'photo',dataUrl:'https://evil.test/'}}).includes('evil.test'));assert(!companion({},'normal" onload="evil').includes('onload'));});
test('photo input bounds and centered crop accept normal iPhone 12MP images',()=>{validatePhotoInput({type:'image/jpeg',size:MAX_PHOTO_BYTES});assert.throws(()=>validatePhotoInput({type:'image/heic',size:1}));assert.throws(()=>validatePhotoInput({type:'image/jpeg',size:MAX_PHOTO_BYTES+1}));assert.throws(()=>validatePhotoInput({type:'image/png',size:0}));assert.deepEqual(photoCrop(4032,3024),{sx:504,sy:0,side:3024,size:512});assert.deepEqual(photoCrop(200,300),{sx:0,sy:50,side:200,size:200});for(const dims of [[0,2],[NaN,3],[40000,10],[9000,9000]])assert.throws(()=>photoCrop(...dims));});
test('photo preparation locally crops and revokes URLs on success and decode errors',async()=>{
  const original={Image:globalThis.Image,document:globalThis.document,create:URL.createObjectURL,revoke:URL.revokeObjectURL};let revoked=0,draw;
  URL.createObjectURL=()=> 'blob:local';URL.revokeObjectURL=()=>revoked++;
  globalThis.Image=class {naturalWidth=4032;naturalHeight=3024;set src(value){if(value)queueMicrotask(()=>this.onload?.());}};
  globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(...args){draw=args;}}),toDataURL:()=>jpeg})};
  try {assert.equal(await prepareCompanionPhoto(new Blob([jpegBytes(4032,3024)],{type:'image/jpeg'})),jpeg);assert.deepEqual(draw.slice(1),[256,0,1536,1536,0,0,512,512]);assert.equal(revoked,1);globalThis.Image=class {set src(value){if(value)queueMicrotask(()=>this.onerror?.());}};await assert.rejects(prepareCompanionPhoto(new Blob([pngBytes()],{type:'image/png'})),/无法读取/);assert.equal(revoked,2);}finally{globalThis.Image=original.Image;globalThis.document=original.document;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
});

test('photo preparation rejects mismatched content before creating an object URL',async()=>{await assert.rejects(prepareCompanionPhoto(new Blob(['<svg/>'],{type:'image/jpeg'})),/内容与格式不符/);});

test('bounded header parser scans JPEG APP/EXIF and all WebP dimension variants',()=>{
  assert.deepEqual(photoHeaderDimensions(jpegBytes(4032,3024),'image/jpeg'),{width:4032,height:3024});
  assert.deepEqual(photoHeaderDimensions(pngBytes(9000,9000),'image/png'),{width:9000,height:9000});
  for(const kind of ['VP8X','VP8L','VP8 '])assert.deepEqual(photoHeaderDimensions(webpBytes(kind,4032,3024),'image/webp'),{width:4032,height:3024});
  for(const [mime,bytes] of [['image/jpeg',jpegBytes()],['image/png',pngBytes()],['image/webp',webpBytes()]])for(const end of [0,3,12,bytes.length-10])assert.throws(()=>photoHeaderDimensions(bytes.slice(0,end),mime));
  const broken=jpegBytes();broken[4]=255;assert.throws(()=>photoHeaderDimensions(broken,'image/jpeg'));
});
test('oversized dimensions are rejected before object URL creation or browser decode',async()=>{
  const original=URL.createObjectURL;let calls=0;URL.createObjectURL=()=>{calls++;throw Error('must not decode');};
  try{for(const [mime,bytes] of [['image/jpeg',jpegBytes(9000,9000)],['image/png',pngBytes(1,20000)],['image/webp',webpBytes('VP8X',9000,9000)],['image/webp',webpBytes('VP8L',9000,9000)],['image/webp',webpBytes('VP8 ',9000,9000)]])await assert.rejects(prepareCompanionPhoto(new Blob([bytes],{type:mime})),/尺寸过大/);assert.equal(calls,0);}finally{URL.createObjectURL=original;}
});
test('imported photo dimensions must fit generated avatar limits',()=>{
  for(const [mime,make] of [['image/jpeg',jpegBytes],['image/png',pngBytes],['image/webp',(w,h)=>webpBytes('VP8X',w,h)]]){assert(isValidAvatar({type:'photo',dataUrl:dataUrl(mime,make(512,512))}));assert(!isValidAvatar({type:'photo',dataUrl:dataUrl(mime,make(513,512))}));assert(!isValidAvatar({type:'photo',dataUrl:dataUrl(mime,make(9000,9000))}));}
});
