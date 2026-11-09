import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvent,nextOccurrence,listOccurrences,lunarToSolar,solarToLunar,createBackup,validateBackup,makeICS,addDays} from '../calendar.js';
const event=(patch={})=>({id:'repeat',title:'重复日子',calendar:'solar',year:2024,month:1,day:31,repeat:'monthly',...patch});
const dates=(e,from,years=1)=>listOccurrences(e,{from,years}).map(o=>o.date);
test('all repeat modes validate and preserve backup v1, legacy defaults remain unchanged',()=>{
 for(const repeat of ['none','daily','weekly','monthly','annual']){
  const e=normalizeEvent(event({repeat}));assert.deepEqual(validateBackup(createBackup([e])),[e]);
 }
 assert.equal(normalizeEvent(event({repeat:undefined})).repeat,'none');
 assert.throws(()=>normalizeEvent(event({repeat:'hourly'})),/重复方式/);
});
test('daily includes today and leap day, never precedes original date',()=>{
 const e=event({repeat:'daily',month:2,day:28});
 assert.equal(nextOccurrence(e,'2024-02-01').date,'2024-02-28');
 assert.equal(nextOccurrence(e,'2024-02-29').days,0);
 assert.deepEqual(dates(e,'2024-02-28').slice(0,3),['2024-02-28','2024-02-29','2024-03-01']);
 assert.equal(dates(e,'2024-02-28').length,366);
});
test('weekly anchors weekday across years, DST and future starts',()=>{
 const e=event({repeat:'weekly',year:2026,month:3,day:1});
 assert.equal(nextOccurrence(e,'2026-01-01').date,'2026-03-01');
 assert.equal(nextOccurrence(e,'2026-03-02').date,'2026-03-08');
 assert.equal(nextOccurrence(e,'2026-03-08').days,0);
 assert.deepEqual(dates(e,'2026-03-01').slice(0,4),['2026-03-01','2026-03-08','2026-03-15','2026-03-22']);
 assert.ok(dates(e,'2026-03-01').every(d=>new Date(d+'T12:00:00Z').getUTCDay()===0));
});
test('monthly clamps without drifting, skips when requested, and handles all month ends',()=>{
 assert.deepEqual(dates(event(),'2024-01-01').slice(0,4),['2024-01-31','2024-02-29','2024-03-31','2024-04-30']);
 assert.deepEqual(dates(event({shortMonth:'skip'}),'2024-01-01').slice(0,4),['2024-01-31','2024-03-31','2024-05-31','2024-07-31']);
 assert.equal(nextOccurrence(event(),'2025-02-01').date,'2025-02-28');
 assert.equal(nextOccurrence(event(),'2025-02-28').days,0);
 assert.equal(nextOccurrence(event(),'2025-03-01').date,'2025-03-31');
 for(const day of [29,30,31])assert.equal(nextOccurrence(event({day}),'2025-02-01').date,'2025-02-28');
 assert.equal(nextOccurrence(event({year:2030}),'2026-01-01').date,'2030-01-31');
 assert.equal(nextOccurrence(event({month:2,day:29,feb29:'next'}),'2025-02-01').date,'2025-02-28');
});
test('lunar monthly includes regular and leap months and uses lunar short-month policy',()=>{
 const e=event({calendar:'lunar',year:2025,month:1,day:1});
 const start=lunarToSolar(2025,1,1),out=dates(e,start).map(solarToLunar).filter(d=>d.year===2025);
 assert.equal(out.length,13);assert.ok(out.some(d=>d.month===6&&d.leapMonth));
 const leap=event({calendar:'lunar',year:2025,month:6,day:1,leapMonth:true});
 assert.equal(nextOccurrence(leap,'2025-01-01').date,lunarToSolar(2025,6,1,true));
 assert.equal(nextOccurrence(leap,addDays(lunarToSolar(2025,6,1,true),1)).date,lunarToSolar(2025,7,1));
 const day30=event({calendar:'lunar',year:2024,month:2,day:30});
 const monthly=dates(day30,'2024-02-01').map(solarToLunar);assert.ok(monthly.some(d=>d.day===29));
 assert.ok(dates({...day30,shortMonth:'skip'},'2024-02-01').map(solarToLunar).every(d=>d.day===30));
});
test('lunar daily and weekly are elapsed civil days from converted original date',()=>{
 for(const [repeat,step] of [['daily',1],['weekly',7]]){
  const e=event({calendar:'lunar',year:2025,month:6,day:1,leapMonth:true,repeat});
  const anchor=lunarToSolar(2025,6,1,true);
  assert.equal(nextOccurrence(e,addDays(anchor,1)).date,addDays(anchor,step));
 }
});
test('supported boundaries and half-open export avoid duplicate or out-of-range occurrences',()=>{
 for(const repeat of ['daily','weekly','monthly','annual']){
  const e=event({year:2100,month:12,day:31,repeat});
  assert.deepEqual(dates(e,'2100-12-31'),['2100-12-31']);assert.equal(nextOccurrence(e,'2101-01-01'),null);
 }
 const e=event({repeat:'monthly',day:1});assert.equal(dates(e,'2024-01-01').length,12);
 const lunar=event({calendar:'lunar',year:2100,month:12,day:1,repeat:'daily'});
 const out=dates(lunar,lunarToSolar(2100,12,1));assert.ok(out.length>=29);assert.equal(nextOccurrence(lunar,addDays(out.at(-1),1)),null);
});
test('frequent exports use distinct concrete dates and exact independent reminders',()=>{
 for(const repeat of ['daily','weekly','monthly']){
  const e=event({repeat,reminders:[{daysBefore:1,time:'09:00'},{daysBefore:0,time:'18:30'}]});
  const expected=dates(e,'2024-01-01');const ics=makeICS([e],{from:'2024-01-01',years:1});
  assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,expected.length);
  assert.equal((ics.match(/BEGIN:VALARM/g)||[]).length,expected.length*2);
  assert.equal(new Set([...ics.matchAll(/UID:(.*)/g)].map(m=>m[1])).size,expected.length);
  assert.doesNotMatch(ics,/RRULE/);
 }
 assert.throws(()=>makeICS(Array.from({length:6},(_,i)=>event({id:'e'+i,repeat:'daily'})),{from:'2024-01-01'}),/20,000/);
});
