import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {APP_VERSION,createUpdater} from '../star-garden/update.mjs';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
class Events{listeners={};addEventListener(n,f){(this.listeners[n]??=new Set()).add(f);}removeEventListener(n,f){this.listeners[n]?.delete(f);}emit(n){for(const f of this.listeners[n]||[])f();}}
function fixture({online=true,timeout=30,canReload=()=>true}={}){
  const sw=new Events(),win=new Events(),doc=new Events();let registered=0,checks=0,reloads=0,skip=0;
  const worker=new Events();worker.state='activated';worker.postMessage=(data,ports)=>{if(data.type==='GET_VERSION'){ports[0].postMessage({version:APP_VERSION});ports[0].close();}else skip++;};
  const registration=Object.assign(new Events(),{active:worker,waiting:null,installing:null,update:async()=>{checks++;}});
  sw.controller=worker;sw.register=async(url,options)=>{registered++;assert.equal(url,'./sw.js');assert.equal(options.scope,'./');assert.equal(options.updateViaCache,'none');return registration;};
  const nav={serviceWorker:sw,onLine:online};const states=[];
  const updater=createUpdater({navigator:nav,window:win,document:doc,timeout,canReload,onChange:s=>states.push(s),reload:()=>reloads++});
  return {updater,sw,win,doc,worker,registration,nav,states,counts:()=>({registered,checks,reloads,skip})};
}
test('offline first launch can recover online and manually recheck',async()=>{const f=fixture({online:false});await f.updater.check();assert.match(f.updater.status.error,/离线/);assert.equal(f.updater.status.checked,false);f.nav.onLine=true;await f.updater.check();assert.equal(f.counts().registered,1);assert.equal(f.counts().checks,1);assert.equal(f.updater.status.error,'');await f.updater.check();assert.equal(f.counts().checks,2);});
test('manual recheck retries registration failure and coalesces overlapping calls',async()=>{const f=fixture();const original=f.sw.register;f.sw.register=async()=>{throw Error('fail');};await f.updater.check();assert.ok(f.updater.status.error);f.sw.register=original;const first=f.updater.check();assert.equal(f.updater.check(),first);await first;assert.equal(f.counts().registered,1);assert.equal(f.updater.status.checking,false);});
test('stalled network check times out and can be retried',async()=>{const f=fixture({timeout:15});await f.updater.start();f.registration.update=()=>new Promise(()=>{});await f.updater.check();assert.ok(f.updater.status.error);assert.equal(f.updater.status.checking,false);f.registration.update=async()=>{};await f.updater.check();assert.equal(f.updater.status.error,'');});
test('waiting update is offered without reloading or automatically activating',async()=>{const f=fixture();f.registration.waiting=f.worker;await f.updater.check();assert.equal(f.updater.status.available,true);assert.equal(f.counts().reloads,0);assert.equal(f.counts().skip,0);f.updater.apply();f.updater.apply();assert.equal(f.counts().skip,1);f.sw.emit('controllerchange');assert.equal(f.counts().reloads,1);});
test('another window activation only offers refresh and preserves this page',async()=>{const f=fixture();await f.updater.check();f.sw.controller={...f.worker,postMessage:f.worker.postMessage};f.sw.emit('controllerchange');assert.equal(f.updater.status.available,true);assert.equal(f.counts().reloads,0);f.updater.apply();assert.equal(f.counts().reloads,1);});
test('first install of the current version does not trigger a refresh prompt',async()=>{const f=fixture();f.sw.controller=null;const updater=createUpdater({navigator:f.nav,window:f.win,document:f.doc,onChange:()=>{}});await updater.start();f.sw.controller=f.worker;f.sw.emit('controllerchange');await turn();assert.equal(updater.status.available,false);});
test('failed installing worker never produces a false successful check',async()=>{const f=fixture();await f.updater.start();const worker=new Events();worker.state='installing';f.registration.installing=worker;f.registration.emit('updatefound');const check=f.updater.check();await turn();worker.state='redundant';worker.emit('statechange');await check;assert.ok(f.updater.status.error);assert.equal(f.updater.status.checked,false);assert.equal(f.updater.status.available,false);});
test('pageshow foreground and online trigger checks without forcing reload',async()=>{const f=fixture();await f.updater.check();f.doc.hidden=false;f.doc.emit('visibilitychange');f.win.emit('pageshow');await turn();assert.equal(f.counts().checks,1);f.win.emit('online');await turn();assert.equal(f.counts().checks,2);assert.equal(f.counts().reloads,0);});
const root=new URL('../star-garden/',import.meta.url);
test('release hashes cover every current shell resource and versions match',async()=>{
 const source=await readFile(new URL('sw.js',root),'utf8');const version=/const VERSION='([^']+)'/.exec(source)[1];assert.equal(version,APP_VERSION);
 const entries=JSON.parse(/const ASSET_ENTRIES=(\[.*\]);/.exec(source)[1]);assert.equal(entries.length,16);
 for(const [path,hash]of entries){const bytes=await readFile(new URL(path==='./'?'./index.html':path,root));assert.equal(hash,'sha256-'+createHash('sha256').update(bytes).digest('base64'),path);}
 assert.match(source,/cache:'reload',integrity:/);assert.doesNotMatch(source,/localStorage|indexedDB|unregister/);
 const client=await readFile(new URL('update.mjs',root),'utf8');assert.doesNotMatch(client,/localStorage|sessionStorage|caches\.delete|unregister\(/);
});
test('worker only cleans its own cache after successful install and activates by message',async()=>{
 const handlers={},deleted=[],added=[];let activated=0;const base='https://example.test/star-garden/';
 const source=await readFile(new URL('sw.js',root),'utf8');
 const self={location:{href:base+'sw.js',origin:'https://example.test'},addEventListener:(n,f)=>handlers[n]=f,skipWaiting:async()=>activated++,clients:{claim:async()=>{}}};
 vm.runInNewContext(source,{self,URL,Response,Request,Map,fetch,caches:{open:async()=>({addAll:async r=>added.push(...r)}),keys:async()=>['other-app','starwish-garden:https://other.test/star-garden/:v1',`starwish-garden:${base}:v0.4.0`],delete:async k=>deleted.push(k)}});
 let work;handlers.install({waitUntil:p=>work=p});await work;assert.equal(activated,0);assert.equal(added.length,16);assert(added.every(r=>r.cache==='reload'&&r.integrity.startsWith('sha256-')));
 handlers.message({data:{type:'SKIP_WAITING'},waitUntil:p=>work=p});await work;assert.equal(activated,1);
 handlers.activate({waitUntil:p=>work=p});await work;assert.deepEqual(deleted,[`starwish-garden:${base}:v0.4.0`]);
});

test('activation after leaving update dialog preserves a newly opened editor',async()=>{const f=fixture({canReload:()=>false});f.registration.waiting=f.worker;await f.updater.check();f.updater.apply();f.sw.emit('controllerchange');assert.equal(f.counts().reloads,0);assert.equal(f.updater.status.applying,false);assert.equal(f.updater.status.available,true);});
test('normal replacement of a previously activated worker is not an install failure',async()=>{const f=fixture();const worker=new Events();worker.state='installing';f.registration.installing=worker;await f.updater.start();worker.state='activated';worker.emit('statechange');worker.state='redundant';worker.emit('statechange');assert.equal(f.updater.status.error,'');});

test('a superseded complete waiting worker does not masquerade as failed download',async()=>{const f=fixture();const worker=new Events();worker.state='installed';f.registration.installing=worker;await f.updater.start();worker.state='redundant';worker.emit('statechange');assert.equal(f.updater.status.error,'');});
test('offline check can still recognize already installed offline resources',async()=>{const f=fixture({online:false});f.sw.getRegistration=async()=>f.registration;await f.updater.check();assert.equal(f.updater.status.offlineReady,true);assert.equal(f.counts().registered,0);assert.equal(f.updater.status.checked,false);});
