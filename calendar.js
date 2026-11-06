/** Civil-date/calendar engine. Dates are ISO YYYY-MM-DD, days use UTC ordinals.
 * Events: id,title,calendar(solar|lunar),year,month,day,repeat(none|annual).
 * Optional policies: feb29(prev|next|skip), leapMonth boolean,
 * leapMonthFallback(regular|skip), shortMonth(last-day|skip).
 * nextOccurrence includes past non-repeating dates (negative days).
 */
export const MIN_YEAR=1901, MAX_YEAR=2100, MAX_EVENTS=1000;
export const MAX_BACKUP_BYTES=24*1024*1024;
const DAY=86400000;
const pad=n=>String(n).padStart(2,'0');
function fail(message){throw new Error(message);}
function integer(n,min,max,name){if(!Number.isInteger(n)||n<min||n>max)fail(`${name}须为 ${min}–${max} 的整数`);return n;}
function choice(v,values,name){if(!values.includes(v))fail(`${name}无效`);return v;}
function text(v,max,name){if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))fail(`${name}无效`);return v;}
function plain(o){return o!==null&&typeof o==='object'&&!Array.isArray(o)&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);}
function keys(o,allowed){if(!plain(o)||Object.keys(o).some(k=>!allowed.includes(k)))fail('包含未知字段或格式无效');}
export function todayISO(date=new Date()){return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;}
function ordinal(iso){if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))fail('日期格式应为 YYYY-MM-DD');const [y,m,d]=iso.split('-').map(Number);const t=Date.UTC(y,m-1,d);if(new Date(t).toISOString().slice(0,10)!==iso)fail('日期不存在');return t/DAY;}
function isoDay(n){return new Date(n*DAY).toISOString().slice(0,10);}
export function addDays(iso,n){integer(n,-1000000,1000000,'天数');return isoDay(ordinal(iso)+n);}
export function differenceDays(a,b){return ordinal(a)-ordinal(b);}
function solarDate(y,m,d){const s=`${y}-${pad(m)}-${pad(d)}`;ordinal(s);return s;}
/* Deterministic 1901–2100 lunar month data generated from lunar-javascript 1.7.7,
 * https://www.npmjs.com/package/lunar-javascript . No runtime dependency.
 * Intl Chinese calendar is deliberately avoided: ICU 78.3 gives incorrect
 * 2027 New Year (Feb 7 rather than Feb 6) on the tested runtime.
MIT License

Copyright (c) 2018 6tail

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const LUNAR_DATA=[[-25153,0,1874],[-24799,0,3749],[-24444,5,5706],[-24061,0,1611],[-23707,0,2715],[-23352,4,5462],[-22968,0,1386],[-22614,0,2905],[-22259,2,5970],[-21875,0,1874],[-21521,6,6949],[-21137,0,2853],[-20783,0,2635],[-20429,5,5291],[-20045,0,685],[-19691,0,1387],[-19336,2,2921],[-18952,0,3497],[-18597,7,7570],[-18213,0,3730],[-17859,0,3365],[-17505,5,6733],[-17121,0,2646],[-16767,0,694],[-16413,4,5557],[-16028,0,1748],[-15674,0,3753],[-15319,2,7826],[-14935,0,3730],[-14581,6,3366],[-14198,0,1323],[-13844,0,2647],[-13489,5,4790],[-13105,0,2906],[-12750,0,1748],[-12396,3,3785],[-12012,0,1865],[-11658,7,5779],[-11274,0,2707],[-10920,0,1323],[-10566,6,2651],[-10182,0,2733],[-9827,0,1386],[-9473,4,6997],[-9088,0,2980],[-8734,0,2889],[-8380,2,6803],[-7996,0,2709],[-7642,7,5421],[-7258,0,1334],[-6904,0,2733],[-6549,5,5546],[-6165,0,1458],[-5811,0,3493],[-5456,3,7498],[-5072,0,3402],[-4718,8,2709],[-4335,0,2711],[-3980,0,1366],[-3626,6,2741],[-3242,0,2773],[-2887,0,1746],[-2533,4,3749],[-2149,0,3749],[-1794,0,1610],[-1441,3,3223],[-1057,0,2715],[-702,7,5466],[-318,0,1386],[36,0,2921],[391,5,5970],[775,0,2898],[1129,0,2853],[1483,4,5707],[1867,0,2635],[2221,8,5291],[2605,0,685],[2959,0,1389],[3314,6,2921],[3698,0,3497],[4053,0,3474],[4407,4,7461],[4791,0,3365],[5145,10,6733],[5529,0,2646],[5883,0,694],[6237,6,1461],[6621,0,1749],[6976,0,3753],[7331,5,7826],[7715,0,3730],[8069,0,3366],[8423,3,2646],[8806,0,2647],[9161,8,5334],[9545,0,858],[9899,0,1749],[10254,5,5833],[10638,0,1865],[10992,0,1683],[11346,4,5419],[11730,0,1323],[12084,0,2651],[12439,2,5466],[12823,0,1386],[13177,7,6997],[13562,0,2980],[13916,0,2889],[14270,5,6803],[14654,0,2709],[15008,0,1325],[15362,4,2733],[15746,0,2741],[16101,9,5546],[16485,0,1490],[16839,0,3493],[17194,6,7498],[17578,0,3402],[17932,0,3221],[18286,4,5422],[18670,0,1366],[19024,0,2741],[19379,2,5554],[19763,0,1746],[20117,6,3749],[20501,0,1829],[20855,0,1611],[21209,5,3223],[21593,0,3243],[21948,0,1370],[22302,3,2774],[22686,0,2921],[23041,11,5970],[23425,0,2898],[23779,0,2853],[24133,6,6731],[24517,0,2635],[24871,0,1195],[25225,5,1371],[25609,0,1453],[25964,0,2922],[26319,2,6994],[26703,0,3474],[27057,7,7461],[27441,0,3365],[27795,0,2645],[28149,5,5293],[28533,0,1206],[28887,0,1461],[29242,3,3498],[29626,0,3785],[29981,8,7826],[30365,0,3730],[30719,0,3366],[31073,6,2646],[31456,0,2647],[31811,0,1238],[32165,4,1749],[32549,0,1877],[32904,0,1865],[33258,3,3731],[33642,0,1683],[33996,7,5419],[34380,0,1323],[34734,0,2651],[35089,5,5466],[35473,0,1386],[35827,0,2917],[36182,4,5962],[36566,0,2890],[36920,8,6805],[37304,0,2709],[37658,0,1325],[38012,6,2733],[38396,0,2741],[38751,0,1450],[39105,4,2981],[39489,0,3493],[39844,0,3402],[40198,3,7317],[40582,0,3222],[40936,7,6478],[41320,0,1366],[41674,0,2741],[42029,5,5554],[42413,0,1746],[42767,0,3749],[43122,4,3658],[43505,0,1675],[43859,8,3223],[44243,0,1195],[44597,0,1371],[44952,6,2774],[45336,0,2922],[45691,0,1874],[46045,4,5925],[46429,0,2885],[46783,0,2699],[47137,2,5275],[47521,0,1195]];
export function lunarCapability(){return true;}
const yearCache=new Map();
function lunarMonths(year){integer(year,MIN_YEAR,MAX_YEAR,'农历年份');if(yearCache.has(year))return yearCache.get(year);const [first,leap,bits]=LUNAR_DATA[year-MIN_YEAR];let start=first,index=0;const months=[];for(let month=1;month<=12;month++){const length=29+((bits>>index++)&1);months.push({month,leapMonth:false,start,length});start+=length;if(month===leap){const length=29+((bits>>index++)&1);months.push({month,leapMonth:true,start,length});start+=length;}}yearCache.set(year,months);return months;}
export function solarToLunar(iso){const n=ordinal(iso);const gregorianYear=Number(iso.slice(0,4));for(let year=Math.min(MAX_YEAR,gregorianYear);year>=Math.max(MIN_YEAR,gregorianYear-1);year--){const m=lunarMonths(year).find(m=>n>=m.start&&n<m.start+m.length);if(m)return {year,month:m.month,day:n-m.start+1,leapMonth:m.leapMonth};}fail('日期超出支持的农历年份 1901–2100');}
export function lunarToSolar(year,month,day,leapMonth=false){integer(month,1,12,'农历月份');integer(day,1,30,'农历日期');if(typeof leapMonth!=='boolean')fail('闰月标记无效');const m=lunarMonths(year).find(m=>m.month===month&&m.leapMonth===leapMonth);if(!m||day>m.length)fail('该农历日期不存在');return isoDay(m.start+day-1);}
export function formatLunar({month,day,leapMonth=false}){const months=['正','二','三','四','五','六','七','八','九','十','冬','腊'];const days=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];return `${leapMonth?'闰':''}${months[month-1]}月${days[day-1]}`;}
const EVENT_KEYS=['id','title','calendar','year','month','day','repeat','leapMonth','leapMonthFallback','shortMonth','feb29','category','emoji','color','note','reminderDays','reminders','pinned','createdAt'];
/** Up to 10 independent reminders; duplicate day/time pairs are rejected.
 * Legacy reminderDays migrates only when the reminders field is absent.
 * Explicit [] means no alarms, regardless of the preserved legacy value.
 */
