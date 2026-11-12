import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('root is a nonredirect placeholder without app scripts or manifest',()=>{
 const html=read('index.html');
 assert.ok(html.includes('href="./days-matter/"'));
 assert.doesNotMatch(html,/http-equiv=["']refresh|location\.(?:assign|replace)|location\.href\s*=|rel=["']manifest|src=["'].\/app\.js/);
 assert.ok(html.includes('不会自动跳转'));
});
test('legacy root worker unregisters only itself and never claims, navigates or deletes caches',async()=>{
 const handlers={};let skips=0,unregisters=0;
 const self={addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>skips++,registration:{unregister:async()=>unregisters++}};
 vm.runInNewContext(read('sw.js'),{self});
 for(const name of ['install','activate']){let work;handlers[name]({waitUntil:p=>work=p});await work;}
 assert.equal(skips,1);assert.equal(unregisters,1);assert.equal(handlers.fetch,undefined);
});
test('Days Matter and Star Garden install scopes and storage namespaces stay distinct',()=>{
 const base='https://lzzsmile.github.io/';
 for(const folder of ['days-matter/','star-garden/']){
  const url=new URL(folder,base),manifest=JSON.parse(read(folder+'manifest.webmanifest'));
  for(const field of ['id','scope','start_url'])assert.equal(new URL(manifest[field],url).pathname,'/'+folder);
  for(const icon of manifest.icons)assert.ok(new URL(icon.src,url).pathname.startsWith('/'+folder));
 }
 assert.match(read('days-matter/app.js'),/niannian\.days\.v1:/);
 assert.match(read('star-garden/model.mjs'),/starwish-garden:data:v1/);
});
