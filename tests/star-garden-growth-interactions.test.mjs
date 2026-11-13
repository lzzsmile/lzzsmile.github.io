import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneMarkup,mountInteraction,INTERACTION_IDS} from '../star-garden/growth-interactions.mjs';

function fixture(kind){
  const nodes=new Map(),listeners=new Map(),docListeners=new Map();
  function node(){return {hidden:false,disabled:false,value:'0',textContent:'',dataset:{},classList:{add(){},remove(){}},setAttribute(){},focus(){this.focused=true;},matches(s){return s==='[data-gi-range]';}};}
  for(const s of ['.gi-feedback','.gi-intro','.gi-activity','.gi-ending','.gi-ending h3','[data-gi-meter]','.gi-activity input, .gi-activity button'])nodes.set(s,node());
  if(['sunrise','wind'].includes(kind))nodes.set('[data-gi-range]',node());
  if(kind==='postcard'){nodes.set('.gi-letter',node());nodes.set('.gi-envelope',node());}
  const beats=Array.from({length:3},(_,i)=>{const n=node();n.dataset.beat=String(i);nodes.set(`[data-beat="${i}"]`,n);return n;});
  const doc={hidden:false,addEventListener:(k,v)=>docListeners.set(k,v),removeEventListener:k=>docListeners.delete(k)};
  const root={ownerDocument:doc,dataset:{giScene:kind},clientWidth:400,matches:()=>true,contains:()=>true,querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>beats,classList:{add(){},toggle(){}},style:{setProperty(){},removeProperty(){}},addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
  function click(action,beat){const button=action==='beat'?beats[beat]:action==='letter'?nodes.get('.gi-envelope'):node();button.dataset.giAction=action;listeners.get('click')?.({target:{closest:()=>button}});}
  return {root,nodes,doc,listeners,docListeners,click};
}

test('all six scenes start with an intro and escape user text',()=>{
  assert.deepEqual(INTERACTION_IDS,['sunrise','highfive','plant','wind','postcard','rhythm']);
  for(const kind of INTERACTION_IDS){
    const html=sceneMarkup(kind,{recipient:'<script>bad</script>',companion:'<unsafe>',dedication:'<img src=x onerror=1>'},{title:'<b>task</b>'});
    assert.match(html,/data-phase="intro"/);assert.match(html,/&lt;b&gt;task&lt;\/b&gt;/);assert(!html.includes('<script>'));assert(!html.includes('<img src=x'));assert(!html.includes('<unsafe>'));
  }
  assert.match(sceneMarkup('__proto__'),/data-gi-scene="sunrise"/);
});

test('every scene completes only once and does not mutate the saved entry',()=>{
  for(const kind of INTERACTION_IDS){
    const f=fixture(kind),entry=Object.freeze({id:'saved',title:'one step'});let completed=0;
    const cleanup=mountInteraction(f.root,{kind,entry,onComplete:()=>completed++});
    f.click('palm');assert.equal(completed,0);f.click('start');assert.equal(f.root.dataset.phase,'active');
    if(kind==='sunrise'||kind==='wind'){const range=f.nodes.get('[data-gi-range]');range.value='100';f.listeners.get('input')({target:range});}
    if(kind==='highfive')f.click('palm');
    if(kind==='plant'){f.click('water');f.click('water');assert.equal(completed,0);f.click('water');}
    if(kind==='postcard'){f.click('letter');assert.equal(completed,0);assert.equal(f.nodes.get('.gi-letter').hidden,false);f.click('keep');}
    if(kind==='rhythm'){f.click('beat',2);assert.equal(completed,0);for(let i=0;i<3;i++)f.click('beat',i);}
    assert.equal(completed,1,kind);assert.equal(f.root.dataset.phase,'done');
    for(let i=0;i<10;i++){f.click('palm');f.click('water');f.click('keep');}
    assert.equal(completed,1);cleanup();cleanup();assert.equal(f.listeners.size,0);assert.equal(f.docListeners.size,0);
  }
});

test('hidden page pauses handlers, remount restores the entire introduction',()=>{
  const f=fixture('plant');let completed=0;
  let cleanup=mountInteraction(f.root,{kind:'plant',onComplete:()=>completed++});f.click('start');f.click('water');
  f.doc.hidden=true;f.docListeners.get('visibilitychange')();assert.equal(f.listeners.size,0);f.click('water');assert.equal(f.root.dataset.step,'1');
  f.doc.hidden=false;f.docListeners.get('visibilitychange')();f.click('water');f.click('water');assert.equal(completed,1);cleanup();
  cleanup=mountInteraction(f.root,{kind:'plant',onComplete:()=>completed++});assert.equal(f.root.dataset.phase,'intro');assert.equal(f.root.dataset.step,'0');assert.equal(f.nodes.get('.gi-activity').hidden,true);assert.equal(f.nodes.get('.gi-intro').hidden,false);cleanup();
});
