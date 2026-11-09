import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app.js'), calendar=read('calendar.js'), html=read('index.html');
const exports=[...calendar.matchAll(/export (?:function|const) (\w+)/g)].map(m=>m[1]).concat('MAX_YEAR','MAX_EVENTS');
const event=(id,patch={})=>({id,title:id,calendar:'solar',year:2024,month:12,day:18,repeat:'annual',pinned:false,...patch});
const backup=events=>JSON.stringify({version:1,app:'days-matter',exportedAt:'2026-01-01T00:00:00Z',events});
// Small DOM double: executes the actual app and event handlers, without pretending to test browser layout.
function harness(initial=[],{raw=backup(initial),failWrite=false,appURL='https://example.test/niannian/'}={}){
 const KEY='niannian.days.v1:'+new URL('./',appURL).pathname;
 const nodes=new Map(), listeners={},writes=[],downloads=[];let saved=raw;
 function node(selector){if(!nodes.has(selector)){const handlers={};nodes.set(selector,{innerHTML:'',textContent:'',value:'',hidden:false,checked:false,disabled:false,open:false,dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},setAttribute(){},focus(){},add(option){this.options.push(option);},addEventListener(type,fn){(handlers[type]??=[]).push(fn);},async emit(type,event={}){for(const fn of handlers[type]??[])await fn({target:this,preventDefault(){},...event});},showModal(){this.open=true;},close(){this.open=false;},reset(){}});}return nodes.get(selector);}
 for(const match of html.matchAll(/\bid="([^"]+)"/g))node('#'+match[1]);
 const elements={};for(const match of html.matchAll(/\bname="([^"]+)"/g))elements[match[1]]=node('#'+match[1]);
 elements.category.options=[{value:'纪念日'}];node('#event-form').elements=elements;
 const context=vm.createContext({TextEncoder,URL,document:{baseURI:appURL,querySelector:node,querySelectorAll:()=>[],addEventListener(type,fn){(listeners[type]??=[]).push(fn);}},window:{addEventListener(){}},navigator:{onLine:true},localStorage:{getItem(key){assert.equal(key,KEY);return saved;},setItem(key,value){assert.equal(key,KEY);if(failWrite)throw Error('quota');writes.push(value);saved=value;}},crypto:{randomUUID:()=> 'new-id'},Option:function(text,value){return {text,value};},setTimeout:()=>0,clearTimeout(){},setInterval(){}});
 vm.runInContext(`Object.assign(globalThis,(()=>{${calendar.replace(/\bexport /g,'')}\nreturn {${exports.join(',')}};})());`,context);
 vm.runInContext(app.replace(/^import .*?;\n/,''),context);
 const run=source=>vm.runInContext(source,context);
 context.captureDownload=(...args)=>downloads.push(args);run('download=captureDownload');
 return {node,run,writes,downloads,get saved(){return saved;},async emit(type,event){for(const fn of listeners[type]??[])await fn(event);}};
}
test('all special-focus dates render, remain pinned, and do not duplicate in ordinary list',()=>{
 const h=harness([event('first',{pinned:true}),event('second',{pinned:true}),event('ordinary')]);
 assert.equal(h.node('#featured-section').hidden,false);assert.equal(h.node('#featured-count').textContent,2);
 for(const id of ['first','second']){assert.match(h.node('#featured').innerHTML,new RegExp(`data-detail="${id}"`));assert.doesNotMatch(h.node('#event-list').innerHTML,new RegExp(`data-detail="${id}"`));}
 assert.match(h.node('#event-list').innerHTML,/data-detail="ordinary"/);assert.equal(h.writes.length,0);
 h.run("query='first';render()");assert.match(h.node('#event-list').innerHTML,/data-detail="first"/);
});
test('pinning a second event preserves first pin; unpin only changes the selected event',async()=>{
 const h=harness([event('first',{pinned:true}),event('second')]);h.run("showDetail('second')");await h.node('#toggle-pin').emit('click');
 assert.deepEqual(JSON.parse(h.saved).events.map(e=>e.pinned),[true,true]);assert.equal(h.node('#featured-count').textContent,2);
 h.run("showDetail('first')");await h.node('#toggle-pin').emit('click');assert.deepEqual(JSON.parse(h.saved).events.map(e=>e.pinned),[false,true]);
});
test('install, full calendar export and backup live only in Settings; navigation closes Settings',async()=>{
 const settings=html.match(/<dialog id="settings-dialog"[\s\S]*?<\/dialog>/)[0];
 for(const id of ['install-button','calendar-all','backup-button']){assert.ok(settings.includes(`id="${id}"`));assert.ok(!html.replace(settings,'').includes(`id="${id}"`));}
 for(const [button,target] of [['install-button','help-dialog'],['calendar-all','export-dialog'],['backup-button','backup-dialog']]){const h=harness([event('first')]);await h.node('#settings-button').emit('click');assert.equal(h.node('#settings-dialog').open,true);await h.node('#'+button).emit('click');assert.equal(h.node('#settings-dialog').open,false);assert.equal(h.node('#'+target).open,true);}
});
test('selective export and multiple custom reminders never change saved event defaults',async()=>{
 const h=harness([event('first',{reminders:[{daysBefore:1,time:'09:00'}]}),event('second')]);const before=h.saved;
 h.run("prepareExport([events[0]]); exportReminders.get('first').push({daysBefore:0,time:'18:30'});updateExportSummary()");
 assert.equal(h.node('#download-calendar').disabled,false);await h.node('#download-calendar').emit('click');
 assert.equal(h.node('#export-error').textContent,'');const ics=h.downloads[0][0];assert.match(ics,/UID:first-/);assert.doesNotMatch(ics,/UID:second-/);assert.equal((ics.match(/BEGIN:VALARM/g)||[]).length,20);
 assert.equal(h.saved,before);assert.equal(h.writes.length,0);assert.equal(h.run('events[0].reminders.length'),1);
 h.run('prepareExport(events)');assert.equal(h.run("exportReminders.get('first').length"),1);
});
test('export empty selection, invalid reminders and past-only dates disable download',async()=>{
 const h=harness([event('first')]);h.run('prepareExport(events)');await h.node('#export-select-none').emit('click');assert.equal(h.node('#download-calendar').disabled,true);assert.match(h.node('#export-error').textContent,/至少选择/);
 await h.node('#export-select-all').emit('click');assert.equal(h.node('#download-calendar').disabled,false);
 h.run("exportReminders.set('first',[{daysBefore:-1,time:'09:00'}]);updateExportSummary()");assert.equal(h.node('#download-calendar').disabled,true);
 const past=harness([event('past',{repeat:'none',year:2000})]);past.run('prepareExport(events)');assert.equal(past.node('#download-calendar').disabled,true);
});
test('editing and saving multiple reminders preserves independent pinned dates and backup schema',async()=>{
 const h=harness([event('first',{pinned:true}),event('second',{pinned:true})]);
 h.run("openEditor(events[0]);draftReminders=[{daysBefore:3,time:'08:00'},{daysBefore:0,time:'09:30'}]");await h.node('#event-form').emit('submit');
 assert.equal(h.node('#form-error').textContent,'');const data=JSON.parse(h.saved);assert.equal(data.version,1);assert.equal(data.app,'days-matter');assert.equal(data.events[0].reminders.length,2);assert.ok(data.events.every(e=>e.pinned));
 h.run('openEditor(events[0]);draftReminders.splice(0)');await h.node('#event-form').emit('submit');assert.deepEqual(JSON.parse(h.saved).events[0].reminders,[]);
});
test('legacy storage migrates reminders in memory without startup writes; read/write errors preserve original',async()=>{
 const legacy=harness([event('first',{reminderDays:3})]);assert.equal(legacy.run("JSON.stringify(events[0].reminders)"),'[{"daysBefore":3,"time":"00:00"}]');assert.equal(legacy.writes.length,0);
 const bad=harness([],{raw:'corrupt'});assert.equal(bad.run('storageBlocked'),true);assert.equal(bad.saved,'corrupt');assert.equal(bad.node('#download-backup').disabled,true);
 const h=harness([event('first')],{failWrite:true});const before=h.saved;h.run("showDetail('first')");await h.node('#toggle-pin').emit('click');assert.equal(h.saved,before);assert.equal(h.run('events[0].pinned'),false);assert.equal(h.node('#storage-warning').hidden,false);
});
test('delegated reminder controls add up to ten, edit exact times, remove and reject incomplete export input',async()=>{
 const h=harness([event('first')]);h.run('openEditor(events[0])');
 const action=(key,removeIndex)=>{const holder={dataset:{reminderKey:key}};const button={dataset:{reminderRemove:String(removeIndex)},closest:()=>holder};return {closest(selector){return selector===(removeIndex===undefined?'[data-reminder-add]':'[data-reminder-remove]')?button:null;}};};
 for(let i=0;i<11;i++)await h.emit('click',{target:action('draft')});assert.equal(h.run('draftReminders.length'),10);assert.equal(h.run('new Set(draftReminders.map(r=>r.daysBefore)).size'),10);
 await h.emit('input',{target:{matches:s=>s==='[data-reminder-field]',closest:()=>({dataset:{reminderKey:'draft'}}),dataset:{index:'0',reminderField:'time'},value:'17:45'}});assert.equal(h.run('draftReminders[0].time'),'17:45');
 await h.emit('click',{target:action('draft',0)});assert.equal(h.run('draftReminders.length'),9);assert.equal(h.run('events[0].reminders.length'),0);
 h.run('prepareExport(events)');await h.emit('click',{target:action('export:first')});assert.equal(h.run("exportReminders.get('first').length"),1);
 await h.emit('input',{target:{matches:s=>s==='[data-reminder-field]',closest:()=>({dataset:{reminderKey:'export:first'}}),dataset:{index:'0',reminderField:'daysBefore'},value:''}});assert.equal(h.node('#download-calendar').disabled,true);assert.equal(h.writes.length,0);
});
test('detail original dates omit only the year and preserve calendar labels, events, storage and exports',()=>{
 const cases=[
  [event('lunar',{calendar:'lunar',year:2024,month:8,day:15}),'农历 · 八月十五'],
  [event('leap',{calendar:'lunar',year:2025,month:6,day:1,leapMonth:true}),'农历 · 闰六月初一'],
  [event('solar',{year:2030}),'公历 · 12月18日']
 ];
 for(const repeat of ['annual','none']){
  const reminders=[{daysBefore:3,time:'08:15'},{daysBefore:0,time:'18:30'}];
  const initial=cases.map(([e])=>({...e,repeat,reminders})),raw=backup(initial),h=harness(initial,{raw});
  assert.equal(h.saved,raw);assert.equal(h.writes.length,0);
  h.run("today='2026-01-01'");
  const before=h.run('JSON.stringify(events)');
  const nextBefore=h.run('JSON.stringify(events.map(occurrence))');
  const exportCode="makeICS(events,{from:'2026-01-01',years:10,now:new Date('2026-01-01T00:00:00Z')})";
  const icsBefore=h.run(exportCode);
  assert.equal(h.run("occurrence(events.find(e=>e.id==='solar')).date"),'2030-12-18');
  assert.match(icsBefore,/DTSTART;VALUE=DATE:20301218\r\n/);
  assert.doesNotMatch(icsBefore,/UID:solar-202[6-9]/);
  for(const [e,label] of cases){
   h.run(`showDetail(${JSON.stringify(e.id)})`);
   const body=h.node('#detail-body').innerHTML;
   const row=body.match(/<div><span>原始日期<\/span><strong>(.*?)<\/strong><\/div>/);
   assert.ok(row,`${e.id}: original date row exists`);assert.equal(row[1],label);
   assert.doesNotMatch(row[1],/年|\d{4}/);
   assert.ok(body.includes('<span>提醒</span><strong>提前 3 天 08:15<br>当天 18:30</strong>'));
   const originalSource=e.calendar==='lunar'?label.replace(' · ',''):`${e.month} 月 ${e.day} 日`;
   assert.equal(h.run(`sourceLabel(events.find(e=>e.id===${JSON.stringify(e.id)}))`),originalSource);
   if(e.calendar==='lunar'){
    assert.ok(h.run(`cardHTML(events.find(e=>e.id===${JSON.stringify(e.id)}),occurrence(events.find(e=>e.id===${JSON.stringify(e.id)})))`).includes(originalSource));
    assert.ok(h.run(`heroHTML(events.find(e=>e.id===${JSON.stringify(e.id)}),occurrence(events.find(e=>e.id===${JSON.stringify(e.id)})))`).includes(originalSource));
   }
   const nextDate=h.run(`occurrence(events.find(e=>e.id===${JSON.stringify(e.id)})).date.replaceAll('-','.')`);
   assert.ok(body.includes(`<span>${repeat==='annual'?'下一次':'日期'}</span><strong>${nextDate}</strong>`));
  }
  assert.equal(h.run('JSON.stringify(events)'),before);
  assert.equal(h.run('JSON.stringify(events.map(occurrence))'),nextBefore);
  assert.equal(h.run(exportCode),icsBefore);
  assert.equal(h.saved,raw);assert.equal(h.writes.length,0);
  assert.deepEqual(JSON.parse(h.saved).events.map(e=>e.year),[2024,2025,2030]);
 }
});
test('detail edit flow preserves original years and keeps the year editable',async()=>{
 const initial=[event('lunar',{calendar:'lunar',year:2024,month:8,day:15}),event('leap',{calendar:'lunar',year:2025,month:6,day:1,leapMonth:true}),event('solar',{year:2030})];
 const h=harness(initial),saved=h.saved,before=h.run('JSON.stringify(events)');
 for(const e of initial){
  h.run(`showDetail(${JSON.stringify(e.id)})`);await h.node('#edit-event').emit('click');
  assert.equal(h.node('#detail-dialog').open,false);assert.equal(h.node('#event-dialog').open,true);
  assert.equal(Number(h.node('#event-form').elements.year.value),e.year);
  const formEvent=JSON.parse(h.run('JSON.stringify(readForm())'));
  for(const field of ['year','month','day','calendar','repeat'])assert.equal(formEvent[field],e[field]);
  assert.equal(formEvent.leapMonth,e.leapMonth??false);
 }
 assert.equal(h.run('JSON.stringify(events)'),before);assert.equal(h.saved,saved);assert.equal(h.writes.length,0);
 h.node('#event-form').elements.year.value='2031';
 assert.equal(h.run('readForm().year'),2031);
 await h.node('#event-form').emit('submit');
 assert.equal(h.node('#form-error').textContent,'');assert.equal(h.writes.length,1);
 assert.deepEqual(JSON.parse(h.saved).events.map(e=>e.year),[2024,2025,2031]);
});

