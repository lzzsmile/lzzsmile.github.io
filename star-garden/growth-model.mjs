import {DEFAULT_AVATAR,isValidAvatar,validateState as validateV1,MAX_BACKUP_BYTES,MAX_ENTRIES,uid,localDate} from './model.mjs';
export {DEFAULT_AVATAR,isValidAvatar,MAX_BACKUP_BYTES,MAX_ENTRIES,uid,localDate};
export const STORAGE_KEY='starwish-garden:growth:v2';
export const BACKUP_KEY='starwish-garden:before-import:v2';
export const LEGACY_STORAGE_KEY='starwish-garden:data:v1';
export const INTERACTIONS=Object.freeze({sunrise:{title:'点亮晨光'},highfive:{title:'击掌庆祝'},plant:{title:'种下成长'},wind:{title:'乘风向前'},postcard:{title:'写给未来'},rhythm:{title:'跃动节拍'}});
const fail=(message='这份备份格式不正确，原有数据没有被更改。')=>{throw Error(message);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const keys=(x,required,optional=[])=>object(x)&&required.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>required.includes(k)||optional.includes(k));
const str=(x,max)=>typeof x==='string'&&x.length<=max;
const id=x=>str(x,100)&&/^[a-zA-Z0-9_-]+$/.test(x);
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().replace('.000Z','Z')===x.replace('.000Z','Z');
export const isDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(`${x}T12:00:00Z`))&&new Date(`${x}T12:00:00Z`).toISOString().slice(0,10)===x;
function safeTree(x,depth=0){if(depth>40)fail();if(x===null||['string','boolean'].includes(typeof x))return;if(typeof x==='number'&&Number.isFinite(x))return;if(Array.isArray(x)){for(const y of x)safeTree(y,depth+1);return;}if(!object(x))fail();for(const [k,v] of Object.entries(x)){if(['__proto__','prototype','constructor'].includes(k))fail();safeTree(v,depth+1);}}
const touch=(s,now)=>{if(!iso(now))fail('时间格式不正确。');s.updatedAt=now;};
export function emptyState(now=new Date().toISOString()){if(!iso(now))fail();return {version:2,createdAt:now,updatedAt:now,settings:{companionConfigured:false,recipient:'',companion:'同行者',dedication:'每一小步，都在向前。',birthday:'',shirt:'#f1b74b',avatar:{...DEFAULT_AVATAR}},tasks:[],entries:[],lastInteraction:null,legacy:null};}
// Old backups have no setup marker. Infer only from persisted customization,
// never from the mere presence of the built-in illustration. Reading stays non-mutating.
export function hasConfiguredCompanion(settings){
 if(typeof settings.companionConfigured==='boolean')return settings.companionConfigured;
 const defaults=[{companion:'同行者',dedication:'每一小步，都在向前。',shirt:'#f1b74b'},{companion:'陪伴者',dedication:'愿你喜欢的事，都慢慢开花。',shirt:'#a2b79b'}];
 const avatar=settings.avatar;
 return Boolean(settings.recipient||settings.birthday||avatar&&(avatar.type==='photo'||avatar.id!==DEFAULT_AVATAR.id)||!defaults.some(d=>settings.companion===d.companion&&settings.dedication===d.dedication&&settings.shirt.toLowerCase()===d.shirt));
}
export function monthDates(month){
 if(!isDate(month+'-01'))fail('月份无效。');
 const first=new Date(month+'-01T12:00:00Z'),dates=Array((first.getUTCDay()+6)%7).fill(null);
 const day=new Date(first);while(day.toISOString().slice(0,7)===month){dates.push(day.toISOString().slice(0,10));day.setUTCDate(day.getUTCDate()+1);}
 while(dates.length%7)dates.push(null);return dates;
}
// Calendar arithmetic uses civil UTC dates so DST never skips a day.
export function shiftDate(date,delta){
 if(!isDate(date)||!Number.isInteger(delta))fail('日期无效。');
 const day=new Date(date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+delta);
 if(!Number.isFinite(day.getTime()))return null;
 const next=day.toISOString().slice(0,10);return isDate(next)?next:null;
}
export function weekDates(date){
 if(!isDate(date))fail('日期无效。');
 const offset=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
 return Array.from({length:7},(_,index)=>shiftDate(date,index-offset));
}
export function shiftMonth(month,delta){
 if(!isDate(month+'-01')||!Number.isInteger(delta))fail('月份无效。');
 const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);
 const next=d.toISOString().slice(0,7);return isDate(next+'-01')?next:null;
}
function validTask(t){return keys(t,['id','title','note','schedule','startDate','date','createdAt','archived'],['deletedAt'])&&(!Object.hasOwn(t,'deletedAt')||iso(t.deletedAt))&&id(t.id)&&str(t.title,60)&&t.title.trim().length>0&&str(t.note,300)&&['once','daily','weekdays'].includes(t.schedule)&&isDate(t.startDate)&&(t.schedule==='once'?isDate(t.date)&&t.date>=t.startDate:t.date===null)&&iso(t.createdAt)&&typeof t.archived==='boolean';}
export function addTask(s,input,now=new Date().toISOString()){
 if(!object(input)||Object.hasOwn(input,'note')&&!str(input.note,300))fail('请检查事项内容。');
 if(s.tasks.length>=200)fail('最多可以保存 200 件事（包括归档和已删除事项），请先导出备份。');
 const startDate=input.startDate??localDate(new Date(now));
 const task={id:uid(),title:typeof input.title==='string'?input.title.trim():'',note:typeof input.note==='string'?input.note.trim():'',schedule:input.schedule??'daily',startDate,date:(input.schedule??'daily')==='once'?(input.date??startDate):null,createdAt:now,archived:false};
 if(!validTask(task))fail('请检查名称、日期与重复方式（名称 1–60 字，备注不超过 300 字）。');
 touch(s,now);s.tasks.push(task);return task;
}
export function isScheduled(task,date){if(!isDate(date)||date<task.startDate)return false;if(task.schedule==='once')return task.date===date;if(task.schedule==='weekdays'){const d=new Date(`${date}T12:00:00Z`).getUTCDay();return d>0&&d<6;}return task.schedule==='daily';}
export function tasksForDate(s,date=localDate()){if(!isDate(date))fail('日期无效。');return s.tasks.filter(t=>!t.deletedAt&&isScheduled(t,date)&&(!t.archived||s.entries.some(e=>e.taskId===t.id&&e.date===date)));}
export function chooseInteraction(previous=null,rng=Math.random){const options=Object.keys(INTERACTIONS).filter(k=>k!==previous);const value=rng();if(!Number.isFinite(value)||value<0||value>=1)fail('随机数无效。');return options[Math.floor(value*options.length)];}
export function checkIn(s,taskId,date=localDate(),note='',now=new Date(),rng=Math.random){
 const t=s.tasks.find(t=>t.id===taskId);if(!t||t.archived||t.deletedAt)fail('这件事已删除、收起或不存在。');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!isDate(date)||date>localDate(now))fail('只能记录今天或过去的日子。');
 if(!isScheduled(t,date))fail('这一天没有安排这件事。');
 if(s.entries.some(e=>e.taskId===taskId&&e.date===date))fail('这件事当天已经完成了。');
 if(s.entries.length>=MAX_ENTRIES)fail('已达到 20000 条记录上限，请导出备份。');
 if(!str(note,300))fail('备注请控制在 300 字以内。');
 const interaction=chooseInteraction(s.lastInteraction,rng),at=now.toISOString();
 const entry={id:uid(),taskId,title:t.title,date,at,note:note.trim(),interaction,completedAt:null};
 s.entries.push(entry);s.lastInteraction=interaction;touch(s,at);return entry;
}
export function finishInteraction(s,entryId,now=new Date().toISOString()){const e=s.entries.find(e=>e.id===entryId);if(!e)fail('这一步已经撤销或不存在。');if(!iso(now))fail();if(!e.completedAt){e.completedAt=now;touch(s,now);}return e;}
export function undoEntry(s,entryId,now=new Date().toISOString()){const index=s.entries.findIndex(e=>e.id===entryId);if(index<0)fail('这一步已经撤销或不存在。');if(!iso(now))fail();const [entry]=s.entries.splice(index,1);touch(s,now);return entry;}
export function archiveTask(s,taskId,archived=true,now=new Date().toISOString()){const t=s.tasks.find(t=>t.id===taskId);if(!t||t.deletedAt||typeof archived!=='boolean')fail('这件事已删除或不存在。');if(!iso(now))fail();t.archived=archived;touch(s,now);return t;}
// Soft deletion retains the task referenced by every historical entry and backup.
// Keep archived unchanged so restoration returns to the exact prior schedule state.
export function deleteTask(s,taskId,now=new Date().toISOString()){
 const t=s.tasks.find(t=>t.id===taskId);if(!t||t.deletedAt)fail('这件事已删除或不存在。');
 if(!iso(now))fail('时间格式不正确。');t.deletedAt=now;touch(s,now);return t;
}
export function restoreTask(s,taskId,now=new Date().toISOString()){
 const t=s.tasks.find(t=>t.id===taskId);if(!t?.deletedAt)fail('这件事已恢复或不存在。');
 if(!iso(now))fail('时间格式不正确。');delete t.deletedAt;touch(s,now);return t;
}
export function history(s,date){if(date!==undefined&&!isDate(date))fail('日期无效。');return s.entries.filter(e=>date===undefined||e.date===date).map((entry,index)=>({entry,index})).sort((a,b)=>b.entry.date.localeCompare(a.entry.date)||b.entry.at.localeCompare(a.entry.at)||b.index-a.index).map(x=>x.entry);}
export function stats(s,date=localDate()){return {total:s.entries.length,today:s.entries.filter(e=>e.date===date).length,days:new Set(s.entries.map(e=>e.date)).size,active:tasksForDate(s,date).filter(t=>!t.archived).length};}
export function validateState(s){
 safeTree(s);if(!keys(s,['version','createdAt','updatedAt','settings','tasks','entries','lastInteraction','legacy'])||s.version!==2||!iso(s.createdAt)||!iso(s.updatedAt)||!Array.isArray(s.tasks)||s.tasks.length>200||!Array.isArray(s.entries)||s.entries.length>MAX_ENTRIES||!(s.lastInteraction===null||Object.hasOwn(INTERACTIONS,s.lastInteraction)))fail();
 const p=s.settings;if(!keys(p,['recipient','companion','dedication','birthday','shirt'],['avatar','companionConfigured'])||Object.hasOwn(p,'companionConfigured')&&typeof p.companionConfigured!=='boolean'||!str(p.recipient,30)||!str(p.companion,30)||!str(p.dedication,160)||!(p.birthday===''||typeof p.birthday==='string'&&/^\d{2}-\d{2}$/.test(p.birthday)&&isDate(`2024-${p.birthday}`))||!/^#[0-9a-fA-F]{6}$/.test(p.shirt)||Object.hasOwn(p,'avatar')&&!isValidAvatar(p.avatar))fail();
 const ids=new Set(),pairs=new Set(),taskMap=new Map();for(const t of s.tasks){if(!validTask(t)||ids.has(t.id))fail();ids.add(t.id);taskMap.set(t.id,t);}
 for(const e of s.entries){const t=taskMap.get(e.taskId),pair=`${e.taskId}|${e.date}`;if(!keys(e,['id','taskId','title','date','at','note','interaction','completedAt'])||!id(e.id)||ids.has(e.id)||!t||!str(e.title,60)||!e.title.trim()||!isDate(e.date)||!isScheduled(t,e.date)||pairs.has(pair)||!iso(e.at)||!str(e.note,300)||!Object.hasOwn(INTERACTIONS,e.interaction)||!(e.completedAt===null||iso(e.completedAt)))fail();ids.add(e.id);pairs.add(pair);}
 if(s.legacy!==null){if(!keys(s.legacy,['version','migratedAt','source'])||s.legacy.version!==1||!iso(s.legacy.migratedAt))fail();validateV1(s.legacy.source);}
 return structuredClone(s);
}
export function migrateV1(source,now=new Date().toISOString()){
 safeTree(source);const old=validateV1(source);now=new Date(now).toISOString();const s=emptyState(now);s.settings={companionConfigured:hasConfiguredCompanion(old.settings),recipient:old.settings.recipient,companion:old.settings.companion,dedication:old.settings.dedication,birthday:old.settings.birthday,shirt:old.settings.shirt,...(old.settings.avatar?{avatar:structuredClone(old.settings.avatar)}:{})};s.legacy={version:1,migratedAt:now,source:old};
 old.wishes.forEach((w,i)=>{const dates=w.entries.map(e=>e.date).sort();const start=dates[0]??(w.kind==='once'?localDate(new Date(now)):localDate(new Date(w.createdAt)));const task={id:`legacy-task-${i}`,title:w.title,note:w.note,schedule:w.kind==='once'?'once':'daily',startDate:start,date:w.kind==='once'?start:null,createdAt:new Date(w.createdAt).toISOString(),archived:w.archived||w.entries.length>=w.target};s.tasks.push(task);w.entries.forEach((e,j)=>{const interaction=Object.keys(INTERACTIONS)[s.entries.length%Object.keys(INTERACTIONS).length];s.entries.push({id:`legacy-entry-${i}-${j}`,taskId:task.id,title:w.title,date:e.date,at:new Date(e.at).toISOString(),note:e.note,interaction,completedAt:new Date(e.at).toISOString()});s.lastInteraction=interaction;});});return validateState(s);
}
export function exportData(s,now=new Date().toISOString()){if(!iso(now))fail();const backup={app:'starwish-garden',formatVersion:2,exportedAt:now,data:validateState(s)};if(new TextEncoder().encode(JSON.stringify(backup)).length>MAX_BACKUP_BYTES)fail('备份超过 32 MiB 上限，原有数据没有被更改。');return backup;}
export function parseBackup(text,now=new Date().toISOString()){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)fail('备份文件过大或格式不正确。');let b;try{b=JSON.parse(text);}catch{fail();}safeTree(b);
 if(!keys(b,['app','formatVersion','exportedAt','data'])||b.app!=='starwish-garden'||!iso(b.exportedAt))fail();
 if(b.formatVersion===1)return migrateV1(b.data,now);if(b.formatVersion!==2)fail();return validateState(b.data);
}
