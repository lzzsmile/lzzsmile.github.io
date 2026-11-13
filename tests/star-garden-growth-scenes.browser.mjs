// Only isolated synthetic local storage and a random loopback HTTP server.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {emptyState,addTask,checkIn,STORAGE_KEY,localDate} from '../star-garden/growth-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=new URL('../',import.meta.url),shots=process.env.GARDEN_SCREENSHOTS||'/tmp/star-garden-growth-scenes';
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/star-garden/'))return res.writeHead(404).end();const file=new URL('.'+(path.endsWith('/')?path+'index.html':path),repo);res.writeHead(200,{'Content-Type':({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file.pathname)]||'application/octet-stream'}).end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/star-garden/`;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block',locale:'zh-CN'}),page=await context.newPage(),errors=[];let count=0;
await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
const kinds=['sunrise','highfive','plant','wind','postcard','rhythm'];
const fixture=emptyState();fixture.settings.recipient='小晴 <晴天>';fixture.settings.companion='同行的人';fixture.settings.dedication='今天认真做的小事，都会成为你的光。\n明天也一起慢慢向前。';
for(const kind of kinds){const task=addTask(fixture,{title:`测试 ${kind}`,schedule:'daily'});const entry=checkIn(fixture,task.id,localDate());entry.interaction=kind;}
const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),STORAGE_KEY);
const close=async()=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#modal').open);await page.waitForTimeout(80);};
const open=async kind=>{const id=fixture.entries.find(e=>e.interaction===kind).id;await page.locator(`[data-action="entry"][data-id="${id}"]`).first().click();await page.locator('#modal [data-action="replay"]').click();await page.locator(`[data-gi-scene="${kind}"][data-phase="intro"]`).waitFor();assert.equal(await page.locator('.gi-intro').isVisible(),true);return id;};
const start=async()=>{await page.locator('[data-gi-action="start"]').focus();await page.keyboard.press('Enter');await page.locator('[data-phase="active"]').waitFor();};
const finish=async(kind,swipe=false)=>{
 if(kind==='sunrise'||kind==='wind'){
  if(swipe){const b=await page.locator('[data-gi-swipe]').boundingBox();await page.mouse.move(b.x+12,b.y+50);await page.mouse.down();await page.mouse.move(b.x+b.width-12,b.y+50,{steps:8});await page.mouse.up();}
  else{await page.locator('[data-gi-range]').focus();await page.keyboard.press('End');}
 }
 if(kind==='highfive'){await page.locator('[data-gi-action="palm"]').focus();await page.keyboard.press('Enter');}
 if(kind==='plant')for(let i=0;i<3;i++)await page.locator('[data-gi-action="water"]').click();
 if(kind==='postcard'){await page.locator('[data-gi-action="letter"]').click();assert.equal(await page.locator('.gi-dedication').textContent(),fixture.settings.dedication);assert.match(await page.locator('.gi-letter').textContent(),/小晴 <晴天>/);if(page.viewportSize().width===390)await page.screenshot({path:shots+'/postcard-open.png'});await page.locator('[data-gi-action="keep"]').click();}
 if(kind==='rhythm')for(let i=0;i<3;i++){assert.equal(await page.locator(`[data-beat="${i}"]`).isDisabled(),false);await page.keyboard.press('Enter');}
 await page.locator('[data-phase="done"]').waitFor();await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).entries.some(e=>e.completedAt),STORAGE_KEY);
};
try{
 await mkdir(shots,{recursive:true});await page.goto(base);
 fixture.settings.avatar=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.fillStyle='#e9b77d';x.fillRect(0,0,64,64);x.fillStyle='#476347';x.fillRect(15,17,8,8);x.fillRect(42,17,8,8);x.fillRect(25,43,20,5);return {type:'photo',dataUrl:c.toDataURL('image/jpeg')};});
 await page.evaluate(({s,k})=>{localStorage.clear();localStorage.setItem(k,JSON.stringify(s));},{s:fixture,k:STORAGE_KEY});await page.goto(base+'#journey?date='+localDate());await page.reload();
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844});
  for(const kind of kinds){
   const id=await open(kind);
   assert.equal(await page.locator('.gi-companion img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
   if(width===390)await page.screenshot({path:`${shots}/${kind}-intro.png`});
   // Closing without finishing must preserve the saved step and restart intro.
   await start();await close();assert.equal((await read()).entries.length,6);await open(kind);await start();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const bounds=await page.locator('.gi-world').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1,`${kind} scene overflow at ${width}`);
   const controls=await page.locator('.gi-activity button:visible,.gi-activity input:visible').all();for(const control of controls){const b=await control.boundingBox();assert(b.x>=bounds.x-1&&b.x+b.width<=bounds.x+bounds.width+1,`${kind} control overflow at ${width}`);}
   if(width===390)await page.screenshot({path:`${shots}/${kind}-active.png`});
   await finish(kind,kind==='wind'&&width===430);
   await page.waitForFunction(({k,id})=>JSON.parse(localStorage.getItem(k)).entries.find(e=>e.id===id).completedAt,{k:STORAGE_KEY,id});
   const before=(await read()).entries.find(e=>e.id===id).completedAt;
   await page.locator('.gi-scene').evaluate(root=>{for(let i=0;i<15;i++)root.querySelectorAll('[data-gi-action]').forEach(b=>b.click());});
   assert.equal((await read()).entries.find(e=>e.id===id).completedAt,before);assert.equal((await read()).entries.length,6);
   if(width===390)await page.screenshot({path:`${shots}/${kind}-done.png`});
   await close();count++;console.log(`PASS ${width}px ${kind}: intro/reopen/keyboard or touch/completion once/photo/no overflow`);
  }
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:count,errors,screenshots:shots}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
