/** Updates the app shell only. Never reads, clears or writes event storage. */
export function initializeUpdates({win=window,doc=document,nav=navigator,fetcher=fetch}={}){
  const version=doc.querySelector('meta[name="app-version"]')?.content||'unknown';
  const byId=id=>doc.getElementById(id);
  let registration=null,latest=null,lastCheck=0,checking=null;
  const setStatus=text=>{byId('update-status').textContent=text;};
  byId('app-version').textContent=`版本 ${version}`;
  function isNewer(next,base=version){if(typeof next!=='string'||!/^\d+\.\d+\.\d+$/.test(next))return false;const a=next.split('.').map(Number),b=base.split('.').map(Number);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
  function offer(next){if(!isNewer(next)||latest&&!isNewer(next,latest))return;latest=next;byId('update-message').textContent=`新版 ${next} 已可用`;byId('update-banner').hidden=false;byId('apply-update').hidden=false;byId('apply-update').textContent=`更新到 ${next}`;setStatus('更新只替换程序，已保存的日子和提醒会保留。');}
  function askWorker(){nav.serviceWorker?.controller?.postMessage({type:'GET_VERSION'});}
  function apply(){if(!latest)return false;const editing=['event-dialog','export-dialog','backup-dialog','confirm-dialog','migration-dialog'].some(id=>byId(id)?.open);if(editing){setStatus('请先保存或关闭正在编辑的内容，再更新。');return false;}const settings=byId('settings-dialog');if(settings?.open)settings.close();const url=new URL(win.location.href);url.searchParams.set('__update',`${latest}-${Date.now()}`);win.location.assign(url.href);return true;}
  async function check(force=false){if(checking)return checking;if(!force&&(doc.hidden||Date.now()-lastCheck<60000))return;lastCheck=Date.now();if(nav.onLine===false){if(force)setStatus('当前离线，联网后可检查更新。');return;}if(force){byId('check-updates').disabled=true;setStatus('正在检查更新…');}
    checking=(async()=>{try{if(registration)registration.update().catch(()=>{});const url=new URL('./release.json',win.location.href);url.searchParams.set('check',String(Date.now()));const controller=new AbortController();const timeout=win.setTimeout(()=>controller.abort(),8000);let response;try{response=await fetcher(url.href,{cache:'no-store',credentials:'same-origin',signal:controller.signal});}finally{win.clearTimeout(timeout);}if(!response.ok||response.redirected||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Update metadata unavailable');const release=await response.json();if(typeof release.version!=='string'||!/^\d+\.\d+\.\d+$/.test(release.version))throw new Error('Invalid version');if(isNewer(release.version)){offer(release.version);}else if(force){setStatus(`当前已是最新版 ${version}。`);}askWorker();}catch{if(force)setStatus('暂时无法检查更新，请确认网络和网站部署状态后重试。');}finally{byId('check-updates').disabled=false;checking=null;}})();return checking;
  }
  byId('check-updates').addEventListener('click',()=>check(true));byId('reload-update').addEventListener('click',apply);byId('apply-update').addEventListener('click',apply);
  win.addEventListener('online',()=>check());win.addEventListener('pageshow',()=>check());win.addEventListener('focus',()=>check());doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)check();});
  const interval=win.setInterval(()=>check(),300000);
  let ready=Promise.resolve(null);
  if('serviceWorker' in nav){nav.serviceWorker.addEventListener('controllerchange',()=>{askWorker();check();});nav.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='APP_VERSION')offer(e.data.version);});ready=nav.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{registration=reg;const watch=worker=>{worker?.addEventListener('statechange',()=>{if(worker.state==='activated'){askWorker();check();}});};watch(reg.installing);reg.addEventListener('updatefound',()=>watch(reg.installing));askWorker();return reg;}).catch(()=>{setStatus('离线缓存暂不可用，联网使用和已保存的数据不受影响。');return null;});}
  // The deployed root sw.js retires itself. Keep this exact-path check narrow.
  if(new URL(win.location.href).pathname.startsWith('/days-matter/')&&nav.serviceWorker?.getRegistrations){
    nav.serviceWorker.getRegistrations().then(regs=>Promise.all(regs.filter(reg=>new URL(reg.scope).pathname==='/'&&[reg.active,reg.waiting,reg.installing].some(worker=>worker&&new URL(worker.scriptURL).pathname==='/sw.js')).map(reg=>reg.update().catch(()=>{})))).catch(()=>{});
  }
  // A cache-busting entry URL remains the same origin and uses the same local data.
  try{const clean=new URL(win.location.href);if(clean.searchParams.has('__update')){clean.searchParams.delete('__update');win.history.replaceState(null,'',clean.href);}}catch{}
  ready.then(()=>check());
  return {check,apply,ready,destroy(){win.clearInterval(interval);}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')initializeUpdates();
