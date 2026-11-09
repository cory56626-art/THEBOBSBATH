import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMIT, BASE_WPM, MAX_WPM, tokenize, wordSignal, speechChunk, wordAtBoundary, wordDuration, advanceWordClock } from '../reader-core.js';

test('word tokens preserve original offsets across blank lines, Unicode and punctuation', () => {
  const text = '  Love,\n\n世界 🌱  a<b>  café!';
  const words = tokenize(text);
  assert.deepEqual(words.map(w => w.text), ['Love,', '世界', '🌱', 'a<b>', 'café!']);
  for (const word of words) assert.equal(text.slice(word.offset, word.offset + word.text.length), word.text);
  assert.equal(tokenize(' \n\t ').length, 0);
});

test('signals match whole words and ignore surrounding punctuation', () => {
  assert.equal(wordSignal('“LOVE!”'), 'positive');
  assert.equal(wordSignal('(Dystopian.)'), 'negative');
  assert.equal(wordSignal('goodbye'), 'neutral');
  assert.equal(wordSignal('hatefulness'), 'neutral');
});

test('speech chunk offsets map back to every document word, including non-BMP characters', () => {
  const words = tokenize('one two three four five six seven 🌱 lovely. Another paragraph goes right here.');
  const chunk = speechChunk(words, 3);
  assert.equal(chunk.start, 3);
  assert.equal(chunk.end, 8);
  for (const o of chunk.offsets) {
    assert.equal(wordAtBoundary(chunk, o.char), o.word);
    assert.equal(wordAtBoundary(chunk, o.char + words[o.word].text.length - 1), o.word);
  }
  assert.equal(wordAtBoundary(chunk, 99999), chunk.end);
});

test('all speech chunks cover a long document without losing or duplicating words', () => {
  const words = tokenize(Array.from({ length: 1200 }, (_, i) => `word${i}${i % 17 === 0 ? '.' : ''}`).join(' '));
  const covered = [];
  for (let i = 0; i < words.length;) {
    const chunk = speechChunk(words, i);
    assert.ok(chunk.text.length <= 210);
    assert.ok(chunk.end >= i);
    covered.push(...chunk.offsets.map(o => o.word));
    i = chunk.end + 1;
  }
  assert.deepEqual(covered, words.map((_, i) => i));
});

test('single very long words do not stall chunking and input has a fixed limit', () => {
  const words = tokenize('x'.repeat(LIMIT + 100));
  assert.equal(words.length, 1);
  assert.equal(words[0].text.length, LIMIT);
  assert.equal(speechChunk(words, 0).end, 0);
});

test('reading speed scales predictably and punctuation gets breathing room', () => {
  assert.equal(wordDuration('hello', 120), 500);
  assert.equal(wordDuration('hello', 240), 250);
  assert.ok(wordDuration('hello.', 120) > wordDuration('hello,', 120));
  assert.ok(wordDuration('hello,', 120) > wordDuration('hello', 120));
});

test('100× reading keeps every word and its timing at 30, 60 and 120 screen refreshes per second',()=>{
  const words=tokenize(Array.from({length:1000},(_,i)=>`word${i}${i%13===0?'.':i%7===0?',':''}`).join(' '));
  const expected=words.reduce((ms,w)=>ms+wordDuration(w.text,MAX_WPM),0);
  assert.equal(MAX_WPM/BASE_WPM,100);
  for(const fps of [30,60,120]) {
    let clock={cursor:0,nextAt:wordDuration(words[0].text,MAX_WPM),complete:false};
    let now=0,maxBatch=0;
    const visited=[0];
    while(!clock.complete) {
      now+=1000/fps;
      const previous=clock.cursor;
      clock=advanceWordClock(words,clock.cursor,clock.nextAt,now,MAX_WPM);
      for(let i=previous+1;i<=clock.cursor;i++) visited.push(i);
      maxBatch=Math.max(maxBatch,clock.cursor-previous);
      assert.ok(now<expected+100);
    }
    assert.deepEqual(visited,words.map((_,i)=>i));
    assert.ok(maxBatch>1);
    assert.ok(now>=expected-1e-7 && now-expected<1000/fps+1e-7);
    assert.ok(Math.abs(clock.nextAt-expected)<1e-7);
  }
});

test('a delayed screen refresh catches up without reading beyond the active speech chunk',()=>{
  const words=tokenize('one two three four five six seven eight nine ten');
  const clock=advanceWordClock(words,0,wordDuration('one',MAX_WPM),1000,MAX_WPM,4);
  assert.equal(clock.cursor,4);
  assert.equal(clock.complete,false);
});
