import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {HOME_ENCOURAGEMENTS,HOME_RETURN_DELAY,pickHomeEncouragement,createHomeCompanionSession,gardenTitle} from '../star-garden/home-companion.mjs';
const home={view:'today',configured:true,now:0};
test('twelve distinct, immutable greetings only contain display text',()=>{assert.equal(HOME_ENCOURAGEMENTS.length,12);assert.equal(new Set(HOME_ENCOURAGEMENTS.map(x=>x.id)).size,12);for(const x of HOME_ENCOURAGEMENTS){assert.ok(x.text.length>=12&&x.text.length<30);assert.equal(Object.hasOwn(x,'reply'),false);assert.ok(Object.isFrozen(x));}assert.ok(Object.isFrozen(HOME_ENCOURAGEMENTS));});
test('random choice reaches every greeting and avoids the immediately previous one',()=>{for(let i=0;i<12;i++)assert.equal(pickHomeEncouragement(null,()=>i/12).id,HOME_ENCOURAGEMENTS[i].id);for(const last of HOME_ENCOURAGEMENTS)for(const r of [0,.5,.999999,1,-1,NaN])assert.notEqual(pickHomeEncouragement(last.id,()=>r).id,last.id);});
test('one choice per initial home visit, repeated renders never randomize',()=>{let calls=0;const s=createHomeCompanionSession({random:()=>{calls++;return 0;}});assert.equal(s.sync(home),true);const first=s.current;for(let i=0;i<20;i++)assert.equal(s.sync({...home,now:i}),false);assert.equal(s.current,first);assert.equal(calls,1);s.sync(home);assert.equal(Object.hasOwn(s.current,'received'),false);assert.equal(calls,1);});
test('returning from another tab or browser Back means a new home visit',()=>{const s=createHomeCompanionSession({random:()=>0});s.sync(home);const first=s.current;s.sync({...home,view:'journey'});assert.equal(s.sync(home),true);assert.notEqual(s.current.id,first.id);assert.equal(s.current.visit,2);assert.equal(Object.hasOwn(s.current,'received'),false);});
test('dialog open, close and its history Back do not count as entering home',()=>{const s=createHomeCompanionSession();s.sync(home);const first=s.current;s.sync({...home,modalOpen:true});s.sync(home);assert.equal(s.current,first);});
test('quick background return keeps greeting; >=30 seconds refreshes once for duplicate foreground events',()=>{const s=createHomeCompanionSession();s.sync(home);const first=s.current;s.sync({...home,visible:false,now:100});s.sync({...home,now:HOME_RETURN_DELAY});assert.equal(s.current,first);s.sync({...home,visible:false,now:40_000});assert.equal(s.sync({...home,now:70_000}),true);const second=s.current;assert.notEqual(second.id,first.id);assert.equal(s.sync({...home,now:70_001}),false);assert.equal(s.current,second);});
test('long background refresh waits for an open editor or full check-in scene to close',()=>{const s=createHomeCompanionSession();s.sync(home);const first=s.current;s.sync({...home,visible:false,modalOpen:true});s.sync({...home,modalOpen:true,now:31_000});assert.equal(s.current.id,first.id);assert.equal(Object.hasOwn(s.current,'received'),false);assert.equal(s.sync({...home,now:32_000}),true);assert.equal(Object.hasOwn(s.current,'received'),false);});
test('unconfigured and background/off-home pages draw nothing; settings changes do not reroll',()=>{let calls=0;const s=createHomeCompanionSession({random:()=>{calls++;return 0;}});s.sync({...home,configured:false});assert.equal(s.current,null);s.sync({...home,view:'settings'});assert.equal(calls,0);s.sync({...home,visible:false});assert.equal(calls,0);s.sync(home);assert.equal(calls,1);s.sync(home);assert.equal(calls,1);s.sync({...home,configured:false});assert.equal(s.current,null);s.sync(home);assert.equal(calls,2);});
test('pending long resume off home draws once on entering; duplicate hidden signals keep original timestamp',()=>{const s=createHomeCompanionSession();s.sync(home);s.sync({...home,view:'settings',visible:false,now:100});s.sync({...home,view:'settings',visible:false,now:10_000});s.sync({...home,view:'settings',now:31_000});assert.equal(s.current.visit,1);s.sync({...home,now:31_001});assert.equal(s.current.visit,2);});

test('garden title uses your name, never the companion name, and defaults when empty',()=>{
 assert.equal(gardenTitle({recipient:'小林',companion:'小晴'}),'小林的星愿花园');
 for(const recipient of ['', '   ', '\t\n'])assert.equal(gardenTitle({recipient,companion:'小晴'}),'星愿花园');
 assert.equal(gardenTitle({recipient:'  小林  '}),'小林的星愿花园');
});
test('garden title preserves special characters and does not mutate saved settings',()=>{
 const settings=Object.freeze({recipient:'  <林>&"\'  ',companion:'小晴'});
 assert.equal(gardenTitle(settings),'<林>&"\'的星愿花园');
 assert.equal(settings.recipient,'  <林>&"\'  ');
});
test('active home card has no receipt action, response state or interaction styles',async()=>{
 const app=await readFile(new URL('../star-garden/growth-app.mjs',import.meta.url),'utf8');
 const css=await readFile(new URL('../star-garden/growth.css',import.meta.url),'utf8');
 for(const token of ['receive-encouragement','home-feedback','home-receive','has-received','is-receiving']){assert.equal(app.includes(token),false,token);assert.equal(css.includes(token),false,token);}
 assert.equal(typeof createHomeCompanionSession().receive,'undefined');
 assert.ok(app.includes('${esc(title)}，返回今天'));
 assert.ok(app.includes('class="brand-title">${esc(title)}'));
});
