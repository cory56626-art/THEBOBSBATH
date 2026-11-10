import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTACT_PHASE,KEYS,graphemes,strokeFor,createTyper,advanceTyper,typerFrame,handPoses} from '../omega-typer.js';

const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

test('a character appears at its fingertip contact, never during the reach',()=>{
  const state=createTyper('f');
  advanceTyper(state,state.units[0].duration*(CONTACT_PHASE-.01));
  assert.equal(state.offset,0);
  advanceTyper(state,state.units[0].duration*.01);
  assert.equal(state.text.slice(0,state.offset),'f');
  const frame=typerFrame(state),hands=handPoses(state);
  const finger=hands.find(h=>h.side==='left').fingers.find(f=>f.finger==='index');
  assert.equal(frame.keyDown,true);assert.equal(finger.down,true);
  assert.ok(dist(finger.points.at(-1),frame.unit.key.center)<1e-8);
});

test('each key press preserves the exact source, including spaces, tabs, markup and Unicode',()=>{
  const text='  Hello, WORLD!\n\n\tCafé e\u0301 世界 👨‍👩‍👧‍👦 <b>&</b>\n ';
  const state=createTyper(text),seen=[];let before=0;
  while(!state.complete) {
    advanceTyper(state,.0001);
    if(state.offset!==before) {seen.push(state.text.slice(before,state.offset));before=state.offset;}
  }
  assert.deepEqual(seen,graphemes(text));
  assert.equal(state.text.slice(0,state.offset),text);
  assert.equal(state.emitted,graphemes(text).length);
});

test('pausing freezes output, key pressure, wrists and every finger joint',()=>{
  const state=createTyper('The omega typer');advanceTyper(state,.06);
  const before=structuredClone(state),pose=handPoses(state);
  advanceTyper(state,100,{running:false,pace:100});
  assert.deepEqual(state,before);assert.deepEqual(handPoses(state),pose);
});

test('both hands have five articulated fingers and shift uses the opposite pinky',()=>{
  for(const character of ['A','J','!','?']) {
    const state=createTyper(character);
    advanceTyper(state,state.units[0].duration*CONTACT_PHASE);
    const frame=typerFrame(state),hands=handPoses(state);
    assert.equal(hands.length,2);assert.ok(hands.every(h=>h.fingers.length===5));
    assert.ok(hands.every(h=>h.fingers.every(f=>f.points.length===4)));
    const pressed=hands.flatMap(h=>h.fingers.filter(f=>f.down).map(f=>({hand:h.side,...f})));
    assert.equal(pressed.length,2);
    assert.ok(pressed.some(f=>f.hand===frame.unit.hand && f.key.id===frame.unit.key.id));
    assert.ok(pressed.some(f=>f.hand!==frame.unit.hand && f.finger==='pinky' && f.key.id===frame.unit.shiftKey.id));
    for(const finger of pressed) assert.ok(dist(finger.points.at(-1),finger.key.center)<1e-8);
  }
});

test('letters, punctuation, whitespace and composed characters resolve to real keys',()=>{
  const expected={'!':'1','@':'2','?':'/','"':"'",'<':',','>':'.','{':'[','}':']',' ':'Space','\n':'Enter','\t':'Tab','界':'Compose','🙂':'Compose'};
  const ids=new Set(KEYS.map(k=>k.id));
  for(const [text,key] of Object.entries(expected)) {assert.equal(strokeFor(text).key.id,key);assert.ok(ids.has(key));}
  for(const c of 'abcdefghijklmnopqrstuvwxyz0123456789') assert.equal(strokeFor(c).key.id,c);
});

test('100× types many characters per refresh without omissions or duplicated keystrokes',()=>{
  const text=Array(30).fill('Exact copy.\n').join('');
  for(const fps of [30,60,120]) {
    const state=createTyper(text);let elapsed=0,batch=0;
    while(!state.complete) {
      const before=state.emitted;
      advanceTyper(state,1/fps,{pace:100});elapsed+=1/fps;
      batch=Math.max(batch,state.emitted-before);
      assert.ok(elapsed<state.total/100+1);
    }
    assert.equal(state.text.slice(0,state.offset),text);assert.equal(state.emitted,state.units.length);
    assert.ok(batch>1);assert.ok(Math.abs(elapsed-state.total/100)<=1/fps+1e-8);
  }
});

test('changing speed mid-copy continues from the same character and pause position',()=>{
  const state=createTyper('Never restart the sentence.');
  advanceTyper(state,.4);const oldOffset=state.offset,oldTime=state.time;
  advanceTyper(state,.001,{pace:100});
  assert.ok(state.time>oldTime && state.offset>=oldOffset);
  advanceTyper(state,100,{pace:100});
  assert.equal(state.text.slice(0,state.offset),'Never restart the sentence.');
});

test('empty, whitespace-only, long and reduced-motion inputs remain safe',()=>{
  assert.equal(createTyper('').complete,true);
  for(const text of [' \n\t ','x'.repeat(30100)]) {
    const state=createTyper(text);advanceTyper(state,100,{pace:100});
    assert.equal(state.text.slice(0,state.offset),text.slice(0,30000));assert.equal(state.complete,true);
    assert.ok(handPoses(state,{reduced:true}).every(h=>h.fingers.every(f=>f.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))));
  }
});
