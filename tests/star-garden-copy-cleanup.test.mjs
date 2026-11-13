import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../star-garden/growth-app.mjs',import.meta.url),'utf8');
test('explanatory copy and calendar shortcuts are removed from active application',()=>{
 for(const phrase of ['从今天的一小步开始','完成即保存','每件事每天一步','这一天没有待完成的事项','无需登录','无排名','没有连续打卡压力','每一个小小的完成，都值得被看见','calendar-legend','calendar-help','selected-date','journey-month','date-today'])assert.equal(source.includes(phrase),false,phrase);
});
test('date cells, month/week navigation and safety affordances remain available',()=>{
 for(const text of ['choose-date','month-prev','month-next','week-prev','week-next','calendar-toggle','aria-pressed','aria-expanded','未加密','请先导出备份','其他事项和记录都不受影响','已有足迹不会删除'])assert.ok(source.includes(text),text);
});
