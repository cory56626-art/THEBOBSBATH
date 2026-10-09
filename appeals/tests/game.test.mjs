import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES, CASE_MAP, SHIFTS} from '../cases.mjs';
import {newCareer, restoreCareer, beginShift, investigate, togglePin, chooseRuling, chooseReason, selectCase, submit, advance, nextShift, retryShift, currentCase, completedCount, accuracy, fileState, finalRank} from '../engine.mjs';

function atCase(c, mode = 'standard') {
  const s = newCareer(mode); s.shift=SHIFTS.findIndex(shift => shift.ids.includes(c.id));s.active=c.id;beginShift(s);return s;
}
function inspectAll(s) {for (const d of currentCase(s).sources) assert.equal(investigate(s,d.id).ok,true);}
function correctFile(s) {
  const c=currentCase(s);inspectAll(s);
  for (const group of c.decisive) assert.equal(togglePin(s,group[0]).ok,true);
  chooseRuling(s,c.answer);chooseReason(s,c.reason);return submit(s);
}

test('25 unique cases cover five shifts exactly once with coherent evidence', () => {
  assert.equal(CASES.length,25);assert.equal(SHIFTS.length,5);
  const ids=SHIFTS.flatMap(shift => shift.ids);assert.equal(new Set(ids).size,25);
  assert.deepEqual([...ids].sort(),CASES.map(c => c.id).sort());
  assert.ok(new Set(CASES.map(c => c.answer)).size===3);
  for (const c of CASES) {
    assert.ok(c.reasons.includes(c.reason));assert.equal(new Set(c.sources.map(d => d.id)).size,c.sources.length);
    assert.ok(c.decisive.length>=1 && c.decisive.length<=3);
    for (const group of c.decisive) for (const finding of group) assert.ok(c.sources.some(d => d.findings.some(k => k.id===finding)),`${c.id} missing ${finding}`);
    for (const d of c.sources) {assert.ok(d.cost>0);assert.ok(!d.requires || c.sources.some(s => s.id===d.requires));}
  }
});

for (const c of CASES) test(`${c.id}: ${c.user} has a substantiated, reachable solution`, () => {
  const s=atCase(c);const answer=correctFile(s);
  assert.equal(answer.ok,true);assert.equal(answer.result.grade,'substantiated');assert.equal(s.earnings,55);assert.equal(s.strikes,0);
  assert.equal(submit(s).ok,false,'cannot submit twice');assert.equal(s.records.length,1);
  assert.ok(restoreCareer(JSON.stringify(s)),'feedback save survives');
});

test('a full perfect career completes all shifts without unavoidable overtime', () => {
  const s=newCareer();
  for (let shift=0;shift<5;shift++) {
    assert.equal(s.shift,shift);assert.equal(s.status,'briefing');beginShift(s);
    for (let n=0;n<SHIFTS[shift].ids.length;n++) {correctFile(s);advance(s);}
    assert.equal(s.status,'report');assert.equal(completedCount(s),SHIFTS[shift].ids.length);
    assert.ok(s.minutes<=SHIFTS[shift].minutes,`shift ${shift+1} has ${s.minutes} min required but ${SHIFTS[shift].minutes} available`);
    assert.ok(restoreCareer(JSON.stringify(s)));nextShift(s);
  }
  assert.equal(s.status,'complete');assert.equal(s.records.length,25);assert.equal(s.earnings,1375);assert.equal(accuracy(s),100);assert.equal(s.integrity,100);assert.equal(finalRank(s)[0],'Lead investigator');assert.ok(restoreCareer(JSON.stringify(s)));
});

test('opening an audit requires sessions and rereading costs zero', () => {
  const s=atCase(CASE_MAP['A-1073']);assert.equal(investigate(s,'audit').ok,false);assert.equal(s.minutes,0);
  assert.equal(investigate(s,'sessions').ok,true);assert.equal(s.minutes,8);
  assert.equal(investigate(s,'sessions').charged,0);assert.equal(s.minutes,8);
  assert.equal(investigate(s,'audit').ok,true);assert.equal(s.minutes,18);
});

test('uninspected evidence cannot be pinned and pinning is capped at three', () => {
  const s=atCase(CASE_MAP['A-1042']);assert.equal(togglePin(s,'chat:1').ok,false);inspectAll(s);
  for (const id of ['chat:0','chat:1','report:0']) assert.equal(togglePin(s,id).ok,true);
  assert.equal(togglePin(s,'history:0').ok,false);assert.equal(fileState(s).pins.length,3);
  assert.equal(togglePin(s,'chat:0').ok,true);assert.equal(togglePin(s,'history:0').ok,true);
});

test('ruling, policy reason, and inspected citation are all required', () => {
  const s=atCase(CASES[0]);assert.equal(submit(s).ok,false);
  chooseRuling(s,'restore');assert.equal(submit(s).ok,false);
  assert.equal(chooseReason(s,'made up reason'),false);chooseReason(s,CASES[0].reason);assert.equal(submit(s).ok,false);
  investigate(s,'chat');togglePin(s,'chat:1');assert.equal(submit(s).ok,true);
});

test('corroboration needs every decisive source, not just a correct verdict', () => {
  const c=CASE_MAP['A-1103'],s=atCase(c);inspectAll(s);togglePin(s,'chat:0');chooseRuling(s,c.answer);chooseReason(s,c.reason);
  const r=submit(s).result;assert.equal(r.correct,true);assert.equal(r.supported,false);assert.equal(r.grade,'incomplete');assert.equal(r.pay,35);assert.equal(s.strikes,0);assert.equal(s.integrity,96);
});

