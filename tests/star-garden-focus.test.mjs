import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../star-garden/app.mjs',import.meta.url),'utf8');
const focusSource=source.slice(source.indexOf('let modalOpener='),source.indexOf('function modalHead('));
function harness(){
  const elements=[],listeners={};
  const document={activeElement:null,body:{classList:{add(){},remove(){}}},addEventListener:(name,fn)=>listeners[name]=fn,querySelectorAll:()=>elements.filter(el=>el.pointerFocus)};
  const element=(data={},interactive=true)=>{
    const el={dataset:{...data},isConnected:true,inApp:true,pointerFocus:false,matches:()=>interactive,focus(options){document.activeElement=el;el.focusOptions=options;},toggleAttribute(name,value){el.pointerFocus=value;if(value)el.dataset.pointerFocus='';else delete el.dataset.pointerFocus;},removeAttribute(){el.pointerFocus=false;delete el.dataset.pointerFocus;}};
    elements.push(el);return el;
  };
  const main=element({},false),nav=element({action:'nav',view:'settings'}),trigger=element({action:'personalize'});
  const title=element({},false);title.inApp=false;
  const app={contains:el=>!!el?.inApp&&el.isConnected,querySelectorAll:()=>elements.filter(el=>el.inApp&&el.isConnected&&el.dataset.action),querySelector:()=>nav};
  const modal={open:false,innerHTML:'',scrollTop:0,showModal(){this.open=true;},close(){this.open=false;document.activeElement=main;},querySelector:()=>title};
  const context=vm.createContext({document,app,modal,importCandidate:null});
  vm.runInContext(focusSource,context);
  const run=code=>vm.runInContext(code,context);
  context.trigger=trigger;context.main=main;
  return {run,document,main,nav,trigger,title,modal,element,listeners,context};
}
test('garden dialog remembers the actual trigger when Safari leaves main focused',()=>{
  const h=harness();h.document.activeElement=h.main;
  h.run('lastPageTrigger=trigger;show("sheet")');h.run('close()');
  assert.equal(h.document.activeElement,h.trigger);
  assert.equal(h.modal.open,false);
});
test('garden nested sheets preserve the first page opener',()=>{
  const h=harness();h.run('lastPageTrigger=trigger;show("detail");show("edit");close()');
  assert.equal(h.document.activeElement,h.trigger);
});
test('garden dialog restores a rebuilt trigger by stable action and record ID',()=>{
  const h=harness();h.trigger.dataset={action:'detail',id:'wish-1'};
  h.run('lastPageTrigger=trigger;show("detail")');h.trigger.isConnected=false;
  h.element({action:'detail',id:'wish-2'});
  const replacement=h.element({action:'detail',id:'wish-1'});
  h.run('close()');assert.equal(h.document.activeElement,replacement);
});
test('garden removed opener falls back to current navigation, never the page container',()=>{
  const h=harness();h.run('lastPageTrigger=trigger;show("detail")');
  h.trigger.isConnected=false;h.run('close()');assert.equal(h.document.activeElement,h.nav);
});
test('garden ignores a noninteractive main as a modal return target',()=>{
  const h=harness();h.document.activeElement=h.main;
  h.run('show("sheet");close()');assert.equal(h.document.activeElement,h.nav);
});
test('garden pointer return is quiet and keyboard input immediately restores normal focus styling',()=>{
  const h=harness();h.listeners.pointerdown();
  h.run('lastPageTrigger=trigger;show("sheet");close()');
  assert.equal(h.trigger.pointerFocus,true);
  assert.equal(h.trigger.focusOptions.preventScroll,true);
  h.listeners.keydown({key:'Tab'});assert.equal(h.trigger.pointerFocus,false);
  h.run('show("sheet");close()');assert.equal(h.trigger.pointerFocus,false);
});
test('garden preserved focus identity excludes the temporary pointer-only marker',()=>{
  const h=harness();h.trigger.toggleAttribute('data-pointer-focus',true);
  h.run('saved=rememberFocus(trigger)');h.trigger.isConnected=false;
  const replacement=h.element({action:'personalize'});
  h.run('restorePageFocus(saved)');assert.equal(h.document.activeElement,replacement);
});
test('garden keyboard Enter and Escape retain the dialog trigger without suppressing focus',()=>{
  const h=harness();h.listeners.keydown({key:'Enter'});
  h.run('lastPageTrigger=trigger;show("sheet")');h.listeners.keydown({key:'Escape'});h.run('close()');
  assert.equal(h.document.activeElement,h.trigger);assert.equal(h.trigger.pointerFocus,false);
});
test('garden settings remove the duplicate profile navigation and retain three settings',()=>{
  const block=source.slice(source.indexOf('function settings(){'),source.indexOf('function personalize()'));
  assert.doesNotMatch(block,/profile-card|我的星愿花园/);
  assert.equal((block.match(/settingsRow\(/g)||[]).length,3);
  assert.match(block,/个性化/);assert.match(block,/数据与使用/);
});


test('garden duplicate action identities retain the same visual control after render',()=>{
  const h=harness();h.trigger.dataset={action:'detail',id:'wish-1'};h.trigger.className='check-button done';
  h.run('lastPageTrigger=trigger;show("detail")');h.trigger.isConnected=false;
  const title=h.element({action:'detail',id:'wish-1'});title.className='wish-main';
  const replacement=h.element({action:'detail',id:'wish-1'});replacement.className='check-button done';
  h.run('close()');assert.equal(h.document.activeElement,replacement);
});