function normalizeReminders(raw){
 if(!Array.isArray(raw)||raw.length>10)fail('每个日子最多设置 10 个提醒');
 const seen=new Set();
 return Array.from(raw,reminder=>{
  keys(reminder,['daysBefore','time']);
  const daysBefore=integer(reminder.daysBefore,0,365,'提前天数');
  const time=reminder.time;
  if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('提醒时间应为 00:00–23:59');
  const key=`${daysBefore}/${time}`;
  if(seen.has(key))fail('同一天的相同时间不能重复提醒');
  seen.add(key);
  return {daysBefore,time};
 });
}
/** Resolve each reminder using the exporting device's civil date and timezone.
 * Subtract calendar days before choosing the wall-clock time, never elapsed hours.
 * Date uses the earlier instant for overlaps and advances by the gap for missing
 * times. Absolute UTC triggers keep this instant when imported in another zone.
 */
function utcStamp(date){return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function reminderInstant(date,{daysBefore,time}){
 const [year,month,day]=addDays(date,-daysBefore).split('-').map(Number);
 const [hours,minutes]=time.split(':').map(Number);
 return utcStamp(new Date(year,month-1,day,hours,minutes,0,0));
}
export function normalizeEvent(raw){keys(raw,EVENT_KEYS);const e={id:raw.id,title:raw.title,calendar:raw.calendar??'solar',year:raw.year,month:raw.month,day:raw.day,repeat:raw.repeat??'none',leapMonth:raw.leapMonth??false,leapMonthFallback:raw.leapMonthFallback??'regular',shortMonth:raw.shortMonth??'last-day',feb29:raw.feb29??'prev',category:raw.category??'纪念日',emoji:raw.emoji??'✨',color:raw.color??'rose',note:raw.note??'',reminderDays:raw.reminderDays??null,pinned:raw.pinned??false,createdAt:raw.createdAt??new Date().toISOString()};text(e.id,100,'ID');if(!/^[a-zA-Z0-9_-]{1,100}$/.test(e.id))fail('ID无效');e.title=text(e.title,120,'标题').trim();if(!e.title)fail('请输入标题');choice(e.calendar,['solar','lunar'],'历法');choice(e.repeat,['none','annual'],'重复方式');integer(e.year,MIN_YEAR,MAX_YEAR,'年份');integer(e.month,1,12,'月份');integer(e.day,1,e.calendar==='solar'?31:30,'日期');choice(e.feb29,['prev','next','skip'],'2月29日规则');choice(e.leapMonthFallback,['regular','skip'],'闰月规则');choice(e.shortMonth,['last-day','skip'],'小月规则');if(typeof e.leapMonth!=='boolean'||typeof e.pinned!=='boolean')fail('布尔字段无效');for(const [key,max] of [['category',40],['emoji',24],['color',40],['note',4000]])text(e[key],max,key);if(e.reminderDays!==null)integer(e.reminderDays,0,365,'提醒天数');e.reminders=normalizeReminders(Object.prototype.hasOwnProperty.call(raw,'reminders')?raw.reminders:e.reminderDays===null?[]:[{daysBefore:e.reminderDays,time:'00:00'}]);text(e.createdAt,40,'创建时间');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(e.createdAt)||!Number.isFinite(Date.parse(e.createdAt)))fail('创建时间无效');if(e.calendar==='solar')solarDate(e.year,e.month,e.day);else lunarToSolar(e.year,e.month,e.day,e.leapMonth);return e;}
function inYear(e,year){if(year<MIN_YEAR||year>MAX_YEAR)return null;const notes=[];if(e.calendar==='solar'){let date;try{date=solarDate(year,e.month,e.day);}catch{if(e.month!==2||e.day!==29||e.feb29==='skip')return null;date=`${year}-${e.feb29==='next'?'03-01':'02-28'}`;notes.push(e.feb29==='next'?'非闰年，顺延至3月1日':'非闰年，提前至2月28日');}return {date,notes};}const months=lunarMonths(year);let month=months.find(m=>m.month===e.month&&m.leapMonth===e.leapMonth);if(!month&&e.leapMonth&&e.leapMonthFallback==='regular'){month=months.find(m=>m.month===e.month&&!m.leapMonth);notes.push('本年无对应闰月，使用同名普通月');}if(!month)return null;let day=e.day;if(day>month.length){if(e.shortMonth==='skip')return null;day=month.length;notes.push('本月无三十，使用月末廿九');}return {date:isoDay(month.start+day-1),notes,lunarYear:year};}
export function nextOccurrence(raw,today=todayISO()){const e=normalizeEvent(raw);const n=ordinal(today);if(e.repeat==='none'){const date=e.calendar==='solar'?solarDate(e.year,e.month,e.day):lunarToSolar(e.year,e.month,e.day,e.leapMonth);return {date,days:ordinal(date)-n,notes:[]};}const start=e.calendar==='lunar'?Math.max(MIN_YEAR,e.year,Number(today.slice(0,4))-1):Math.max(MIN_YEAR,e.year,Number(today.slice(0,4)));for(let y=start;y<=MAX_YEAR;y++){const o=inYear(e,y);if(o&&ordinal(o.date)>=n)return {...o,days:ordinal(o.date)-n};}return null;}
/** Half-open date interval [from, from + years), maximum 20 years. */
export function listOccurrences(raw,{from=todayISO(),years=10}={}){const e=normalizeEvent(raw);integer(years,1,20,'导出年数');const start=ordinal(from);const [y,m,d]=from.split('-').map(Number);let end;try{end=ordinal(solarDate(y+years,m,d));}catch{end=ordinal(solarDate(y+years,3,1));}if(e.repeat==='none'){const o=nextOccurrence(e,from);return ordinal(o.date)>=start&&ordinal(o.date)<end?[o]:[];}const out=[];for(let year=Math.max(MIN_YEAR,e.year,y-1);year<=Math.min(MAX_YEAR,y+years);year++){const o=inYear(e,year);if(o&&ordinal(o.date)>=start&&ordinal(o.date)<end)out.push({...o,days:ordinal(o.date)-start});}return out.sort((a,b)=>a.date.localeCompare(b.date));}
function checkBackupSize(json){if(json.length>MAX_BACKUP_BYTES||new TextEncoder().encode(json).byteLength>MAX_BACKUP_BYTES)fail('备份文件超过 24 MiB');}
export function validateBackup(input){let data=input;if(typeof data==='string'){checkBackupSize(data);try{data=JSON.parse(data);}catch{fail('无法读取 JSON 备份');}}keys(data,['version','app','exportedAt','events']);if(data.version!==1||data.app!=='days-matter')fail('备份版本或应用不匹配');if(typeof data.exportedAt!=='string'||!Number.isFinite(Date.parse(data.exportedAt)))fail('备份时间无效');if(!Array.isArray(data.events)||data.events.length>MAX_EVENTS)fail(`最多支持 ${MAX_EVENTS} 条记录`);const events=data.events.map(normalizeEvent);if(new Set(events.map(e=>e.id)).size!==events.length)fail('备份含重复 ID');return events;}
export function createBackup(events){const data={version:1,app:'days-matter',exportedAt:new Date().toISOString(),events};data.events=validateBackup(data);const json=JSON.stringify(data,null,2);checkBackupSize(json);return json;}
export function escapeICS(s){return String(s).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
export function foldICS(line){const encoder=new TextEncoder();let out='',part='',size=0;for(const c of line){const n=encoder.encode(c).length;if(size+n>75){out+=part+'\r\n';part=' ';size=1;}part+=c;size+=n;}return out+part;}
export function makeICS(events,{from=todayISO(),years=10,now=new Date()}={}){if(!Array.isArray(events)||events.length>MAX_EVENTS)fail('事件列表无效');if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('导出时间无效');const stamp=utcStamp(now);const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Days Matter//Chinese Calendar 1.0//ZH','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:我的重要日子'];for(const raw of events){const e=normalizeEvent(raw);for(const o of listOccurrences(e,{from,years})){lines.push('BEGIN:VEVENT',`UID:${e.id}-${o.date.replace(/-/g,'')}@days-matter.local`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${o.date.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${addDays(o.date,1).replace(/-/g,'')}`,`SUMMARY:${escapeICS(e.title)}`,`DESCRIPTION:${escapeICS([e.note,e.calendar==='lunar'?`农历${formatLunar(e)}`:'',...o.notes,e.repeat==='annual'?`已换算为独立日期；仅导出未来${years}年，之后请重新导出。`:''].filter(Boolean).join('\n'))}`,'TRANSP:TRANSPARENT');for(const reminder of e.reminders)lines.push('BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${escapeICS(e.title)}`,`TRIGGER;VALUE=DATE-TIME:${reminderInstant(o.date,reminder)}`,'END:VALARM');lines.push('END:VEVENT');}}lines.push('END:VCALENDAR');return lines.map(foldICS).join('\r\n')+'\r\n';}
