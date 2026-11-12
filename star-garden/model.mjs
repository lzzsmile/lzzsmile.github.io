export const AVATAR_PRESETS=Object.freeze({friend:'温柔伙伴',cat:'小猫',bunny:'小兔'});
export const MAX_AVATAR_DATA_URL_LENGTH=350*1024;
// Parse dimensions without decoding pixels. All offsets and segment sizes are bounded.
export function photoHeaderDimensions(bytes,mime){
  const bad=()=>{throw Error('照片内容与格式不符，请选择有效的 JPG、PNG 或 WebP 照片。');};
  if(!(bytes instanceof Uint8Array))bad();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const need=(offset,length)=>{if(offset<0||length<0||offset+length>bytes.length)bad();};
  const u16=offset=>{need(offset,2);return view.getUint16(offset);};
  const u32=(offset,little=false)=>{need(offset,4);return view.getUint32(offset,little);};
  const u24=offset=>{need(offset,3);return bytes[offset]+bytes[offset+1]*256+bytes[offset+2]*65536;};
  const text=(offset,length)=>{need(offset,length);return String.fromCharCode(...bytes.subarray(offset,offset+length));};
  const result=(width,height)=>{if(!width||!height)bad();return {width,height};};
  if(mime==='image/png'){
    need(0,33);
    if(text(0,8)!=='\x89PNG\r\n\x1a\n'||u32(8)!==13||text(12,4)!=='IHDR')bad();
    return result(u32(16),u32(20));
  }
  if(mime==='image/jpeg'){
    need(0,4);if(bytes[0]!==255||bytes[1]!==216)bad();
    let offset=2;
    while(offset<bytes.length){
      if(bytes[offset++]!==255)bad();
      while(offset<bytes.length&&bytes[offset]===255)offset++;
      need(offset,1);const marker=bytes[offset++];
      if(marker===0||marker===0xd8||marker===0xda||marker===0xd9)bad();
      if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
      const length=u16(offset);if(length<2)bad();need(offset,length);
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(length<8)bad();const components=bytes[offset+7];
        if(!components||length!==8+3*components)bad();
        return result(u16(offset+5),u16(offset+3));
      }
      offset+=length;
    }
    bad();
  }
  if(mime==='image/webp'){
    need(0,12);if(text(0,4)!=='RIFF'||text(8,4)!=='WEBP'||u32(4,true)+8!==bytes.length)bad();
    let offset=12,width=0,height=0;
    const include=(w,h)=>{result(w,h);width=Math.max(width,w);height=Math.max(height,h);};
    while(offset<bytes.length){
      need(offset,8);const kind=text(offset,4),size=u32(offset+4,true),start=offset+8;
      need(start,size);const next=start+size+(size%2);need(start,size+(size%2));
      if(kind==='VP8X'){
        if(size!==10)bad();include(u24(start+4)+1,u24(start+7)+1);
      }else if(kind==='VP8 '){
        if(size<10||bytes[start]&1||text(start+3,3)!=='\x9d\x01\x2a')bad();
        include((bytes[start+6]+bytes[start+7]*256)&0x3fff,(bytes[start+8]+bytes[start+9]*256)&0x3fff);
      }else if(kind==='VP8L'){
        if(size<5||bytes[start]!==0x2f||bytes[start+4]>>5)bad();
        const bits=u32(start+1,true);include((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);
      }else if(kind==='ANMF'){
        if(size<16)bad();include(u24(start+6)+1,u24(start+9)+1);
      }
      offset=next;
    }
    return result(width,height);
  }
  bad();
}
export function isValidPhotoDataUrl(value){
  if(typeof value!=='string'||value.length>MAX_AVATAR_DATA_URL_LENGTH)return false;
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match||match[2].length%4!==0)return false;
  try {
    const decoded=atob(match[2]);if(btoa(decoded)!==match[2])return false;
    const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
    const {width,height}=photoHeaderDimensions(bytes,`image/${match[1]}`);
    return width<=512&&height<=512;
  } catch {return false;}
}
export function isValidAvatar(avatar){
  if(!avatar||typeof avatar!=='object'||Array.isArray(avatar)||!Object.hasOwn(avatar,'type'))return false;
  const keys=Object.keys(avatar);
  if(avatar.type==='preset')return keys.length===2&&Object.hasOwn(avatar,'id')&&typeof avatar.id==='string'&&Object.hasOwn(AVATAR_PRESETS,avatar.id);
  return avatar.type==='photo'&&keys.length===2&&Object.hasOwn(avatar,'dataUrl')&&isValidPhotoDataUrl(avatar.dataUrl);
}
export const STORAGE_KEY='starwish-garden:data:v1';
export const BACKUP_KEY='starwish-garden:before-import:v1';
export const MAX_BACKUP_BYTES=32*1024*1024;
export const MAX_ENTRIES=20000;
export const CATEGORIES={self:{label:'好好爱自己',color:'rose',icon:'flower'},life:{label:'生活的小美好',color:'sage',icon:'leaf'},together:{label:'我们的时光',color:'amber',icon:'spark'}};
export const ENDINGS={
  hug:{icon:'heart',title:'星光拥抱',subtitle:'把温暖一圈圈传给你',stamp:'被星光拥抱'},
  dance:{icon:'flower',title:'花园舞会',subtitle:'轻点节拍，一起转个圈',stamp:'花园里的小舞会'},
  fireworks:{icon:'spark',title:'专属烟花',subtitle:'亲手点亮这一片夜空',stamp:'为你亮起的烟花'},
  meteor:{icon:'spark',title:'流星许愿',subtitle:'把心愿交给一场流星雨',stamp:'流星捎来的祝福'},
  bloom:{icon:'flower',title:'繁花盛放',subtitle:'轻轻浇水，让花海绽放',stamp:'为你盛开的花海'},
  lanterns:{icon:'sun',title:'心愿天灯',subtitle:'放飞一盏暖暖的祝福',stamp:'飞向星空的心愿'},
  bubbles:{icon:'heart',title:'彩虹泡泡',subtitle:'戳破泡泡，收集小惊喜',stamp:'装满快乐的泡泡'},
  aurora:{icon:'leaf',title:'极光漫游',subtitle:'拨动星光，换一片天空',stamp:'一起看过的极光'}
};
export const uid=()=>globalThis.crypto?.randomUUID?.()||`g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function localDate(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function emptyState(now=new Date().toISOString()) {return {version:1,createdAt:now,updatedAt:now,settings:{recipient:'',companion:'陪伴者',dedication:'愿你喜欢的事，都慢慢开花。',birthday:'',shirt:'#a2b79b'},wishes:[],stamps:[],pending:[]};}
export const examples=[{title:'读完一本喜欢的书',note:'不用赶进度，读几页也很好。',category:'self',kind:'habit',target:7},{title:'出门走走，看看天空',note:'给自己一小段没有安排的时间。',category:'life',kind:'habit',target:5},{title:'一起去看一场日落',note:'选一个天气刚好的傍晚。',category:'together',kind:'once',target:1}];
export const progress=w=>Math.min(w.entries.length,w.target);
export const isComplete=w=>w.entries.length>=w.target;
export function addWish(state,input,now=new Date().toISOString()) {if(state.wishes.length>=200)throw Error('花园里最多可以保存 200 个愿望，请先导出备份。');const wish={id:uid(),title:input.title.trim(),note:input.note?.trim()||'',category:input.category,kind:input.kind,target:input.kind==='once'?1:Number(input.target),createdAt:now,archived:false,entries:[]};if(!wish.title||wish.title.length>60)throw Error('愿望名称需要 1–60 个字。');if(wish.note.length>300)throw Error('愿望备注请控制在 300 字以内。');if(!CATEGORIES[wish.category]||!['once','habit'].includes(wish.kind)||!Number.isInteger(wish.target)||wish.target<1||wish.target>365)throw Error('请检查愿望类型与目标次数。');state.wishes.unshift(wish);return wish;}
export function checkIn(state,id,note='',now=new Date()) {const w=state.wishes.find(x=>x.id===id);if(!w||w.archived)throw Error('这个愿望暂时不在花园里。');if(isComplete(w))throw Error('这个愿望已经开花啦。');const day=localDate(now);if(state.wishes.reduce((n,x)=>n+x.entries.length,0)>=MAX_ENTRIES)throw Error('花园已达到 20000 条记录上限，请导出备份保管。');if(w.entries.some(e=>e.date===day))throw Error('今天已经记下啦，明天再来浇水吧。');if(note.length>300)throw Error('打卡心情请控制在 300 字以内。');w.entries.push({id:uid(),date:day,at:now.toISOString(),note:note.trim()});let celebration=null;if(isComplete(w)){celebration={id:uid(),wishId:w.id,title:w.title,category:w.category,createdAt:now.toISOString()};state.pending.push(celebration);}return {wish:w,celebration};}
export function finishCelebration(state,id,ending,now=new Date().toISOString()) {if(!ENDINGS[ending])throw Error('请选择一个庆祝结局。');const old=state.stamps.find(x=>x.id===id);if(old)return old;const p=state.pending.find(x=>x.id===id);if(!p)throw Error('这段庆祝已经完成或不存在。');const stamp={...p,ending,celebratedAt:now};state.stamps.unshift(stamp);state.pending=state.pending.filter(x=>x.id!==id);return stamp;}
export function undoEntry(state,wishId,entryId){const w=state.wishes.find(x=>x.id===wishId);if(!w)throw Error('愿望不存在。');w.entries=w.entries.filter(x=>x.id!==entryId);if(!isComplete(w)){state.pending=state.pending.filter(x=>x.wishId!==wishId);state.stamps=state.stamps.filter(x=>x.wishId!==wishId);}}
export function deleteWish(state,id){
  const wish=state.wishes.find(w=>w.id===id);
  if(!wish)throw Error('这个愿望已经删除或不存在。');
  state.wishes=state.wishes.filter(w=>w.id!==id);
  state.pending=state.pending.filter(c=>c.wishId!==id);
  state.stamps=state.stamps.filter(c=>c.wishId!==id);
  return wish;
}
export function stats(state,today=localDate()){const entries=state.wishes.flatMap(w=>w.entries);return {total:entries.length,flowers:state.wishes.filter(isComplete).length,today:entries.filter(e=>e.date===today).length,active:state.wishes.filter(w=>!w.archived&&!isComplete(w)).length,days:new Set(entries.map(e=>e.date)).size};}
export function exportData(state){return {app:'starwish-garden',formatVersion:1,exportedAt:new Date().toISOString(),data:state};}
const fail=()=>{throw Error('这份备份格式不正确，原有数据没有被更改。');};
const str=(s,max=300)=>typeof s==='string'&&s.length<=max;
const iso=s=>str(s,40)&&Number.isFinite(Date.parse(s));
const id=s=>str(s,100)&&/^[a-zA-Z0-9_-]+$/.test(s);
const day=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&localDate(new Date(`${s}T12:00:00`))===s;
export function validateState(s){if(!s||s.version!==1||!iso(s.createdAt)||!iso(s.updatedAt)||!s.settings||!Array.isArray(s.wishes)||!Array.isArray(s.stamps)||!Array.isArray(s.pending)||s.wishes.length>200||s.stamps.length>200||s.pending.length>200)fail();const p=s.settings;if(Object.hasOwn(p,'avatar')&&!isValidAvatar(p.avatar))fail();if(!str(p.recipient,30)||!str(p.companion,30)||!str(p.dedication,160)||!(p.birthday===''||/^\d{2}-\d{2}$/.test(p.birthday)&&day(`2024-${p.birthday}`))||!/^#[0-9a-fA-F]{6}$/.test(p.shirt))fail();if(s.wishes.reduce((n,w)=>n+(Array.isArray(w?.entries)?w.entries.length:0),0)>MAX_ENTRIES)fail();const ids=new Set();for(const w of s.wishes){if(!id(w.id)||ids.has(w.id)||!str(w.title,60)||!w.title.trim()||!str(w.note)||!Object.hasOwn(CATEGORIES,w.category)||!['once','habit'].includes(w.kind)||!Number.isInteger(w.target)||w.target<1||w.target>365||(w.kind==='once'&&w.target!==1)||!iso(w.createdAt)||typeof w.archived!=='boolean'||!Array.isArray(w.entries)||w.entries.length>w.target)fail();ids.add(w.id);const dates=new Set(),entryIds=new Set();for(const e of w.entries){if(!id(e.id)||entryIds.has(e.id)||!day(e.date)||dates.has(e.date)||!iso(e.at)||!str(e.note))fail();dates.add(e.date);entryIds.add(e.id);}}const celebrationIds=new Set(),wishCelebrations=new Set();for(const c of [...s.pending,...s.stamps]){const w=s.wishes.find(x=>x.id===c.wishId);if(!id(c.id)||celebrationIds.has(c.id)||wishCelebrations.has(c.wishId)||!w||!isComplete(w)||!str(c.title,60)||!Object.hasOwn(CATEGORIES,c.category)||!iso(c.createdAt))fail();if(c.ending!==undefined&&!Object.hasOwn(ENDINGS,c.ending))fail();if(s.stamps.includes(c)&&(!Object.hasOwn(ENDINGS,c.ending)||!iso(c.celebratedAt)))fail();celebrationIds.add(c.id);wishCelebrations.add(c.wishId);}return structuredClone(s);}
export function parseBackup(text){let b;try{b=JSON.parse(text);}catch{fail();}if(b?.app!=='starwish-garden'||b.formatVersion!==1)throw Error('请选择「星愿花园」导出的 JSON 备份。');return validateState(b.data);}
