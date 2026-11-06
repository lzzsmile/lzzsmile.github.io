import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

// Each child has a real OS timezone; expected UTC instants below are independent
// reference values, not a reimplementation of the production conversion.
function exportInZone(timezone, date, reminders, repeat='none', years=1) {
 const [year,month,day]=date.split('-').map(Number);
 const event={id:'dst-test',title:'DST reminder',calendar:'solar',year,month,day,repeat,reminders};
 const source=`import {makeICS} from ${JSON.stringify(new URL('../calendar.js',import.meta.url).href)};process.stdout.write(makeICS(${JSON.stringify([event])},{from:${JSON.stringify(date)},years:${years},now:new Date('2027-01-01T00:00:00Z')}));`;
 const ics=execFileSync(process.execPath,['--input-type=module','-e',source],{env:{...process.env,TZ:timezone},encoding:'utf8'});
 assert.doesNotMatch(ics,/TRIGGER;(?:RELATED|TZID)/);
 assert.match(ics,new RegExp(`DTSTART;VALUE=DATE:${date.replaceAll('-','')}`));
 const triggers=[...ics.matchAll(/^TRIGGER;VALUE=DATE-TIME:(\d{8}T\d{6}Z)\r?$/gm)].map(m=>m[1]);
 assert.equal(triggers.length,(ics.match(/BEGIN:VALARM/g)||[]).length);
 return triggers;
}

test('New York spring and fall reminders preserve wall times across DST',()=>{
 const reminders=[{daysBefore:0,time:'09:00'},{daysBefore:1,time:'09:00'},{daysBefore:7,time:'09:00'}];
 assert.deepEqual(exportInZone('America/New_York','2027-03-14',reminders),['20270314T130000Z','20270313T140000Z','20270307T140000Z']);
 assert.deepEqual(exportInZone('America/New_York','2027-11-07',reminders),['20271107T140000Z','20271106T130000Z','20271031T130000Z']);
});

test('nonexistent and repeated DST wall times use the documented policy',()=>{
 assert.deepEqual(exportInZone('America/New_York','2027-03-14',[{daysBefore:0,time:'02:30'}]),['20270314T073000Z']);
 assert.deepEqual(exportInZone('America/New_York','2027-11-07',[{daysBefore:0,time:'01:30'}]),['20271107T053000Z']);
 assert.deepEqual(exportInZone('Australia/Lord_Howe','2027-10-03',[{daysBefore:0,time:'02:15'}]),['20271002T154500Z']);
 assert.deepEqual(exportInZone('Australia/Lord_Howe','2027-04-04',[{daysBefore:0,time:'01:45'}]),['20270403T144500Z']);
});

test('half-hour DST shifts and non-DST fractional timezones export exact instants',()=>{
 const reminders=[{daysBefore:0,time:'09:00'},{daysBefore:1,time:'09:00'}];
 assert.deepEqual(exportInZone('Australia/Lord_Howe','2027-04-04',reminders),['20270403T223000Z','20270402T220000Z']);
 assert.deepEqual(exportInZone('Australia/Lord_Howe','2027-10-03',reminders),['20271002T220000Z','20271001T223000Z']);
 assert.deepEqual(exportInZone('Asia/Shanghai','2027-03-14',reminders),['20270314T010000Z','20270313T010000Z']);
 assert.deepEqual(exportInZone('Asia/Kathmandu','2027-03-14',[{daysBefore:0,time:'09:00'}]),['20270314T031500Z']);
});

test('annual dates resolve each occurrence timezone offset independently',()=>{
 assert.deepEqual(exportInZone('America/New_York','2027-03-12',[{daysBefore:0,time:'09:00'}],'annual',2),['20270312T140000Z','20280312T130000Z']);
});
