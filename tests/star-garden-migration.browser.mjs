// Disposable synthetic browser contexts. Never connects to production or a real user profile.
import assert from 'node:assert/strict';
import {selectedDate,visibleMonth,browseMonth,chooseDate} from './star-garden-calendar-helpers.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {emptyState,addTask,checkIn,STORAGE_KEY,localDate,exportData} from '../star-garden/growth-model.mjs';
import {emptyState as legacyState,addWish,checkIn as legacyCheck,STORAGE_KEY as LEGACY_KEY,exportData as legacyExport} from '../star-garden/model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url),shots='/tmp/star-garden-growth-review';
const server=createServer(async(req,res)=>{try{let p=new URL(req.url,'http://localhost').pathname;if(!p.startsWith('/star-garden/'))return res.writeHead(404).end();const url=new URL('.'+(p.endsWith('/')?p+'index.html':p),root);res.writeHead(200,{'Content-Type':({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[extname(url.pathname)]||'application/octet-stream','Cache-Control':'no-store'}).end(await readFile(url));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/star-garden/';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',reducedMotion:'reduce',serviceWorkers:'block'});const page=await context.newPage(),errors=[],external=[],results=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();external.push(u);return route.abort();});
const step=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
const saved=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),STORAGE_KEY),raw=()=>page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
const seed=async(state,extras={})=>{await page.goto(base);await page.evaluate(({key,state,extras})=>{localStorage.clear();if(state)localStorage.setItem(key,JSON.stringify(state));for(const [k,v]of Object.entries(extras))localStorage.setItem(k,v);},{key:STORAGE_KEY,state,extras});await page.reload();};
const dismiss=async()=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.waitForFunction(()=>!history.state?.growthDialog);};
const nav=async(name)=>{await page.locator('.tabbar [data-view="'+name+'"]').click();};
const snap=async(name)=>{await mkdir(shots,{recursive:true});await page.screenshot({path:shots+'/'+name+'.png',fullPage:true});};
const add=async(title,schedule='once',date=localDate())=>{await page.locator('[data-action="new-task"]').first().click();await page.locator('[name="title"]').fill(title);await page.locator('[name="schedule"][value="'+schedule+'"]').check({force:true});await page.locator('[name="startDate"]').fill(date);await page.locator('#task-form [type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);};
const tomorrow=()=>{const d=new Date();d.setDate(d.getDate()+1);return localDate(d);};const yesterday=()=>{const d=new Date();d.setDate(d.getDate()-1);return localDate(d);};
const SNAPSHOT='starwish-garden:growth:legacy-snapshot:v1',RECOVERY='starwish-garden:growth:before-restore:v2';
const legacy=()=>{const s=legacyState();const w=addWish(s,{title:'合成旧愿望',category:'self',kind:'habit',target:5});legacyCheck(s,w.id,'保留这一步',new Date());return JSON.stringify(s);};
const reopen=async()=>{await nav('settings');await page.locator('[data-action="backup"]').click();const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const buffer=await readFile(await(await pending).path());await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer});};
const stored=key=>page.evaluate(key=>localStorage.getItem(key),key);
try{
 await step('first prompt is shown once, cancel/reload/back-forward stay quiet, and export/import offers explicit retry',async()=>{
  const old=legacy();await seed(null,{[LEGACY_KEY]:old});await page.locator('[data-action="confirm-migration"]').waitFor();assert.equal(await page.locator('[data-action="preview-migration"],[data-action="export-legacy"]').count(),0);
  await dismiss();await page.reload();assert.equal(await page.locator('#modal').evaluate(e=>e.open),false);
  for(const view of ['journey','settings','today']){await nav(view);assert.equal(await page.locator('.legacy-notice,[data-action="legacy-archive"],[data-action="migrate"]').count(),0);}
  await page.goBack();await page.goForward();assert.equal(await page.locator('#modal').evaluate(e=>e.open),false);assert.equal(await raw(),null);assert.equal(await stored(LEGACY_KEY),old);
  await reopen();await page.locator('[data-action="confirm-import"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.deepEqual((await saved()).legacy.source,JSON.parse(old));assert.equal(await stored(SNAPSHOT),null);assert.equal(await stored(LEGACY_KEY),old);await page.reload();assert.equal(await page.locator('#modal').evaluate(e=>e.open),false);
 });
 await step('canceling a lock-waiting migration does not write, and later explicit retry succeeds',async()=>{
  const old=legacy();await seed(null,{[LEGACY_KEY]:old});
  await page.evaluate(key=>{void navigator.locks.request(key,()=>new Promise(resolve=>{window.releaseMigrationLock=resolve;}));},STORAGE_KEY);await page.waitForFunction(()=>Boolean(window.releaseMigrationLock));
  await page.locator('[data-action="confirm-migration"]').click();await dismiss();await page.evaluate(()=>window.releaseMigrationLock());
  await page.waitForFunction(()=>navigator.locks.query().then(s=>s.held.length===0&&s.pending.length===0));assert.equal(await raw(),null);assert.equal(await stored(SNAPSHOT),null);assert.equal(await stored(LEGACY_KEY),old);
  await reopen();await page.locator('[data-action="confirm-import"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal((await saved()).entries.length,1);
 });
 await step('declining migration keeps both datasets in one export after starting fresh',async()=>{
 const old=legacy();await seed(null,{[LEGACY_KEY]:old});await dismiss();await add('全新的事项');const fresh=await raw();await nav('settings');await page.locator('[data-action="backup"]').click();const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const backup=JSON.parse(await readFile(await(await pending).path(),'utf8'));assert.equal(backup.raw[LEGACY_KEY],old);assert.equal(backup.raw[STORAGE_KEY],fresh);assert.equal(await stored(LEGACY_KEY),old);await dismiss();
 });
 await step('confirmation preserves an existing snapshot and every recovery byte',async()=>{
  const old=legacy(),extras={[LEGACY_KEY]:old,[SNAPSHOT]:'prior snapshot bytes',[RECOVERY]:'prior recovery bytes','starwish-garden:before-import:v1':'old recovery','starwish-garden:last-deleted:v1':'old deleted'};
  await seed(null,extras);await page.locator('[data-action="confirm-migration"]').dblclick();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal((await saved()).entries.length,1);for(const[k,v]of Object.entries(extras))assert.equal(await stored(k),v);
 });
 await step('existing v2, including an empty saved journey, never offers automatic migration',async()=>{
 for(const existing of [emptyState(),{...emptyState(),settings:{...emptyState().settings,recipient:'新版已有名字'}}]){
 const old=legacy();await seed(existing,{[LEGACY_KEY]:old,[RECOVERY]:'recovery'});const before=await raw();assert.equal(await page.locator('#modal').evaluate(e=>e.open),false);await nav('settings');await page.locator('[data-action="backup"]').click();assert.equal(await page.locator('[data-action="migrate"],[data-action="confirm-migration"]').count(),0);assert.equal(await raw(),before);assert.equal(await stored(LEGACY_KEY),old);assert.equal(await stored(RECOVERY),'recovery');await dismiss();}
 });
 await step('concurrent new journey and changed legacy source invalidate confirmation without overwriting',async()=>{
  for(const changedKey of [STORAGE_KEY,LEGACY_KEY]){
   const old=legacy();await seed(null,{[LEGACY_KEY]:old});const other=await context.newPage();await other.goto(base);const changed=changedKey===STORAGE_KEY?JSON.stringify(emptyState()):legacy();
   // Ensure source bytes differ even when timestamps fall within the same millisecond.
   const value=changedKey===LEGACY_KEY?JSON.stringify({...JSON.parse(changed),settings:{...JSON.parse(changed).settings,recipient:'另一页'}}):changed;
   await other.evaluate(({k,v})=>localStorage.setItem(k,v),{k:changedKey,v:value});await page.locator('[data-action="confirm-migration"]').click();await page.waitForFunction(()=>document.querySelector('.modal-error').textContent.length>0);assert.equal(await stored(changedKey),value);assert.equal(await stored(SNAPSHOT),null);if(changedKey===LEGACY_KEY)assert.equal(await raw(),null);await other.close();await dismiss();
  }
 });
 await step('quota failures preserve source and recovery, and import retry succeeds without a new prompt',async()=>{
  for(const failedKey of [SNAPSHOT,STORAGE_KEY]){
   const old=legacy();await seed(null,{[LEGACY_KEY]:old,[RECOVERY]:'prior recovery'});
   await page.evaluate(key=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('full','QuotaExceededError');return window.originalSet.call(this,k,v);};},failedKey);
   await page.locator('[data-action="confirm-migration"]').click();await page.waitForFunction(()=>document.querySelector('.modal-error').textContent.includes('空间不足'));assert.equal(await raw(),null);assert.equal(await stored(LEGACY_KEY),old);assert.equal(await stored(RECOVERY),'prior recovery');if(failedKey===STORAGE_KEY)assert.equal(await stored(SNAPSHOT),old);
   await page.evaluate(()=>Storage.prototype.setItem=window.originalSet);await dismiss();await page.reload();assert.equal(await page.locator('#modal').evaluate(e=>e.open),false);await reopen();await page.locator('[data-action="confirm-import"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.equal((await saved()).entries.length,1);
  }
 });
 await step('invalid legacy stays raw and cannot be confirmed; cancellation permits new independent records',async()=>{
  await seed(null,{[LEGACY_KEY]:'{invalid old bytes'});assert.match(await page.locator('#modal').innerText(),/暂时无法读取/);assert.equal(await page.locator('[data-action="confirm-migration"]').count(),0);await dismiss();await add('新的独立事项');assert.equal((await saved()).tasks.length,1);assert.equal(await stored(LEGACY_KEY),'{invalid old bytes');assert.equal(await stored(SNAPSHOT),null);
 });
 await step('canceling a pending import leaves journey and recovery bytes untouched',async()=>{
 const old=legacy();await seed(null,{[LEGACY_KEY]:old,[RECOVERY]:'prior recovery'});await dismiss();await reopen();
 await page.evaluate(key=>{void navigator.locks.request(key,()=>new Promise(resolve=>{window.releaseImportLock=resolve;}));},STORAGE_KEY);await page.waitForFunction(()=>Boolean(window.releaseImportLock));await page.locator('[data-action="confirm-import"]').click();await dismiss();await page.evaluate(()=>window.releaseImportLock());await page.waitForFunction(()=>navigator.locks.query().then(s=>s.held.length===0&&s.pending.length===0));assert.equal(await raw(),null);assert.equal(await stored(RECOVERY),'prior recovery');assert.equal(await stored(LEGACY_KEY),old);
 });
 await step('single export preserves unreadable raw records instead of silently discarding them',async()=>{
 await seed(null,{[STORAGE_KEY]:'{invalid current',[LEGACY_KEY]:'{invalid legacy'});await nav('settings');await page.locator('.settings-row[data-action="backup"]').click();const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const backup=JSON.parse(await readFile(await(await pending).path(),'utf8'));assert.equal(backup.raw[STORAGE_KEY],'{invalid current');assert.equal(backup.raw[LEGACY_KEY],'{invalid legacy');await dismiss();
 });
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log(`Completed ${results.length} migration regression groups.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
