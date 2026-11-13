// Disposable fixtures and temporary loopback origin only. No real profile or production data.
import assert from 'node:assert/strict';
import {selectedDate,visibleMonth,browseMonth,chooseDate} from './star-garden-calendar-helpers.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {emptyState,addTask,checkIn,STORAGE_KEY} from '../star-garden/growth-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url),shots='/tmp/star-garden-flexible-calendar-review';
const server=createServer(async(req,res)=>{try{let p=new URL(req.url,'http://localhost').pathname;if(!p.startsWith('/star-garden/'))return res.writeHead(404).end();const url=new URL('.'+(p.endsWith('/')?p+'index.html':p),root);res.writeHead(200,{'Content-Type':({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[extname(url.pathname)]||'application/octet-stream','Cache-Control':'no-store'}).end(await readFile(url));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/star-garden/';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2,locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce',serviceWorkers:'block'});
const page=await context.newPage(),errors=[],external=[],results=[];page.setDefaultTimeout(10000);context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();external.push(u);return route.abort();});
await page.clock.install({time:new Date('2026-11-13T04:00:00Z')});
const step=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
const selected=()=>selectedDate(page),expanded=()=>page.locator('.calendar-toggle').getAttribute('aria-expanded');
const raw=()=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
const date=value=>chooseDate(page,value);
const month=value=>browseMonth(page,value);
const toggle=()=>page.locator('.calendar-toggle').tap();
const dismiss=async()=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.waitForFunction(()=>!history.state?.growthDialog);};
const snap=async(name)=>{await page.clock.fastForward(4500);await page.evaluate(()=>scrollTo(0,0));await mkdir(shots,{recursive:true});await page.screenshot({path:shots+'/'+name+'.png',fullPage:true});};
const client=await context.newCDPSession(page);
const swipe=async(selector,dx,dy,cancel=false)=>{
 const el=page.locator(selector);await el.evaluate(el=>el.scrollIntoView({block:'center'}));const r=await el.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=6;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6}]});
 await client.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
};
try{
 await page.goto(base+'#journey');
 const s=emptyState(),t=addTask(s,{title:'合成日历阅读',schedule:'daily',startDate:'2024-01-01'});
 for(const d of ['2024-02-29','2024-12-31','2025-01-01','2026-11-09','2026-11-13'])checkIn(s,t.id,d);
 const t2=addTask(s,{title:'合成第二步',schedule:'daily',startDate:'2026-11-01'});checkIn(s,t2.id,'2026-11-13');
 await page.evaluate(({key,s})=>{localStorage.setItem(key,JSON.stringify(s));localStorage.setItem('starwish-garden:data:v1','legacy bytes untouched');localStorage.setItem('starwish-garden:growth:before-restore:v2','recovery bytes untouched');localStorage.setItem('other-app','unchanged');},{key:STORAGE_KEY,s});await page.reload();const initial=await raw();
 await step('initial week is Monday-first, current date selected, future disabled and footprints explicit',async()=>{
  assert.equal(await expanded(),'false');assert.equal(await page.locator('.calendar-day').count(),7);
  assert.deepEqual(await page.locator('.calendar-day').evaluateAll(es=>es.map(e=>e.dataset.date)),['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']);
  assert.equal(await selected(),'2026-11-13');assert.equal(await page.locator('[aria-current="date"]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('[aria-current="date"]').getAttribute('aria-label'),/有足迹，2 步/);
  assert.equal(await page.locator('[data-date="2026-11-14"]').isDisabled(),true);assert.equal(await page.locator('[data-action="week-next"]').isDisabled(),true);assert.equal(await page.locator('.has-entries').count(),2);await snap('week-390');
 });
 await step('tap expands month, preserves selection and data, collapse restores selected week',async()=>{
  await toggle();assert.equal(await expanded(),'true');assert.equal(await page.locator('.calendar-day').count(),30);assert.equal(await selected(),'2026-11-13');
  await page.locator('[data-action="month-prev"]').tap();assert.equal(await selected(),'2026-11-13');assert.equal(await visibleMonth(page),'2026-10');
  await toggle();assert.equal(await expanded(),'false');assert.equal(await page.locator('[data-date="2026-11-13"]').getAttribute('aria-pressed'),'true');assert.deepEqual(await raw(),initial);
 });
 await step('real touch pull expands and push collapses once, without changing date or hash',async()=>{
  const hash=new URL(page.url()).hash;await swipe('.calendar-toggle',0,65);assert.equal(await expanded(),'true');assert.equal(await selected(),'2026-11-13');assert.equal(new URL(page.url()).hash,hash);
  await snap('month-390');await swipe('.calendar-toggle',0,-65);assert.equal(await expanded(),'false');assert.equal(await selected(),'2026-11-13');
 });
 await step('short, horizontal, wrong-direction and cancelled gestures do not toggle or select',async()=>{
  for(const [dx,dy,cancel] of [[0,20,false],[80,8,false],[0,-60,false],[0,60,true]]){await swipe('.calendar-toggle',dx,dy,cancel);assert.equal(await expanded(),'false');assert.equal(await selected(),'2026-11-13');}
  await page.locator('.calendar-toggle').evaluate(el=>el.scrollIntoView({block:'center'}));const grip=await page.locator('.calendar-toggle').boundingBox(),x=grip.x+grip.width/2,y=grip.y+grip.height/2;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y},{id:2,x:x+20,y}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x,y:y+60},{id:2,x:x+20,y:y+60}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await expanded(),'false');assert.equal(await selected(),'2026-11-13');
  await swipe('[data-date="2026-11-11"]',0,-60);assert.equal(await selected(),'2026-11-13');assert.equal(await expanded(),'false');await page.locator('[data-date="2026-11-11"]').tap();assert.equal(await selected(),'2026-11-11');
 });
 await step('week arrows browse across year without changing selected day, grid selection preserves compact mode',async()=>{
  await date('2025-01-01');assert.equal(await expanded(),'false');assert.match(await page.locator('#calendar-range').innerText(),/2024.12.30 – 2025.1.5/);
  await page.locator('[data-action="week-prev"]').tap();assert.equal(await selected(),'2025-01-01');assert.equal(await page.locator('.calendar-day').first().getAttribute('data-date'),'2024-12-23');
  await page.locator('[data-action="week-next"]').tap();await page.locator('[data-date="2024-12-31"]').tap();assert.equal(await selected(),'2024-12-31');assert.equal(await page.locator('.journey-line .task-card').count(),1);
  await date('2024-02-29');assert.equal(await page.locator('.calendar-day').first().getAttribute('data-date'),'2024-02-26');assert.equal(await expanded(),'false');
 });
 await step('month browsing expands, leap day and cross-year month navigation retain selection',async()=>{
  await month('2024-02');assert.equal(await expanded(),'true');assert.equal(await page.locator('.calendar-day').count(),29);await page.locator('[data-date="2024-02-29"]').tap();assert.equal(await page.locator('.calendar-day.selected i').count(),1);
  await month('2025-01');await page.locator('[data-action="month-prev"]').tap();assert.equal(await visibleMonth(page),'2024-12');await page.locator('[data-action="month-next"]').tap();assert.equal(await visibleMonth(page),'2025-01');assert.equal(await selected(),'2024-02-29');
 });
 await step('keyboard arrows, Home/End and PageUp/PageDown move focus without selecting',async()=>{
  await date('2024-02-29');await page.locator('.calendar-day.selected').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2024-03-01');assert.equal(await selected(),'2024-02-29');await page.keyboard.press('Enter');assert.equal(await selected(),'2024-03-01');
  await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2024-02-26');await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2024-03-03');await page.keyboard.press('PageUp');assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2024-02-03');await page.keyboard.press('PageDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2024-03-03');
  await page.locator('.calendar-toggle').focus();await page.keyboard.press('Space');assert.equal(await expanded(),'false');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'calendar-toggle');
  await page.locator('[data-date="2024-03-03"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2024-03-04');assert.equal(await selected(),'2024-03-01');await page.keyboard.press('Space');assert.equal(await selected(),'2024-03-04');
 });
 await step('reload and Back/Forward keep selected date and leave Today separate',async()=>{
  await page.reload();assert.equal(await selected(),'2024-03-04');assert.equal(await expanded(),'false');await page.locator('.tabbar [data-view="today"]').tap();assert.equal(await page.locator('#selected-date').count(),0);await page.locator('.tabbar [data-view="journey"]').tap();assert.equal(await selected(),'2024-03-04');await page.goBack();assert.equal(await page.locator('.daily-section').count(),1);await page.goForward();assert.equal(await selected(),'2024-03-04');assert.deepEqual(await raw(),initial);
 });
 await step('date shortcuts are absent, future days stay disabled and earliest year cannot underflow',async()=>{
  assert.equal(await page.locator('#selected-date,#journey-month,[data-action="date-today"],.calendar-jump,.calendar-date-jump').count(),0);
  await page.goto(base+'#journey?date=0001-01-01');assert.equal(await page.locator('.calendar-day').count(),7);await toggle();assert.equal(await page.locator('[data-action="month-prev"]').isDisabled(),true);
  await page.goto(base+'#journey?date=2026-11-13');if(await expanded()==='false')await toggle();assert.equal(await page.locator('[data-action="month-next"]').isDisabled(),true);assert.equal(await page.locator('[data-date="2026-11-14"]').isDisabled(),true);await toggle();
 });
 await step('VoiceOver-facing names/state and 320–430px/desktop layouts remain clear without overflow',async()=>{
  for(const width of [320,375,390,430,1280]){await page.setViewportSize({width,height:844});for(let n=0;n<2;n++){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.calendar-toggle').evaluate(el=>el.getBoundingClientRect().height>=44),true);assert.match(await page.locator('.calendar-toggle').getAttribute('aria-label'),/展开|收起/);assert.equal(await page.locator('#journey-calendar-days').getAttribute('aria-describedby'),null);assert.equal(await page.locator('.calendar-legend').count(),0);assert.equal(await page.locator('#selected-date,#journey-month,[data-action="date-today"]').count(),0);assert.equal(await page.locator('.calendar-day.selected').getAttribute('aria-pressed'),'true');if(width===320||width===390)await snap((await expanded()==='true'?'month':'week')+'-'+width);await toggle();}}
  await page.setViewportSize({width:390,height:844});
 });
 await step('new check-in adds marker and undo removes only last mark for that day',async()=>{
  await date('2026-11-10');assert.equal(await page.locator('.calendar-day.selected i').count(),0);await page.locator('.journey-checklist [data-action="check-in"]').first().tap();await page.locator('[data-gi-scene]').waitFor();await dismiss();assert.equal(await page.locator('.calendar-day.selected i').count(),1);
  await page.locator('.journey-line [data-action="entry"]').first().tap();await page.locator('[data-action="confirm-undo"]').tap();await page.locator('[data-action="undo"]').tap();await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.waitForFunction(()=>!history.state?.growthDialog);assert.equal(await page.locator('.calendar-day.selected i').count(),0);const after=await raw();for(const k of Object.keys(initial).filter(k=>k!==STORAGE_KEY))assert.equal(after[k],initial[k]);assert.deepEqual(JSON.parse(after[STORAGE_KEY]).entries,s.entries);
 });
 await step('another-tab marker refresh keeps unsaved task draft and focus intact',async()=>{
  await date('2026-11-10');await page.locator('.journey-checklist [data-action="new-task"]').tap();await page.locator('[name="title"]').fill('未保存的小事');const before=await raw();const other=await context.newPage();await other.goto(base+'#journey?date=2026-11-10');await other.locator('.journey-checklist [data-action="check-in"]').first().click();await other.locator('[data-gi-scene]').waitFor();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('同步'));assert.equal(await page.locator('[name="title"]').inputValue(),'未保存的小事');assert.equal(await page.locator('[name="title"]').evaluate(el=>el===document.activeElement),true);assert.equal(await page.locator('.calendar-day.selected i').count(),1);assert.equal(await page.locator('#modal').evaluate(el=>el.open),true);await dismiss();assert.equal((JSON.parse((await raw())[STORAGE_KEY]).tasks).some(t=>t.title==='未保存的小事'),false);await other.close();
 });
 await step('repeated toggles and ordinary tap after drag remain single actions',async()=>{
  for(let n=0;n<8;n++){await toggle();assert.equal(await expanded(),n%2===0?'true':'false');}await swipe('.calendar-toggle',0,60);assert.equal(await expanded(),'true');await toggle();assert.equal(await expanded(),'false');await page.locator('[data-date="2026-11-12"]').tap();assert.equal(await selected(),'2026-11-12');
 });
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({passed:results.length,results,errors,external,screenshots:shots},null,2));
}finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