test('a correct verdict with a wrong reason gets an incomplete audit', () => {
  const c=CASES[0],s=atCase(c);inspectAll(s);togglePin(s,'chat:1');chooseRuling(s,c.answer);chooseReason(s,c.reasons.find(r => r!==c.reason));
  const r=submit(s).result;assert.equal(r.grade,'incomplete');assert.equal(r.supported,true);assert.equal(r.reasonCorrect,false);assert.equal(s.strikes,0);
});

test('three wrong rulings dismiss standard mode and retry restores the whole shift', () => {
  const s=newCareer();beginShift(s);
  for (let n=0;n<3;n++) {const c=currentCase(s);inspectAll(s);togglePin(s,c.sources[0].findings[0].id);chooseRuling(s,c.answer==='restore' ? 'uphold' : 'restore');chooseReason(s,c.reason);assert.equal(submit(s).result.grade,'overturned');advance(s);}
  assert.equal(s.status,'fired');assert.equal(s.strikes,3);assert.equal(s.records.length,3);assert.ok(restoreCareer(JSON.stringify(s)));
  const retry=retryShift(s);assert.equal(retry.status,'briefing');assert.equal(retry.strikes,0);assert.equal(retry.minutes,0);assert.equal(retry.records.length,0);assert.equal(retry.earnings,0);assert.equal(retry.integrity,100);
});

test('retrying a later shift preserves all prior pay and records', () => {
  const s=newCareer();beginShift(s);for(let n=0;n<4;n++){correctFile(s);advance(s);}nextShift(s);beginShift(s);
  const c=currentCase(s);inspectAll(s);togglePin(s,c.sources[0].findings[0].id);chooseRuling(s,'uphold');chooseReason(s,c.reason);submit(s);
  const retry=retryShift(s);assert.equal(retry.shift,1);assert.equal(retry.records.length,4);assert.equal(retry.earnings,220);assert.equal(retry.strikes,0);assert.equal(retry.status,'briefing');assert.ok(restoreCareer(JSON.stringify(retry)));
});

test('practice mode survives 25 incorrect rulings', () => {
  const s=newCareer('practice');
  for(let shift=0;shift<5;shift++) {beginShift(s);for(let n=0;n<SHIFTS[shift].ids.length;n++){const c=currentCase(s);inspectAll(s);togglePin(s,c.sources[0].findings[0].id);chooseRuling(s,c.answer==='restore' ? 'uphold' : 'restore');chooseReason(s,c.reason);submit(s);advance(s);}assert.equal(s.status,'report');nextShift(s);}
  assert.equal(s.status,'complete');assert.equal(s.strikes,25);assert.equal(s.earnings,0);assert.equal(accuracy(s),0);assert.ok(restoreCareer(JSON.stringify(s)));
});

test('overtime is charged once per started ten-minute block only in career', () => {
  const s=atCase(CASES[0]);s.minutes=120;investigate(s,'report');assert.equal(s.integrity,98);investigate(s,'chat');assert.equal(s.integrity,96);investigate(s,'chat');assert.equal(s.integrity,96);
  const p=atCase(CASES[0],'practice');p.minutes=120;investigate(p,'report');investigate(p,'chat');assert.equal(p.integrity,100);
});

test('queue switching keeps each case’s records, reason, and notes separate', () => {
  const s=atCase(CASES[0]);investigate(s,'chat');togglePin(s,'chat:1');chooseReason(s,CASES[0].reason);fileState(s).note='Quote is a complaint.';
  assert.equal(selectCase(s,CASES[1].id),true);assert.deepEqual(fileState(s).opened,[]);assert.equal(fileState(s).note,'');
  assert.equal(selectCase(s,'A-1161'),false);assert.equal(selectCase(s,CASES[0].id),true);assert.equal(fileState(s).note,'Quote is a complaint.');assert.deepEqual(fileState(s).pins,['chat:1']);
});

test('save validation rejects malformed, incompatible, and unreachable states', () => {
  for(const raw of ['invalid','null','{}','[]','{"version":9}']) assert.equal(restoreCareer(raw),null);
  for(const mutate of [s=>s.shift=99,s=>s.minutes=-1,s=>s.integrity=101,s=>s.active='not-a-case',s=>s.files=[] ,s=>s.status='feedback',s=>s.status='complete']) {const s=newCareer();mutate(s);assert.equal(restoreCareer(JSON.stringify(s)),null);}
  const s=atCase(CASES[0]);fileState(s).pins=['audit:missing'];assert.equal(restoreCareer(JSON.stringify(s)),null);
});

test('notes and opened evidence survive an in-progress save and reload', () => {
  const s=atCase(CASES[0]);investigate(s,'chat');togglePin(s,'chat:1');fileState(s).note='<script>not markup</script> & notes';chooseRuling(s,'restore');chooseReason(s,CASES[0].reason);
  const restored=restoreCareer(JSON.stringify(s));assert.ok(restored);assert.equal(fileState(restored).note,fileState(s).note);assert.equal(submit(restored).result.grade,'substantiated');
});

test('actions cannot change a completed or feedback state', () => {
  const s=atCase(CASES[0]);correctFile(s);const before=JSON.stringify(s);
  assert.equal(selectCase(s,CASES[1].id),false);assert.equal(investigate(s,'chat').ok,false);assert.equal(togglePin(s,'chat:1').ok,false);assert.equal(chooseReason(s,CASES[0].reason),false);assert.equal(chooseRuling(s,'uphold'),false);assert.equal(nextShift(s),false);assert.equal(JSON.stringify(s),before);
});
