// All records are synthetic, in disposable Chromium contexts on a random loopback port.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {extname} from 'node:path';
import {STORAGE_KEY as GROWTH_KEY} from '../star-garden/growth-model.mjs';
import {APP_VERSION} from '../star-garden/update.mjs';
import {emptyState,addWish,checkIn,finishCelebration,STORAGE_KEY,BACKUP_KEY} from '../star-garden/model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url),dir=new URL('../star-garden/',import.meta.url);
const futureVersion=APP_VERSION.replace(/\d+$/,patch=>String(Number(patch)+1));
const source=await readFile(new URL('sw.js',dir),'utf8');
const entries=JSON.parse(/const ASSET_ENTRIES=(\[.*\]);/.exec(source)[1]);
const paths=[...new Set(entries.map(([p])=>p==='./'?'index.html':p.slice(2))), 'sw.js'];
const current=new Map(await Promise.all(paths.map(async p=>[p,await readFile(new URL(p,dir))])));
const legacyRef=process.env.GARDEN_LEGACY_REF||'d932be3';
const oldSource=execFileSync('git',['show',legacyRef+':star-garden/sw.js'],{cwd:root}).toString();
const oldEntries=JSON.parse(/const ASSET_ENTRIES=(\[.*\]);/.exec(oldSource)[1]);
const oldPaths=[...new Set(oldEntries.map(([p])=>p==='./'?'index.html':p.slice(2))), 'sw.js'];
const old=new Map(oldPaths.map(p=>[p,execFileSync('git',['show',legacyRef+':star-garden/'+p],{cwd:root})]));

