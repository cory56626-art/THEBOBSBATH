import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLeg, createRig, updateRig, translateBodyForScroll, legPose } from '../crawler-motion.js';
import { tokenize, huntTargets } from '../reader-core.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

test('two-segment knees retain both bone lengths in every quadrant and bend direction', () => {
  const root = {x:17,y:-13};
  for (let angle = -Math.PI; angle < Math.PI; angle += .15) {
    for (const bend of [-1,1]) {
      const target={x:root.x+Math.cos(angle)*80,y:root.y+Math.sin(angle)*80};
      const p=solveLeg(root,target,43,65,bend);
      assert.ok(p.reachable);
      near(dist(root,p.knee),43);near(dist(p.knee,p.toe),65);near(dist(p.toe,target),0);
    }
  }
});

test('an unreachable contact gives a finite closest pose instead of a knee flip or NaN', () => {
  for (const toe of [{x:900,y:900},{x:0,y:0}]) {
    const pose=solveLeg({x:0,y:0},toe,43,65,-1);
    assert.equal(pose.reachable,false);
    for (const p of [pose.knee,pose.toe]) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    near(dist({x:0,y:0},pose.knee),43);
    near(dist(pose.knee,pose.toe),65);
  }
});

test('scrolling moves the body with the viewport while toes hold the same document contact', () => {
  const rig=createRig(150,200,1);
  assert.equal(rig.legs.length,8);assert.equal(rig.legs.filter(l=>l.side<0).length,4);
  const planted=rig.legs.map(l=>({...l.toe}));
  translateBodyForScroll(rig,45);
  near(rig.body.y,245);near(rig.goal.y,245);
  assert.deepEqual(rig.legs.map(l=>l.toe),planted);
});

test('a stride moves the body, plants feet without sliding and lifts no more than three at once', () => {
  const rig=createRig(150,200,1);rig.goal={x:245,y:220};
  let movedBody=false, stableContacts=0;
  for (let frame=0;frame<240;frame++) {
    const before=rig.legs.map(l=>({toe:{...l.toe},steps:l.steps,stepping:l.stepping}));
    updateRig(rig,1/120,frame/120,p=>p);
    assert.ok(rig.legs.filter(l=>l.stepping).length<=3);
    rig.legs.forEach((l,i)=>{
      if (!before[i].stepping && !l.stepping && before[i].steps===l.steps) {
        assert.deepEqual(l.toe,before[i].toe);stableContacts++;
      }
    });
    movedBody ||= rig.body.x>160;
  }
  assert.ok(movedBody);assert.ok(rig.steps>=5);assert.ok(stableContacts>500);
  assert.ok(dist(rig.body,rig.goal)<.2);
});

test('pause freezes body, foot positions, and gait progress', () => {
  const rig=createRig(100,100,1);rig.goal={x:190,y:140};
  updateRig(rig,.05,1,p=>p);
  const before=structuredClone(rig);
  updateRig(rig,.05,2,p=>p,{running:false});
  assert.deepEqual(rig,before);
});

test('rendered toes remain at their planted contacts even with a tightly folded leg', () => {
  const rig=createRig(100,100,1);
  const leg=rig.legs[0];
  leg.toe={x:97,y:94};
  const pose=legPose(rig,leg);
  near(dist(pose.toe,leg.toe),0);
});

test('body motion takes the same time at 15, 30, and 120 frames per second', () => {
  const poses=[];
  for (const fps of [15,30,120]) {
    const rig=createRig(100,100,1);rig.goal={x:210,y:117};
    for(let i=0;i<fps;i++) updateRig(rig,1/fps,i/fps,p=>p);
    poses.push(rig.body);
    assert.ok(dist(rig.body,rig.goal)<.1);
  }
  assert.ok(dist(poses[0],poses[2])<.02);
});

test('the default hunt keeps topic phrases without requiring emotional words', () => {
  const words=tokenize('The web crawler follows visual representation. I love this beautiful idea, but I hate the terrible noise.');
  const targets=huntTargets(words);
  const text=targets.map(t=>words.slice(t.index,t.end+1).map(w=>w.text).join(' '));
  assert.ok(text.includes('web crawler'));
  assert.ok(text.includes('visual representation.'));
  assert.ok(targets.some(t=>t.signal==='neutral'));
  assert.ok(targets.length<words.length/2);
  for (let i=1;i<targets.length;i++) assert.ok(targets[i].index>targets[i-1].end);
  assert.ok(!text.includes('The'));assert.ok(!text.includes('I'));assert.ok(!text.includes('the'));
});

test('5× accelerates the body and leg swing instead of hiding a lower speed cap', () => {
  function settle(pace) {
    const rig=createRig(100,100,1);rig.goal={x:210,y:125};
    for(let i=0;i<2000;i++) {
      updateRig(rig,1/1200,i/1200,p=>p,{pace});
      if(dist(rig.body,rig.goal)<1 && Math.hypot(rig.body.vx,rig.body.vy)<15*pace) return {time:i/1200,rig};
    }
    assert.fail('Body did not settle');
  }
  const normal=settle(1),fast=settle(5);
  assert.ok(normal.time/fast.time>4.7 && normal.time/fast.time<5.3);
  assert.ok(fast.rig.legs.some(l=>l.duration<.05));
  assert.ok(fast.rig.legs.filter(l=>l.stepping).length<=3);
});

test('100× body motion remains finite and settles within a single 30 Hz refresh',()=>{
  const rig=createRig(100,100,1);rig.goal={x:210,y:125};
  updateRig(rig,1/30,1/30,p=>p,{pace:100});
  assert.ok(dist(rig.body,rig.goal)<.01);
  assert.ok(Number.isFinite(rig.body.vx) && Number.isFinite(rig.body.vy));
  assert.ok(rig.legs.some(l=>l.duration<.003));
  for(const leg of rig.legs) {
    const pose=legPose(rig,leg);
    assert.ok(Number.isFinite(pose.knee.x) && Number.isFinite(pose.knee.y));
  }
});

test('phrase targets respect paragraph breaks and empty/function-word inputs do not stall', () => {
  const words=tokenize('robot\n\nspider');
  assert.ok(huntTargets(words).every(t=>t.index===t.end));
  assert.deepEqual(huntTargets([]),[]);
  assert.equal(huntTargets(tokenize('the and it')).length,1);
});
