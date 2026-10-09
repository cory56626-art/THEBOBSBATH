import {CASE_MAP, SHIFTS} from './cases.mjs';

export const SAVE_KEY = 'latch-appeals-career-v1';
export const RULINGS = {restore:'Restore account', uphold:'Uphold ban', escalate:'Escalate review'};
const copy = value => JSON.parse(JSON.stringify(value));
export function newCareer(mode = 'standard') {
  return {version:1, mode:mode === 'practice' ? 'practice' : 'standard', shift:0, active:SHIFTS[0].ids[0], status:'briefing', integrity:100, strikes:0, earnings:0, minutes:0, overtime:0, records:[], files:{}, checkpoint:null};
}
export const currentShift = state => SHIFTS[state.shift];
export const currentCase = state => CASE_MAP[state.active];
export function fileState(state, id = state.active) {
  if (!state.files[id]) state.files[id] = {opened:[], pins:[], decision:'', reason:'', note:''};
  return state.files[id];
}
export const completedCount = state => currentShift(state).ids.filter(id => state.files[id]?.result).length;
export const accuracy = state => state.records.length ? Math.round(state.records.filter(r => r.correct).length / state.records.length * 100) : 100;
export function beginShift(state) {
  if (state.status !== 'briefing') return false;
  state.checkpoint = copy({...state, checkpoint:null});
  state.status = 'playing';
  return true;
}
function spend(state, amount) {
  state.minutes += amount;
  const overtime = Math.ceil(Math.max(0, state.minutes - currentShift(state).minutes) / 10);
  if (state.mode === 'standard') state.integrity = Math.max(0, state.integrity - Math.max(0, overtime - state.overtime) * 2);
  state.overtime = overtime;
}
export function selectCase(state, id) {
  if (state.status !== 'playing' || !currentShift(state).ids.includes(id) || state.files[id]?.result) return false;
  state.active = id;
  return true;
}
export function investigate(state, sourceId) {
  if (state.status !== 'playing') return {ok:false, message:'Finish the current review first.'};
  const c = currentCase(state), f = fileState(state), source = c.sources.find(d => d.id === sourceId);
  if (!source) return {ok:false, message:'Record unavailable.'};
  if (source.requires && !f.opened.includes(source.requires)) return {ok:false, message:'Open session records first to request this audit.'};
  if (f.opened.includes(sourceId)) return {ok:true, charged:0};
  f.opened.push(sourceId);
  spend(state, source.cost);
  return {ok:true, charged:source.cost};
}
export function togglePin(state, findingId) {
  if (state.status !== 'playing') return {ok:false, message:'This review has already been submitted.'};
  const c = currentCase(state), f = fileState(state);
  if (!c.sources.some(d => f.opened.includes(d.id) && d.findings.some(k => k.id === findingId))) return {ok:false, message:'Inspect the source before citing a finding.'};
  if (f.pins.includes(findingId)) { f.pins = f.pins.filter(k => k !== findingId); return {ok:true}; }
  if (f.pins.length >= 3) return {ok:false, message:'Cite up to three findings. Unpin one to make room.'};
  f.pins.push(findingId);
  return {ok:true};
}
export function chooseRuling(state, ruling) {
  if (state.status !== 'playing' || !Object.hasOwn(RULINGS, ruling)) return false;
  fileState(state).decision = ruling;
  return true;
}
export function chooseReason(state, reason) {
  if (state.status !== 'playing' || !currentCase(state).reasons.includes(reason)) return false;
  fileState(state).reason = reason;
  return true;
}
export function submit(state) {
  if (state.status !== 'playing') return {ok:false, message:'This review has already been submitted.'};
  const c = currentCase(state), f = fileState(state);
  if (!Object.hasOwn(RULINGS, f.decision)) return {ok:false, message:'Choose a ruling first.'};
  if (!c.reasons.includes(f.reason)) return {ok:false, message:'Choose the reason for your ruling.'};
  if (!f.pins.length) return {ok:false, message:'Pin at least one finding from a record you inspected.'};
  spend(state, 6);
  const correct = f.decision === c.answer;
  const reasonCorrect = f.reason === c.reason;
  const supported = c.decisive.every(group => group.some(k => f.pins.includes(k)));
  const grade = !correct ? 'overturned' : reasonCorrect && supported ? 'substantiated' : 'incomplete';
  const pay = grade === 'substantiated' ? 55 : grade === 'incomplete' ? 35 : 0;
  const result = {caseId:c.id, shift:state.shift, chosen:f.decision, correct, reasonCorrect, supported, grade, pay, pins:[...f.pins], reason:f.reason};
  f.result = result;
  state.records.push(result);
  state.earnings += pay;
  state.integrity = Math.max(0, Math.min(100, state.integrity + (grade === 'substantiated' ? 2 : grade === 'incomplete' ? -4 : -18)));
  if (!correct) state.strikes++;
  state.status = 'feedback';
  return {ok:true, result};
}
export function advance(state) {
  if (state.status !== 'feedback') return false;
  if (state.mode === 'standard' && state.strikes >= 3) {state.status = 'fired'; return true;}
  const next = currentShift(state).ids.find(id => !state.files[id]?.result);
  if (next) {state.active = next; state.status = 'playing';}
  else state.status = 'report';
  return true;
}
export function nextShift(state) {
  if (state.status !== 'report') return false;
  if (state.shift === SHIFTS.length - 1) {state.status = 'complete'; return true;}
  state.shift++;
  state.active = currentShift(state).ids[0];
  state.minutes = 0;
  state.overtime = 0;
  state.files = {};
  state.status = 'briefing';
  state.checkpoint = null;
  return true;
}
export function retryShift(state) {
  return state.checkpoint ? copy(state.checkpoint) : newCareer(state.mode);
}
export function shiftStats(state) {
  const records = state.records.filter(r => r.shift === state.shift);
  return {count:records.length, correct:records.filter(r => r.correct).length, thorough:records.filter(r => r.grade === 'substantiated').length, pay:records.reduce((a,r) => a + r.pay, 0), overtime:Math.max(0, state.minutes - currentShift(state).minutes)};
}
export function finalRank(state) {
  const correct = accuracy(state), thorough = state.records.filter(r => r.grade === 'substantiated').length;
  if (correct === 100 && thorough === 25 && state.integrity >= 90) return ['Lead investigator','Every ruling was correct, reasoned, and supported. This is what human review is supposed to look like.'];
  if (correct >= 92 && state.integrity >= 65) return ['Senior reviewer','You caught the important distinctions. There is a permanent seat waiting for you at the senior desk.'];
  if (correct >= 80) return ['Appeals reviewer','You made it through the week. Keep checking original records and make your reasons as strong as your rulings.'];
  return ['Extended probation','The desk needs more consistent decisions. Work through the audit notes and try another week.'];
}

