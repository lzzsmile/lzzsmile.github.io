import {STORAGE_KEY,emptyState,localDate,addTask,tasksForDate,checkIn,undoEntry,archiveTask,deleteTask,history as entriesHistory,stats,validateState,parseBackup,migrateV1,finishInteraction,INTERACTIONS,hasConfiguredCompanion,monthDates,weekDates,shiftDate,shiftMonth,isDate} from './growth-model.mjs';
import {STORAGE_KEY as LEGACY_KEY,BACKUP_KEY as LEGACY_BACKUP,MAX_BACKUP_BYTES,validateState as validateLegacy,DEFAULT_AVATAR} from './model.mjs';
import {icon,companion} from './art.mjs';
import {openCompanionPhoto,mountPhotoCrop} from './companion-photo.mjs';
import {sceneMarkup,mountInteraction} from './growth-interactions.mjs';
import {APP_VERSION,createUpdater} from './update.mjs';
import {createHomeCompanionSession,gardenTitle} from './home-companion.mjs';
const CALENDAR_MIN='0001-01-01';
const BACKUP_KEY='starwish-garden:growth:before-restore:v2',MIGRATION_KEY='starwish-garden:growth:legacy-snapshot:v1';
const $=s=>document.querySelector(s),app=$('#app'),modal=$('#modal');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labelDate=(date,withYear=false)=>new Date(date+'T12:00:00').toLocaleDateString('zh-CN',{...(withYear?{year:'numeric'}:{}),month:'long',day:'numeric',weekday:'short'});
const scheduleName=t=>({once:'仅这一天',daily:'每天',weekdays:'周一至周五'})[t.schedule];
const button=(text,action,cls='primary',attrs='')=>`<button type="button" class="button ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
let state=emptyState(),storageError='',legacyRaw='',legacyError='',view='today',selectedDate=localDate(),visibleMonth=localDate().slice(0,7),weekAnchor=localDate(),calendarExpanded=false,dayWhenOpened=localDate(),cleanup=()=>{},dialogKind='',opener=null,lastPageTrigger=null,inputMethod='keyboard',suppressPop=false,mutationBusy=false,toastTimer,updateStatus={supported:'serviceWorker' in navigator},updater,advance=false,updateDeferred=false;
const homeCompanion=createHomeCompanionSession();
let photoController,photoCleanup,photoGeneration=0,draftAvatar,draftShirt,settingsSnapshot,importCandidate,importExpected,deleteCandidate,dialogEpoch=0;
function load(){try{const raw=localStorage.getItem(STORAGE_KEY);state=raw?validateState(JSON.parse(raw)):emptyState();legacyRaw=localStorage.getItem(LEGACY_KEY)||'';if(legacyRaw){try{validateLegacy(JSON.parse(legacyRaw));legacyError='';}catch{legacyError='旧版记录暂时无法解析。原始内容已保留，请先导出备份。';}}storageError='';}catch{storageError='无法读取本地记录。为保护数据，已暂停写入。请导出备份或恢复有效备份。';}}
load();
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function errorText(error){return error.name==='QuotaExceededError'?'设备空间不足，这次操作没有保存。请先导出备份，再释放空间。':error.message||'没有保存成功，请检查浏览器存储权限。';}
function modalError(error){const node=modal.querySelector('.modal-error');if(node){node.textContent=errorText(error);node.scrollIntoView({block:'nearest'});}else toast(errorText(error));}
function safeLock(work){if(!navigator.locks?.request)throw Error('当前浏览器不支持安全的多页面保存。请使用支持 Web Locks 的新版 Safari、Chrome 或 Edge，在 HTTPS 网站打开；现有记录仍可查看和导出。');return navigator.locks.request(STORAGE_KEY,work);}
function needsMigration(){try{return localStorage.getItem(STORAGE_KEY)===null&&Boolean(legacyRaw)&&localStorage.getItem('starwish-garden:growth:migration-prompt:v1')===null;}catch{return false;}}
async function commit(change){if(mutationBusy)throw Error('正在保存，请稍等。');if(storageError)throw Error(storageError);mutationBusy=true;try{const work=()=>{const raw=localStorage.getItem(STORAGE_KEY),next=raw?validateState(JSON.parse(raw)):emptyState();const result=change(next);next.updatedAt=new Date().toISOString();validateState(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;render();return result;};return await safeLock(work);}finally{mutationBusy=false;}}
function focusKey(el){return el?.dataset?.focusKey||null;}
function rememberFocus(element){
 if(!element?.matches('button,a[href],input,select,textarea,summary')||!app.contains(element))return null;
 return {element,key:focusKey(element),className:element.className,data:Object.fromEntries(Object.entries(element.dataset).filter(([key])=>key!=='pointerFocus'))};
}
function pageFocusTarget(saved){
 if(saved?.element?.isConnected&&app.contains(saved.element)&&!saved.element.disabled)return saved.element;
 if(saved?.key){const found=[...app.querySelectorAll('[data-focus-key]')].find(el=>el.dataset.focusKey===saved.key&&!el.disabled);if(found)return found;}
 if(saved?.data.action){const matches=[...app.querySelectorAll('[data-action]')].filter(el=>!el.disabled&&Object.entries(saved.data).every(([key,value])=>el.dataset[key]===value));const found=matches.find(el=>el.className===saved.className)||matches[0];if(found)return found;}
 return app.querySelector('.tabbar [aria-current="page"]');
}
function focusControl(el){if(!el)return;el.toggleAttribute('data-pointer-focus',inputMethod==='pointer'&&el.matches('button,a[href],summary'));el.focus({preventScroll:true});}
function syncHomeCompanion(visible=!document.hidden){return homeCompanion.sync({view,configured:hasConfiguredCompanion(state.settings),visible,modalOpen:modal.open});}
function render(){
 syncHomeCompanion();
 const activeFocus=!modal.open?rememberFocus(document.activeElement):null,s=stats(state,view==='journey'?selectedDate:localDate()),title=gardenTitle(state.settings);
 document.title=(view==='today'?'':view==='journey'?'旅途 · ':'我的 · ')+title;
 app.innerHTML=`<div class="app-shell"><header class="topbar"><a class="brand" href="#today" data-action="nav" data-view="today" aria-label="${esc(title)}，返回今天"><span class="brand-mark">${icon('sun')}</span><span class="brand-title">${esc(title)}</span></a><div class="header-meta"><span data-update-entry></span><span class="header-date">${new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric'})}</span></div></header><main id="main" tabindex="-1">${!navigator.locks?.request?'<section class="notice warning"><p>这个浏览器暂不支持安全保存。现有记录可以查看和导出，请用新版浏览器在 HTTPS 网站打开后继续打卡。</p></section>':''}${storageError?`<section class="notice warning" role="alert"><p>${esc(storageError)}</p>${button('数据与备份','backup','text')}</section>`:''}<div data-update-notice aria-live="polite"></div>${view==='today'?todayPage(s):view==='journey'?journeyPage(s):settingsPage(s)}</main></div><nav class="tabbar" aria-label="主要导航">${[['today','今天','sun'],['journey','旅途','leaf'],['settings','我的','heart']].map(([v,label,i])=>`<button data-action="nav" data-view="${v}" data-focus-key="nav-${v}" class="${view===v?'active':''}" ${view===v?'aria-current="page"':''}>${icon(i)}<span>${label}${v==='settings'?'<span class="update-dot" data-update-dot hidden aria-hidden="true"></span>':''}</span></button>`).join('')}</nav>`;
 renderUpdateStatus();if(activeFocus)focusControl(pageFocusTarget(activeFocus));advance=false;
}
function pathArt(total){const points=[[183,300],[252,273],[291,244],[261,217],[215,196],[206,172],[245,151],[288,132],[284,111],[250,95]],position=points[total%10];return `<svg class="path-art" viewBox="0 0 420 330" role="img" aria-label="通往晨光的弯弯小路。已经向前 ${total} 步。"><defs><linearGradient id="morning" x2="0" y2="1"><stop stop-color="#e3f2ef"/><stop offset=".65" stop-color="#fff3cf"/><stop offset="1" stop-color="#dce9b5"/></linearGradient><linearGradient id="road" x2="0" y2="1"><stop stop-color="#fff8df"/><stop offset="1" stop-color="#f8dc9c"/></linearGradient></defs><rect width="420" height="330" fill="url(#morning)"/><circle cx="279" cy="70" r="35" fill="#fff7ca"/><circle cx="279" cy="70" r="25" fill="#ffd27b"/><path d="M0 167Q65 94 141 146T281 121T420 144V330H0Z" fill="#bfd7b6"/><path d="M0 204Q89 143 177 192T340 174T420 180V330H0Z" fill="#94bd98"/><path d="M0 252Q97 201 191 245T420 225V330H0Z" fill="#b6d399"/><path d="M156 330C158 291 311 278 294 246S160 202 219 167 318 141 269 105L254 93C291 125 235 135 208 156S162 198 249 226 247 274 104 330Z" fill="url(#road)"/><path d="M182 327C189 287 302 280 281 248S184 208 218 180S299 139 260 104" stroke="#eab96c" stroke-width="1.4" stroke-dasharray="3 8" fill="none" opacity=".55"/><g fill="#fff6d2"><ellipse cx="58" cy="244" rx="3" ry="5"/><ellipse cx="66" cy="247" rx="3" ry="5"/><ellipse cx="355" cy="282" rx="3" ry="5"/><ellipse cx="362" cy="286" rx="3" ry="5"/></g><g stroke="#668f64" stroke-width="2" fill="none"><path d="M62 263v-17m-1 8-7-5m8 2 7-4M359 300v-15m0 8 6-6"/></g><path d="m71 105 8-4 7 4m7-9 5-3 5 3" stroke="#7d9e92" stroke-width="1.8" fill="none" stroke-linecap="round"/><g class="path-marker ${advance?'advancing':''}" transform="translate(${position[0]} ${position[1]})"><ellipse cy="9" rx="13" ry="5" fill="#6a805c" opacity=".2"/><circle r="10" fill="#fff9e8" stroke="#d89b3b" stroke-width="2"/><path d="m-4 0 3 3 5-6" fill="none" stroke="#6e873b" stroke-width="2" stroke-linecap="round"/></g></svg>`;}
const activeDate=()=>view==='journey'?selectedDate:localDate();
function companionPresence(){
 return `<section class="companion-invitation" aria-label="邀请同行者"><span class="invitation-icon">${icon('heart')}</span><div><strong>让一位同行者，陪你走这段路</strong></div>${button('去我的设置','nav','text','data-view="settings" data-focus-key="setup-companion"')}</section>`;
}
function homeHero(s){
 const greeting=homeCompanion.current;
 if(!hasConfiguredCompanion(state.settings)||!greeting)return `<section class="hero"><div class="hero-copy"><h1>${s.total?'你已向前，<br>走了 <em>'+s.total+'</em> 步。':'新的一天，<br>从一小步开始。'}</h1><span class="hero-badge">${icon('leaf')} ${s.days?`已留下 ${s.days} 天的足迹`:'你的旅途，由今天启程'}</span></div><div class="hero-landscape">${pathArt(s.total)}<span class="mile-label">${s.total<10?'晨光起点':`第 ${Math.floor(s.total/10)+1} 段小路`} <span>→</span></span></div></section>${companionPresence()}`;
 return `<section class="hero companion-hero companion-presence" aria-label="同行者的鼓励" data-home-greeting="${greeting.id}" data-home-visit="${greeting.visit}"><div class="home-greeting"><p class="home-companion-name">${icon('leaf')}<span>${esc(state.settings.companion||'同行者')}，与你一路同行</span></p><h1>${esc(greeting.text)}</h1>${state.settings.dedication?`<p class="home-dedication">${esc(state.settings.dedication)}</p>`:''}</div><div class="home-landscape" aria-hidden="true">${pathArt(s.total)}<span class="home-companion-figure">${companion(state.settings)}</span><span class="home-warmth">${icon('heart')}</span></div>${s.total?`<div class="home-card-footer"><span class="home-progress">已向前 ${s.total} 步 · ${s.days} 天足迹</span></div>`:''}</section>`;
}
// A new greeting never rebuilds the checklist or destroys its current keyboard focus.
function renderHomeGreeting(){
 const hero=app.querySelector('.companion-hero');
 if(!hero||!homeCompanion.current){render();return;}
 const activeKey=hero.contains(document.activeElement)?focusKey(document.activeElement):null;
 hero.outerHTML=homeHero(stats(state,localDate()));
 if(activeKey)focusControl([...app.querySelectorAll('[data-focus-key]')].find(el=>el.dataset.focusKey===activeKey));
}
function journeyCalendar(){
 const today=localDate(),counts=new Map();for(const entry of state.entries)counts.set(entry.date,(counts.get(entry.date)||0)+1);
 const week=weekDates(weekAnchor),days=calendarExpanded?monthDates(visibleMonth):week;
 const first=week.find(Boolean),last=week.findLast(Boolean),prev=calendarExpanded?shiftMonth(visibleMonth,-1):shiftDate(first,-7),next=calendarExpanded?shiftMonth(visibleMonth,1):shiftDate(first,7);
 const month=calendarExpanded?visibleMonth:weekAnchor.slice(0,7),title=new Date(month+'-01T12:00:00Z').toLocaleDateString('zh-CN',{timeZone:'UTC',year:'numeric',month:'long'});
 const short=date=>`${first.slice(0,4)!==last.slice(0,4)?Number(date.slice(0,4))+'.':''}${Number(date.slice(5,7))}.${Number(date.slice(8))}`;
 const range=calendarExpanded?'整月':`${short(first)} – ${short(last)}`;
 return `<section class="journey-calendar ${calendarExpanded?'is-expanded':'is-collapsed'}" aria-label="旅途日历"><div class="calendar-heading"><button type="button" class="icon-button" data-action="${calendarExpanded?'month':'week'}-prev" data-focus-key="calendar-prev" aria-label="${calendarExpanded?'上个月':'上一周'}" ${prev&&prev>=(calendarExpanded?CALENDAR_MIN.slice(0,7):CALENDAR_MIN)?'':'disabled'}>${icon('back')}</button><div class="calendar-heading-copy"><h2 id="calendar-title" aria-live="polite">${title}</h2><p id="calendar-range" aria-live="polite">${range}</p></div><button type="button" class="icon-button" data-action="${calendarExpanded?'month':'week'}-next" data-focus-key="calendar-next" aria-label="${calendarExpanded?'下个月':'下一周'}" ${!next||next>(calendarExpanded?today.slice(0,7):today)?'disabled':''}>${icon('arrow')}</button></div><div class="calendar-weekdays" aria-hidden="true">${['一','二','三','四','五','六','日'].map(d=>`<span>${d}</span>`).join('')}</div><div id="journey-calendar-days" class="calendar-days" role="group" aria-labelledby="calendar-title calendar-range">${days.map(date=>date?`<button type="button" class="calendar-day ${date===selectedDate?'selected':''} ${date===today?'is-today':''} ${counts.has(date)?'has-entries':''} ${date.slice(0,7)!==month?'other-month':''}" data-action="choose-date" data-date="${date}" data-focus-key="calendar-${date}" aria-label="${esc(labelDate(date,true))}${date===today?'，今天':''}，${counts.has(date)?'有足迹，':'暂无足迹，'}${counts.get(date)||0} 步" aria-pressed="${date===selectedDate}" ${date===today?'aria-current="date"':''} ${date>today?'disabled':''}><span>${Number(date.slice(8))}</span><span class="calendar-mark" aria-hidden="true">${counts.has(date)?'<i></i>':' '}</span></button>`:'<span class="calendar-blank" aria-hidden="true"></span>').join('')}</div><button type="button" class="calendar-toggle" data-action="calendar-toggle" data-focus-key="calendar-toggle" aria-expanded="${calendarExpanded}" aria-controls="journey-calendar-days" aria-label="${calendarExpanded?'收起月历，显示所选日期的一周':'展开整月日历'}"><span class="calendar-grip" aria-hidden="true"></span><span>${calendarExpanded?'收起为一周':'展开整月'}</span><span class="calendar-chevron" aria-hidden="true">${calendarExpanded?'⌃':'⌄'}</span></button></section>`;
}

