/* One complete, immutable app shell per release. Never touches user data. */
const VERSION='0.4.1';
const BASE=new URL('./',self.location.href).href;
const PREFIX=`starwish-garden:${BASE}:`;
// BEGIN GENERATED RELEASE
const RELEASE_ID='4e2b9282bc1eee8b';
const ASSET_ENTRIES=[["./","sha256-DxJ7IQ7X47FY6SPlkyyzgt4N/ojfvdq1NcdCeKAZza0="],["./index.html","sha256-DxJ7IQ7X47FY6SPlkyyzgt4N/ojfvdq1NcdCeKAZza0="],["./style.css","sha256-rY6tCQwOoc5AlxaUlWcpqhu69e/iljTf3lmVZmdCmy4="],["./app.mjs","sha256-53OOoF/+KE9Pl4kcDm7+LO3uTpW75u6cG3sxqLWo8lY="],["./update.mjs","sha256-BcA2X+C9x7hqbrj2n1NzJWTT3sXl0l5YSlA7qneMMe8="],["./model.mjs","sha256-FIhidBqphirRUzKUGxDbXNsS+aKyicgB9A20YePpJoA="],["./art.mjs","sha256-kA5/g3SrIzgr/FN8nsaEUgjLuFN8oIeja0gEXBbfsGI="],["./companion-photo.mjs","sha256-fwvlj+lzHYgZEC8UUyoU334Dby+flsNSbyxXkTi+J/w="],["./photo-decode-worker.mjs","sha256-CnZVhAkyoSvy8IHTa+FWHKKIxaOPWZeeUbfky2qwdKc="],["./celebration.mjs","sha256-YpDnSFig0qhWVtLRxdSCcH9fr1nuf9SLY5ni8hl5ozE="],["./celebration.css","sha256-dDVA8weqntms+BKgV0x3aFf+uTw4eYbiAWnciOb0iJA="],["./manifest.webmanifest","sha256-d9l9xwUbCgZFdV8CLIr/p2crwqcEZkEiSWXCq5POLzs="],["./assets/icon.svg","sha256-GNeZ0FYD6sL86ZHxsCVQHX6Q1d/oxs4ouAMs8H6EkUk="],["./assets/icon-192.png","sha256-7uO+CSVAnYpLdJ0B5FLX2hyPFO4DrAf2Ud/Ti3lfQ1Y="],["./assets/icon-512.png","sha256-AXxi0gStWqN/UM/sbZy/fA+mydHPE/pjQAxr2pBk5Us="],["./assets/apple-touch-icon.png","sha256-qGOiacSS4Y1ajBGX14fylUVOBQm0yfMW7ycq4akx9RE="]];
// END GENERATED RELEASE
const CACHE=PREFIX+'v'+VERSION+'-'+RELEASE_ID;
const INTEGRITY=new Map(ASSET_ENTRIES.map(([path,integrity])=>[new URL(path,BASE).href,integrity]));
const ASSETS=[...INTEGRITY.keys()];
self.addEventListener('install',event=>event.waitUntil(
  // Bypass HTTP caches as well as the old worker. addAll fails atomically if any asset fails.
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload',integrity:INTEGRITY.get(url)}))))
));
// A new release waits until the user chooses it, or all old windows have closed.
self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting());
  if(event.data?.type==='GET_VERSION')event.ports[0]?.postMessage({version:VERSION});
});
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(BASE))return;
  const navigation=request.mode==='navigate';
  const entry=new URL(url);entry.search='';entry.hash='';
  if(navigation&&![BASE,new URL('./index.html',BASE).href].includes(entry.href))return;
  if(!navigation&&!ASSETS.includes(url.href))return;
  const key=navigation?BASE:url.href;
  event.respondWith((async()=>{
    // A page and its modules/styles come from the same complete release, online or offline.
    const cached=await (await caches.open(CACHE)).match(key);
    if(cached)return cached;
    try{return await fetch(new Request(request,{cache:'no-store',integrity:INTEGRITY.get(key)}));}catch{return Response.error();}
  })());
});
