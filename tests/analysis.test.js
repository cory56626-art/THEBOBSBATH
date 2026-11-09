import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../reader-core.js';
import { analyzeDocument, summarizeDocument } from '../text-analysis.js';

function analyze(text) { const words=tokenize(text);return analyzeDocument(words,text); }
function targetText(model) { return model.targets.map(t=>model.words.slice(t.index,t.end+1).map(w=>w.text).join(' ')); }

test('neutral technical text yields topics, actions and measurements with no emotion vocabulary', () => {
  const model=analyze('Solar panels convert sunlight into electricity. Battery storage supplies electricity at night. The solar panels can charge the battery storage in six hours. Engineers measure battery life before expanding the solar project.');
  const labels=targetText(model).join(' ').toLowerCase();
  for(const idea of ['solar panels','battery','electricity']) assert.ok(labels.includes(idea),labels);
  assert.ok(model.targets.length>3);
  assert.ok(model.targets.every(t=>t.signal==='neutral'));
  assert.ok(model.topics.some(t=>/solar panels/iu.test(t.text)));
});

test('context outranks a few generic praise words in a technical document', () => {
  const model=analyze('Great, amazing, lovely. The cooling pump controls reactor temperature. A blocked pipe stopped the cooling pump. Engineers must replace the blocked pipe before restarting the reactor.');
  const ideas=model.topics.slice(0,4).map(t=>t.text).join(' ').toLowerCase();
  assert.ok(/pump|reactor|pipe/u.test(ideas),ideas);
  assert.ok(!/^great|^amazing|^lovely/u.test(ideas),ideas);
});

test('summaries retain a failure, repair and explicit restriction instead of inventing permission', () => {
  const text='The reactor overheated because the cooling pump failed. Engineers replaced the cooling pump and restarted the reactor. The inspection found a blocked intake pipe. The reactor will not reopen until inspectors approve the repairs.';
  const summary=summarizeDocument(analyze(text)).text;
  assert.match(summary,/cooling pump failed/u);
  assert.match(summary,/will not reopen until inspectors approve/u);
  assert.ok(summary.length<text.length,summary);
});

test('a summary identifies a neutral project and preserves its stated limit', () => {
  const text='An underwater robot is mapping a coral reef. Sonar measures distance while cameras identify damaged coral. The robot stores location data so researchers can revisit the same sites. Its battery lasts four hours, so the team plans short trips and recharges between surveys. The project aims to track reef recovery over time. The robot records observations; it does not repair the coral itself.';
  const result=summarizeDocument(analyze(text));
  assert.match(result.text,/underwater robot/u);
  assert.match(result.text,/does not repair/u);
  assert.ok(result.text.length<text.length*.75,result.text);
  assert.ok(result.topics.length>2);
});

test('summary statements come from the source and preserve names and numbers', () => {
  const text='Mira leads the Atlas project. The Atlas rover carries 3 cameras and stores 48 hours of footage. The rover maps underground tunnels using sonar. Mira plans to compare the sonar maps with camera images. The Atlas rover will remain underground until its survey is complete.';
  const model=analyze(text),result=summarizeDocument(model);
  for(const term of result.text.match(/\S+/gu)||[]) assert.ok(text.includes(term),term);
  assert.match(result.text,/Atlas/u);
  assert.ok(result.topics.some(t=>/Atlas|rover/u.test(t.text)));
});

test('sentence boundaries preserve decimals and abbreviations', () => {
  const text='Dr. Chen leads the pilot. The battery stores 3.5 kWh. The pilot will measure battery life.';
  const model=analyze(text);
  assert.ok(model.sentences.some(s=>s.text.includes('3.5 kWh')));
  assert.ok(model.sentences.some(s=>s.text.includes('Dr. Chen')));
});

test('empty, short, numeric and markup-like inputs stay safe and bounded', () => {
  assert.equal(summarizeDocument(analyze('   ')).text,'');
  assert.equal(summarizeDocument(analyze('Hello, world.')).text,'Hello, world.');
  const markup='<img src=x onerror=alert(1)> This is only text.';
  assert.equal(summarizeDocument(analyze(markup)).text,markup);
  const long=summarizeDocument(analyze('x'.repeat(30000))).text;
  assert.ok(long.length<=651);
  assert.ok(analyze('42 84 126').targets.length>0);
});

test('summarization reads the full document, including a final caveat', () => {
  const text='The museum is planning a new public exhibit about coastal wildlife. The exhibit contains photographs, interactive maps, and recordings of ocean sounds. School groups can book guided tours with museum staff. The museum will not open the exhibit until the accessibility inspection is complete.';
  const result=summarizeDocument(analyze(text));
  assert.match(result.text,/will not open the exhibit until/u);
  assert.ok(result.topics.some(t=>/exhibit|museum|inspection/u.test(t.text)));
});
