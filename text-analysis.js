// Document-wide topic ranking and extractive summaries. No requests or models:
// the summary preserves original sentences, including their qualifiers/numbers.
export const normalizeKey = text => String(text).toLocaleLowerCase().replace(/[’']/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
const stops = new Set(('a an the and or but if then than that this these those it its is are was were be been being ' +
  'i me my mine we us our ours you your yours he him his she her hers they them their theirs ' +
  'of to in on at as for from by with without into onto out up down over under between through about ' +
  'not no yes do does did doing done have has had having will would can could should may might must ' +
  'what which who whom whose where when why how there here just so very too more most some any all ' +
  'each every much many few little also even only really actually basically literally ' +
  'im ive id ill youre youve theyre weve dont doesnt didnt cant cannot wont isnt arent wasnt werent ' +
  'think thinks thought know knows known get gets got getting give gives gave going go goes went ' +
  'say says said like still now something anything everything someone anyone thing things ' +
  'make makes made let lets use uses used seem seems see seen looks looking look ' +
  'others other another such own ever somewhere somehow whatever whenever while until ' +
  'itself themselves himself herself myself yourself yourselves ourselves both either else ' +
  'follow follows following because aim aims').split(' '));
const light = new Set('good great nice amazing awesome wonderful beautiful lovely bad terrible awful cool best worst new'.split(' '));
const negations = new Set('not never no neither without cannot cant dont doesnt didnt wont isnt arent'.split(' '));
const phraseEndVerbs = new Set('store stores record records turn turns expand expands plan plans aim aims found finds found measure measures generate generates identify identifies provide provides supply supplies repair repairs replaced replaces restart restarts restarted overheated'.split(' '));
const incompleteEnds = new Set('short long new old heavy temporary essential public damaged stored same'.split(' '));

function stem(key) {
  if (key.length < 5 || /\d/u.test(key)) return key;
  if (/ies$/u.test(key)) return key.slice(0, -3) + 'y';
  if (/ing$/u.test(key) && key.length > 6) return key.slice(0, -3).replace(/([b-df-hj-np-tv-z])\1$/u, '$1');
  if (/ed$/u.test(key) && key.length > 5) return key.slice(0, -2);
  if (/s$/u.test(key) && !/(ss|us|is)$/u.test(key)) return key.slice(0, -1);
  return key;
}

function sourceFromWords(words) { return words.map(w => (w.gap || '') + w.text).join(''); }

function sentencesFrom(text, words) {
  const result = [];
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('en', { granularity: 'sentence' }) : null;
  const paragraphPattern = /[^\n]+(?:\n(?![ \t]*\n)[^\n]+)*/gu;
  let wordAt = 0, paragraph = 0;
  for (const p of text.matchAll(paragraphPattern)) {
    const rawSegments = segmenter ? Array.from(segmenter.segment(p[0]), s => ({ text: s.segment, index: s.index })) : Array.from(p[0].matchAll(/[^.!?]+(?:[.!?]+(?:\s+|$)|$)/gu), s => ({ text: s[0], index: s.index }));
    const segments=[];
    for(const s of rawSegments) {
      const previous=segments.at(-1);
      if(previous && /\b(?:Dr|Mr|Mrs|Ms|Prof|Jr|Sr|St|vs|etc)\.$/iu.test(previous.text.trim())) previous.text+=s.text;
      else segments.push({...s});
    }
    for (const segment of segments) {
      const start = p.index + segment.index, end = start + segment.text.length;
      while (wordAt < words.length && words[wordAt].offset < start) wordAt++;
      const first = wordAt;
      while (wordAt < words.length && words[wordAt].offset < end) wordAt++;
      if (first < wordAt) result.push({ text: segment.text.trim(), start, end, first, last: wordAt - 1, paragraph, terms: new Map(), score: 0 });
    }
    paragraph++;
  }
  return result;
}

function pageRank(nodes, edges, rounds = 18) {
  if (!nodes.length) return new Map();
  let rank = new Map(nodes.map(k => [k, 1 / nodes.length]));
  const sums = new Map(nodes.map(k => [k, Array.from(edges.get(k)?.values() || []).reduce((a, b) => a + b, 0)]));
  for (let iteration = 0; iteration < rounds; iteration++) {
    const dangling = nodes.reduce((sum, key) => sum + (sums.get(key) ? 0 : rank.get(key)), 0) / nodes.length;
    const next = new Map(nodes.map(key => [key, .15 / nodes.length + .85 * dangling]));
    for (const key of nodes) {
      if (!sums.get(key)) continue;
      for (const [other, weight] of edges.get(key) || []) next.set(other, next.get(other) + .85 * rank.get(key) * weight / sums.get(key));
    }
    rank = next;
  }
  return rank;
}

function addEdge(edges, a, b, value) {
  if (a === b) return;
  if (!edges.has(a)) edges.set(a, new Map());
  edges.get(a).set(b, (edges.get(a).get(b) || 0) + value);
}

export function analyzeDocument(words, text = sourceFromWords(words)) {
  const sentences = sentencesFrom(text, words);
  const terms = new Map();
  const keys = words.map(w => {
    const raw = normalizeKey(w.text);
    return raw && !stops.has(raw) && (/\d/u.test(raw) || /\p{L}{2}/u.test(raw)) ? stem(raw) : '';
  });
  const wordSentence = new Map();
  sentences.forEach((s, id) => {
    for (let i = s.first; i <= s.last; i++) {
      wordSentence.set(i, id);
      const key = keys[i];
      if (!key) continue;
      if (!terms.has(key)) terms.set(key, { key, label: words[i].text.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}%]+$/gu, ''), count: 0, sentences: new Set(), first: i, proper: false, score: 0 });
      const term = terms.get(key);
      term.count++; term.sentences.add(id);
      term.proper ||= /^\p{Lu}/u.test(words[i].text) && (i > s.first || /\p{Lu}{2}/u.test(words[i].text));
      s.terms.set(key, (s.terms.get(key) || 0) + 1);
    }
  });

  const nodes = Array.from(terms.values()).sort((a, b) => b.count - a.count || a.first - b.first).slice(0, 700).map(t => t.key);
  const allowed = new Set(nodes), edges = new Map();
  for (const s of sentences) {
    const sequence = [];
    for (let i = s.first; i <= s.last; i++) if (allowed.has(keys[i])) sequence.push(keys[i]);
    for (let i = 0; i < sequence.length; i++) for (let j = i + 1; j < Math.min(sequence.length, i + 5); j++) {
      addEdge(edges, sequence[i], sequence[j], 1 / (j - i));
      addEdge(edges, sequence[j], sequence[i], 1 / (j - i));
    }
  }
  const ranks = pageRank(nodes, edges);
  for (const term of terms.values()) {
    const generic = light.has(normalizeKey(term.label)) ? .55 : 1;
    term.score = generic * (.7 + (ranks.get(term.key) || 0) * Math.max(1, nodes.length) * .8 + Math.log1p(term.count) * .8 + Math.log1p(term.sentences.size) * 1.05 + (term.proper ? .45 : 0) + (/\d/u.test(term.key) ? .3 : 0));
  }

  const phraseCounts = new Map();
  for (const s of sentences) for (let i = s.first; i < s.last; i++) {
    if (!keys[i] || !keys[i + 1] || /[,;:!?。！？.]$/.test(words[i].text)) continue;
    const phrase = `${keys[i]} ${keys[i + 1]}`;
    phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
  }

  const targets = [];
  for (const s of sentences) {
    const content = [];
    for (let i = s.first; i <= s.last; i++) if (keys[i]) content.push(i);
    if (!content.length) continue;
    const candidates = [];
    for (const i of content) {
      let start = i;
      if (i > s.first && negations.has(normalizeKey(words[i - 1].text))) start--;
      const base = terms.get(keys[i]).score;
      candidates.push({ index: start, end: i, score: base, terms: [keys[i]] });
      for (let n = 2; n <= 3 && i + n - 1 <= s.last; n++) {
        const end = i + n - 1;
        if (!keys[end] || !keys[end - 1] || /[,;:!?。！？.]$/.test(words[end - 1].text) || /\n/.test(words[end].gap || '')) break;
        if (phraseEndVerbs.has(normalizeKey(words[end].text)) || incompleteEnds.has(normalizeKey(words[end].text))) continue;
        if (words.slice(i+1,end).some(w=>phraseEndVerbs.has(normalizeKey(w.text)))) continue;
        const ks = keys.slice(i, end + 1);
        const values = ks.map(k => terms.get(k).score);
        const repeated = phraseCounts.get(`${ks[0]} ${ks[1]}`) || 1;
        candidates.push({ index: start, end, terms: ks, score: Math.max(...values) + values.reduce((a,b) => a+b,0) / values.length * .26 + Math.log(repeated) * .8 + (n === 2 ? .17 : .08) });
      }
    }
    const budget = Math.max(1, Math.min(4, Math.ceil(content.length / 3)));
    const occupied = new Set(), usedTerms = new Set(), chosen = [];
    for (const c of candidates.sort((a,b) => b.score-a.score || a.index-b.index)) {
      if (chosen.length >= budget || c.terms.every(k => usedTerms.has(k))) continue;
      if (Array.from({length:c.end-c.index+1},(_,j)=>c.index+j).some(i=>occupied.has(i))) continue;
      for(let i=c.index;i<=c.end;i++) occupied.add(i);
      c.terms.forEach(k=>usedTerms.add(k));
      const signal = words.slice(c.index,c.end+1).find(w=>w.signal!=='neutral')?.signal || 'neutral';
      chosen.push({ index:c.index, end:c.end, signal, score:c.score, terms:c.terms, sentence:wordSentence.get(c.index) });
    }
    targets.push(...chosen.sort((a,b)=>a.index-b.index));
  }
  if (!targets.length && words.length) targets.push({index:0,end:0,signal:'neutral',score:0,terms:[]});

  // Use the same document topics for hunting and the summary's key-idea chips.
  const topics = [], represented = new Set();
  const rankedTargets = targets.slice().sort((a,b)=>b.score-a.score || a.index-b.index);
  for (const t of rankedTargets) {
    if (topics.length >= 7 || t.terms.filter(k=>!represented.has(k)).length < Math.ceil(t.terms.length * .6)) continue;
    const phrase=words.slice(t.index,t.end+1).map(w=>w.text).join(' ').replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}%]+$/gu,'');
    if (!phrase) continue;
    topics.push({ text:phrase, index:t.index, end:t.end });
    t.terms.forEach(k=>represented.add(k));
  }
  return { text, words, sentences, terms, keys, targets, topics };
}

