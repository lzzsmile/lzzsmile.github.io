// Release metadata must change together with sw.js. Data/backup versions stay at v1.
export const APP_VERSION='0.4.1';
// No storage writes, cache deletion, unregistering, or unsolicited page reloads here.
export function createUpdater({navigator:nav=globalThis.navigator,window:win=globalThis.window,document:doc=globalThis.document,onChange=()=>{},reload=()=>win.location.reload(),canReload=()=>true,timeout=15000}={}){
  const status={supported:Boolean(nav.serviceWorker),checking:false,available:false,applying:false,offlineReady:false,checked:false,error:''};
  let registration,starting,inFlight,lastCheck=0,changedController=false,applyTimer;
  let previousController=nav.serviceWorker?.controller;
  const bounded=promise=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),timeout);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
  const watched=new WeakSet();
  const emit=()=>onChange({...status});
  const fail=message=>{status.error=message;emit();};
  function inspect(){
    status.offlineReady=Boolean(registration?.active);
    status.available=Boolean(registration?.waiting)||changedController;
    emit();
  }
  function identifyController(){
    const worker=nav.serviceWorker.controller;
    if(!worker)return;
    const channel=new MessageChannel();
    const timer=setTimeout(()=>channel.port1.close(),2000);
    channel.port1.onmessage=event=>{
      clearTimeout(timer);channel.port1.close();
      if(event.data?.version&&event.data.version!==APP_VERSION){changedController=true;inspect();}
    };
    worker.postMessage({type:'GET_VERSION'},[channel.port2]);
  }
  function watch(worker){
    if(!worker||watched.has(worker))return;
    watched.add(worker);
    let installed=['installed','activating','activated'].includes(worker.state);
    worker.addEventListener('statechange',()=>{
      if(['installed','activating','activated'].includes(worker.state))installed=true;
      if(worker.state==='installed'||worker.state==='activated'){status.error='';inspect();identifyController();}
      if(worker.state==='redundant'&&!installed)fail('新版资源未下载完整，仍可继续使用当前版本。请联网后重试，不要删除 App。');
    });
  }
  function waitForInstall(worker){
    if(worker?.state==='redundant')return Promise.reject(Error('install failed'));
    if(!worker||['installed','activated'].includes(worker.state))return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const finish=()=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);};
      const changed=()=>{if(['installed','activated','redundant'].includes(worker.state)){finish();worker.state==='redundant'?reject(Error('install failed')):resolve();}};
      const timer=setTimeout(()=>{finish();reject(Error('install timeout'));},timeout);
      worker.addEventListener('statechange',changed);changed();
    });
  }
  async function start(){
    if(!status.supported){emit();return;}
    if(starting)return starting;
    starting=Promise.resolve().then(async()=>{
      try{
        registration=await nav.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
        registration.addEventListener('updatefound',()=>watch(registration.installing));
        watch(registration.installing);inspect();identifyController();
      }catch{fail('暂时无法准备离线资源或检查版本。请联网后重试，记录不会因此被删除。');starting=null;}
    });
    return starting;
  }
  function check({quiet=false}={}){
    if(inFlight)return inFlight;
    if(quiet&&Date.now()-lastCheck<60000)return Promise.resolve();
    lastCheck=Date.now();
    inFlight=Promise.resolve().then(async()=>{
      status.checking=true;status.checked=false;status.error='';emit();
      try{
        if(!status.supported)throw Error('unsupported');
        if(nav.onLine===false){registration??=await bounded(nav.serviceWorker.getRegistration?.('./'));throw Error('offline');}
        await bounded(start());if(!registration)throw Error('registration');
        await bounded(registration.update());
        await waitForInstall(registration.installing);
        if(status.error)throw Error('install failed');
        status.checked=true;inspect();identifyController();
      }catch{
        status.error=nav.onLine===false?'当前离线，暂时无法检查更新。已下载的版本仍可使用。':'暂时未能完成更新检查。请联网后重试，不要删除 App。';
      }finally{status.checking=false;inspect();inFlight=null;}
    });
    return inFlight;
  }
  function apply(){
    if(status.applying)return;
    if(!status.available){void check();return;}
    status.applying=true;status.error='';emit();
    if(registration?.waiting){
      applyTimer=setTimeout(()=>{status.applying=false;fail('更新尚未完成，请稍后重试。不要删除 App，当前记录保持不变。');},timeout);
      registration.waiting.postMessage({type:'SKIP_WAITING'});
    }else if(changedController)reload();
    else {status.applying=false;inspect();}
  }
  if(status.supported){
    nav.serviceWorker.addEventListener('controllerchange',()=>{
      // The first install has nothing to replace. Other tabs may still contain drafts.
      if(previousController&&previousController!==nav.serviceWorker.controller)changedController=true;
      previousController=nav.serviceWorker.controller;
      if(status.applying){clearTimeout(applyTimer);status.applying=false;status.error='';if(canReload()){reload();return;}changedController=true;}
      identifyController();inspect();
    });
    doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)void check({quiet:true});});
    win.addEventListener('pageshow',()=>void check({quiet:true}));
    win.addEventListener('online',()=>void check());
  }
  return {status,start,check,apply};
}
