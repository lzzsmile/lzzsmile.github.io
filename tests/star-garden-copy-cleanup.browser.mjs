// Disposable synthetic browser contexts. Never connects to production or a real user profile.
import assert from 'node:assert/strict';
import {selectedDate,visibleMonth,browseMonth,chooseDate} from './star-garden-calendar-helpers.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {emptyState,addTask,checkIn,STORAGE_KEY,localDate,exportData} from '../star-garden/growth-model.mjs';
import {emptyState as legacyState,addWish,checkIn as legacyCheck,STORAGE_KEY as LEGACY_KEY,exportData as legacyExport} from '../star-garden/model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url),shots='/tmp/star-garden-copy-cleanup-review';
const server=createServer(async(req,res)=>{try{let p=new URL(req.url,'http://localhost').pathname;if(!p.startsWith('/star-garden/'))return res.writeHead(404).end();const url=new URL('.'+(p.endsWith('/')?p+'index.html':p),root);res.writeHead(200,{'Content-Type':({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[extname(url.pathname)]||'application/octet-stream','Cache-Control':'no-store'}).end(await readFile(url));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/star-garden/';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',reducedMotion:'reduce',serviceWorkers:'block'});const page=await context.newPage(),errors=[],external=[],results=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();external.push(u);return route.abort();});
const step=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
const saved=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),STORAGE_KEY),raw=()=>page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
const seed=async(state,extras={})=>{await page.goto(base);await page.evaluate(({key,state,extras})=>{localStorage.clear();if(state)localStorage.setItem(key,JSON.stringify(state));for(const [k,v]of Object.entries(extras))localStorage.setItem(k,v);},{key:STORAGE_KEY,state,extras});await page.goto(base+'#today');await page.reload();};
const dismiss=async()=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.waitForFunction(()=>!history.state?.growthDialog);};
const nav=async(name)=>{await page.locator('.tabbar [data-view="'+name+'"]').click();};
const snap=async(name)=>{await mkdir(shots,{recursive:true});await page.screenshot({path:shots+'/'+name+'.png',fullPage:true});};
const add=async(title,schedule='once',date=localDate())=>{await page.locator('[data-action="new-task"]').first().click();await page.locator('[name="title"]').fill(title);await page.locator('[name="schedule"][value="'+schedule+'"]').check({force:true});await page.locator('[name="startDate"]').fill(date);await page.locator('#task-form [type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);};
const tomorrow=()=>{const d=new Date();d.setDate(d.getDate()+1);return localDate(d);};const yesterday=()=>{const d=new Date();d.setDate(d.getDate()-1);return localDate(d);};
try{
 await page.goto(base);
 await step('all pages omit requested explanations and shared slogans without hiding actions',async()=>{
  const removed=['完成即保存','每件事每天一步','这一天没有待完成的事项','无需登录','无排名','没有连续打卡压力','每一个小小的完成，都值得被看见','点击记录，可重温陪伴','不和别人比较','周一开始','直接选择日期','跳转','回到今天','一步很小，走过就有意义'];
  for(const route of ['today','journey','settings']){
   await nav(route);const text=await page.locator('#app').innerText();for(const phrase of removed)assert.equal(text.includes(phrase),false,route+': '+phrase);
   assert.equal(await page.locator('.quiet-footer,.save-note,.settings-footnote,.calendar-legend').count(),0);
   if(route==='today'){assert.equal(await page.locator('.empty-day [data-action="new-task"]').isVisible(),true);assert.equal(await page.locator('[data-focus-key="setup-companion"]').isVisible(),true);}
   if(route==='journey'){assert.equal(await page.locator('#selected-date,#journey-month,[data-action="date-today"],.journey-calendar input').count(),0);assert.equal(await page.locator('.journey-checklist [data-action="new-task"]').isVisible(),true);}
   if(route==='settings')assert.match(await page.locator('.privacy-card').innerText(),/换设备或清理浏览器前，请先导出备份/);
  }
  assert.equal(await raw(),null);
 });
 await step('date shortcuts are absent while grid selection and week/month controls work',async()=>{
  await nav('journey');const initial=await selectedDate(page);await page.locator('[data-action="week-prev"]').click();assert.equal(await selectedDate(page),initial);
  const target=await page.locator('.calendar-day').first().getAttribute('data-date');await page.locator('.calendar-day').first().click();assert.equal(await selectedDate(page),target);
  await page.locator('.calendar-toggle').click();assert.equal(await page.locator('.calendar-toggle').getAttribute('aria-expanded'),'true');await page.locator('[data-action="month-prev"]').click();assert.equal(await selectedDate(page),target);await page.locator('.calendar-day').first().click();
  await page.locator('.calendar-toggle').click();assert.equal(await page.locator('.calendar-day').count(),7);assert.equal(await page.locator('.calendar-day.selected').getAttribute('aria-pressed'),'true');assert.equal(await raw(),null);
 });
 await step('safety and user-authored text stay intact; cancelling dialogs never saves',async()=>{
  const s=emptyState();s.settings.companion='测试同行者';s.settings.dedication='用户写下的这段话必须完整保留';s.settings.companionConfigured=true;
  const task=addTask(s,{title:'用户事项',note:'用户的小提醒',schedule:'daily'});checkIn(s,task.id,localDate(),'用户的完成记录备注');addTask(s,{title:'待完成的用户事项',note:'用户的小提醒'});await seed(s);const before=await raw();
  assert.match(await page.locator('.companion-presence').innerText(),/用户写下的这段话必须完整保留/);assert.match(await page.locator('.task-list').first().innerText(),/用户的小提醒/);
  await page.locator('.completed-list [data-action="entry"]').first().click();assert.match(await page.locator('#modal').innerText(),/用户的完成记录备注/);await page.locator('[data-action="confirm-undo"]').click();assert.match(await page.locator('#modal').innerText(),/其他事项和记录都不受影响/);await dismiss();
  await nav('settings');await page.locator('[data-action="manage-tasks"]').click();assert.match(await page.locator('#modal').innerText(),/已有足迹不会删除/);await dismiss();
  await page.locator('[data-action="backup"]').click();assert.match(await page.locator('#modal').innerText(),/未加密/);assert.match(await page.locator('#modal').innerText(),/导入前会先预览并请你确认/);assert.equal(await page.locator('#modal [data-action="export"],#modal #import-file').count(),2);assert.equal(await page.locator('#modal [data-action="restore-previous"],#modal [data-action="export-safety"],#modal [data-action="migrate"],#modal [data-action="legacy-archive"]').count(),0);await dismiss();
  await page.locator('[data-action="personalize"]').click();assert.match(await page.locator('#modal').innerText(),/照片仅在本机裁剪和保存/);await page.locator('[name="recipient"]').fill('取消的草稿');await dismiss();assert.equal(await raw(),before);
 });
 await step('concise pages stay usable at 320, 390 and 1280 pixels',async()=>{
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   for(const route of ['today','journey','settings']){
    await nav(route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await snap(route+'-'+width);
    if(route==='journey'){await page.locator('.calendar-toggle').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await snap('journey-month-'+width);assert.equal(await page.locator('.calendar-toggle').evaluate(el=>el.getBoundingClientRect().height>=44),true);await page.locator('.calendar-toggle').click();}
   }
  }
 });
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(JSON.stringify({passed:results.length,results,errors,external,screenshots:shots},null,2));
}finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
