import { analyzeDocument, normalizeKey } from './text-analysis.js?v=3';

export const LIMIT = 30000;

export const SAMPLES = [
  'A city is testing solar panels on public buildings.\n\nThe panels turn sunlight into electricity. Battery storage keeps essential lights on after sunset.\n\nDuring power cuts, the stored energy can supply emergency shelters.\n\nThe trial will measure installation costs, electricity output, and battery life before the city expands the system.',
  'An underwater robot is mapping a coral reef.\n\nSonar measures distance while cameras identify damaged coral. The robot stores location data so researchers can revisit the same sites.\n\nIts battery lasts four hours, so the team plans short trips and recharges between surveys.\n\nThe project aims to track reef recovery over time. The robot records observations; it does not repair the coral itself.',
  'I love this strange little machine.\n\nA spider made of words. Beautiful and a little scary.\n\nLook at those long legs searching the page.\n\nThis is a cool way to turn text into motion.\n\nSome think it is creepy. Others call it digital art.\n\nA web crawler with a taste for language.\n\nI hate boring pages. This one has a life of its own.\n\nEvery tiny joint has somewhere to be.\n\nWhat a brilliant, wonderfully weird creature.\n\nHello, crawler. Welcome to Bobs Bath.',
  'At midnight, the library was quiet.\n\nA small shadow slipped out of a sentence and stretched eight impossibly long legs across the page.\n\nIt did not eat the paper. It ate the pauses. The lovely ones. The awful ones. The little moments nobody else could see.\n\nThen it found your words.'
];

const positive = new Set('love loves loved loving lovely like likes liked enjoy enjoys enjoyed amazing beautiful brilliant awesome good great wonderful excellent happy cool adore perfect best nice cute fantastic thanks thank'.split(' '));
const negative = new Set('hate hates hated hating dislike dislikes disliked awful bad worst ugly terrible scary creepy horrible boring stupid annoying cruel disgusting dystopian fear angry sad'.split(' '));

export function wordSignal(word) {
  const clean = word.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return positive.has(clean) ? 'positive' : negative.has(clean) ? 'negative' : 'neutral';
}

export function tokenize(text) {
  const bounded = String(text).slice(0, LIMIT);
  let previous = 0;
  return Array.from(bounded.matchAll(/\S+/gu), m => {
    const word = { text: m[0], offset: m.index, signal: wordSignal(m[0]), gap: bounded.slice(previous, m.index) };
    previous = m.index + m[0].length;
    return word;
  });
}

// Keep speech requests short, preserving a map from speech offsets to document words.
export function speechChunk(words, start) {
  let text = '';
  const offsets = [];
  let end = start;
  for (let i = start; i < words.length && i < start + 28; i++) {
    if (i > start && text.length + words[i].text.length > 210) break;
    if (text) text += ' ';
    offsets.push({ char: text.length, word: i });
    text += words[i].text;
    end = i;
    if (i >= start + 5 && /[.!?。！？]$/.test(words[i].text)) break;
  }
  return { text, start, end, offsets };
}

export function wordAtBoundary(chunk, charIndex) {
  let word = chunk.start;
  for (const offset of chunk.offsets) {
    if (offset.char > charIndex) break;
    word = offset.word;
  }
  return word;
}

export function wordDuration(word, wpm) {
  const base = 60000 / wpm;
  return base * (/[.!?。！？]$/.test(word) ? 1.7 : /[,;:，、]$/.test(word) ? 1.3 : 1);
}

export function cleanWord(text) { return normalizeKey(text); }

// Topic selection uses the entire document; color/tone does not get a ranking bonus.
export function huntTargets(words) { return analyzeDocument(words).targets; }