function todayPage(s){const tasks=tasksForDate(state,localDate()),done=state.entries.filter(e=>e.date===localDate()),remaining=tasks.filter(t=>!done.some(e=>e.taskId===t.id));return `${homeHero(s)}<section class="daily-section" data-today="${localDate()}"><div class="section-heading"><div><h2>今日清单 <span>${done.length}/${tasks.length+done.filter(e=>!tasks.some(t=>t.id===e.taskId)).length}</span></h2></div>${button(icon('plus')+' 添加事项','new-task','small','data-focus-key="new-task"')}</div><p class="today-date">${labelDate(localDate())}</p>${remaining.length?`<div class="task-list">${remaining.map(task=>taskRow(task)).join('')}</div>`:tasks.length||done.length?`<div class="all-done"><span>${icon('sun')}</span><div><strong>这一页，已经有了你的努力。</strong></div></div>`:`<div class="empty-day"><div class="empty-sun">${icon('sun')}</div><h3>今天，想迈出哪一步？</h3>${button('添加今天想做的事','new-task','primary','data-focus-key="new-task-empty"')}<div class="suggestions">${['读书 10 分钟','出门走一走','认真喝杯水'].map(title=>button(title,'quick-task','chip',`data-title="${title}"`)).join('')}</div></div>`}${done.length?`<div class="done-heading"><span>已向前 ${done.length} 步</span></div><div class="task-list completed-list">${done.map(entry=>entryRow(entry)).join('')}</div>`:''}</section>`;}
function taskRow(task){return `<article class="task-card"><button class="check-control" data-action="check-in" data-date="${activeDate()}" data-id="${esc(task.id)}" data-focus-key="task-${esc(task.id)}" aria-label="完成：${esc(task.title)}">${icon('check')}</button><button class="task-label" data-action="task-detail" data-date="${activeDate()}" data-id="${esc(task.id)}" data-focus-key="task-detail-${esc(task.id)}"><strong>${esc(task.title)}</strong><span>${esc(task.note)||scheduleName(task)}</span></button><span class="task-frequency">${task.schedule==='once'?'单次':task.schedule==='daily'?'每日':'工作日'}</span></article>`;}
function entryRow(entry,journey=false){return `<article class="task-card is-done"><button class="check-control done" data-action="entry" data-id="${esc(entry.id)}" data-focus-key="entry-check-${esc(entry.id)}" aria-label="查看已完成：${esc(entry.title)}">${icon('check')}</button><button class="task-label" data-action="entry" data-id="${esc(entry.id)}" data-focus-key="entry-${esc(entry.id)}"><strong>${esc(entry.title)}</strong><span>${journey?new Date(entry.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' · ':''}${entry.completedAt?'已收藏陪伴':'已完成'}${entry.taskDeleted?' · 事项已删除':''}</span></button><button class="icon-button replay-small" data-action="replay" data-id="${esc(entry.id)}" data-focus-key="entry-replay-${esc(entry.id)}" aria-label="重温${esc(entry.title)}的陪伴">${icon('spark')}</button></article>`;}
function journeyPage(s){const entries=entriesHistory(state,selectedDate),pending=tasksForDate(state,selectedDate).filter(t=>!t.archived&&!entries.some(e=>e.taskId===t.id));return `<section class="page-heading journey-heading"><h1>每一步，都在这里。</h1></section><section class="journey-stats"><div><strong>${s.total}</strong><span>累计向前 / 步</span></div><div><strong>${s.days}</strong><span>留下足迹 / 天</span></div><div><strong>${s.today}</strong><span>所选日期 / 步</span></div></section>${journeyCalendar()}<section class="journey-day" aria-labelledby="journey-day-title"><div class="section-heading"><h2 id="journey-day-title">${labelDate(selectedDate,true)}</h2><span class="muted" aria-live="polite">${entries.length} 步</span></div>${entries.length?`<div class="journey-line">${entries.map(e=>entryRow(e,true)).join('')}</div>`:`<div class="empty-day small-empty"><span>${icon('leaf')}</span><h3>这一天，还没有足迹</h3></div>`}<div class="journey-checklist"><div class="section-heading"><div><h3>${selectedDate===localDate()?'这一天的清单':'补记这一天'}</h3></div>${button(icon('plus')+' 添加事项','new-task','small','data-focus-key="new-task"')}</div>${pending.length?`<div class="task-list">${pending.map(t=>taskRow(t)).join('')}</div>`:''}</div></section>`;}
function settingsPage(s){return `<section class="page-heading compact"><h1>我的小小世界</h1></section><button class="profile-card" data-action="personalize" data-focus-key="personalize"><span class="profile-avatar">${companion(state.settings)}</span><span><strong>${hasConfiguredCompanion(state.settings)?esc(state.settings.companion||'同行者'):'设置我的同行者'}</strong><small>${hasConfiguredCompanion(state.settings)?'专属形象、称呼和想对你说的话':'选择形象与称呼，开启一路同行'}</small></span>${icon('edit')}</button><div class="settings-group">${settingsRow('manage-tasks','grid','清单管理',`${state.tasks.filter(t=>!t.archived&&!t.deletedAt).length} 个进行中事项 · 归档与删除`)}${settingsRow('backup','download','数据与备份','导出与导入本机记录')}</div><section class="privacy-card">${icon('lock')}<div><strong>这里的记录，只属于你。</strong><p>打卡、照片与文案只保存在当前浏览器，不会上传。换设备或清理浏览器前，请先导出备份。</p></div></section><footer class="settings-footer"><p class="settings-version">版本 ${APP_VERSION}</p><div data-update-actions>${button('检查更新','check-update','secondary','data-focus-key="check-update"')}${button('更新到最新版','apply-update','primary','data-focus-key="apply-update" hidden')}</div><p data-update-status role="status" aria-live="polite"></p></footer>`;}
function settingsRow(action,i,title,subtitle){return `<button class="settings-row" data-action="${action}" data-focus-key="${action}">${icon(i)}<span><strong>${title}</strong><small>${subtitle}</small></span><b aria-hidden="true">›</b></button>`;}
function routeHash(){return view==='journey'?`#journey?date=${selectedDate}`:`#${view}`;}
function parseRoute(){const route=location.hash.slice(1).split('?')[0];view=['today','journey','settings'].includes(route)?route:'today';const date=new URLSearchParams(location.hash.split('?')[1]||'').get('date');if(view==='journey'){if(isDate(date)&&date>=CALENDAR_MIN&&date<=localDate())selectedDate=date;visibleMonth=selectedDate.slice(0,7);weekAnchor=selectedDate;}if(location.hash!==routeHash())history.replaceState(history.state,'',routeHash());}
function navigate(next){const replacing=modal.open;if(replacing)closeModal(true);const previous=view;view=['today','journey','settings'].includes(next)?next:'today';if(view==='journey'){visibleMonth=selectedDate.slice(0,7);weekAnchor=selectedDate;}if(replacing||previous===view)history.replaceState(null,'',routeHash());else history.pushState(null,'',routeHash());render();window.scrollTo({top:0,behavior:'instant'});}
function setDate(date){if(view!=='journey'||modal.open)return;if(!isDate(date)||date<CALENDAR_MIN||date>localDate()){render();toast('请选择今天或以前的日期。');return;}selectedDate=date;visibleMonth=date.slice(0,7);weekAnchor=date;history.replaceState(null,'',routeHash());render();}
function setMonth(month){if(view!=='journey'||modal.open)return;if(!isDate(month+'-01')||month<CALENDAR_MIN.slice(0,7)||month>localDate().slice(0,7)){render();toast('请选择本月或以前的月份。');return;}visibleMonth=month;calendarExpanded=true;render();}
function setWeek(delta){
 if(view!=='journey'||modal.open)return;
 const date=shiftDate(weekDates(weekAnchor).find(Boolean),delta*7);
 if(!date||date<CALENDAR_MIN||date>localDate())return;weekAnchor=date;visibleMonth=date.slice(0,7);render();
}
function setCalendarExpanded(expanded){
 if(view!=='journey'||modal.open||calendarExpanded===expanded)return;
 calendarExpanded=expanded;
 if(expanded)visibleMonth=weekAnchor.slice(0,7);else{weekAnchor=selectedDate;visibleMonth=selectedDate.slice(0,7);}
 render();const toggle=app.querySelector('[data-focus-key="calendar-toggle"]');focusControl(toggle);if(inputMethod==='keyboard')toggle.scrollIntoView({block:'nearest'});
}
function openModal(title,body,kind='',wide=false){dialogEpoch++;const wasOpen=modal.open;cleanup();cleanup=()=>{};stopPhoto();if(!wasOpen){opener=lastPageTrigger||rememberFocus(document.activeElement);lastPageTrigger=null;history.pushState({growthDialog:true},'',location.href);}dialogKind=kind;modal.className=wide?'interaction-dialog':'';modal.innerHTML=`<div class="modal-top"><h2 id="modal-title">${esc(title)}</h2><button class="icon-button" data-action="close" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}</div><p class="modal-error" role="alert"></p>`;if(!wasOpen)modal.showModal();document.body.classList.add('modal-open');modal.scrollTop=0;const initial=modal.querySelector('[autofocus]')||modal.querySelector('.modal-top button');focusControl(initial);}
function closeModal(fromHistory=false){if(!modal.open)return;dialogEpoch++;cleanup();cleanup=()=>{};stopPhoto();modal.close();modal.innerHTML='';dialogKind='';importCandidate=null;deleteCandidate=null;document.body.classList.remove('modal-open');if(syncHomeCompanion())renderHomeGreeting();if(!fromHistory&&history.state?.growthDialog){suppressPop=true;history.back();}focusControl(pageFocusTarget(opener));opener=null;}
function newTask(){openModal('给这一天，添一小步',`<form id="task-form"><label>想做的事<input name="title" maxlength="60" placeholder="比如，读书 10 分钟" required autofocus></label><label>一句小提醒 <span>可选</span><input name="note" maxlength="300" placeholder="不求很多，开始就很好"></label><label>安排在<input type="date" name="startDate" value="${activeDate()}" required></label><fieldset class="repeat-options"><legend>怎样重复</legend>${[['once','仅这一天'],['daily','每天'],['weekdays','周一至周五']].map(([value,label],i)=>`<label><input type="radio" name="schedule" value="${value}" ${i===0?'checked':''}><span>${label}</span></label>`).join('')}</fieldset><button class="button primary full-width" type="submit">放进清单</button></form>`,'task');}
async function completeTask(id,date=activeDate()){if(view==='today'&&date!==localDate()){closeModal();render();toast('新的一天已经开始，请从今天的清单重新选择。昨天的事仍可到旅途补记。');return;}const epoch=dialogEpoch,openedView=view;try{advance=true;const entry=await commit(next=>checkIn(next,id,date));if(epoch===dialogEpoch&&view===openedView)showInteraction(entry.id);else toast('这一步已保存，可以在旅途中重温陪伴。');}catch(e){advance=false;toast(errorText(e));}}
function entryDetails(id){const entry=state.entries.find(e=>e.id===id);if(!entry){toast('这条记录已在其他页面更改。');return;}const task=state.tasks.find(t=>t.id===entry.taskId);openModal('这一步，值得记住',`<div class="entry-detail"><span class="eyebrow">${labelDate(entry.date,true)}</span><h3>${esc(entry.title)}</h3>${entry.note?`<p class="entry-note">${esc(entry.note)}</p>`:''}${entry.taskDeleted?'<p class="field-help">事项已删除，这一步和陪伴仍为你保留。</p>':''}<div class="entry-actions">${button('重温完整陪伴','replay','primary',`data-id="${esc(id)}"`)}${button('撤销这一次打卡','confirm-undo','text danger',`data-id="${esc(id)}"`)}${task&&!task.deletedAt?button('删除这个事项','confirm-delete-task','text danger',`data-id="${esc(task.id)}" data-return="entry" data-entry-id="${esc(id)}"`):''}</div></div>`,'entry');}
function confirmUndo(id){const entry=state.entries.find(e=>e.id===id);if(!entry)return;const task=state.tasks.find(t=>t.id===entry.taskId);openModal('只撤销这一步',`<p>将撤销 ${esc(labelDate(entry.date))} 的「${esc(entry.title)}」及它对应的 1 步，其他事项和记录都不受影响。</p><p class="field-help">${entry.taskDeleted?'事项已删除，撤销只移除这一次足迹，不会重新创建事项。':task?.archived?'事项已归档，如需重新完成，请先在清单管理恢复。':'事项仍保留在清单里，可以重新完成。'}</p><div class="modal-actions">${button('保留这一步','entry','secondary',`data-id="${esc(id)}"`)}${button('确认撤销','undo','danger',`data-id="${esc(id)}"`)}</div>`,'undo');}
function showInteraction(id){const entry=state.entries.find(e=>e.id===id);if(!entry)return;openModal('这一步，送给你',`<p class="interaction-saved" data-growth-entry="${esc(id)}">${icon('check')} 记录已保存 · 关闭也不会丢失这一步</p>${sceneMarkup(entry.interaction,state.settings,entry)}`,'interaction',true);cleanup=mountInteraction(modal.querySelector('.modal-body'),{kind:entry.interaction,settings:state.settings,entry,onComplete:async()=>{try{await commit(next=>finishInteraction(next,id));}catch(e){modalError(e);}}});}
function manageTasks(){
 const visible=state.tasks.filter(t=>!t.deletedAt);
 openModal('我的清单',`<p class="field-help">归档或删除事项，已有足迹不会删除。</p>${visible.length?`<div class="managed-list">${visible.map(task=>`<div class="managed-task" data-task-id="${esc(task.id)}"><span><strong>${esc(task.title)}</strong><small>${scheduleName(task)} · ${task.startDate}${task.archived?' · 已归档':''}</small></span><div class="managed-task-actions">${button(task.archived?'恢复':'归档','archive-task','text',`data-id="${esc(task.id)}" data-archived="${task.archived?'false':'true'}" aria-label="${task.archived?'恢复':'归档'}：${esc(task.title)}"`)}${button('删除','confirm-delete-task','text danger',`data-id="${esc(task.id)}" data-return="manage" aria-label="删除：${esc(task.title)}"`)}</div></div>`).join('')}</div>`:'<p>清单里还没有事项，从今天的小事开始吧。</p>'}${button('添加事项','new-task','primary full-width')}`,'manage');
}
function taskDetails(id,date=activeDate()){const task=state.tasks.find(t=>t.id===id);if(!task||task.deletedAt)return;openModal('这一件小事',`<div class="entry-detail"><span class="eyebrow">${labelDate(date,true)}</span><h3>${esc(task.title)}</h3>${task.note?`<p>${esc(task.note)}</p>`:''}<p class="field-help">${scheduleName(task)} · 从 ${task.startDate} 开始</p>${button('完成这件事 · 向前一步','check-in','primary full-width',`data-id="${esc(id)}" data-date="${date}"`)}${button('归档这个事项','archive-task','text full-width',`data-id="${esc(id)}" data-archived="true"`)}${button('删除这个事项','confirm-delete-task','text danger full-width',`data-id="${esc(id)}" data-return="task-detail" data-date="${date}"`)}</div>`,'task-detail');}
const deletionSnapshot=(s,id)=>JSON.stringify({task:s.tasks.find(t=>t.id===id),entries:s.entries.filter(e=>e.taskId===id)});
function confirmDeleteTask(el){
 const id=el.dataset.id,task=state.tasks.find(t=>t.id===id);if(!task||task.deletedAt){toast('这件事已删除或不存在，请重新打开清单。');return;}
 const count=state.entries.filter(e=>e.taskId===id).length;
 deleteCandidate={id,snapshot:deletionSnapshot(state,id),origin:el.dataset.return||'manage',date:el.dataset.date,entryId:el.dataset.entryId};
 openModal('删除这个事项？',`<div class="delete-task-summary"><h3>${esc(task.title)}</h3><p>${scheduleName(task)} · ${task.startDate}</p></div><p>删除后，不再出现在待办清单中，也不能继续打卡或补记。</p><p>${count?`已有的 <strong>${count} 条记录和 ${count} 步</strong>、备注及陪伴都会保留，仍可在旅途中查看。`:'目前没有打卡记录，不会影响已有步数。'}</p><p class="field-help">事项删除后无法恢复，不会保留在清单管理中。仅想暂停，可以取消后选择归档。</p><div class="modal-actions">${button('取消','cancel-delete-task','secondary','autofocus')}${button('确认删除事项','delete-task','danger')}</div>`,'delete-task');
}
function cancelDeleteTask(){const target=deleteCandidate;deleteCandidate=null;if(!target){closeModal();return;}if(target.origin==='entry'&&state.entries.some(e=>e.id===target.entryId))entryDetails(target.entryId);else if(target.origin==='task-detail'&&state.tasks.some(t=>t.id===target.id&&!t.deletedAt))taskDetails(target.id,target.date);else if(target.origin==='manage')manageTasks();else closeModal();}
async function applyTaskDeletion(el){
 const candidate=deleteCandidate,epoch=dialogEpoch;if(!candidate||mutationBusy)return;el.disabled=true;
 try{await commit(next=>{if(epoch!==dialogEpoch||!modal.open||dialogKind!=='delete-task')throw Error('删除已取消。');if(deletionSnapshot(next,candidate.id)!==candidate.snapshot)throw Error('这件事或它的记录已在另一个页面改变。请取消后重新打开，核对最新内容再删除。');deleteTask(next,candidate.id);});if(epoch===dialogEpoch){deleteCandidate=null;if(candidate.origin==='manage')manageTasks();else closeModal();}toast('事项已删除，已有足迹保留。');}
 catch(e){if(epoch===dialogEpoch&&modal.open){el.disabled=false;modalError(e);}}
}
function personalize(){settingsSnapshot=structuredClone(state.settings);draftAvatar=structuredClone(state.settings.avatar||DEFAULT_AVATAR);draftShirt=state.settings.shirt;openModal('专属陪伴',`<form id="settings-form"><div class="settings-preview">${companion({...state.settings,avatar:draftAvatar})}</div><div class="photo-actions"><label class="button secondary upload-label">选择本机照片<input id="companion-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"></label>${button('恢复默认人物','avatar-default','text')}</div><p class="field-help">照片仅在本机裁剪和保存，最长边 512 像素。支持 JPG / PNG / WebP，最大 30 MiB；HEIC 请先转为 JPEG。</p><div id="photo-editor"></div><label>你的称呼 <span>可选</span><input name="recipient" maxlength="30" value="${esc(state.settings.recipient)}" placeholder="想被怎样称呼"></label><label>陪伴者的名字<input name="companion" maxlength="30" value="${esc(state.settings.companion)}" placeholder="陪伴者"></label><label>想对你说的话<textarea name="dedication" maxlength="160" rows="3" placeholder="今天，也一起往前走一点。">${esc(state.settings.dedication)}</textarea></label><label class="color-label">默认人物的衣服颜色<input name="shirt" type="color" value="${esc(state.settings.shirt)}"></label><label>生日 <span>可选，月-日</span><input name="birthday" value="${esc(state.settings.birthday)}" placeholder="06-18" inputmode="numeric" maxlength="5"></label><button type="submit" class="button primary full-width">保存专属陪伴</button></form>`,'personalize');}
function stopPhoto(){photoGeneration++;photoController?.abort();photoController=null;photoCleanup?.();photoCleanup=null;}
function updatePhotoPreview(){const preview=modal.querySelector('.settings-preview');if(preview)preview.innerHTML=companion({...state.settings,avatar:draftAvatar,shirt:draftShirt});}
async function selectPhoto(file){if(!file)return;stopPhoto();const generation=photoGeneration,controller=photoController=new AbortController(),form=modal.querySelector('#settings-form'),submit=form?.querySelector('[type="submit"]');if(!form)return;submit.disabled=true;modal.querySelector('.modal-error').textContent='';try{const source=await openCompanionPhoto(file,{signal:controller.signal});if(generation!==photoGeneration||!modal.open||dialogKind!=='personalize'){source.dispose();return;}photoCleanup=mountPhotoCrop($('#photo-editor'),source,{onUse:data=>{draftAvatar={type:'photo',dataUrl:data};stopPhoto();updatePhotoPreview();submit.disabled=false;focusControl($('#companion-file'));},onCancel:()=>{stopPhoto();submit.disabled=false;focusControl($('#companion-file'));},onError:modalError});}catch(e){if(generation===photoGeneration&&!controller.signal.aborted){submit.disabled=false;modalError(e);}}}
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function safetyData(){
 const keys=[STORAGE_KEY,BACKUP_KEY,LEGACY_KEY,LEGACY_BACKUP,'starwish-garden:last-deleted:v1',MIGRATION_KEY],raw={};
 for(const key of keys){const value=localStorage.getItem(key);if(value!==null)raw[key]=value;}
 // Normalize the active journey, but keep unreadable originals and historical slots recoverable.
 if(raw[STORAGE_KEY]){try{raw[STORAGE_KEY]=JSON.stringify(validateState(JSON.parse(raw[STORAGE_KEY])));}catch{}}
 if(raw[STORAGE_KEY]===undefined&&raw[LEGACY_KEY]===undefined)raw[STORAGE_KEY]=JSON.stringify(state);
 const result={app:'starwish-garden-safety',formatVersion:1,exportedAt:new Date().toISOString(),raw};
 if(new TextEncoder().encode(JSON.stringify(result,null,2)).length>MAX_BACKUP_BYTES)throw Error('备份超过 32 MiB 上限，未导出不完整文件。原有记录没有更改。');
 return result;
}
function backup(){openModal('数据与备份',`<p>备份包含本机旅途、陪伴照片与文字，以及保留的旧版原始记录。文件未加密，请保存在你信任的位置。</p><div class="backup-actions">${button('导出备份','export','primary full-width')}<label class="file-import">${icon('upload')}<span>导入备份</span><input type="file" id="import-file" accept="application/json,.json" aria-label="导入备份"></label></div><p class="field-help">导入前会先预览并请你确认。换设备或清理浏览器前，请将备份保存到独立位置。</p>`,'backup');}
function previewImport(candidate,expected,source='JSON 备份'){importCandidate=candidate;importExpected=expected;const s=stats(candidate);openModal('恢复前，先核对一下',`<p>来自${esc(source)}：<strong>${candidate.tasks.length} 个事项、${s.total} 步、${s.days} 天足迹</strong>。</p><p>确认后替换当前新版旅途。当前旅途会自动留存一份副本，旧版记录不会覆盖或删除。</p>${candidate.legacy?'<p class="field-help">这份备份包含完整的旧版花园档案。</p>':''}<p class="field-help">自动留存只保留最近一次，并随下次导出备份一起保存；重要内容请先导出到独立文件。</p><div class="modal-actions">${button('取消','backup','secondary')}${button('确认恢复','confirm-import','primary')}</div>`,'import');}
async function readBackup(file){if(!file)return;const epoch=dialogEpoch;try{if(file.size>MAX_BACKUP_BYTES)throw Error('备份文件超过 32 MiB，请选择星愿花园导出的备份。');const expected=localStorage.getItem(STORAGE_KEY),text=await file.text();let candidate,source='JSON 备份';const parsed=JSON.parse(text);if(parsed.app==='starwish-garden-safety'){source='备份文件（导入其中的旅途；其他旧版和历史原始记录仍保留在文件内，不会覆盖本机原始记录）';if(parsed.formatVersion!==1||!parsed.raw||typeof parsed.raw!=='object')throw Error('备份格式不正确。');const growth=parsed.raw[STORAGE_KEY],old=parsed.raw[LEGACY_KEY];candidate=growth?validateState(JSON.parse(growth)):old?migrateV1(JSON.parse(old)):null;if(!candidate)throw Error('这份备份没有可导入的旅途或旧版花园。');}else candidate=parseBackup(text);if(epoch!==dialogEpoch||!modal.open||dialogKind!=='backup')return;previewImport(candidate,expected,source);}catch(e){modalError(e);}}
async function restore(){
 if(!importCandidate||mutationBusy)return;
 const candidate=validateState(importCandidate),expected=importExpected,epoch=dialogEpoch;mutationBusy=true;
 try{
  const restored=await safeLock(()=>{
   if(epoch!==dialogEpoch||!modal.open||dialogKind!=='import')return false;
   const current=localStorage.getItem(STORAGE_KEY);if(current!==expected)throw Error('预览期间，当前记录已在另一个页面改变。请重新选择备份核对，避免覆盖新的努力。');
   const oldBackup=localStorage.getItem(BACKUP_KEY);
   try{if(current!==null)localStorage.setItem(BACKUP_KEY,current);candidate.updatedAt=new Date().toISOString();validateState(candidate);localStorage.setItem(STORAGE_KEY,JSON.stringify(candidate));}
   catch(e){try{if(oldBackup===null)localStorage.removeItem(BACKUP_KEY);else localStorage.setItem(BACKUP_KEY,oldBackup);}catch{}throw e;}
   state=candidate;storageError='';return true;
  });
  if(!restored)return;if(epoch===dialogEpoch)closeModal();render();toast('旅途已恢复。原有旧版数据没有更改。');
 }finally{mutationBusy=false;}
}
// The prompt is a UI preference only; raw records and recovery slots are never changed by dismissal.
let migrationSource=null;
function firstMigrationPrompt(){if(!needsMigration())return;try{localStorage.setItem('starwish-garden:growth:migration-prompt:v1','seen');}catch{}migration();}
function migration(){
 migrationSource=null;
 try{
  const raw=localStorage.getItem(LEGACY_KEY),legacy=validateLegacy(JSON.parse(raw));
  if(localStorage.getItem(STORAGE_KEY)!==null){openModal('旧版记录已保留',`<p>这里已有新版旅途，不能直接迁移，以免覆盖现有记录。两份数据都保持原样，可在「我的 → 数据与备份」一并导出保存。</p>${button('返回数据与备份','backup','primary full-width')}`,'migrate');return;}
  migrationSource=raw;const total=legacy.wishes.reduce((n,w)=>n+w.entries.length,0);
  openModal('带着过去，继续向前',`<div class="migration-summary"><span>${icon('leaf')}</span><strong>${total} 次努力 → ${total} 步</strong></div><p>发现 ${legacy.wishes.length} 个旧版愿望。确认后直接迁入新旅途，旧版原始记录、印章与待庆祝都会保留。</p><p class="field-help">之后可在「我的 → 数据与备份」管理备份。</p><div class="modal-actions">${button('暂不迁移','close','secondary')}${button('确认迁移','confirm-migration','primary')}</div>`,'migrate');
 }catch{openModal('旧版记录暂时无法读取',`<p>原始内容已保留，没有覆盖或删除。可到「我的 → 数据与备份」导出备份或导入有效备份。</p>${button('知道了','close','primary full-width')}`,'migrate');}
}
async function migrate(){
 if(mutationBusy)throw Error('正在保存，请稍等。');if(migrationSource===null)throw Error('请重新打开旧版迁移。');
 const expected=migrationSource,epoch=dialogEpoch;mutationBusy=true;
 try{
  const migrated=await safeLock(()=>{
   if(epoch!==dialogEpoch||!modal.open||dialogKind!=='migrate')return false;
   const raw=localStorage.getItem(LEGACY_KEY);
   if(raw!==expected)throw Error('旧版记录已在另一个页面改变，请到「我的 → 数据与备份」导出备份后重新导入。');
   if(localStorage.getItem(STORAGE_KEY)!==null)throw Error('这里已有新版旅途，未覆盖任何记录。请到「我的 → 数据与备份」一并导出保存。');
   const candidate=migrateV1(JSON.parse(raw)),serialized=JSON.stringify(candidate);
   // Preserve the first snapshot and all previous recovery slots, including on quota failure.
   if(localStorage.getItem(MIGRATION_KEY)===null)localStorage.setItem(MIGRATION_KEY,raw);
   localStorage.setItem(STORAGE_KEY,serialized);state=candidate;storageError='';return true;
  });
  if(!migrated)return;migrationSource=null;if(epoch===dialogEpoch)closeModal();render();toast('旧版记录已迁入，继续向前吧。');
 }finally{mutationBusy=false;}
}
function updates(){navigate('settings');focusControl($('[data-update-actions] button'));}
function setUpdateMarkup(node,html){if(node&&node.innerHTML!==html)node.innerHTML=html;}
function renderUpdateStatus(){
 if(!updateStatus.available)updateDeferred=false;
 const available=updateStatus.available,busy=updateStatus.applying;
 setUpdateMarkup($('[data-update-entry]'),available?button('有更新','updates','update-entry','data-focus-key="update-entry" aria-label="有新版本，查看更新"'):'');
 const dot=$('[data-update-dot]');if(dot)dot.hidden=!available;
 const settingsTab=app.querySelector('.tabbar [data-view="settings"]');if(settingsTab)settingsTab.setAttribute('aria-label',available?'我的，有新版本可更新':'我的');
 setUpdateMarkup($('[data-update-notice]'),available&&!updateDeferred?`<section class="update-banner" aria-label="版本更新提示"><span class="update-banner-icon" aria-hidden="true">${icon('spark')}</span><div class="update-banner-copy"><strong>${busy?'正在为你打开新版…':'有新版本，准备好了'}</strong><p>已保存的记录会保留，想更新时再点一下。</p>${updateStatus.error?`<p class="update-banner-error">${esc(updateStatus.error)}</p>`:''}</div><div class="update-banner-actions">${button(busy?'正在更新…':'立即更新','apply-update','primary',busy?'disabled':'data-focus-key="update-now"')}${button('稍后','defer-update','text',busy?'disabled':'data-focus-key="update-later"')}</div></section>`:!navigator.onLine?'<p class="offline-note">正在离线使用，打卡仍保存在此设备。</p>':'');
 const node=app.querySelector('[data-update-status]');if(!node)return;
 node.textContent=updateStatus.error||(!updateStatus.supported?'当前浏览器暂不支持检查更新。':busy?'正在切换新版，请稍等。':updateStatus.checking?'正在检查更新…':available?'新版本已准备好，已保存的记录会保留。':updateStatus.checked?`当前已是最新版 ${APP_VERSION}。`:'');
 const check=app.querySelector('[data-update-actions] [data-action="check-update"]'),apply=app.querySelector('[data-update-actions] [data-action="apply-update"]');
 // Keep controls mounted and keyboard focus intact while asynchronous checks finish.
 if(check)check.setAttribute('aria-disabled',String(Boolean(updateStatus.checking||busy)));
 if(apply){apply.hidden=!available;apply.disabled=Boolean(busy);apply.textContent=busy?'正在更新…':'更新到最新版';}
}
function applyUpdate(){if(!safeToUpdate()){toast('请先保存或关闭当前编辑，再更新。');return;}updater.apply();}
function safeToUpdate(){return !mutationBusy&&!modal.open;}
function deferUpdate(){updateDeferred=true;renderUpdateStatus();focusControl($('[data-update-entry] button'));toast('可以继续使用，稍后点顶部「有更新」。');}

