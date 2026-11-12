import {ENDINGS} from './model.mjs';
import {companion} from './art.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keyOf=ending=>Object.hasOwn(ENDINGS,ending)?ending:'hug';
export const CELEBRATION_INTERACTIONS=Object.freeze({
  hug:{action:'再抱紧一点',hint:'轻点按钮，让温暖慢慢靠近。',feedback:['收到一个暖暖的拥抱。','所有认真，都值得被温柔接住。','今天的你，已经做得很好啦。']},
  dance:{action:'跟上这个节拍',hint:'按自己的节奏，和陪伴者一起跳舞。',feedback:['第一拍，迈出快乐的一小步。','第二拍，转个轻轻的圈。','第三拍，为完成愿望的你鼓掌！']},
  fireworks:{action:'点亮一束烟花',hint:'每一次轻点，都有新的花火为你盛开。',feedback:['金色花火，为你的努力绽放。','玫瑰色的夜空，只为此刻停留。','星蓝色的祝福，送给闪闪发光的你。']},
  meteor:{action:'送出一颗流星',hint:'在心里许个愿，再把流星送向远方。',feedback:['第一颗流星，愿你被温柔以待。','第二颗流星，愿喜欢的事慢慢开花。','第三颗流星，愿下一段旅程也有光。']},
  bloom:{action:'浇下一滴星光',hint:'再浇一点点，看花园开出不同颜色的花。',feedback:['小花醒来了，正在向你打招呼。','花瓣舒展开，努力有了颜色。','整片花海，都在为你喝彩。']},
  lanterns:{action:'放飞一盏天灯',hint:'把今天的开心，轻轻送上天空。',feedback:['一盏灯，装着今天的勇气。','一盏灯，装着被珍惜的时光。','一盏灯，装着对明天的期待。']},
  bubbles:{action:'戳破一颗泡泡',hint:'也可以直接轻点画面里的泡泡。',feedback:['泡泡里藏着：今天的你超棒！','泡泡里藏着：快乐可以是小小的。','泡泡里藏着：下一份惊喜正在路上。']},
  aurora:{action:'拨动极光颜色',hint:'轻点按钮，在三片极光夜色里漫游。',feedback:['薄荷绿的极光，像一封温柔的来信。','紫罗兰的极光，收藏你的浪漫。','蜜桃色的极光，照亮下一次出发。']}
});
export function celebrationStory(ending,settings={}){
  const name=escape(settings.recipient||'你'),friend=escape(settings.companion||'陪伴者');
  return ({hug:`${friend}轻轻张开双臂。<br>“${name}，你已经做得很好了。抱抱你。”`,dance:`${friend}认真地做了个邀请手势。<br>“愿意和我跳一支，只属于今天的舞吗？”`,fireworks:`小小的花园，亮起一场为你准备的烟花。<br>“${name}，你值得每一个闪闪发光的时刻。”`,meteor:`${friend}陪你抬头，等一颗流星经过。<br>“${name}，你的下一份期待，也会有回响。”`,bloom:`${friend}递来一壶盛着星光的水。<br>“看，你认真做的事，已经开成花了。”`,lanterns:`${friend}为你点亮一盏小小的灯。<br>“${name}，让今天的开心，飞得再远一点。”`,bubbles:`花园里冒出一串彩虹色的泡泡。<br>“${name}，快乐就藏在这些小小的惊喜里。”`,aurora:`${friend}把夜空变成一封彩色的信。<br>“走慢一点也没关系，我们一起看光。”`})[keyOf(ending)];
}
const star=(x,y,size=5)=>`<path d="m${x} ${y-size} ${size*.3} ${size*.7} ${size*.7} ${size*.3}-${size*.7} ${size*.3}-${size*.3} ${size*.7}-${size*.3}-${size*.7}-${size*.7}-${size*.3} ${size*.7}-${size*.3}Z"/>`;
function landscape(ending){
  const stars=Array.from({length:17},(_,i)=>star(16+(i*47)%330,15+(i*31)%150,i%3+1)).join('');
  const details={
    hug:'<path class="ce-heart" d="M180 103C125 64 110 98 133 119L180 157 227 119C250 98 235 64 180 103Z"/>',
    dance:'<g class="ce-notes"><text x="40" y="92">♪</text><text x="282" y="125">♫</text><text x="245" y="65">♪</text></g><ellipse cx="180" cy="214" rx="130" ry="22" class="ce-floor"/>',
    fireworks:'<g class="ce-firework-base">'+[0,1,2].map(i=>`<g transform="translate(${65+i*110} ${54+i%2*30})">${Array.from({length:8},(_,j)=>`<path transform="rotate(${j*45})" d="M0-10V-25"/>`).join('')}</g>`).join('')+'</g>',
    meteor:'<g class="ce-meteors"><path d="m45 25 66 48m85-65 75 58m-138 42 42 31"/>'+star(111,73,8)+star(271,66,6)+'</g>',
    bloom:'<g class="ce-flowers">'+Array.from({length:9},(_,i)=>`<g transform="translate(${20+i*40} ${190+i%2*17})"><path d="M0 30V0m0 20-10-8m10 3 10-8" stroke="#b4d8a1" stroke-width="2"/><g fill="${['#efb5c4','#ffe5a1','#c3b6ef'][i%3]}"><ellipse ry="13" rx="6" cy="-7"/><ellipse ry="13" rx="6" cy="-7" transform="rotate(60)"/><ellipse ry="13" rx="6" cy="-7" transform="rotate(120)"/><circle r="4" fill="#fff2b8"/></g></g>`).join('')+'</g>',
    lanterns:'<g class="ce-lanterns">'+[0,1,2,3].map(i=>`<g transform="translate(${40+i*90} ${35+i%2*40})"><path d="M-13 0Q0-8 13 0L9 27H-9Z"/><path d="M-9 27H9M-5 32H5" stroke="#ffe4a8"/><circle cy="15" r="4" fill="#fff8ce"/></g>`).join('')+'</g>',
    bubbles:'<g class="ce-bubble-art">'+[0,1,2,3,4].map(i=>`<circle cx="${35+i*72}" cy="${60+i%2*60}" r="${15+i%3*6}"/>`).join('')+'</g>',
    aurora:'<g class="ce-aurora"><path d="M-30 100Q60-40 150 55T400 25"/><path d="M-25 140Q75-20 175 95T400 65"/><path d="M-15 160Q80 10 200 115T400 90"/></g>'
  }[ending];
  return `<svg class="ce-landscape" viewBox="0 0 360 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="#f9e8b0" opacity=".65">${stars}</g>${details}<path d="M0 224Q80 193 180 220T360 207V240H0Z" fill="#182b3a" opacity=".55"/></svg>`;
}
export function sceneMarkup(ending,settings={}){
  const key=keyOf(ending),info=CELEBRATION_INTERACTIONS[key];
  return `<section class="ce-experience" data-celebration="${key}"><div class="stage ce-stage ce-${key}" role="group" aria-label="${ENDINGS[key].title}互动场景">${landscape(key)}<div class="ce-companion">${companion(settings,key)}</div><div class="ce-effects" aria-hidden="true"></div>${key==='bubbles'?'<button type="button" class="ce-bubble-target" data-ce-trigger aria-label="戳破画面里的彩虹泡泡"><span aria-hidden="true">✧</span></button>':''}<span class="ce-scene-caption" aria-hidden="true">${ENDINGS[key].title}</span></div><div class="ce-controls"><button type="button" class="button secondary ce-trigger" data-ce-trigger>${info.action} <span aria-hidden="true">✦</span></button><p class="ce-feedback" role="status" aria-live="polite" aria-atomic="true">${info.hint}</p><p class="ce-optional">互动随心，不用完成也可以直接收下印章。</p></div></section>`;
}
// The whole effect is replaced on every tap, bounding DOM and timer count even under rapid input.
function effectMarkup(key,turn){
  const symbols={hug:'♥',dance:['♪','♫','✦'][turn%3],fireworks:'✦',meteor:'✧',bloom:'✿',lanterns:'▱',bubbles:'○',aurora:'✧'};
  return Array.from({length:key==='aurora'?7:12},(_,i)=>{
    const angle=i*Math.PI/6,dx=Math.round(Math.cos(angle)*115),dy=Math.round(Math.sin(angle)*85);
    return `<span class="ce-particle ce-particle-${key}" style="--x:${dx}px;--y:${dy}px;--i:${i};--tone:${(turn*55+i*20)%360}deg">${symbols[key]}</span>`;
  }).join('');
}
export function mountCelebration(container,ending){
  const key=keyOf(ending),root=container.querySelector('[data-celebration]');
  if(!root)return ()=>{};
  const doc=root.ownerDocument,win=doc.defaultView,stage=root.querySelector('.ce-stage'),effects=root.querySelector('.ce-effects'),feedback=root.querySelector('.ce-feedback');
  const motion=win?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let timer=null,turn=0,disposed=false;
  const clear=()=>{if(timer!==null){win.clearTimeout(timer);timer=null;}effects.replaceChildren();stage.classList.remove('ce-active');};
  const activate=event=>{
    if(disposed||doc.hidden||!event.target.closest('[data-ce-trigger]'))return;
    clear();turn++;stage.dataset.palette=String((turn-1)%3);stage.dataset.step=String((turn-1)%3);
    feedback.textContent=CELEBRATION_INTERACTIONS[key].feedback[(turn-1)%3];
    if(motion?.matches)return;
    effects.innerHTML=effectMarkup(key,turn);stage.classList.add('ce-active');
    timer=win.setTimeout(clear,1900);
  };
  const visibility=()=>{root.classList.toggle('ce-paused',doc.hidden);if(doc.hidden)clear();};
  const motionChange=()=>{if(motion?.matches)clear();};
  root.addEventListener('click',activate);doc.addEventListener('visibilitychange',visibility);motion?.addEventListener?.('change',motionChange);visibility();
  return ()=>{if(disposed)return;disposed=true;clear();root.removeEventListener('click',activate);doc.removeEventListener('visibilitychange',visibility);motion?.removeEventListener?.('change',motionChange);};
}
