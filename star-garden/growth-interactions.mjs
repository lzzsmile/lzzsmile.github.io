import {companion} from './art.mjs';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const INTERACTION_SCENES=Object.freeze({
  sunrise:{title:'把清晨拉近一点',intro:'一起把太阳升起来，让这一步沐浴在晨光里。',action:'一起迎接晨光',hint:'向右拖动太阳滑块。也可以用方向键慢慢升起太阳。',ending:'看，光已经落在你走过的路上。'},
  highfive:{title:'给努力的你击个掌',intro:'有一只手，正为你今天的小小胜利举起。',action:'伸出我的手',hint:'轻点画面中的手掌，或者按 Tab 选中手掌后按回车。',ending:'这一掌，是为认真向前的你。做得真好！'},
  plant:{title:'让这一小步开花',intro:'刚刚完成的事，变成了一颗小小的种子。',action:'一起照顾它',hint:'给种子浇三次水，看看它会开出什么。',ending:'你付出的每一滴认真，都有自己的花期。'},
  wind:{title:'把好心情交给风',intro:'折一架纸飞机，让今天的勇气飞得更远。',action:'去草地放飞机',hint:'在天空向右滑动，或把下方风力滑块推到最右边。',ending:'起飞啦！下一段路，也会有轻快的风。'},
  postcard:{title:'一封专属的晴天来信',intro:'陪伴你的人，把想说的话折进了一张小卡片。',action:'去收这封信',hint:'轻点信封，展开写给你的话。',ending:'这份心意，和今天迈出的这一步，都值得珍藏。'},
  rhythm:{title:'跳一段轻快的小舞',intro:'不用赶上谁的节奏，我们按自己的步子跳。',action:'一起跳起来',hint:'依次轻点亮起的脚步，没有倒计时，也不会失败。',ending:'一、二、三！原来向前走，也可以这样轻盈。'}
});
export const INTERACTION_IDS=Object.freeze(Object.keys(INTERACTION_SCENES));
const validKind=kind=>Object.hasOwn(INTERACTION_SCENES,kind)?kind:'sunrise';
const landscape='<div class="gi-cloud gi-cloud-one"></div><div class="gi-cloud gi-cloud-two"></div><div class="gi-hill gi-hill-back"></div><div class="gi-hill gi-hill-front"></div>';
function activity(kind,settings){
  if(kind==='sunrise')return '<div class="gi-sun" aria-hidden="true"></div><div class="gi-control-deck"><label>把太阳带到山顶<input data-gi-range type="range" min="0" max="100" value="0" aria-label="太阳升起的高度" aria-valuetext="太阳刚刚露头"></label><span data-gi-meter>晨光 0%</span></div>';
  if(kind==='highfive')return '<button type="button" class="gi-palm" data-gi-action="palm" aria-label="和陪伴者击掌"><span aria-hidden="true">✋</span><small>在这里击掌</small></button><div class="gi-highfive-rays" aria-hidden="true">✦ · ✧ · ✦</div>';
  if(kind==='plant')return '<div class="gi-plant-art" aria-hidden="true"><div class="gi-bloom">✿</div><div class="gi-stem"></div><div class="gi-leaf gi-leaf-left"></div><div class="gi-leaf gi-leaf-right"></div><div class="gi-pot"></div><div class="gi-drops">• • •</div></div><div class="gi-control-deck gi-watering"><button type="button" data-gi-action="water" class="gi-water"><span aria-hidden="true">♧</span> 浇一点水</button><span data-gi-meter>0 / 3 滴认真</span></div>';
  if(kind==='wind')return '<div class="gi-flight-area" data-gi-swipe aria-label="纸飞机飞行的天空"><svg class="gi-plane" viewBox="0 0 120 90" aria-hidden="true"><path d="M5 40 113 6 78 82 56 54Z" fill="#fffdf1" stroke="#648a8f" stroke-width="2"/><path d="m5 40 51 14L113 6 41 47m15 7 1 21 21 7" fill="none" stroke="#648a8f" stroke-width="2"/></svg><span class="gi-wind-trail" aria-hidden="true">﹏ ﹏ ﹏</span></div><div class="gi-control-deck"><label>送来一阵轻风<input data-gi-range type="range" min="0" max="100" value="0" aria-label="送纸飞机起飞的风力" aria-valuetext="等待一阵风"></label><span data-gi-meter>风力 0%</span></div>';
  if(kind==='postcard')return `<div class="gi-letter-wrap"><button type="button" class="gi-envelope" data-gi-action="letter" aria-label="展开专属来信"><span class="gi-envelope-fold" aria-hidden="true"></span><span class="gi-stamp" aria-hidden="true">✿</span><span class="gi-address">给 ${escape(settings.recipient||'认真向前的你')}</span><small>轻点拆开</small></button><article class="gi-letter" hidden tabindex="-1" aria-label="专属来信"><span class="gi-letter-date">一封晴天来信</span><p>${escape(settings.recipient||'亲爱的你')}：</p><p class="gi-dedication">${escape(settings.dedication||'不用一口气走很远。每一次认真做完的小事，都是你留给自己的光。')}</p><p class="gi-signature">一直陪着你的 ${escape(settings.companion||'陪伴者')}</p><button type="button" data-gi-action="keep" class="gi-start">把这份心意收好</button></article></div>`;
  return '<div class="gi-dance-floor" role="group" aria-label="按自己的节奏走三个舞步">'+['向左一步','向右一步','轻轻转圈'].map((name,i)=>`<button type="button" data-gi-action="beat" data-beat="${i}" class="gi-footstep gi-footstep-${i}" ${i?'disabled':''} aria-label="第${i+1}步：${name}"><span aria-hidden="true">${['↖','↗','↻'][i]}</span><small>${name}</small></button>`).join('')+'</div><span class="gi-rhythm-count" data-gi-meter>跟着自己的节奏 · 0 / 3</span>';
}
export function sceneMarkup(kind,settings={},entry={}){
  kind=validKind(kind);const scene=INTERACTION_SCENES[kind];
  return `<section class="gi-scene gi-${kind}" data-gi-scene="${kind}" data-phase="intro" data-step="0" aria-label="${scene.title}"><header class="gi-heading"><span class="gi-eyebrow">这一小步，值得庆祝</span><h2>${scene.title}</h2><p class="gi-task-name">${escape(entry.title||'你又向前走了一步')}</p></header><div class="gi-world">${landscape}<div class="gi-companion">${companion(settings)}</div><div class="gi-activity" hidden>${activity(kind,settings)}</div><div class="gi-intro"><p>${escape(settings.companion||'陪伴者')}说：<br>“${scene.intro}”</p><button type="button" class="gi-start" data-gi-action="start">${scene.action} <span aria-hidden="true">↗</span></button></div><div class="gi-ending" hidden><span class="gi-ending-mark" aria-hidden="true">${{sunrise:'☀',highfive:'✋',plant:'✿',wind:'✈',postcard:'♡',rhythm:'♫'}[kind]}</span><h3>这一步，真好</h3><p>${scene.ending}</p><span>慢慢来，我们继续向前。</span></div></div><p class="gi-feedback" role="status" aria-live="polite" aria-atomic="true">先停一小会儿，和陪伴者分享这一刻。</p><p class="gi-saved">这一步已经记下，随时关闭都不会丢失。</p></section>`;
}

