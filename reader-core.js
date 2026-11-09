export const LIMIT = 30000;

export const SAMPLES = [
  'There is a tiny creature living between these lines.\n\nI love the way it moves. A little strange. A little beautiful. Every word is somewhere new to go.\n\nSome people hate the long legs. Others think they are wonderful. I think it is just hungry.\n\nGive it a story. Give it a secret. Let it read.',
  'I love this idea. It is weird and brilliant and a little scary.\n\nWhat if every word had somewhere to be, and this little creature was the only one who knew the way.\n\nI hate to interrupt its journey. But I have one more thought.\n\nHello, crawler. Welcome to Bobs Bath.',
  'At midnight, the library was quiet.\n\nA small shadow slipped out of a sentence and stretched eight impossibly long legs across the page.\n\nIt did not eat the paper. It ate the pauses. The lovely ones. The awful ones. The little moments nobody else could see.\n\nThen it found your words.'
];

const positive = new Set('love loves loved loving lovely like likes liked enjoy enjoys enjoyed amazing beautiful brilliant awesome good great wonderful excellent happy cool adore perfect best nice cute fantastic thanks thank'.split(' '));
const negative = new Set('hate hates hated hating dislike dislikes disliked awful bad worst ugly terrible scary creepy horrible boring stupid annoying cruel disgusting dystopian fear angry sad'.split(' '));

export function wordSignal(word) {
  const clean = word.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return positive.has(clean) ? 'positive' : negative.has(clean) ? 'negative' : 'neutral';
}

export function tokenize(text) {
  return Array.from(String(text).slice(0, LIMIT).matchAll(/\S+/gu), m => ({ text: m[0], offset: m.index, signal: wordSignal(m[0]) }));
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
