import test from 'node:test';
import assert from 'node:assert/strict';
import {createRig,updateRig,legPose} from '../crawler-motion.js';
import {createInspection,advanceInspection,releaseInspection,retargetInspection,strokePrefix} from '../crawler-inspection.js';

const box={x:110,y:180,w:90,h:16};
const target={index:3,end:4,signal:'neutral'};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function setup(boxes=[box]) { const rig=createRig(155,245,1);return {rig,state:createInspection(rig,boxes,target)}; }
function advanceTo(rig,state,time,pace=1) {
  let clock=0;
  while(state.time<time && !state.frame.complete) {
    clock+=1/1000;
    updateRig(rig,1/1000,clock,p=>p,{pace});
    advanceInspection(rig,state,1/1000,{pace});
  }
  return state.frame;
}

test('a foreleg reaches the word before ink appears',()=>{
  const {rig,state}=setup();
  const old=structuredClone(rig.legs[state.pointerLeg].toe);
  const frame=advanceInspection(rig,state,.08);
  assert.equal(frame.phase,'reaching');assert.equal(frame.touched,false);
  assert.equal(frame.paths.length,0);assert.equal(frame.progress,0);
  assert.ok(dist(frame.pointer,state.geometry.contacts[0])<dist(old,state.geometry.contacts[0]));
  assert.equal(rig.legs.filter(l=>l.controlled).length,2);
});

test('one leg points while the other physically traces a partial circle',()=>{
  const {rig,state}=setup();
  const frame=advanceTo(rig,state,state.geometry.reachDuration+.2);
  assert.equal(frame.phase,'circling');assert.equal(frame.touched,true);
  assert.ok(frame.progress>0 && frame.progress<1);
  assert.equal(frame.paths.length,1);
  const ink=frame.paths[0];
  assert.ok(ink.points.length<state.geometry.strokes[0].points.length);
  assert.ok(dist(ink.points.at(-1),frame.tip)<1e-7);
  assert.ok(dist(legPose(rig,rig.legs[state.penLeg]).toe,frame.tip)<1e-4);
  assert.ok(dist(legPose(rig,rig.legs[state.pointerLeg]).toe,state.geometry.contacts[0])<1e-4);
});

test('the pen draws the underline too, and completed ink remains after release',()=>{
  const {rig,state}=setup();
  const underline=state.geometry.strokes.find(s=>s.kind==='underline');
  const frame=advanceTo(rig,state,state.geometry.reachDuration+underline.start+underline.duration*.5);
  assert.equal(frame.phase,'underlining');
  assert.ok(dist(frame.paths.at(-1).points.at(-1),rig.legs[state.penLeg].toe)<1e-7);
  advanceTo(rig,state,state.geometry.total);
  const toe={...rig.legs[state.penLeg].toe};
  releaseInspection(rig,state);
  assert.ok(rig.legs.every(l=>!l.controlled));
  assert.deepEqual(rig.legs[state.penLeg].toe,toe);
  assert.equal(state.frame.complete,true);assert.equal(state.frame.progress,1);
  assert.ok(state.frame.paths.some(p=>p.kind==='circle'));
  assert.ok(state.frame.paths.some(p=>p.kind==='underline'));
});

test('pausing freezes the actual pen, pointer, joints, and unfinished line',()=>{
  const {rig,state}=setup();advanceTo(rig,state,.5);
  const beforeRig=structuredClone(rig),beforeTime=state.time,beforeFrame=structuredClone(state.frame);
  updateRig(rig,.1,5,p=>p,{running:false});
  advanceInspection(rig,state,.1,{running:false});
  assert.deepEqual(rig,beforeRig);assert.equal(state.time,beforeTime);assert.deepEqual(state.frame,beforeFrame);
});

test('the six supporting legs keep at least four planted while the hands mark',()=>{
  const {rig,state}=setup();rig.goal.x+=40;
  for(let i=0;i<150;i++) {
    updateRig(rig,1/120,i/120,p=>p);
    advanceInspection(rig,state,1/120);
    const supporting=rig.legs.filter(l=>!l.controlled);
    assert.equal(supporting.length,6);
    assert.ok(supporting.filter(l=>l.stepping).length<=2);
    assert.ok(dist(rig.legs[state.penLeg].toe,state.frame.tip)<1e-7);
  }
});

test('the complete reach, circle, underline and hold run five times faster at 5×',()=>{
  function duration(pace) {
    const {rig,state}=setup();let elapsed=0;
    while(!state.frame.complete) {advanceInspection(rig,state,1/1000,{pace});elapsed+=1/1000;}
    return {elapsed,state};
  }
  const normal=duration(1),fast=duration(5);
  assert.ok(normal.elapsed/fast.elapsed>4.95 && normal.elapsed/fast.elapsed<5.05);
  assert.ok(dist(normal.state.frame.tip,fast.state.frame.tip)<1e-7);
});

test('wrapped phrases get separate loops and a lifted pen between rows',()=>{
  const {rig,state}=setup([box,{x:80,y:213,w:70,h:16}]);
  const crossing=state.geometry.strokes.find(s=>s.kind==='travel' && s.pointerFrom.y!==s.pointerTo.y);
  assert.ok(crossing);
  const frame=advanceTo(rig,state,state.geometry.reachDuration+crossing.start+crossing.duration*.5);
  assert.equal(frame.penDown,false);
  assert.ok(frame.paths.every(p=>p.ink));
  advanceTo(rig,state,state.geometry.total);
  assert.equal(state.frame.paths.filter(p=>p.kind==='circle').length,2);
  assert.equal(state.frame.paths.filter(p=>p.kind==='underline').length,2);
});

test('layout changes move the partial marks and their pen together',()=>{
  const {rig,state}=setup();advanceTo(rig,state,.5);
  const old=structuredClone(state.frame);
  retargetInspection(state,[{...box,x:box.x+40,y:box.y+80}]);
  assert.ok(Math.abs(old.progress-state.frame.progress)<1e-7);
  assert.ok(dist(state.frame.tip,{x:old.tip.x+40,y:old.tip.y+80})<1e-7);
  assert.ok(dist(state.frame.paths.at(-1).points.at(-1),state.frame.tip)<1e-7);
});

test('resizing a paused reader reattaches both hands without advancing the ink',()=>{
  const {rig,state}=setup();advanceTo(rig,state,.5);
  const time=state.time;
  retargetInspection(state,[{...box,x:box.x+40,y:box.y+80}]);
  const reflowedRig=createRig(180,330,1);
  advanceInspection(reflowedRig,state,.1,{running:false});
  assert.equal(state.time,time);
  assert.ok(dist(legPose(reflowedRig,reflowedRig.legs[state.penLeg]).toe,state.frame.tip)<1e-7);
  assert.ok(dist(legPose(reflowedRig,reflowedRig.legs[state.pointerLeg]).toe,state.frame.pointer)<1e-7);
  assert.ok(dist(state.frame.paths.at(-1).points.at(-1),state.frame.tip)<1e-7);
});

test('arc-length prefixes never draw farther than their tip and reduced motion still completes',()=>{
  const {rig,state}=setup();
  const circle=state.geometry.strokes[0];
  for(const u of [0,.1,.5,.9,1]) {
    const prefix=strokePrefix(circle,u);
    assert.deepEqual(prefix.tip,prefix.points.at(-1));
  }
  advanceInspection(rig,state,.016,{reduced:true});
  assert.equal(state.frame.complete,true);assert.equal(state.frame.progress,1);
  assert.ok(dist(state.frame.tip,rig.legs[state.penLeg].toe)<1e-7);
});