// Deliberately owns no record or counting state. There are no timers and no autoplay.
export function mountInteraction(container,{kind,settings={},entry={},onComplete=()=>{}}={}){
  const root=container.matches?.('[data-gi-scene]')?container:container.querySelector('[data-gi-scene]');
  if(!root)return ()=>{};
  kind=validKind(kind||root.dataset.giScene);
  const scene=INTERACTION_SCENES[kind],doc=root.ownerDocument;
  const query=selector=>root.querySelector(selector),feedback=query('.gi-feedback');
  let phase='intro',step=0,disposed=false,listening=false,swipe=null;
  // A mount, including a replay, always starts from the full introduction.
  root.dataset.phase='intro';root.dataset.step='0';root.style.removeProperty('--gi-progress');
  query('.gi-intro').hidden=false;query('.gi-activity').hidden=true;query('.gi-ending').hidden=true;
  queryAllReset();
  function queryAllReset(){
    const range=query('[data-gi-range]');if(range){range.value='0';range.disabled=false;range.setAttribute('aria-valuetext',kind==='wind'?'等待一阵风':'太阳刚刚露头');}
    const letter=query('.gi-letter');if(letter)letter.hidden=true;
    const envelope=query('.gi-envelope');if(envelope)envelope.hidden=false;
    root.querySelectorAll('[data-beat]').forEach((button,index)=>{button.disabled=index!==0;button.classList.remove('gi-beat-done');});
    const meter=query('[data-gi-meter]');if(meter)meter.textContent={sunrise:'晨光 0%',wind:'风力 0%',plant:'0 / 3 滴认真',rhythm:'跟着自己的节奏 · 0 / 3'}[kind]||'';
    feedback.textContent='先停一小会儿，和陪伴者分享这一刻。';
  }
  function finish(){
    if(disposed||phase!=='active')return;
    phase='done';root.dataset.phase='done';swipe=null;
    query('.gi-activity').hidden=true;query('.gi-ending').hidden=false;
    feedback.textContent=scene.ending;
    const heading=query('.gi-ending h3');heading.tabIndex=-1;heading.focus({preventScroll:true});
    onComplete({kind,entry});
  }
  function progress(value){
    if(phase!=='active'||doc.hidden||disposed)return;
    const amount=Math.max(0,Math.min(100,Number(value)||0));
    root.style.setProperty('--gi-progress',String(amount/100));
    const range=query('[data-gi-range]');range.value=String(amount);range.setAttribute('aria-valuetext',`${kind==='wind'?'风力':'晨光'} ${Math.round(amount)}%`);
    query('[data-gi-meter]').textContent=`${kind==='wind'?'风力':'晨光'} ${Math.round(amount)}%`;
    if(amount>=100)finish();
  }
  function click(event){
    const button=event.target.closest?.('[data-gi-action]');if(!button||!root.contains(button)||disposed||doc.hidden)return;
    const action=button.dataset.giAction;
    if(action==='start'&&phase==='intro'){
      phase='active';root.dataset.phase='active';query('.gi-intro').hidden=true;query('.gi-activity').hidden=false;feedback.textContent=scene.hint;
      query('.gi-activity input, .gi-activity button')?.focus({preventScroll:true});return;
    }
    if(phase!=='active')return;
    if(action==='palm')finish();
    if(action==='water'){
      step=Math.min(3,step+1);root.dataset.step=String(step);query('[data-gi-meter]').textContent=`${step} / 3 滴认真`;
      feedback.textContent=['','种子醒来了，伸出一小片嫩绿。','叶子舒展开了，花苞正在准备。','小花开了！'][step];if(step===3)finish();
    }
    if(action==='letter'){
      button.hidden=true;const letter=query('.gi-letter');letter.hidden=false;root.dataset.step='1';feedback.textContent='这封信，只写给你。';letter.focus({preventScroll:true});
    }
    if(action==='keep')finish();
    if(action==='beat'&&Number(button.dataset.beat)===step){
      button.disabled=true;button.classList.add('gi-beat-done');step++;root.dataset.step=String(step);
      query('[data-gi-meter]').textContent=`跟着自己的节奏 · ${step} / 3`;
      feedback.textContent=['','第一步，把认真踩成快乐。','第二步，把快乐带向前方。','第三步，给自己一个小小的喝彩。'][step];
      if(step===3)finish();else{const next=query(`[data-beat="${step}"]`);next.disabled=false;next.focus({preventScroll:true});}
    }
  }
  const input=event=>{if(event.target.matches('[data-gi-range]'))progress(event.target.value);};
  const down=event=>{if(kind!=='wind'||phase!=='active'||event.isPrimary===false||event.button>0||!event.target.closest?.('[data-gi-swipe]'))return;swipe={id:event.pointerId,x:event.clientX};};
  const move=event=>{if(!swipe||event.pointerId!==swipe.id)return;progress((event.clientX-swipe.x)/Math.max(100,root.clientWidth*.4)*100);};
  const up=()=>{swipe=null;};
  const events=[['click',click],['input',input],['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['pointerleave',up]];
  function listen(enabled){if(listening===enabled)return;listening=enabled;for(const [name,handler]of events)root[enabled?'addEventListener':'removeEventListener'](name,handler);}
  const visibility=()=>{swipe=null;root.classList.toggle('gi-paused',doc.hidden);listen(!doc.hidden&&!disposed);};
  doc.addEventListener('visibilitychange',visibility);visibility();
  return ()=>{if(disposed)return;disposed=true;swipe=null;listen(false);doc.removeEventListener('visibilitychange',visibility);root.classList.add('gi-paused');};
}