test('project paths isolate record keys while directory and index entries agree',()=>{const a=harness([],{appURL:'https://example.test/a/'}),b=harness([],{appURL:'https://example.test/b/index.html?launch=1'}),c=harness([],{appURL:'https://example.test/a/index.html'});assert.equal(a.run('KEY'),'niannian.days.v1:/a/');assert.equal(b.run('KEY'),'niannian.days.v1:/b/');assert.equal(a.run('KEY'),c.run('KEY'));});

test('new recurrence editor, detail, persistence and backup remain consistent',async()=>{
 for(const [repeat,label] of [['daily','每天'],['weekly','每周'],['monthly','每月']]){
  assert.ok(html.includes(`value="${repeat}"`));
  const h=harness([event('first',{repeat})]);h.run("today='2026-01-01';showDetail('first')");
  assert.ok(h.node('#detail-body').innerHTML.includes(`<span>重复</span><strong>${label}</strong>`));
  assert.ok(h.node('#detail-body').innerHTML.includes('<span>下一次</span>'));
  h.run('openEditor(events[0])');assert.equal(h.node('#repeat').value,repeat);
  assert.equal(h.node('#short-month-field').hidden,repeat!=='monthly');
  await h.node('#event-form').emit('submit');assert.equal(h.node('#form-error').textContent,'');
  assert.equal(JSON.parse(h.saved).events[0].repeat,repeat);
  const restored=harness([],{raw:h.saved});assert.equal(restored.run('events[0].repeat'),repeat);
 }
});
test('large frequent calendar export is blocked before download and can be reduced',async()=>{
 const h=harness(Array.from({length:6},(_,i)=>event('e'+i,{repeat:'daily'})));
 h.run('prepareExport(events)');assert.equal(h.node('#download-calendar').disabled,true);assert.match(h.node('#export-error').textContent,/20,000/);
 h.run('prepareExport([events[0]])');assert.equal(h.node('#download-calendar').disabled,false);
 await h.node('#download-calendar').emit('click');assert.equal(h.downloads.length,1);assert.equal(h.writes.length,0);
});
