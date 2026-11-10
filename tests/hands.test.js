import test from 'node:test';
import assert from 'node:assert/strict';
import {createTyper,advanceTyper,handPoses} from '../omega-typer.js';
import {keyTrails} from '../omega-hands.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
const finger=(state,side,name)=>handPoses(state).find(h=>h.side===side).fingers.find(f=>f.finger===name);

test('a finger travels directly between successive keys instead of resetting at each letter',()=>{
  const state=createTyper('frf');
  advanceTyper(state,state.units[1].start);
  const index=finger(state,'left','index');
  assert.equal(index.key.id,'r');
  assert.equal(index.down,false);
  assert.ok(index.worldPoints[3].z>10,'the finger lifts in an arc between keys');
  assert.ok(distance(index.points[3],state.units[0].key.center)>8);
  const next=state.units[1].key.center;
  assert.ok(distance(index.worldPoints[3],{x:next.x-310,y:325-next.y,z:0})>10);
});

test('the next hand prepares its key before the current hand finishes typing',()=>{
  const state=createTyper('fj');
  const initial=finger(state,'right','index').points[3];
  advanceTyper(state,state.units[0].contact);
  assert.equal(state.index,0);
  assert.ok(distance(initial,finger(state,'right','index').points[3])>4);
  assert.equal(finger(state,'left','index').down,true);
});

test('all three bones retain their lengths and contacting fingertips meet the actual keys',()=>{
  const state=createTyper('The quick brown fox jumps over the lazy dog. QAZ WSX EDC RFV 12345 !@#$% 世界');
  for(const stroke of state.units) {
    advanceTyper(state,stroke.contact-state.time);
    for(const hand of handPoses(state))for(const f of hand.fingers) {
      for(let i=0;i<3;i++)assert.ok(Math.abs(distance(f.worldPoints[i],f.worldPoints[i+1])-f.bones[i])<1e-7);
      if(f.down)assert.ok(distance(f.points[3],f.key.center)<1e-6);
    }
    assert.equal(finger(state,stroke.hand,stroke.finger).down,true);
  }
});

test('releasing a key and changing letters do not teleport joints or wrists',()=>{
  const state=createTyper('qaz frft ghjk !@#$%\nThe omega typer');
  let previous=handPoses(state);
  while(!state.complete) {
    advanceTyper(state,.001);
    const current=handPoses(state);
    for(let h=0;h<2;h++) {
      assert.ok(distance(previous[h].wrist,current[h].wrist)<3);
      for(let f=0;f<5;f++)for(let j=0;j<4;j++)assert.ok(distance(previous[h].fingers[f].points[j],current[h].fingers[f].points[j])<3);
    }
    previous=current;
  }
});

test('wrists translate and rotate through a passage instead of holding a flat pose',()=>{
  const state=createTyper('qaz WSX rftg YHNUJMIK 12345 !@#$%');
  const poses=[];
  while(!state.complete){advanceTyper(state,1/120);poses.push(handPoses(state));}
  for(let h=0;h<2;h++) {
    const range=field=>Math.max(...poses.map(p=>p[h].pose[field]))-Math.min(...poses.map(p=>p[h].pose[field]));
    assert.ok(range('y')>15);
    assert.ok(range('yaw')+range('roll')+range('pitch')>.10);
  }
});

test('the hand springs produce consistent poses at 30 and 120 refreshes per second',()=>{
  function at(fps) {
    const state=createTyper('quiet zippers and faraway keyboards');
    for(let i=0;i<fps;i++)advanceTyper(state,1/fps);
    return handPoses(state);
  }
  const slow=at(30),fast=at(120);
  for(let h=0;h<2;h++) {
    assert.ok(distance(slow[h].wrist,fast[h].wrist)<.5);
    for(let f=0;f<5;f++)for(let j=0;j<4;j++)assert.ok(distance(slow[h].fingers[f].points[j],fast[h].fingers[f].points[j])<.8);
  }
});

test('the last key releases smoothly before the copy is marked complete',()=>{
  const state=createTyper('fj');
  advanceTyper(state,state.typingEnd-.0005);
  const before=handPoses(state);
  advanceTyper(state,.001);
  const after=handPoses(state);
  assert.equal(state.offset,state.text.length);
  assert.equal(state.complete,false);
  for(let h=0;h<2;h++)for(let f=0;f<5;f++)for(let j=0;j<4;j++)assert.ok(distance(before[h].fingers[f].points[j],after[h].fingers[f].points[j])<1);
  advanceTyper(state,1);
  assert.equal(state.complete,true);
});

test('several key lights linger, pause freezes them, and old lights fade',()=>{
  const state=createTyper('asdfgh');advanceTyper(state,.45);
  const before=[...keyTrails(state)];assert.ok(before.length>=4);
  advanceTyper(state,1,{running:false,pace:100});
  assert.deepEqual([...keyTrails(state)],before);
  advanceTyper(state,1);
  assert.equal(keyTrails(state).has('a'),false);
});
