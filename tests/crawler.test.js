import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMIT, tokenize, wordSignal, speechChunk, wordAtBoundary, wordDuration } from '../reader-core.js';

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
