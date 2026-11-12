// Run with an installed Playwright package. Set PLAYWRIGHT_MODULE if it is outside this checkout.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {emptyState,addWish,checkIn,finishCelebration,STORAGE_KEY} from '../star-garden/model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url);
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(!path.startsWith('/star-garden/')){res.writeHead(404).end();return;}
    const url=new URL('.'+(path.endsWith('/')?path+'index.html':path),root);
    const data=await readFile(url);
    res.writeHead(200,{'Content-Type':mime[fileURLToPath(url).match(/\.[^.]+$/)?.[0]]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/star-garden/';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion:'reduce',serviceWorkers:'block'});
const page=await context.newPage(),errors=[],external=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:'))external.push(r.url());});
const step=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
const nav=async name=>page.locator('.tabbar [data-view="'+name+'"]').tap();
const dismiss=async()=>{await page.locator('#modal [data-action="close"]').first().tap();await page.waitForFunction(()=>!document.querySelector('#modal').open);};
const saved=()=>page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
const focus=()=>page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,action:document.activeElement.dataset.action,ring:getComputedStyle(document.activeElement).outlineStyle,width:getComputedStyle(document.activeElement).outlineWidth,quiet:document.activeElement.hasAttribute('data-pointer-focus')}));
const checkReturn=async selector=>{
  assert.equal(await page.locator(selector).first().evaluate(el=>el===document.activeElement),true,selector);
  assert.notEqual((await focus()).id,'main');
};
try{
  await page.goto(base+'#settings');
  await step('settings has four direct entries and no duplicate garden/profile card',async()=>{
    assert.equal(await page.locator('.profile-card').count(),0);
    assert.equal(await page.locator('.settings-row').count(),4);
    assert.equal(await page.locator('h1').innerText(),'我的');
    assert.equal(await saved(),null);
  });
  await nav('home');
  await step('empty example sheet returns to its actual pointer trigger',async()=>{
    const selector='.example-row';
    await page.locator('#main').focus();
    await page.locator(selector).first().dispatchEvent('pointerdown');
    await page.locator(selector).first().dispatchEvent('click');
    await dismiss();await checkReturn(selector);assert.equal((await focus()).ring,'none');
  });
  const data=emptyState();
  const habit=addWish(data,{title:'焦点回归：读两页书',note:'虚构测试记录',category:'self',kind:'habit',target:7});
  const completed=addWish(data,{title:'焦点回归：看星星',note:'',category:'together',kind:'once',target:1});
  const c=checkIn(data,completed.id,'',new Date('2026-10-01T12:00:00'));finishCelebration(data,c.celebration.id,'hug');
  const pending=addWish(data,{title:'焦点回归：去散步',note:'',category:'self',kind:'once',target:1});checkIn(data,pending.id,'',new Date('2026-10-02T12:00:00'));
  const raw=JSON.stringify(data);
  await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:STORAGE_KEY,value:raw});await page.reload();
  const cases=[
    ['home','.companion-row'],['home','.wish-main'],['home','[data-action="checkin"]'],['home','[data-action="celebrate"]'],
    ['wishes','[data-action="new"]'],['wishes','.wish-main'],['wishes','[data-action="checkin"]'],
    ['stamps','.stamp-card'],['stamps','[data-action="celebrate"]'],
    ['settings','[data-action="personalize"]'],['settings','[data-action="backup"]'],['settings','[data-action="install-help"]']
  ];
  for(const [route,selector] of cases){
    await step(route+' '+selector+' survives Safari-style unfocused button activation',async()=>{
      await nav(route);await page.locator('#main').focus();
      await page.locator(selector).first().dispatchEvent('pointerdown');
      await page.locator(selector).first().dispatchEvent('click');
      assert.equal((await focus()).id,'modal-title');
      await dismiss();await checkReturn(selector);assert.equal((await focus()).ring,'none');
      assert.equal(await saved(),raw);
    });
  }
  for(const [route,selector] of cases){
    await step(route+' '+selector+' returns keyboard focus with a visible ring',async()=>{
      await nav(route);await page.locator(selector).first().focus();await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');await checkReturn(selector);
      const f=await focus();assert.equal(f.quiet,false);assert.equal(f.ring,'solid');assert.equal(f.width,'3px');
    });
  }
  await step('typing then pointer cancellation does not leave an inherited keyboard ring',async()=>{
    await nav('settings');await page.locator('[data-action="personalize"]').tap();
    await page.locator('[name="recipient"]').pressSequentially('no save');
    await dismiss();await checkReturn('[data-action="personalize"]');assert.equal((await focus()).ring,'none');assert.equal(await saved(),raw);
  });
  await step('background render while a sheet is open resolves the replacement trigger',async()=>{
    await page.locator('[data-action="backup"]').tap();
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await dismiss();await checkReturn('[data-action="backup"]');
  });
  await step('nested detail/edit cancellation returns to the original wish row',async()=>{
    await nav('wishes');const selector='.wish-main[data-id="'+habit.id+'"]';
    await page.locator(selector).tap();await page.locator('[data-action="edit"]').tap();await dismiss();await checkReturn(selector);
  });
  await step('saving settings returns focus after full DOM replacement',async()=>{
    await nav('settings');await page.locator('[data-action="personalize"]').focus();await page.keyboard.press('Enter');
    await page.locator('[name="recipient"]').fill('焦点测试');
    await page.locator('#settings-form [type="submit"]').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await checkReturn('[data-action="personalize"]');assert.equal((await focus()).ring,'solid');
    await page.locator('[data-action="personalize"]').tap();await page.locator('#settings-form [type="submit"]').tap();
    await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await checkReturn('[data-action="personalize"]');assert.equal((await focus()).ring,'none');
  });
  await step('keyboard filtering keeps the replacement filter focused',async()=>{
    await nav('wishes');await page.locator('[data-filter="bloomed"]').focus();await page.keyboard.press('Enter');
    await checkReturn('[data-filter="bloomed"]');assert.equal((await focus()).ring,'solid');
    await page.locator('[data-filter="growing"]').tap();
  });
  await step('a rebuilt duplicate detail action returns to the same control, not the wish title',async()=>{
    await page.locator('[data-filter="bloomed"]').tap();
    await page.locator('.check-button.done').first().tap();
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await dismiss();await checkReturn('.check-button.done');
    await page.locator('[data-filter="growing"]').tap();
  });
  await step('archiving a disappearing opener uses current navigation, never main/body',async()=>{
    await page.locator('.wish-main[data-id="'+habit.id+'"]').focus();await page.keyboard.press('Enter');
    await page.locator('[data-action="archive"]').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await checkReturn('.tabbar [aria-current="page"]');assert.equal((await focus()).ring,'solid');
  });
  await step('skip link retains accessible main focus and keyboard indicator',async()=>{
    await page.locator('.skip-link').focus();await page.keyboard.press('Enter');
    const f=await focus();assert.equal(f.id,'main');assert.equal(f.ring,'solid');assert.equal(f.width,'2px');
    await page.keyboard.press('Tab');assert.equal((await focus()).tag,'BUTTON');assert.equal((await focus()).ring,'solid');
  });
  await step('browser Back and Forward dismiss sheets and keep correct route',async()=>{
    await nav('home');await nav('wishes');await page.locator('[data-action="new"]').first().tap();await page.goBack();
    assert.equal(await page.locator('#modal').evaluate(el=>el.open),false);
    assert.equal(await page.locator('.tabbar .active').getAttribute('data-view'),'home');
    assert.notEqual((await focus()).id,'main');
    await page.goForward();assert.equal(await page.locator('.tabbar .active').getAttribute('data-view'),'wishes');
  });
  await step('all four pages fit 320, 375, 390, 430 and 1280 widths',async()=>{
    for(const width of [320,375,390,430,1280]){
      await page.setViewportSize({width,height:844});
      for(const route of ['home','wishes','stamps','settings']){
        await nav(route);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' '+width);
      }
    }
  });
  await step('selected color retains a distinct keyboard focus indicator',async()=>{
    await page.setViewportSize({width:390,height:844});await page.locator('[data-action="personalize"]').tap();
    await page.locator('.color-choice.selected').focus();await page.keyboard.press('ArrowRight');
    assert.equal((await focus()).ring,'solid');assert.equal((await focus()).width,'3px');await dismiss();
  });
  if(process.env.GARDEN_SCREENSHOTS){
    await mkdir(process.env.GARDEN_SCREENSHOTS,{recursive:true});
    await nav('settings');await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('visible'));await page.screenshot({path:process.env.GARDEN_SCREENSHOTS+'/settings-pointer.png'});
    await page.locator('[data-action="personalize"]').focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');
    await page.screenshot({path:process.env.GARDEN_SCREENSHOTS+'/settings-keyboard.png'});
  }
  await step('isolated test has no JavaScript errors or external requests',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
  console.log('ALL '+results.length+' FOCUS/UI CHECKS PASSED');
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
}