// Only accept saves matching the current campaign. Notes are rendered as text.
export function restoreCareer(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || s.version !== 1 || !['standard','practice'].includes(s.mode) || !Number.isInteger(s.shift) || !SHIFTS[s.shift]) return null;
    if (!['briefing','playing','feedback','report','fired','complete'].includes(s.status) || !SHIFTS[s.shift].ids.includes(s.active)) return null;
    for (const key of ['integrity','strikes','earnings','minutes','overtime']) if (!Number.isFinite(s[key]) || s[key] < 0) return null;
    if (s.integrity > 100 || !Number.isInteger(s.strikes) || !Array.isArray(s.records) || s.records.length > 25 || !s.files || typeof s.files !== 'object' || Array.isArray(s.files)) return null;
    const seen = new Set();
    for (const r of s.records) {
      const c = CASE_MAP[r.caseId];
      if (!c || seen.has(r.caseId) || !Number.isInteger(r.shift) || !SHIFTS[r.shift]?.ids.includes(r.caseId) || r.shift > s.shift || !Object.hasOwn(RULINGS,r.chosen) || typeof r.correct !== 'boolean' || typeof r.reasonCorrect !== 'boolean' || typeof r.supported !== 'boolean' || !['substantiated','incomplete','overturned'].includes(r.grade) || ![0,35,55].includes(r.pay) || !Array.isArray(r.pins) || !c.reasons.includes(r.reason)) return null;
      seen.add(r.caseId);
    }
    for (const [id,f] of Object.entries(s.files)) {
      const c = CASE_MAP[id];
      if (!c || !SHIFTS[s.shift].ids.includes(id) || !f || !Array.isArray(f.opened) || !Array.isArray(f.pins) || f.pins.length > 3 || typeof f.note !== 'string' || f.note.length > 4000 || typeof f.decision !== 'string' || typeof f.reason !== 'string') return null;
      if (f.opened.some(k => !c.sources.some(d => d.id === k)) || f.pins.some(k => !c.sources.some(d => f.opened.includes(d.id) && d.findings.some(p => p.id === k)))) return null;
      if (f.result && !s.records.some(r => r.caseId === id && JSON.stringify(r) === JSON.stringify(f.result))) return null;
    }
    for (const r of s.records.filter(r => r.shift === s.shift)) if (!s.files[r.caseId]?.result) return null;
    if (s.status === 'feedback' && !s.files[s.active]?.result) return null;
    if (['report','complete'].includes(s.status) && !SHIFTS[s.shift].ids.every(id => s.files[id]?.result)) return null;
    if (s.status === 'complete' && s.shift !== SHIFTS.length - 1) return null;
    if (s.status === 'fired' && (s.mode !== 'standard' || s.strikes < 3)) return null;
    if (s.checkpoint) {
      const checkpoint = restoreCareer(JSON.stringify({...s.checkpoint, checkpoint:null}));
      if (!checkpoint || checkpoint.status !== 'briefing' || checkpoint.shift !== s.shift || checkpoint.mode !== s.mode) return null;
      s.checkpoint = checkpoint;
    }
    return s;
  } catch {return null;}
}
