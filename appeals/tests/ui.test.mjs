// Runs the real application events and templates against a minimal DOM fixture.
// This checks integration and escaping, not browser layout or rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CASES, CASE_MAP, SHIFTS} from '../cases.mjs';
import {SAVE_KEY} from '../engine.mjs';

let events, windowEvents, surfaces, storage, selectedMode, boots=0;
class Element {
  constructor(id='') {this.id=id;this.innerHTML='';this.hidden=false;this.style={};this.textContent='';this.classList={add(){},remove(){}};this.tagName='DIV';this.offsetLeft=0;this.scrollLeft=0;}
  focus(){document.activeElement=this;}
  getAttribute(){return null;}
  querySelector(selector){return new Element(selector === '.active' ? 'queue-active' : 'fixture-focus');}
  querySelectorAll(){return [new Element('fixture-first'),new Element('fixture-last')];}
}
async function boot({saved=null,blocked=false,width=1280}={}) {
  events=new Map();windowEvents=new Map();surfaces=new Map();storage=new Map();selectedMode='standard';
  if(saved)storage.set(SAVE_KEY,saved);
  for(const id of ['app','overlay','toast','mode-note'])surfaces.set(id,new Element(id));
  globalThis.document={body:{style:{}},activeElement:new Element(),hidden:false,
    querySelector(selector){if(selector.includes('name='))return {value:selectedMode};return surfaces.get(selector.replace(/^#/,'')) || new Element();},
    getElementById(id){return surfaces.get(id) || new Element(id);},
    addEventListener(name,fn){events.set(name,fn);}
  };
  globalThis.window={innerWidth:width,addEventListener(name,fn){windowEvents.set(name,fn);}};
  globalThis.localStorage={getItem(key){if(blocked)throw Error('blocked');return storage.get(key)||null;},setItem(key,value){if(blocked)throw Error('blocked');storage.set(key,value);}};
  globalThis.requestAnimationFrame=fn=>fn();
  await import(`../app.mjs?fixture=${++boots}`);
}
const html=()=>surfaces.get('app').innerHTML;
const modal=()=>surfaces.get('overlay').innerHTML;
const state=()=>JSON.parse(storage.get(SAVE_KEY));
function click(action,id='',other={}) {const button={dataset:{action,id,...other},disabled:false,closest(){return this;},tagName:'BUTTON',getAttribute(){return null;}};events.get('click')({target:button});}
function change(id,value){events.get('change')({target:{id,value,tagName:'SELECT'}});}
function begin(){click('start');assert.match(modal(),/Read past the red flag/);click('begin');assert.equal(surfaces.get('overlay').hidden,true);}
function solveCurrent(){
  const c=CASE_MAP[state().active];click('tab','',{tab:'investigate'});
  for(const d of c.sources){click('source',d.id);for(const group of c.decisive){const key=group[0];if(d.findings.some(k=>k.id===key))click('pin',key);}}
  click('ruling',c.answer);change('reason',c.reason);click('submit');assert.match(modal(),/That ruling stands/);
}

test('title, clock-in, policy, tabs, evidence, and first submitted audit work together',async()=>{
  await boot();assert.match(html(),/You are the/);assert.match(html(),/second opinion/);begin();
  assert.match(html(),/PixelPigeon/);assert.match(html(),/submit-verdict[^>]*disabled/);
  click('policy');assert.match(modal(),/reviewer’s handbook/);click('close');assert.equal(surfaces.get('overlay').hidden,true);
  click('tab','',{tab:'investigate'});assert.match(html(),/Full conversation/);click('source','chat');assert.match(html(),/FINDINGS TO CITE/);
  click('pin','chat:1');assert.equal(state().files['A-1042'].pins.length,1);assert.match(html(),/pinned-note/);
  click('ruling','restore');change('reason',CASES[0].reason);assert.doesNotMatch(html(),/submit-verdict[^>]*disabled/);
  click('submit');assert.match(modal(),/That ruling stands/);assert.equal(state().records.length,1);click('advance');assert.equal(state().active,'A-1043');
});

test('all 25 cases can be completed through actual application event handlers',async()=>{
  await boot();begin();
  for(let shift=0;shift<5;shift++){
    for(let n=0;n<SHIFTS[shift].ids.length;n++){solveCurrent();click('advance');}
    assert.match(modal(),/Desk cleared/);click('review',SHIFTS[shift].ids[0]);assert.match(modal(),/Back to report/);click('close');assert.match(modal(),/Desk cleared/);
    click('next-shift');if(shift<4){assert.equal(state().status,'briefing');click('begin');}
  }
  assert.equal(state().status,'complete');assert.equal(state().records.length,25);assert.match(modal(),/LEAD INVESTIGATOR/);assert.equal(state().earnings,1375);
  click('leave');assert.match(html(),/Continue shift 5/);click('continue');assert.match(modal(),/A human made/);
});

test('save and continue preserve opened documents, pins, notes, and ruling',async()=>{
  await boot();begin();click('source','chat');click('pin','chat:1');click('ruling','restore');change('reason',CASES[0].reason);
  click('tab','',{tab:'notes'});events.get('input')({target:{id:'case-notes',value:'<img src=x onerror=alert(1)> & my notes'}});
  click('tab','',{tab:'appeal'});const serialized=storage.get(SAVE_KEY);
  assert.equal(state().files['A-1042'].note,'<img src=x onerror=alert(1)> & my notes');
  click('new');click('confirm-new'); // Cancels the old note-save debounce before remounting.
  await boot({saved:serialized});assert.match(html(),/Continue shift 1/);click('continue');assert.equal(state().files['A-1042'].pins.length,1);
  click('tab','',{tab:'notes'});assert.match(html(),/&lt;img src=x onerror=alert\(1\)&gt; &amp; my notes/);assert.doesNotMatch(html(),/<img src=x/);
  click('submit');assert.match(modal(),/That ruling stands/);
});

test('audit access stays locked until session retrieval through the UI',async()=>{
  await boot();begin();for(let n=0;n<4;n++){solveCurrent();click('advance');}click('next-shift');click('begin');click('case','A-1073');click('tab','',{tab:'investigate'});
  assert.match(html(),/id="source-audit"[^>]*disabled/);click('source','audit');assert.equal(state().minutes,0);
  click('source','sessions');click('sources');assert.doesNotMatch(html(),/id="source-audit"[^>]*disabled/);click('source','audit');assert.match(html(),/attacker’s stolen session remains active/);
});

test('bad audit, dismissal, and retry are connected to the UI',async()=>{
  await boot();begin();for(let n=0;n<3;n++){const c=CASE_MAP[state().active];click('source',c.sources[0].id);click('pin',c.sources[0].findings[0].id);click('ruling',c.answer==='restore'?'uphold':'restore');change('reason',c.reason);click('submit');assert.match(modal(),/The audit disagrees/);click('advance');}
  assert.match(modal(),/Your desk is on hold/);click('retry');assert.equal(state().records.length,0);assert.equal(state().strikes,0);assert.match(modal(),/Read past the red flag/);click('begin');assert.match(html(),/PixelPigeon/);
});

test('new-career confirmation, mode choice, and practice selection work',async()=>{
  await boot();begin();click('new');assert.match(modal(),/replaces the current saved career/);click('close');assert.equal(state().mode,'standard');
  selectedMode='practice';click('new');click('confirm-new');assert.equal(state().mode,'practice');assert.match(html(),/PRACTICE DESK/);
});

test('blocked storage and corrupt saves do not stop the desk',async()=>{
  await boot({saved:'not-json'});assert.doesNotMatch(html(),/Continue shift/);begin();assert.equal(state().status,'playing');
  await boot({blocked:true});begin();assert.match(html(),/AUTOSAVE UNAVAILABLE/);click('settings');assert.match(modal(),/UNAVAILABLE/);click('close');click('source','chat');assert.match(html(),/FINDINGS TO CITE/);click('pin','chat:1');click('ruling','restore');change('reason',CASES[0].reason);click('submit');assert.match(modal(),/That ruling stands/);
});

test('mobile template retains all actions and CSS includes touch and motion support',async()=>{
  await boot({width:390});begin();assert.match(html(),/data-action="source"|data-tab="investigate"/);assert.match(html(),/data-action="submit"/);assert.match(html(),/data-action="policy"/);
  const css=await readFile(new URL('../style.css',import.meta.url),'utf8');assert.match(css,/@media\(max-width:650px\)/);assert.match(css,/touch-action:manipulation/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/\.decision-column\{grid-template-columns:1fr\}/);
});