function cosine(a, b) {
  let dot=0, aa=0, bb=0;
  for(const [key,value] of a) { aa+=value*value; dot+=value*(b.get(key)||0); }
  for(const value of b.values()) bb+=value*value;
  return aa && bb ? dot/Math.sqrt(aa*bb) : 0;
}

function compactExcerpt(text, maxWords=85) {
  const clean=text.replace(/\s+/gu,' ').trim();
  const parts=clean.split(' ');
  if(parts.length<=maxWords && clean.length<=650) return clean;
  const shortened=parts.slice(0,maxWords).join(' ').slice(0,650).trim();
  const boundary=shortened.lastIndexOf(' ');
  return (shortened.length>=650 && boundary>450 ? shortened.slice(0,boundary) : shortened).replace(/[,;:]$/u,'')+'…';
}

export function summarizeDocument(model) {
  const {sentences,terms,words}=model;
  if(!words.length) return { text:'', topics:[] };
  if(words.length<=24 || sentences.length<=1) return { text:compactExcerpt(model.text), topics:model.topics };
  const vectors=sentences.map(s=>new Map(Array.from(s.terms,([k,n])=>[k,(1+Math.log(n))*(1+Math.log(1+sentences.length/(1+terms.get(k).sentences.size)))])));
  const topicMass=sentences.map(s=>Array.from(s.terms.keys()).reduce((sum,k)=>sum+terms.get(k).score,0)/Math.sqrt(Math.max(1,s.last-s.first+1)));
  const bestByMass=topicMass.map((mass,i)=>({mass,i})).sort((a,b)=>b.mass-a.mass).slice(0,100).map(x=>x.i);
  const sample=Array.from({length:Math.min(60,sentences.length)},(_,i)=>Math.round(i*(sentences.length-1)/Math.max(1,Math.min(60,sentences.length)-1)));
  const nodes=Array.from(new Set([0,sentences.length-1,...bestByMass,...sample]));
  const edges=new Map();
  for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) {
    const similarity=cosine(vectors[nodes[i]],vectors[nodes[j]]);
    if(similarity>.035) { addEdge(edges,nodes[i],nodes[j],similarity);addEdge(edges,nodes[j],nodes[i],similarity); }
  }
  const ranks=pageRank(nodes,edges,16);
  const maxMass=Math.max(...topicMass,1);
  const base=sentences.map((s,i)=>{
    const cue=/\b(because|therefore|however|instead|although|but|means|goal|result|need|must|not|never|without)\b/iu.test(s.text) ? .18 : 0;
    const length=s.last-s.first+1;
    return (ranks.get(i)||0)*nodes.length*.5 + topicMass[i]/maxMass*.65 + (i===0?.3:.08/(1+i)) + cue + (length>=6 && length<=45?.12:0);
  });
  const selected=[], covered=new Set();
  const wanted=words.length<100?2:3;
  for(let pick=0;pick<wanted;pick++) {
    let best=-1, bestScore=-Infinity;
    for(const i of nodes) {
      if(selected.includes(i)) continue;
      const s=sentences[i], length=s.last-s.first+1;
      if(pick && length>60) continue;
      const redundancy=selected.length?Math.max(...selected.map(j=>cosine(vectors[i],vectors[j]))):0;
      if(redundancy>.88) continue;
      const novel=Array.from(s.terms.keys()).filter(k=>!covered.has(k)).reduce((sum,k)=>sum+terms.get(k).score,0)/Math.max(1,topicMass[i]*Math.sqrt(length));
      const priorWords=selected.reduce((n,j)=>n+sentences[j].last-sentences[j].first+1,0);
      if(pick && priorWords+length>90) continue;
      const score=base[i]+novel*.2-redundancy*.75;
      if(score>bestScore) { bestScore=score;best=i; }
    }
    if(best<0) break;
    selected.push(best);sentences[best].terms.forEach((_,k)=>covered.add(k));
  }
  // A leading pronoun needs its introduction; prefer source context to an
  // unsupported rewrite of who or what the sentence refers to.
  const first=Math.min(...selected);
  if(first>0 && /^(it|they|he|she|this|these|those|that)\b/iu.test(sentences[first].text)) {
    if(selected.length>=wanted) selected.pop();
    selected.push(Math.max(0,first-1));
  }
  // Preserve an explicit operating condition instead of implying an activity
  // may proceed when the source says it cannot or must wait for approval.
  const important = new Set(Array.from(terms.values()).sort((a,b)=>b.score-a.score).slice(0,8).map(t=>t.key));
  for(let i=0;i<sentences.length;i++) {
    const s=sentences[i];
    if(selected.includes(i) || !/\b(?:not|cannot|cant|won't|must)\b[^.!?]*\b(?:until|before|unless)\b/iu.test(s.text)) continue;
    if(!Array.from(s.terms.keys()).some(k=>important.has(k))) continue;
    const prior=selected.reduce((n,j)=>n+sentences[j].last-sentences[j].first+1,0);
    if(prior+s.last-s.first+1<=90) {
      if(selected.length>=3) selected.splice(selected.reduce((worst,j,k)=>base[j]<base[selected[worst]]?k:worst,0),1);
      selected.push(i);
    }
  }
  const chosen=Array.from(new Set(selected)).sort((a,b)=>a-b);
  return { text:compactExcerpt(chosen.map(i=>sentences[i].text).join(' '),90), topics:model.topics };
}
