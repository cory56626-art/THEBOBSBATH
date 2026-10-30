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

export function getOpenings(set = 'strength24') {
  const counts = { arena4: 2, pilot8: 4, strength24: 12 };
  if (!(set in counts)) throw new Error(`Unknown opening set ${set}; choose arena4, pilot8, or strength24`);
  return openings.slice(0, counts[set]).map(item => ({ name: item.name, moves: [...item.moves] }));
}
