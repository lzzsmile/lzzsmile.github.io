import test from 'node:test';
import assert from 'node:assert/strict';
import {weekDates,shiftDate} from '../star-garden/growth-model.mjs';
test('week always has Monday through Sunday, including cross-month and year',()=>{
 assert.deepEqual(weekDates('2025-01-01'),['2024-12-30','2024-12-31','2025-01-01','2025-01-02','2025-01-03','2025-01-04','2025-01-05']);
 assert.deepEqual(weekDates('2024-12-30'),weekDates('2025-01-05'));
 assert.deepEqual(weekDates('2024-02-29'),['2024-02-26','2024-02-27','2024-02-28','2024-02-29','2024-03-01','2024-03-02','2024-03-03']);
});
test('civil day arithmetic is DST independent and leap-year safe',()=>{
 for(const [date,delta,expected] of [['2024-02-28',1,'2024-02-29'],['2024-02-29',1,'2024-03-01'],['2026-03-08',1,'2026-03-09'],['2026-11-01',1,'2026-11-02'],['2025-01-01',-1,'2024-12-31']])assert.equal(shiftDate(date,delta),expected);
 assert.equal(weekDates('2026-03-08')[0],'2026-03-02');assert.equal(weekDates('2026-11-01')[6],'2026-11-01');
});
test('calendar year bounds do not wrap and invalid inputs reject',()=>{
 assert.equal(shiftDate('0000-01-01',-1),null);assert.equal(shiftDate('9999-12-31',1),null);
 assert.equal(weekDates('0000-01-01').length,7);assert.equal(weekDates('0000-01-01')[5],'0000-01-01');assert.equal(weekDates('9999-12-31')[5],null);
 for(const date of [null,'','2026-02-29','2026-1-01']){assert.throws(()=>weekDates(date));assert.throws(()=>shiftDate(date,1));}
 for(const delta of [.5,NaN,'1',Infinity])assert.throws(()=>shiftDate('2026-01-01',delta));
});
