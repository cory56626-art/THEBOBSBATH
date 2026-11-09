export const LIMIT = 30000;

export const SAMPLES = [
  'There is a tiny creature living between these lines.\n\nI love the way it moves. A little strange. A little beautiful. Every word is somewhere new to go.\n\nSome people hate the long legs. Others think they are wonderful. I think it is just hungry.\n\nGive it a story. Give it a secret. Let it read.',
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

const stopWords = new Set(('a an the and or but if then than that this these those it its is are was were be been being ' +
  'i me my mine we us our ours you your yours he him his she her hers they them their theirs ' +
  'of to in on at as for from by with without into onto out up down over under between through about ' +
  'not no yes do does did doing done have has had having will would can could should may might must ' +
  'what which who whom whose where when why how there here just so very too more most some any all ' +
  'each every much many few little also even only really actually basically literally ' +
  'im ive id ill youre youve dont doesnt didnt cant cannot wont isnt arent wasnt werent ' +
  'think thinks thought know knows known get gets got getting give gives gave going go goes went ' +
  'say says said like still now one two something anything everything someone anyone thing things ' +
  'follow follows following move moves moving make makes made let lets turn turns use uses used ' +
  'seem seems see seen watching watch looks looking look starts start started').split(' '));

export function cleanWord(text) { return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }

// A local salience heuristic, not a claim to reproduce the creator's internals.
// Function words are bypassed; sentiment terms and distinctive adjacent content
// words become sparse word/phrase targets, ordered along the document.
export function huntTargets(words) {
  if (!words.length) return [];
  const frequency = new Map();
  for (const word of words) { const key = cleanWord(word.text); frequency.set(key, (frequency.get(key) || 0) + 1); }
  const content = w => {
    const key = cleanWord(w.text);
    return key && (!stopWords.has(key) || w.signal !== 'neutral') && /\p{L}/u.test(key);
  };
  const result = [];
  let sentence = [];
  function select() {
    if (!sentence.length) return;
    const budget = Math.max(1, Math.min(4, Math.ceil(sentence.length * .65)));
    const ranked = sentence.slice().sort((a, b) => b.score - a.score || a.index - b.index);
    const chosen = ranked.slice(0, budget).sort((a, b) => a.index - b.index);
    result.push(...chosen.map(({ score, ...target }) => target));
    sentence = [];
  }
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (content(word)) {
      let end = i;
      const key = cleanWord(word.text);
      let score = 1 + Math.min(10, key.length) * .12 + 1 / Math.sqrt(frequency.get(key));
      if (word.signal !== 'neutral') score += 8;
      else if (i + 1 < words.length && content(words[i + 1]) && words[i + 1].signal === 'neutral' && !/[.,;:!?。！？]$/.test(word.text) && !/\n/.test(words[i + 1].gap || '') && words[i + 1].offset - word.offset - word.text.length <= 2) {
        end = i + 1; score += 1.6;
      }
      sentence.push({ index: i, end, signal: word.signal, score });
      if (end > i) i = end;
    }
    if (/[.!?。！？]$/.test(words[i].text) || sentence.length >= 6) select();
  }
  select();
  return result.length ? result : [{ index: 0, end: 0, signal: words[0].signal }];
}
