import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENDINGS,emptyState,addWish,checkIn,finishCelebration,exportData,parseBackup} from '../star-garden/model.mjs';
import {sceneMarkup,celebrationStory,mountCelebration,CELEBRATION_INTERACTIONS} from '../star-garden/celebration.mjs';

function fixture(reduced=false){
  const listeners=new Map(),docListeners=new Map(),motionListeners=new Map(),timers=new Map();let nextTimer=0;
  const classes=new Set(),stage={dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
  const effects={innerHTML:'',replaceChildren(){this.innerHTML='';}},feedback={textContent:''};
  const motion={matches:reduced,addEventListener:(k,v)=>motionListeners.set(k,v),removeEventListener:k=>motionListeners.delete(k)};
  const doc={hidden:false,defaultView:{matchMedia:()=>motion,setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)},addEventListener:(k,v)=>docListeners.set(k,v),removeEventListener:k=>docListeners.delete(k)};
  const root={ownerDocument:doc,classList:{toggle(){}},querySelector:s=>({'.ce-stage':stage,'.ce-effects':effects,'.ce-feedback':feedback})[s],addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
  const container={querySelector:()=>root};
  return {container,stage,effects,feedback,doc,motion,timers,listeners,docListeners,motionListeners,classes,click(){listeners.get('click')?.({target:{closest:()=>({})}});}};
}

test('eight distinct endings retain the original identifiers and offer optional native controls',()=>{
  assert.equal(Object.keys(ENDINGS).length,8);
  for(const key of ['hug','dance','fireworks'])assert.ok(ENDINGS[key]);
  assert.deepEqual(Object.keys(ENDINGS),Object.keys(CELEBRATION_INTERACTIONS));
  for(const key of Object.keys(ENDINGS)){
    const html=sceneMarkup(key,{recipient:'你',companion:'伙伴',shirt:'#a2b79b'});
    assert.match(html,new RegExp(`data-celebration="${key}"`));
    assert.match(html,/<button type="button"[^>]*data-ce-trigger/);
    assert.match(html,/aria-live="polite"/);
    assert.match(html,/不用完成也可以直接收下印章/);
    assert.ok(celebrationStory(key).length>20);
    assert.equal(new Set(CELEBRATION_INTERACTIONS[key].feedback).size,3);
  }
});

test('story escapes recipient and companion text and handles unknown ending safely',()=>{
  const settings={recipient:'<img src=x onerror=alert(1)>',companion:'<script>bad()</script>'};
  for(const key of Object.keys(ENDINGS)){
    const story=celebrationStory(key,settings);assert.doesNotMatch(story,/<(?:img|script)/);
    assert.doesNotMatch(sceneMarkup(key,settings),/onerror=/);
  }
  assert.equal(celebrationStory('__proto__'),celebrationStory('hug'));
  assert.match(sceneMarkup('constructor'),/data-celebration="hug"/);
});

for(const ending of Object.keys(ENDINGS)){
  test(`${ending} reacts to input, bounds nodes and timers, and cleans listeners`,()=>{
    const f=fixture(),cleanup=mountCelebration(f.container,ending);
    f.click();const first=f.feedback.textContent;assert.ok(first);assert.equal(f.stage.dataset.palette,'0');
    f.click();assert.notEqual(first,f.feedback.textContent);
    for(let i=0;i<100;i++)f.click();
    assert.ok((f.effects.innerHTML.match(/class="ce-particle /g)||[]).length<=12);
    assert.equal(f.timers.size,1);
    cleanup();cleanup();assert.equal(f.timers.size,0);assert.equal(f.effects.innerHTML,'');
    assert.equal(f.listeners.size,0);assert.equal(f.docListeners.size,0);assert.equal(f.motionListeners.size,0);
  });
  test(`${ending} remains interactive without motion and never gates stamp completion`,()=>{
    const f=fixture(true),cleanup=mountCelebration(f.container,ending);f.click();
    assert.ok(f.feedback.textContent);assert.equal(f.stage.dataset.palette,'0');assert.equal(f.timers.size,0);assert.equal(f.effects.innerHTML,'');cleanup();
    const state=emptyState();const wish=addWish(state,{title:'一个小愿望',category:'self',kind:'once'});
    const {celebration}=checkIn(state,wish.id);celebration.ending=ending;
    const restored=parseBackup(JSON.stringify(exportData(state)));assert.equal(restored.pending[0].ending,ending);
    const stamp=finishCelebration(restored,celebration.id,ending);
    assert.equal(finishCelebration(restored,celebration.id,ending),stamp);assert.equal(restored.stamps.length,1);assert.equal(restored.pending.length,0);
    assert.equal(parseBackup(JSON.stringify(exportData(restored))).stamps[0].ending,ending);
  });
}

test('hidden document immediately clears effects and refuses hidden activations',()=>{
  const f=fixture(),cleanup=mountCelebration(f.container,'meteor');f.click();assert.equal(f.timers.size,1);
  f.doc.hidden=true;f.docListeners.get('visibilitychange')();assert.equal(f.timers.size,0);assert.equal(f.effects.innerHTML,'');
  const text=f.feedback.textContent;f.click();assert.equal(f.feedback.textContent,text);
  f.doc.hidden=false;f.docListeners.get('visibilitychange')();f.click();assert.notEqual(f.feedback.textContent,text);cleanup();
});

test('enabling reduced motion during an effect removes all in-flight effects',()=>{
  const f=fixture(),cleanup=mountCelebration(f.container,'aurora');f.click();
  f.motion.matches=true;f.motionListeners.get('change')();assert.equal(f.timers.size,0);assert.equal(f.effects.innerHTML,'');
  f.click();assert.equal(f.stage.dataset.palette,'1');assert.equal(f.effects.innerHTML,'');cleanup();
});

test('noninteractive clicks and missing scenes are harmless',()=>{
  const f=fixture(),cleanup=mountCelebration(f.container,'hug');
  f.listeners.get('click')({target:{closest:()=>null}});assert.equal(f.feedback.textContent,'');assert.equal(f.timers.size,0);cleanup();
  assert.doesNotThrow(mountCelebration({querySelector:()=>null},'hug'));
});

test('player has no storage side effects and stylesheet disables animation for reduced motion',()=>{
  const js=readFileSync(new URL('../star-garden/celebration.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(js,/localStorage|sessionStorage|finishCelebration|setInterval|requestAnimationFrame/);
  const css=readFileSync(new URL('../star-garden/celebration.css',import.meta.url),'utf8');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/animation:none!important/);
  assert.match(css,/\.ce-paused \*\{animation-play-state:paused!important/);
});
