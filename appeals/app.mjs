import {CASES, CASE_MAP, SHIFTS, POLICY} from './cases.mjs';
import {SAVE_KEY, RULINGS, newCareer, restoreCareer, currentShift, currentCase, fileState, completedCount, accuracy, beginShift, investigate, selectCase, togglePin, chooseRuling, chooseReason, submit, advance, nextShift, retryShift, shiftStats, finalRank} from './engine.mjs';

const app = document.querySelector('#app');
const overlay = document.querySelector('#overlay');
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  arrow:'M4 14 14 4M4 4h10v10', back:'M15 9H3m5-5-5 5 5 5', search:'M12 12l5 5M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
  pin:'m7 2 5 0-1 5 4 4H4l4-4-1-5M9 11v6', check:'m3 9 4 4 8-9', close:'m4 4 10 10M14 4 4 14',
  file:'M11 2H4v14h11V6l-4-4v4h4M6 9h6M6 12h6', book:'M9 4C6 2 3 2 1 3v12c3-1 6 0 8 1 2-1 5-2 8-1V3c-2-1-5-1-8 1v12',
  settings:'M9 6v6M6 9h6M9 2a7 7 0 1 1 0 14A7 7 0 0 1 9 2', logout:'M7 2H2v14h5M6 9h11m-4-4 4 4-4 4',
  chat:'M2 3h14v10H7l-5 3V3M5 6h8M5 9h5', terminal:'m3 5 4 4-4 4M9 13h5', lock:'M4 8h10v8H4V8m2 0V5a3 3 0 0 1 6 0v3M9 11v2',
  shield:'M9 1 2 4v5c0 4 7 8 7 8s7-4 7-8V4L9 1m-4 8 3 3 5-6', clock:'M9 2a7 7 0 1 0 0 14A7 7 0 0 0 9 2m0 3v4l3 2',
  info:'M9 2a7 7 0 1 0 0 14A7 7 0 0 0 9 2m0 6v5M9 5h.01', award:'M9 1 11 4l4 1v4l2 3-3 2-1 3-4-1-4 1-1-3-3-2 2-3V5l4-1 2-3m-3 8 2 2 4-4'
};
const icon = name => `<svg class="icon" viewBox="0 0 18 18" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
const money = n => `$${n.toLocaleString('en-US')}`;
let career = null, saved = null, view = {tab:'appeal', source:null}, transient = null;
let sound = false, audioContext = null, toastTimer, saveTimer, storageAvailable = true;
try { saved = restoreCareer(localStorage.getItem(SAVE_KEY)); sound = localStorage.getItem('latch-sound') === 'on'; } catch { storageAvailable = false; }

function save() {
  if (!career || !storageAvailable) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(career)); saved = career; }
  catch { storageAvailable = false; toast('Autosave is unavailable in this browser. Keep this tab open to preserve your career.'); }
}
function toast(message) {
  const t = document.querySelector('#toast');
  t.textContent = message; t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
}
function tone(kind = 'paper') {
  if (!sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = kind === 'bad' ? 150 : kind === 'good' ? 520 : 340;
    gain.gain.setValueAtTime(0.045, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .15);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .16);
  } catch { /* Sound is optional. */ }
}
function header(inGame = false) {
  return `<div class="service-strip"><span><strong>${inGame ? 'REVIEW SESSION ACTIVE' : 'LATCH / TRUST & SAFETY'}</strong> &nbsp; · &nbsp; HUMAN REVIEW DIVISION</span><span>${inGame ? `${career.mode === 'practice' ? 'PRACTICE DESK' : 'EMPLOYEE 084'} / SHIFT ${career.shift + 1}` : 'AUTOMATION FLAGS. PEOPLE DECIDE.'}</span></div>
    <header class="topbar"><div class="brand"><span class="brand-symbol">L</span><div><div class="brand-name">LATCH<span style="color:#739052">.</span></div><div class="brand-sub">THE APPEALS DESK</div></div></div>
    ${inGame ? `<div class="header-metrics"><div class="header-metric clock"><span>Shift remaining</span><b class="${career.minutes > currentShift(career).minutes ? 'warning' : ''}">${Math.max(0,currentShift(career).minutes - career.minutes)} min</b></div><div class="header-metric"><span>Accuracy</span><b>${accuracy(career)}%</b></div><div class="header-metric"><span>Audit strikes</span><b class="${career.strikes ? 'warning' : ''}">${career.strikes}${career.mode === 'standard' ? ' / 3' : ''}</b></div><div class="header-metric"><span>Earned</span><b>${money(career.earnings)}</b></div></div>` : '<span class="eyebrow muted">AN ORIGINAL INVESTIGATION GAME</span>'}
    <div class="top-actions"><button class="icon-button" data-action="policy" aria-label="Open handbook" title="Handbook">${icon('book')}</button><button class="icon-button" data-action="settings" aria-label="Open settings" title="Settings">${icon('settings')}</button>${inGame ? `<button class="icon-button" data-action="exit" aria-label="Save and leave the desk" title="Save and leave">${icon('logout')}</button>` : ''}</div></header>`;
}
function welcome() {
  app.innerHTML = `<div class="screen">${header()}<main class="welcome"><div class="welcome-grid"><div><div class="eyebrow">YOUR FIRST SHIFT STARTS HERE</div><h1>You are the<br><em>second opinion.</em></h1><p class="welcome-intro">A ban is automatic. A fair decision takes you.<br>Investigate the appeal. Find the missing context.<br>Then put your name on the ruling.</p>
    <div class="mode-row"><span class="eyebrow">YOUR DESK</span><label class="mode-choice"><input type="radio" name="mode" value="standard" checked> Career</label><label class="mode-choice"><input type="radio" name="mode" value="practice"> Practice</label></div><p class="mode-note" id="mode-note">Three wrong rulings end your career. You can retry the shift.</p>
    <div class="welcome-actions">${saved ? `<button class="primary lime" data-action="continue">Continue shift ${saved.shift + 1} ${icon('arrow')}</button><button class="secondary" data-action="new">New career ${icon('arrow')}</button>` : `<button class="primary lime" data-action="start">Clock in ${icon('arrow')}</button><button class="secondary" data-action="how">How to play ${icon('book')}</button>`}</div><p class="welcome-small">25 ORIGINAL CASES &nbsp; / &nbsp; 5 SHIFTS &nbsp; / &nbsp; EVERY CALL HAS CONSEQUENCES</p></div>
    <div class="folder-scene" aria-hidden="true"><div class="file-folder"><div class="folder-emboss">TRUST & SAFETY / HUMAN REVIEW</div><div class="folder-word">There’s<br>another side.</div><div class="folder-sub">DO NOT CLOSE WITHOUT INVESTIGATION</div><div class="file-paper"><div class="paper-label">APPEAL REQUEST · PIXELPIGEON</div><div class="paper-text">“Can someone please<br>read the entire message?”</div><div class="paper-rule"></div><div class="paper-rule short"></div><div class="stamp">REVIEW REQUIRED</div></div></div><div class="folder-caption">ONE ACCOUNT. TWO STORIES. YOUR SIGNATURE.</div></div></div><footer class="welcome-foot"><span><i class="live-dot"></i> THE HUMAN IN THE LOOP</span><span>READ. INVESTIGATE. RULE.</span><span>DESKTOP & TOUCH</span></footer></main></div>`;
  renderOverlay();
}
function queueHTML() {
  const shift = currentShift(career);
  const remaining = shift.ids.length - completedCount(career);
  return `<aside class="sidebar" aria-label="Appeal queue"><div class="queue-head"><span class="eyebrow">INCOMING</span><span class="queue-counter">${String(remaining).padStart(2,'0')}</span></div><nav class="queue">${shift.ids.map(id => {
    const c = CASE_MAP[id], done = career.files[id]?.result;
    return `<button id="queue-${id}" class="queue-item ${career.active === id ? 'active' : ''} ${done ? 'done' : ''}" data-action="case" data-id="${id}" ${done ? 'disabled' : ''} ${career.active === id ? 'aria-current="true"' : ''}><i class="queue-dot"></i><span class="queue-copy"><span class="queue-id">${id}</span><span class="queue-user" style="display:block">${e(c.user)}</span><span class="queue-category">${e(c.category)}</span></span>${done ? `<span class="queue-mark">${done.correct ? '✓' : '×'}</span>` : ''}</button>`;
  }).join('')}</nav><div class="sidebar-bottom"><div class="supervisor"><div class="eyebrow">A NOTE FROM MARA</div><p>${career.shift === 0 ? '“The flag tells you where to look. It does not tell you what happened.”' : career.shift === 1 ? '“Same network. Same device. Same person. Those are three different claims.”' : career.shift === 2 ? '“Do not let a familiar story replace an investigation.”' : career.shift === 3 ? '“If the original is missing, confidence is not a substitute.”' : '“Make a decision that another reviewer can defend.”'}</p></div><div class="employee-card"><div class="employee-avatar">084</div><div><b>${e(shift.name)}</b><span>HUMAN REVIEW DIVISION</span></div></div></div></aside>`;
}
function appealHTML(c) {
  return `<div class="eyebrow muted">APPELLANT’S STATEMENT</div><h2 class="appeal-subject">${e(c.subject)}</h2><div class="appeal-letter">“${e(c.appeal)}”<div class="appeal-signature">— ${e(c.user)} / submitted today</div></div><div class="ban-summary"><div class="record-label">ENFORCEMENT SUMMARY</div><dl class="facts"><div><dt>Flagged for</dt><dd>${e(c.category)}</dd></div><div><dt>Penalty</dt><dd>${e(c.sanction)}</dd></div><div><dt>Issued by</dt><dd>Automated moderation</dd></div><div><dt>Account age</dt><dd>${e(c.age)}</dd></div></dl></div><div class="case-hint">${icon('info')}<span>The appeal is a claim. Open the original records to establish what happened.</span></div><div class="investigate-cta"><small>${c.sources.length} RECORDS AVAILABLE</small><button class="primary" data-action="tab" data-tab="investigate">Investigate case ${icon('search')}</button></div>`;
}
const sourceType = d => d.kind === 'terminal' ? 'SYSTEM RECORD' : d.kind === 'chat' ? d.id === 'witness' ? 'INTERVIEW' : 'MESSAGE ARCHIVE' : 'CASE RECORD';
function sourcesHTML(c, f) {
  if (view.source) {
    const d = c.sources.find(s => s.id === view.source);
    if (!d || !f.opened.includes(d.id)) {view.source = null; return sourcesHTML(c,f);}
    let rows;
    if (d.kind === 'chat') rows = `<div class="conversation">${d.rows.map(([time,actor,text]) => `<div class="chat-row ${actor === c.user ? 'accused' : ''}"><div class="chat-meta"><b>${e(actor)}</b><span>${e(time)}</span></div><p>${e(text)}</p></div>`).join('')}</div>`;
    else if (d.kind === 'terminal') rows = `<div class="terminal"><div class="terminal-header"><span>LATCH / ${e(d.id.toUpperCase())}</span><span>READ ONLY</span></div>${d.rows.map(([time,actor,text]) => `<div class="terminal-row"><span class="terminal-time">${e(time)}</span><b>${e(actor)}</b><p>${e(text)}</p></div>`).join('')}</div>`;
    else rows = `<div class="document-record">${d.rows.map(([field,actor,text]) => `<div class="document-row"><div class="row-label">${e(field.toUpperCase())} / ${e(actor.toUpperCase())}</div><p>${e(text)}</p></div>`).join('')}</div>`;
    return `<div class="source-nav"><button data-action="sources">${icon('back')} All records</button><span class="badge green">${icon('check')} RETRIEVED</span></div><div class="eyebrow muted">${sourceType(d)}</div><h2 class="source-title">${e(d.title)}</h2>${rows}<div class="findings-title">${icon('pin')} FINDINGS TO CITE</div>${d.findings.map(k => `<button id="pin-${e(k.id)}" class="finding ${f.pins.includes(k.id) ? 'selected' : ''}" data-action="pin" data-id="${e(k.id)}" aria-pressed="${f.pins.includes(k.id)}">${icon(f.pins.includes(k.id) ? 'check' : 'pin')}<span>${e(k.text)}<small>${f.pins.includes(k.id) ? 'Cited · tap to unpin' : 'Pin to your evidence board'}</small></span></button>`).join('')}`;
  }
  return `<div class="source-intro"><h2>Look beyond the flag.</h2><p>Retrieve a record. Read the original. Pin the finding that supports your ruling. Opening records spends shift time; rereading them is free.</p></div><div class="source-list">${c.sources.map(d => {
    const opened = f.opened.includes(d.id), locked = d.requires && !f.opened.includes(d.requires);
    return `<button id="source-${d.id}" class="source-card ${opened ? 'opened' : ''}" data-action="source" data-id="${d.id}" ${locked ? 'disabled' : ''}><span class="source-icon">${icon(locked ? 'lock' : d.kind === 'terminal' ? 'terminal' : d.kind === 'chat' ? 'chat' : 'file')}</span><span class="source-copy"><b>${e(d.title)}</b><span>${locked ? 'REQUIRES SESSION RECORDS' : opened ? 'RETRIEVED · OPEN AGAIN' : sourceType(d)}</span></span><span class="source-cost">${opened ? icon('check') : locked ? 'LOCKED' : `${d.cost} MIN ↗`}</span></button>`;
  }).join('')}</div>${career.shift >= 2 ? `<div class="case-hint">${icon('info')}<span>Some complex rulings need corroboration from two different sources. You can cite up to three findings.</span></div>` : ''}`;
}
function notesHTML(f) {
  return `<div class="source-intro"><h2>Think it through.</h2><p>A private scratchpad for this appeal.</p></div><label class="note-label" for="case-notes">YOUR INVESTIGATION NOTES</label><textarea class="notes" id="case-notes" placeholder="What is the claim? What do the original records show?" maxlength="4000">${e(f.note)}</textarea><p class="note-help">Notes save with your career. Your submitted ruling is evaluated against the reason you select and the evidence you pin.</p>`;
}
function evidenceHTML(c, f) {
  return `<section class="evidence-board" aria-label="Cited evidence"><div class="board-head">${icon('pin')} EVIDENCE BOARD <span>${f.pins.length} / 3</span></div><div class="board-body">${f.pins.length ? f.pins.map(id => {
    const d = c.sources.find(s => s.findings.some(k => k.id === id)), finding = d.findings.find(k => k.id === id);
    return `<div class="pinned-note"><small>${e(d.title)}</small>${e(finding.text)}<button class="unpin" data-action="pin" data-id="${e(id)}" aria-label="Unpin: ${e(finding.text)}">×</button></div>`;
  }).join('') : `<div class="empty-board">${icon('pin')}<p>Open a record, then pin what supports your ruling.</p></div>`}</div></section>`;
}
const rulingSub = {restore:'Reverse the enforcement', uphold:'Keep the penalty in place', escalate:'Send to a specialist'};
function shuffledReasons(c) {
  const hash = text => [...`${c.id}:${text}`].reduce((n,ch) => ((n * 31) + ch.charCodeAt(0)) >>> 0, 0);
  return [...c.reasons].sort((a,b) => hash(a)-hash(b));
}
function rulingHTML(c, f) {
  const ready = f.decision && f.reason && f.pins.length;
  const next = !f.pins.length ? 'Pin at least one finding to continue.' : !f.decision ? 'Choose a ruling to continue.' : !f.reason ? 'Choose a reason to continue.' : 'FINAL SIGNATURE · 6 SHIFT MINUTES';
  return `<section class="ruling-card" aria-label="Ruling form"><div class="eyebrow muted">YOUR DECISION</div><h2>Make the call.</h2><p>Your signature. Your responsibility.</p><div class="ruling-options">${Object.entries(RULINGS).map(([id,label]) => `<button id="ruling-${id}" class="ruling-choice" data-action="ruling" data-id="${id}" aria-pressed="${f.decision === id}"><span class="radio"></span><span>${label}<small>${rulingSub[id]}</small></span></button>`).join('')}</div><label class="reason-label" for="reason">BASED ON WHICH FINDING?</label><select id="reason" class="reason-select"><option value="">Select your reason…</option>${shuffledReasons(c).map(r => `<option value="${e(r)}" ${f.reason === r ? 'selected' : ''}>${e(r)}</option>`).join('')}</select><button id="submit-ruling" class="primary submit-verdict" data-action="submit" ${ready ? '' : 'disabled'}>Sign & submit ${icon('arrow')}</button><p class="submit-help">${next}</p></section>`;
}
function renderDesk() {
  const c = currentCase(career), f = fileState(career), shift = currentShift(career);
  const focusId = document.activeElement?.id;
  app.innerHTML = `<div class="screen">${header(true)}<div class="workdesk">${queueHTML()}<main class="workspace"><div class="workspace-head"><div><div class="eyebrow muted">SHIFT ${String(career.shift + 1).padStart(2,'0')} / ${e(shift.name.toUpperCase())}</div><h1>Appeals desk.</h1><p>${completedCount(career)} of ${shift.ids.length} reviews completed · ${Math.max(0,shift.minutes-career.minutes)} shift minutes remaining</p></div><div class="shift-label">HUMAN REVIEW<br>WEEK 01<div class="shift-progress" aria-label="Shift ${career.shift+1} of 5">${SHIFTS.map((_,i) => `<i class="${i <= career.shift ? 'active' : ''}"></i>`).join('')}</div></div></div><div class="desk-grid"><article class="case-panel" aria-label="Case ${c.id}"><div class="file-top"><span>CASE FILE / ${c.id}</span><span>${icon('lock')} INTERNAL</span></div><div class="case-heading"><div class="player-avatar">${e(c.tag)}</div><div><div class="eyebrow">ACCOUNT UNDER REVIEW</div><div class="case-user">${e(c.user)}</div><span class="badge red">${e(c.sanction)}</span></div></div><div class="case-tabs" role="tablist" aria-label="Case sections">${[['appeal','Appeal'],['investigate','Investigate'],['notes','Notes']].map(([id,label]) => `<button id="tab-${id}" role="tab" aria-controls="case-content" aria-selected="${view.tab === id}" data-action="tab" data-tab="${id}">${label}${id === 'investigate' ? `<span class="count">${f.opened.length}/${c.sources.length}</span>` : ''}</button>`).join('')}</div><div class="case-body" id="case-content" role="tabpanel" aria-labelledby="tab-${view.tab}">${view.tab === 'appeal' ? appealHTML(c) : view.tab === 'investigate' ? sourcesHTML(c,f) : notesHTML(f)}</div><div class="panel-footer"><span>${f.opened.length} RECORDS RETRIEVED / ${f.pins.length} FINDINGS CITED</span><span>${career.mode === 'practice' ? 'PRACTICE' : 'EMPLOYEE 084'}</span></div></article><aside class="decision-column">${evidenceHTML(c,f)}${rulingHTML(c,f)}</aside></div><footer class="desk-footer"><span>${storageAvailable ? 'AUTOSAVE ACTIVE' : 'AUTOSAVE UNAVAILABLE'} &nbsp; · &nbsp; INTEGRITY ${career.integrity}% ${career.minutes > shift.minutes ? `· OVERTIME ${career.minutes - shift.minutes} MIN` : ''}</span><button data-action="policy">Consult the handbook ↗</button></footer></main></div></div>`;
  if (focusId) document.getElementById(focusId)?.focus({preventScroll:true});
  if (window.innerWidth <= 650) {const q = app.querySelector('.queue'), active = q?.querySelector('.active');if (active) q.scrollLeft = Math.max(0,active.offsetLeft-q.offsetLeft-12);}
  save(); renderOverlay();
}
function render() { if (career) renderDesk(); else welcome(); }
function modal(content, title, closeable = false) {
  return `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><span>${title}</span>${closeable ? '<button class="modal-close" data-action="close" aria-label="Close dialog">×</button>' : icon('file')}</div><div class="modal-body">${content}</div></section>`;
}
function briefingHTML() {
  const shift = currentShift(career);
  return modal(`<div class="eyebrow">MARA / DESK SUPERVISOR</div><h2 id="modal-title">${e(shift.title)}</h2><p>${e(shift.brief)}</p><div class="brief-facts"><div><span>SHIFT</span><b>${String(career.shift+1).padStart(2,'0')} / 05</b></div><div><span>APPEALS</span><b>${String(shift.ids.length).padStart(2,'0')}</b></div><div><span>TIME BUDGET</span><b>${shift.minutes} min</b></div></div>${career.shift === 0 ? `<div class="steps"><div class="step"><i>01</i><div><b>Investigate</b><p>Open records from the Investigate tab. Reading itself never costs time.</p></div></div><div class="step"><i>02</i><div><b>Pin the evidence</b><p>At the bottom of each record, pin the finding that matters.</p></div></div><div class="step"><i>03</i><div><b>Make the call</b><p>Choose restore, uphold, or escalate, then select a reason and sign.</p></div></div></div>` : ''}<div class="modal-actions"><button class="secondary" data-action="policy">Handbook</button><button class="primary" data-action="begin">Begin shift ${icon('arrow')}</button></div>`, `SHIFT BRIEFING / ${String(career.shift+1).padStart(2,'0')}`);
}
function auditHTML(result, historic = false) {
  const c = CASE_MAP[result.caseId], grade = result.grade;
  const title = grade === 'substantiated' ? 'That ruling stands.' : grade === 'incomplete' ? 'Right call. Weak file.' : 'The audit disagrees.';
  const banner = grade === 'substantiated' ? 'SUBSTANTIATED · REASON AND EVIDENCE VERIFIED' : grade === 'incomplete' ? 'RULING CORRECT · SUPPORT NEEDS WORK' : 'RULING OVERTURNED · AUDIT STRIKE ISSUED';
  return modal(`<div class="audit-banner ${grade === 'overturned' ? 'bad' : grade === 'incomplete' ? 'partial' : ''}">${icon(grade === 'overturned' ? 'close' : grade === 'incomplete' ? 'info' : 'check')}${banner}</div><div class="eyebrow">${c.id} / ${e(c.user)}</div><h2 id="modal-title">${title}</h2><p>${e(c.explanation)}</p><div class="audit-grid"><div><span>YOUR RULING</span><b class="${result.correct ? 'correct' : 'incorrect'}">${RULINGS[result.chosen]}</b></div><div><span>AUDITED RULING</span><b>${RULINGS[c.answer]}</b></div><div><span>REASON</span><b class="${result.reasonCorrect ? 'correct' : 'incorrect'}">${result.reasonCorrect ? 'Supported by policy' : 'Needs correction'}</b></div><div><span>EVIDENCE</span><b class="${result.supported ? 'correct' : 'incorrect'}">${result.supported ? 'Decisive findings cited' : 'Decisive findings missing'}</b></div></div><div class="audit-rationale"><small>DEFENSIBLE REASON</small><p>${e(c.reason)}</p></div><div class="audit-findings"><h3>THE FINDINGS THAT MATTER</h3>${c.decisive.map(group => {
    const id = group[0], d = c.sources.find(s => s.findings.some(k => k.id === id)), k = d.findings.find(k => k.id === id);
    return `<p>${icon('pin')}<span>${e(k.text)} <span class="muted mono" style="font-size:9px">/ ${e(d.title)}</span></span></p>`;
  }).join('')}</div><div class="modal-actions">${historic ? '<button class="primary" data-action="close">Back to report</button>' : `<button class="primary" data-action="advance">${career.mode === 'standard' && career.strikes >= 3 ? 'View career review' : completedCount(career) === currentShift(career).ids.length ? 'View shift report' : 'Next appeal'} ${icon('arrow')}</button>`}</div><p class="about-note">${money(result.pay)} earned ${!historic ? `· Integrity ${career.integrity}% · ${career.strikes}${career.mode === 'standard' ? ' / 3' : ''} audit strikes` : ''}</p>`, 'QUALITY ASSURANCE / CASE AUDIT', historic);
}
function reportHTML() {
  const stats = shiftStats(career), shift = currentShift(career);
  return modal(`<div class="eyebrow">SHIFT ${career.shift+1} / COMPLETE</div><h2 id="modal-title">Desk cleared.</h2><p>${stats.correct === stats.count ? 'Every appeal received the correct ruling.' : `${stats.correct} of ${stats.count} appeals received the correct ruling.`} ${stats.thorough === stats.count ? 'Every file also had the right reason and decisive evidence.' : 'Review the audit notes below to strengthen your files.'}</p><div class="score-strip"><div class="score-cell"><b>${stats.correct}/${stats.count}</b><span>CORRECT RULINGS</span></div><div class="score-cell"><b>${stats.thorough}/${stats.count}</b><span>COMPLETE FILES</span></div><div class="score-cell"><b>${money(stats.pay)}</b><span>SHIFT EARNINGS</span></div></div><div class="report-table">${career.records.filter(r => r.shift === career.shift).map(r => `<div class="report-row">${icon(r.correct ? 'check' : 'close')}<span class="report-user">${e(CASE_MAP[r.caseId].user)}</span><span>${r.grade === 'substantiated' ? 'VERIFIED' : r.grade === 'incomplete' ? 'WEAK FILE' : 'OVERTURNED'}</span><button data-action="review" data-id="${r.caseId}">Audit ↗</button></div>`).join('')}</div>${stats.overtime ? `<div class="case-hint">${icon('clock')}<span>${stats.overtime} minutes of overtime. ${career.mode === 'standard' ? 'Each started 10-minute overtime block costs 2 integrity points.' : 'Practice mode does not penalize overtime.'}</span></div>` : ''}<div class="modal-actions"><button class="secondary" data-action="policy">Handbook</button><button class="primary" data-action="next-shift">${career.shift === SHIFTS.length-1 ? 'View final evaluation' : 'Next shift'} ${icon('arrow')}</button></div>`, `HUMAN REVIEW / ${e(shift.name.toUpperCase())}`);
}
function firedHTML() {
  return modal(`<div class="audit-banner bad">${icon('close')} THREE RULINGS OVERTURNED</div><div class="eyebrow">CAREER REVIEW</div><h2 id="modal-title">Your desk is on hold.</h2><p>Three incorrect rulings ended this career attempt. Your previous shifts are saved. Retry this shift with its original time budget, salary, and strike count.</p><div class="score-strip"><div class="score-cell"><b>${accuracy(career)}%</b><span>CAREER ACCURACY</span></div><div class="score-cell"><b>${money(career.earnings)}</b><span>EARNED</span></div><div class="score-cell"><b>${career.shift+1}</b><span>SHIFT REACHED</span></div></div><div class="modal-actions"><button class="secondary" data-action="leave">Return to title</button><button class="primary" data-action="retry">Retry this shift ${icon('arrow')}</button></div>`, 'QUALITY ASSURANCE / CAREER ON HOLD');
}
function completeHTML() {
  const [rank,description] = finalRank(career);
  return modal(`<div class="final-seal">${icon('award')}</div><div class="eyebrow">FIVE SHIFTS / 25 APPEALS / YOUR SIGNATURE</div><h2 id="modal-title">A human made<br>the difference.</h2><p>${e(description)}</p><div class="final-rank">DESK ASSIGNMENT: ${e(rank.toUpperCase())}</div><div class="score-strip"><div class="score-cell"><b>${accuracy(career)}%</b><span>ACCURACY</span></div><div class="score-cell"><b>${money(career.earnings)}</b><span>CAREER EARNINGS</span></div><div class="score-cell"><b>${career.integrity}%</b><span>INTEGRITY</span></div></div><p>${career.records.filter(r => r.grade === 'substantiated').length} of 25 rulings had the correct reason and decisive evidence.${career.mode === 'practice' ? ' Completed at the practice desk.' : ''}</p><div class="modal-actions"><button class="secondary" data-action="leave">Return to title</button><button class="primary" data-action="new">Start a new career ${icon('arrow')}</button></div>`, 'EMPLOYEE 084 / FINAL EVALUATION');
}
function policyHTML() {
  return modal(`<div class="eyebrow">THE DESK’S FICTIONAL POLICY / V1.0</div><h2 id="modal-title">The reviewer’s handbook.</h2><p>Our job is to establish what happened, then apply the rule consistently. These are the rules your decisions are audited against.</p>${POLICY.map(([n,title,text]) => `<div class="policy-row"><span class="number">${n}</span><div><h3>${e(title)}</h3><p>${e(text)}</p></div></div>`).join('')}<div class="modal-actions"><button class="primary" data-action="close">Back to the desk ${icon('arrow')}</button></div><p class="about-note">LATCH, its platform, users, cases, and policies are fictional. This is an original game about investigating appeals.</p>`, 'HUMAN REVIEW / EMPLOYEE HANDBOOK', true);
}
function howHTML() {
  return modal(`<div class="eyebrow">AN EMPLOYEE SIMULATION</div><h2 id="modal-title">Investigate before<br>you sign.</h2><div class="steps"><div class="step"><i>01</i><div><b>Read the appeal.</b><p>The player’s statement is a claim. The flag is a lead.</p></div></div><div class="step"><i>02</i><div><b>Open the original records.</b><p>Use Investigate to retrieve conversations, reports, sessions, and audits. Technical audits require session records first.</p></div></div><div class="step"><i>03</i><div><b>Cite the decisive findings.</b><p>Pin up to three findings from the bottom of retrieved records. Later cases need corroborating sources.</p></div></div><div class="step"><i>04</i><div><b>Choose a ruling and reason.</b><p>Restore mistaken bans, uphold verified violations, or escalate unresolved evidence and account-security incidents.</p></div></div><div class="step"><i>05</i><div><b>Learn from the audit.</b><p>Correct, substantiated files earn $55. A correct ruling with weak support earns $35. A wrong ruling earns an audit strike. Career mode ends at three strikes; practice keeps going.</p></div></div></div><div class="case-hint">${icon('clock')}<span>Time moves only when you retrieve records or sign. Reading and rereading are free. Each started 10 minutes of overtime costs 2 integrity points in career mode.</span></div><div class="modal-actions"><button class="primary" data-action="close">Got it ${icon('arrow')}</button></div>`, 'LATCH / HOW TO PLAY', true);
}
function settingsHTML() {
  return modal(`<div class="eyebrow">PERSONAL WORKSTATION</div><h2 id="modal-title">Desk settings.</h2><div class="settings-list"><label class="setting-row"><span><b>Desk sounds</b><small>Soft cues for records, pins, and case audits.</small></span><input id="sound" type="checkbox" ${sound ? 'checked' : ''}></label><div class="setting-row"><span><b>Autosave</b><small>Your career and notes stay in this browser.</small></span><span class="badge ${storageAvailable ? 'green' : 'red'}">${storageAvailable ? 'ACTIVE' : 'UNAVAILABLE'}</span></div>${career ? `<div class="setting-row"><span><b>Current desk</b><small>${career.mode === 'practice' ? 'Practice · no dismissal or overtime penalties' : 'Career · three audit strikes end the attempt'}</small></span><span class="badge">SHIFT ${career.shift+1}</span></div>` : ''}</div><p class="setting-note">No live countdown. Reading, taking notes, and checking the handbook are free.</p><div class="modal-actions"><button class="secondary" data-action="how">How to play</button><button class="primary" data-action="close">Back ${icon('arrow')}</button></div><p class="about-note"><a href="https://github.com/cory56626-art/THEBOBSBATH/tree/main/appeals/" target="_blank" rel="noopener">Game source ↗</a> · Version 1.0 · Fictional platform and policies.</p>`, 'LATCH / SETTINGS', true);
}
function renderOverlay() {
  let html = '';
  if (transient?.kind === 'policy') html = policyHTML();
  else if (transient?.kind === 'how') html = howHTML();
  else if (transient?.kind === 'settings') html = settingsHTML();
  else if (transient?.kind === 'review') html = auditHTML(career.records.find(r => r.caseId === transient.id),true);
  else if (transient?.kind === 'new') html = modal(`<div class="eyebrow">NEW EMPLOYEE FILE</div><h2 id="modal-title">Start a new career?</h2><p>This replaces the current saved career. You will start at shift one with a clean audit record. Choose the desk you want.</p><div class="mode-row"><label class="mode-choice"><input type="radio" name="new-mode" value="standard" checked> Career</label><label class="mode-choice"><input type="radio" name="new-mode" value="practice"> Practice</label></div><div class="modal-actions"><button class="secondary" data-action="close">Keep my career</button><button class="primary" data-action="confirm-new">Start fresh ${icon('arrow')}</button></div>`, 'LATCH / NEW CAREER',true);
  else if (transient?.kind === 'exit') html = modal(`<div class="eyebrow">END YOUR SESSION</div><h2 id="modal-title">Leave the desk?</h2><p>${storageAvailable ? 'Your career, retrieved records, pinned evidence, and notes are saved. Continue from the title screen whenever you return.' : 'Autosave is unavailable. Returning to this title screen keeps your progress in this tab, but closing or reloading the tab will lose it.'}</p><div class="modal-actions"><button class="secondary" data-action="close">Stay at the desk</button><button class="primary" data-action="leave">Save & leave ${icon('arrow')}</button></div>`, 'LATCH / CLOCK OUT',true);
  else if (career?.status === 'briefing') html = briefingHTML();
  else if (career?.status === 'feedback') html = auditHTML(fileState(career).result);
  else if (career?.status === 'report') html = reportHTML();
  else if (career?.status === 'fired') html = firedHTML();
  else if (career?.status === 'complete') html = completeHTML();
  overlay.hidden = !html;
  overlay.innerHTML = html;
  document.body.style.overflow = html ? 'hidden' : '';
  if (html) requestAnimationFrame(() => overlay.querySelector('button, input, select, textarea')?.focus({preventScroll:true}));
}
function start(mode) {
  clearTimeout(saveTimer); career = newCareer(mode); transient = null; view = {tab:'appeal',source:null}; render();
}
function resetView() {view = {tab:'appeal',source:null}; transient = null;}
function handleAction(button) {
  const action = button.dataset.action, id = button.dataset.id;
  if (action === 'policy' || action === 'settings' || action === 'how' || action === 'exit') {transient = {kind:action}; renderOverlay(); return;}
  if (action === 'close') {transient = null; renderOverlay(); return;}
  if (action === 'start') {start(document.querySelector('[name="mode"]:checked')?.value); return;}
  if (action === 'continue') {career = saved; resetView(); render(); return;}
  if (action === 'new') {if (career || saved) {transient={kind:'new'};renderOverlay();} else start(); return;}
  if (action === 'confirm-new') {start(document.querySelector('[name="new-mode"]:checked')?.value); return;}
  if (!career) return;
  if (action === 'leave') {save(); saved = career; career = null; transient = null; render(); return;}
  if (action === 'begin') {beginShift(career); render(); return;}
  if (action === 'case') {if (selectCase(career,id)) {resetView();render();} return;}
  if (action === 'tab') {if (career.status !== 'playing') return; view.tab = button.dataset.tab; render(); return;}
  if (action === 'sources') {view.source = null; render(); return;}
  if (action === 'source') {const result = investigate(career,id); if (!result.ok) {toast(result.message);return;} view = {tab:'investigate',source:id};tone();render();return;}
  if (action === 'pin') {const result = togglePin(career,id);if (!result.ok) toast(result.message);else {tone();render();}return;}
  if (action === 'ruling') {chooseRuling(career,id);render();return;}
  if (action === 'submit') {const result = submit(career);if (!result.ok) toast(result.message);else {tone(result.result.correct ? 'good' : 'bad');render();}return;}
  if (action === 'advance') {advance(career);resetView();render();return;}
  if (action === 'next-shift') {nextShift(career);resetView();render();return;}
  if (action === 'retry') {career = retryShift(career);resetView();render();return;}
  if (action === 'review') {transient={kind:'review',id};renderOverlay();return;}
}
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  handleAction(button);
});
document.addEventListener('change', event => {
  if (event.target.id === 'reason' && career) {chooseReason(career,event.target.value);render();}
  else if (event.target.name === 'mode') document.querySelector('#mode-note').textContent = event.target.value === 'practice' ? 'No dismissal or overtime penalties. Learn at your own pace.' : 'Three wrong rulings end your career. You can retry the shift.';
  else if (event.target.id === 'sound') {sound = event.target.checked;try {localStorage.setItem('latch-sound',sound ? 'on' : 'off');}catch{}tone();}
});
document.addEventListener('input', event => {
  if (event.target.id === 'case-notes' && career?.status === 'playing') {fileState(career).note = event.target.value.slice(0,4000);clearTimeout(saveTimer);saveTimer = setTimeout(save,150);}
});
document.addEventListener('keydown', event => {
  if (!overlay.hidden) {
    if (event.key === 'Escape' && transient) {event.preventDefault();transient=null;renderOverlay();}
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button:not(:disabled),input,select,textarea,a[href]')];
      const first = focusable[0], last = focusable[focusable.length-1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    }
    return;
  }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if (event.key.toLowerCase() === 'h') {transient={kind:'policy'};renderOverlay();}
  if (event.key === 'Escape' && career) {transient={kind:'exit'};renderOverlay();}
  if (event.target.getAttribute('role') === 'tab' && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();const tabs=['appeal','investigate','notes'];let n=tabs.indexOf(view.tab);
    n=event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (n+(event.key === 'ArrowRight' ? 1 : 2))%3;
    view.tab=tabs[n];render();document.querySelector(`#tab-${tabs[n]}`)?.focus();
  }
});
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',() => {if(document.hidden)save();});
render();