const actions={
 close:()=>closeModal(),nav:el=>navigate(el.dataset.view),'month-prev':()=>setMonth(shiftMonth(visibleMonth,-1)),'month-next':()=>setMonth(shiftMonth(visibleMonth,1)),'week-prev':()=>setWeek(-1),'week-next':()=>setWeek(1),'calendar-toggle':()=>setCalendarExpanded(!calendarExpanded),'choose-date':el=>setDate(el.dataset.date),
 'new-task':newTask,'quick-task':async el=>{try{await commit(next=>addTask(next,{title:el.dataset.title,schedule:'once',startDate:localDate(),date:localDate()}));toast('已放进今天的清单。');}catch(e){toast(errorText(e));}},
 'check-in':el=>completeTask(el.dataset.id,el.dataset.date),'task-detail':el=>taskDetails(el.dataset.id,el.dataset.date),entry:el=>entryDetails(el.dataset.id),replay:el=>showInteraction(el.dataset.id),'confirm-undo':el=>confirmUndo(el.dataset.id),undo:async el=>{try{await commit(next=>undoEntry(next,el.dataset.id));closeModal();toast('只撤销了这一次记录和一步。');}catch(e){modalError(e);}},
 personalize,'avatar-default':()=>{stopPhoto();draftAvatar=structuredClone(DEFAULT_AVATAR);updatePhotoPreview();const submit=modal.querySelector('[type="submit"]');if(submit)submit.disabled=false;},'manage-tasks':manageTasks,'confirm-delete-task':confirmDeleteTask,'cancel-delete-task':cancelDeleteTask,'delete-task':applyTaskDeletion,'archive-task':async el=>{const epoch=dialogEpoch;try{await commit(next=>archiveTask(next,el.dataset.id,el.dataset.archived==='true'));if(epoch===dialogEpoch&&modal.open)manageTasks();}catch(e){modalError(e);}},
 backup,export:()=>{try{downloadJSON(safetyData(),`星愿花园-备份-${localDate()}.json`);}catch(e){modalError(e);}},'confirm-import':async()=>{try{await restore();}catch(e){modalError(e);}},
 'confirm-migration':async()=>{try{await migrate();}catch(e){modalError(e);}},updates,'check-update':()=>{if(!updateStatus.checking&&!updateStatus.applying)void updater.check();},'apply-update':applyUpdate,'defer-update':deferUpdate,skip:()=>$('#main').focus()
};
document.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(!target||target.disabled)return;const action=actions[target.dataset.action];if(action){event.preventDefault();if(app.contains(target))lastPageTrigger=rememberFocus(target);void action(target);}});
document.addEventListener('submit',async event=>{const form=event.target;if(!['task-form','settings-form'].includes(form.id))return;event.preventDefault();const submit=form.querySelector('[type="submit"]');if(submit.disabled)return;submit.disabled=true;const data=new FormData(form),epoch=dialogEpoch;try{if(form.id==='task-form'){await commit(next=>addTask(next,{title:data.get('title'),note:data.get('note'),schedule:data.get('schedule'),startDate:data.get('startDate'),date:data.get('startDate')}));if(epoch===dialogEpoch)closeModal();toast('小小的一步，已经放进清单。');}else{const birthday=data.get('birthday').trim();if(birthday&&(!/^\d{2}-\d{2}$/.test(birthday)||localDate(new Date('2024-'+birthday+'T12:00:00'))!=='2024-'+birthday))throw Error('生日请填写有效的月-日，例如 06-18。');const savedAvatar=structuredClone(draftAvatar);await commit(next=>{if(JSON.stringify(next.settings)!==JSON.stringify(settingsSnapshot))throw Error('陪伴设置已在另一个页面改变。请关闭后重新打开，查看最新内容再保存。');Object.assign(next.settings,{companionConfigured:true,recipient:data.get('recipient').trim(),companion:data.get('companion').trim()||'陪伴者',dedication:data.get('dedication').trim(),birthday:data.get('birthday').trim(),shirt:data.get('shirt'),avatar:savedAvatar});});if(epoch===dialogEpoch)closeModal();toast('专属陪伴已保存。');}}catch(e){submit.disabled=false;modalError(e);}});
document.addEventListener('change',event=>{if(event.target.id==='import-file')void readBackup(event.target.files[0]);if(event.target.id==='companion-file')void selectPhoto(event.target.files[0]);});
document.addEventListener('input',event=>{if(event.target.name==='shirt'){draftShirt=event.target.value;updatePhotoPreview();}});
document.addEventListener('pointerdown',()=>{inputMethod='pointer';},{capture:true});
document.addEventListener('keydown',event=>{if(!['Shift','Control','Alt','Meta'].includes(event.key)){inputMethod='keyboard';document.querySelectorAll('[data-pointer-focus]').forEach(el=>delete el.dataset.pointerFocus);}});
// Swipes belong to the labelled handle, not to dates: the grid keeps normal page scrolling.
// Movement/cancellation never falls through to a date click (including synthetic touch clicks).
let calendarGesture=null,suppressCalendarClickUntil=0;
document.addEventListener('pointerdown',event=>{
 if(!event.isPrimary){if(calendarGesture)calendarGesture.cancelled=true;return;}
 const target=event.target.closest?.('.calendar-toggle,.calendar-day');
 suppressCalendarClickUntil=0;
 if(!target||modal.open||event.button!==0)return;
 calendarGesture={id:event.pointerId,target,x:event.clientX,y:event.clientY,dx:0,dy:0,moved:false,handle:target.matches('.calendar-toggle')};
 if(calendarGesture.handle)target.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
 const g=calendarGesture;if(!g||g.id!==event.pointerId)return;
 g.dx=event.clientX-g.x;g.dy=event.clientY-g.y;g.moved ||= Math.hypot(g.dx,g.dy)>8;
});
function finishCalendarGesture(event,cancelled=false){
 const g=calendarGesture;if(!g||g.id!==event.pointerId)return;
 calendarGesture=null;
 if(g.moved||cancelled||g.cancelled)suppressCalendarClickUntil=performance.now()+700;
 if(cancelled||g.cancelled||!g.handle||!g.target.isConnected||Math.abs(g.dy)<36||Math.abs(g.dy)<Math.abs(g.dx)*1.2)return;
 setCalendarExpanded(g.dy>0);
}
document.addEventListener('pointerup',event=>finishCalendarGesture(event));
document.addEventListener('pointercancel',event=>finishCalendarGesture(event,true));
document.addEventListener('click',event=>{
 if(event.detail!==0&&performance.now()<suppressCalendarClickUntil&&event.target.closest?.('.journey-calendar')){event.preventDefault();event.stopImmediatePropagation();}
},{capture:true});
document.addEventListener('keydown',event=>{
 const el=event.target.closest?.('.calendar-day');if(!el||modal.open||event.altKey||event.ctrlKey||event.metaKey)return;
 const current=el.dataset.date,weekday=(new Date(current+'T12:00:00Z').getUTCDay()+6)%7;
 const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-weekday,End:6-weekday}[event.key];
 let date;
 if(delta!==undefined)date=shiftDate(current,delta);
 else if(['PageUp','PageDown'].includes(event.key)){
  const month=shiftMonth(current.slice(0,7),event.key==='PageUp'?-1:1);
  if(month){const dates=monthDates(month).filter(Boolean);date=dates[Math.min(Number(current.slice(8)),dates.length)-1];}
 }else return;
 event.preventDefault();if(!date||date<CALENDAR_MIN||date>localDate())return;
 if(!app.querySelector(`[data-focus-key="calendar-${date}"]`)){weekAnchor=date;visibleMonth=date.slice(0,7);render();}
 const target=app.querySelector(`[data-focus-key="calendar-${date}"]`);focusControl(target);target?.scrollIntoView({block:'nearest'});
});
document.addEventListener('focusout',event=>{if(event.target.dataset)delete event.target.dataset.pointerFocus;});
modal.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
window.addEventListener('popstate',()=>{if(suppressPop){suppressPop=false;if(history.state?.growthDialog&&!modal.open)history.replaceState(null,'',location.href);return;}if(modal.open)closeModal(true);if(history.state?.growthDialog)history.replaceState(null,'',location.href);parseRoute();render();});
window.addEventListener('storage',event=>{if([STORAGE_KEY,LEGACY_KEY].includes(event.key)){load();render();if(modal.open&&dialogKind==='interaction'){const id=modal.querySelector('[data-growth-entry]')?.dataset.growthEntry;if(id&&!state.entries.some(e=>e.id===id))closeModal();}toast('已同步这个浏览器中其他页面的记录。');}});
function refreshDay(){const today=localDate();if(today!==dayWhenOpened){dayWhenOpened=today;render();}}
function resumeHome(){const changed=syncHomeCompanion();if(!document.hidden){if(changed)renderHomeGreeting();refreshDay();}}
document.addEventListener('visibilitychange',resumeHome);window.addEventListener('pagehide',()=>syncHomeCompanion(false));window.addEventListener('pageshow',resumeHome);window.addEventListener('online',render);window.addEventListener('offline',render);
setInterval(()=>{if(!document.hidden)refreshDay();},60000);
parseRoute();render();updater=createUpdater({onChange:status=>{updateStatus=status;renderUpdateStatus();},canReload:safeToUpdate});void updater.start();firstMigrationPrompt();