function future(version){const files=new Map(current);for(const p of ['update.mjs','sw.js'])files.set(p,Buffer.from(files.get(p).toString().replaceAll(APP_VERSION,version)));const hashes=entries.map(([p])=>[p,'sha256-'+createHash('sha256').update(files.get(p==='./'?'index.html':p.slice(2))).digest('base64')]);const id=createHash('sha256').update(JSON.stringify(hashes)).digest('hex').slice(0,16);files.set('sw.js',Buffer.from(files.get('sw.js').toString().replace(/const RELEASE_ID='[^']+';/,`const RELEASE_ID='${id}';`).replace(/const ASSET_ENTRIES=\[.*\];/,'const ASSET_ENTRIES='+JSON.stringify(hashes)+';')));return files;}
let served=old,broken='';const requests=[];
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/star-garden/'))return res.writeHead(404).end();const name=url.pathname.slice('/star-garden/'.length)||'index.html';requests.push({name,cache:req.headers['cache-control']});if(name===broken)return res.writeHead(503).end();const data=served.get(name);if(!data)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':mime[extname(name)]||'application/octet-stream','Cache-Control':name==='sw.js'?'no-cache':'public,max-age=3600'}).end(data);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/star-garden/';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',serviceWorkers:'allow',reducedMotion:'reduce'});
let page=await context.newPage();const errors=[],results=[];
context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
const step=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
const state=emptyState('2026-11-01T12:00:00Z');state.settings.recipient='升级测试';state.settings.avatar={type:'preset',id:'cat'};const wish=addWish(state,{title:'合成测试愿望',category:'life',kind:'once'});const celebration=checkIn(state,wish.id,'测试心情',new Date('2026-11-01T12:00:00Z'));finishCelebration(state,celebration.celebration.id,'hug');
const initial={[STORAGE_KEY]:JSON.stringify(state),[BACKUP_KEY]:JSON.stringify(state),'starwish-garden:last-deleted:v1':JSON.stringify(state),'other-app-data':'must stay'};
const snapshot=p=>p.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
const nav=async(name,p=page)=>p.locator('.tabbar [data-view="'+name+'"]').click();
const updates=async(p=page)=>{await nav('settings',p);await p.locator('.settings-row[data-action="updates"]').click();};
const dismiss=async(p=page)=>{await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('#modal').open);};
const available=async(p=page)=>{await p.locator('#modal [data-action="apply-update"]').waitFor({state:'visible',timeout:20000});};
try{
 await step('historical 0.4.2 worker installs synthetic v1 and recovery records',async()=>{
  await page.goto(base);await page.evaluate(async data=>{for(const [k,v]of Object.entries(data))localStorage.setItem(k,v);await navigator.serviceWorker.ready;await caches.open('other-app-cache');},initial);
  await page.reload();await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));assert.deepEqual(await snapshot(page),initial);
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data.version);navigator.serviceWorker.controller.postMessage({type:'GET_VERSION'},[c.port2]);})),'0.4.2');
 });
 await step('complete hashed current release waits until explicit update; v1 remains untouched',async()=>{
  served=current;await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting));
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data.version);navigator.serviceWorker.controller.postMessage({type:'GET_VERSION'},[c.port2]);})),'0.4.2');assert.deepEqual(await snapshot(page),initial);
  await nav('settings');await page.locator('[data-action="updates"]').first().click();await available();await page.locator('#modal [data-action="apply-update"]').click();
  await page.locator('.profile-card').waitFor();await page.locator('[data-action="confirm-migration"]').waitFor();assert.deepEqual(await snapshot(page),{...initial,'starwish-garden:growth:migration-prompt:v1':'seen'});
 });
 await step('first migration prompt cancels without changing records; one confirmation creates v2',async()=>{
  const prompted={...initial,'starwish-garden:growth:migration-prompt:v1':'seen'};assert.deepEqual(await snapshot(page),prompted);await dismiss();assert.deepEqual(await snapshot(page),prompted);
  await page.locator('[data-action="backup"]').click();await page.locator('[data-action="migrate"]').click();await page.locator('[data-action="confirm-migration"]').click();await page.waitForFunction(k=>!!localStorage.getItem(k),GROWTH_KEY);await page.waitForFunction(()=>!document.querySelector('#modal').open);
  const all=await snapshot(page);for(const [k,v]of Object.entries(initial))assert.equal(all[k],v);
  const growth=JSON.parse(all[GROWTH_KEY]);assert.equal(growth.entries.length,1);assert.deepEqual(growth.legacy.source,state);assert.equal(all['starwish-garden:growth:legacy-snapshot:v1'],initial[STORAGE_KEY]);
 });
 const migrated=await snapshot(page);
 await step('complete current shell reloads offline with migrated records',async()=>{
  await context.setOffline(true);await page.reload();await page.locator('.profile-card').waitFor();assert.deepEqual(await snapshot(page),migrated);await updates();assert.match(await page.locator('.settings-version').innerText(),new RegExp(APP_VERSION.replaceAll('.','\\.')));await dismiss();await context.setOffline(false);
 });
 await step('incomplete next release cannot activate and retains complete offline current shell',async()=>{
  served=future(futureVersion);broken='growth-interactions.mjs';await updates();await page.locator('[data-action="check-update"]').click();await page.waitForFunction(()=>document.querySelector('[data-update-status]').textContent.match(/未能|未下载/));assert.equal(await page.locator('#modal [data-action="apply-update"]').isVisible(),false);assert.deepEqual(await snapshot(page),migrated);
  await dismiss();await context.setOffline(true);await page.reload();await page.locator('.profile-card').waitFor();assert.deepEqual(await snapshot(page),migrated);await context.setOffline(false);broken='';
 });
 const editor=await context.newPage();await editor.goto(base+'#settings');await editor.locator('[data-action="personalize"]').click();await editor.locator('[name="recipient"]').fill('尚未保存的称呼');
 await step('complete future release waits for consent and preserves another-tab draft',async()=>{
  await updates();await page.locator('[data-action="check-update"]').click();await available();assert.equal(await editor.locator('[name="recipient"]').inputValue(),'尚未保存的称呼');assert.deepEqual(await snapshot(page),migrated);
 });
 await step('global notice is visible on all pages, can be deferred, and remains reachable',async()=>{
  await dismiss();for(const v of ['today','journey','settings']){await nav(v);await page.locator('.update-banner').waitFor();assert.equal(await page.locator('[data-update-entry] button').isVisible(),true);assert.match(await page.locator('.tabbar [data-view="settings"]').getAttribute('aria-label'),/新版本/);}
  await mkdir('/tmp/star-garden-update-notice-review',{recursive:true});
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await nav('today');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/star-garden-update-notice-review/notice-'+width+'.png',fullPage:true});}
  await page.setViewportSize({width:390,height:844});await page.locator('[data-action="defer-update"]').click();assert.equal(await page.locator('.update-banner').count(),0);assert.equal(await page.locator('[data-update-entry] button').evaluate(el=>el===document.activeElement),true);
  for(const v of ['journey','settings','today']){await nav(v);assert.equal(await page.locator('.update-banner').count(),0);assert.equal(await page.locator('[data-update-entry] button').isVisible(),true);}
  assert.equal(await editor.locator('[name="recipient"]').inputValue(),'尚未保存的称呼');assert.equal(await editor.locator('[name="recipient"]').evaluate(el=>el===document.activeElement),true);
  await page.locator('[data-update-entry] button').click();await available();assert.deepEqual(await snapshot(page),migrated);
 });
 await step('explicit future update reloads only requester, preserving draft and every stored key',async()=>{
  await page.locator('#modal [data-action="apply-update"]').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);await nav('settings');await page.locator('.profile-card').waitFor();await updates();await page.waitForFunction(v=>document.querySelector('.settings-version')?.textContent.includes(v),futureVersion);
  assert.deepEqual(await snapshot(page),migrated);assert.equal(await editor.locator('[name="recipient"]').inputValue(),'尚未保存的称呼');assert.equal(await editor.locator('#modal').evaluate(e=>e.open),true);await editor.locator('[data-update-entry] [data-action="updates"]').waitFor({state:'attached'});
  assert.equal(await page.evaluate(async()=> (await caches.keys()).includes('other-app-cache')),true);
  // This page already has the new worker, but remains on its old document until it chooses to update.
  await dismiss(editor);await editor.locator('.update-banner [data-action="apply-update"]').click();await editor.locator('.profile-card').waitFor();await updates(editor);await editor.waitForFunction(v=>document.querySelector('.settings-version')?.textContent.includes(v),futureVersion);assert.deepEqual(await snapshot(editor),migrated);await editor.close();await dismiss();
 });
 await step('updated future shell is complete offline and raw recovery records remain byte-identical',async()=>{
  await context.setOffline(true);await page.reload();await page.locator('.profile-card').waitFor();await updates();assert.match(await page.locator('.settings-version').innerText(),new RegExp(futureVersion.replaceAll('.','\\.')));assert.deepEqual(await snapshot(page),migrated);
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,results,errors},null,2));
}catch(error){console.error('DEBUG',await page.evaluate(async()=>({online:navigator.onLine,status:document.querySelector('[data-update-status]')?.textContent,worker:(await navigator.serviceWorker.getRegistration())?.active?.state,waiting:(await navigator.serviceWorker.getRegistration())?.waiting?.state,version:document.querySelector('.settings-version')?.textContent})));throw error;}finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
