const opening = (name, moves) => ({ name, moves: moves.split(' ') });

// Fixed before v3 match outcomes. Each opening is played with colors reversed.
const openings = [
  opening('Italian', 'e4 e5 Nf3 Nc6 Bc4 Bc5'),
  opening('Queen’s Gambit', 'd4 d5 c4 e6 Nc3 Nf6'),
  opening('Sicilian', 'e4 c5 Nf3 d6 d4 cxd4'),
  opening('English', 'c4 e5 Nc3 Nf6 g3 d5'),
  opening('Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5 a6'),
  opening('French', 'e4 e6 d4 d5 Nc3 Nf6'),
  opening('Caro-Kann', 'e4 c6 d4 d5 Nc3 dxe4'),
  opening('Scandinavian', 'e4 d5 exd5 Qxd5 Nc3 Qa5'),
  opening('Pirc', 'e4 d6 d4 Nf6 Nc3 g6'),
  opening('King’s Indian', 'd4 Nf6 c4 g6 Nc3 Bg7'),
  opening('Scotch', 'e4 e5 Nf3 Nc6 d4 exd4'),
  opening('London', 'd4 d5 Nf3 Nf6 Bf4 e6'),
];

// Prospective Gato 2 selection: separate from the 12 earlier six-ply lines.
// These are opening families, not positions selected from candidate games.
const gato2Openings = [
  opening('Vienna', 'e4 e5 Nc3 Nf6 f4 d5'),
  opening('Four Knights', 'e4 e5 Nf3 Nc6 Nc3 Nf6'),
  opening('Petrov', 'e4 e5 Nf3 Nf6 Nxe5 d6'),
  opening('Philidor', 'e4 e5 Nf3 d6 d4 Nf6'),
  opening('Ponziani', 'e4 e5 Nf3 Nc6 c3 Nf6'),
  opening('Two Knights', 'e4 e5 Nf3 Nc6 Bc4 Nf6'),
  opening('Bishop’s Opening', 'e4 e5 Bc4 Nf6 d3 Nc6'),
  opening('King’s Gambit', 'e4 e5 f4 exf4 Nf3 g5'),
  opening('Center Game', 'e4 e5 d4 exd4 Qxd4 Nc6'),
  opening('Smith–Morra Gambit', 'e4 c5 d4 cxd4 c3 dxc3'),
  opening('Alapin Sicilian', 'e4 c5 c3 Nf6 e5 Nd5'),
  opening('Closed Sicilian', 'e4 c5 Nc3 Nc6 g3 g6'),
  opening('French Advance', 'e4 e6 d4 d5 e5 c5'),
  opening('Caro–Kann Advance', 'e4 c6 d4 d5 e5 Bf5'),
  opening('Alekhine', 'e4 Nf6 e5 Nd5 d4 d6'),
  opening('Modern', 'e4 g6 d4 Bg7 Nc3 d6'),
  opening('Nimzo–Indian', 'd4 Nf6 c4 e6 Nc3 Bb4'),
  opening('Queen’s Indian', 'd4 Nf6 c4 e6 Nf3 b6'),
  opening('Bogo–Indian', 'd4 Nf6 c4 e6 Nf3 Bb4+'),
  opening('Grünfeld', 'd4 Nf6 c4 g6 Nc3 d5'),
  opening('Dutch', 'd4 f5 g3 Nf6 Bg2 g6'),
  opening('Benoni', 'd4 Nf6 c4 c5 d5 e6'),
  opening('Slav', 'd4 d5 c4 c6 Nf3 Nf6'),
  opening('Catalan', 'd4 Nf6 c4 e6 g3 d5'),
];

export function getOpenings(set = 'strength24') {
  const counts = { arena4: 2, pilot8: 4, strength24: 12 };
  if (set === 'gato2_48') return gato2Openings.map(item => ({ name: item.name, moves: [...item.moves] }));
  if (!(set in counts)) throw new Error(`Unknown opening set ${set}; choose arena4, pilot8, strength24, or gato2_48`);
  return openings.slice(0, counts[set]).map(item => ({ name: item.name, moves: [...item.moves] }));
}
