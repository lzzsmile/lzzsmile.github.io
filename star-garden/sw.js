/* Isolated by directory, cache namespace and request allowlist. Never removes another app's cache. */
const BASE=new URL('./',self.location.href).href;
const PREFIX=`starwish-garden:${BASE}:`;
const CACHE=PREFIX+'v0.2.0';
const ASSETS=['./','./index.html','./style.css','./app.mjs','./model.mjs','./art.mjs','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/apple-touch-icon.png'].map(p=>new URL(p,BASE).href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(BASE)||new URL(e.request.url).origin!==self.location.origin)return;
  const isNavigation=e.request.mode==='navigate';
  const asset=ASSETS.includes(e.request.url);
  // A navigation Request can include the tab fragment, including on offline reload.
  const entryURL=new URL(e.request.url);entryURL.search='';entryURL.hash='';
  if(isNavigation&&![BASE,new URL('./index.html',BASE).href].includes(entryURL.href))return;
  if(!isNavigation&&!asset)return;
  const key=isNavigation?new URL('./',BASE).href:e.request.url;
  /* Network first makes a normal reload pick up a new release without trapping installs on old CSS/JS. */
  e.respondWith(fetch(e.request).then(response=>{
    if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(cache=>cache.put(key,copy)));}
    return response;
  }).catch(async()=>await caches.match(key)||Response.error()));
});
