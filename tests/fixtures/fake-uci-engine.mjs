import { createInterface } from 'node:readline';
const mode = process.argv[2];
let position = '';
const input = createInterface({ input: process.stdin });
for await (const command of input) {
  if (mode === 'exit') process.exit(7);
  if (mode === 'hang') continue;
  if (command === 'uci') process.stdout.write('id name Fake protocol fixture\noption name Skill Level type spin default 20 min 0 max 20\noption name Clear Hash type button\nuciok\n');
  if (command === 'isready') process.stdout.write('readyok\n');
  if (command.startsWith('position ')) position = command;
  if (command.startsWith('go ')) process.stdout.write(`info depth 3 nodes 99 time 1 score cp 12 pv e7e5\nbestmove ${position.includes('moves e2e4') ? 'e7e5' : 'e2e4'}\n`);
  if (command === 'quit') break;
}
