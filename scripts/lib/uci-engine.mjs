import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** A sequential UCI client. Protocol failures reject the pending request and stop the child. */
export class UciEngine {
  constructor(binary, { args = [], timeoutMs = 30000 } = {}) {
    this.timeoutMs = timeoutMs;
    this.name = null;
    this.options = [];
    this.commands = [];
    this.stderr = '';
    this.error = null;
    this.child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      if (line.startsWith('id name ')) this.name = line.slice(8);
      if (line.startsWith('option ')) this.options.push(line);
      this.collect?.(line);
      if (this.pending?.predicate(line)) this.pending.resolve(line);
    });
    this.child.stderr.on('data', data => { this.stderr = (this.stderr + data).slice(-2000); });
    const fail = error => {
      this.error ||= error;
      this.pending?.reject(this.error);
    };
    this.child.on('error', fail);
    this.child.stdin.on('error', fail);
    this.child.on('exit', (code, signal) => fail(new Error(`UCI engine exited (${code ?? signal}): ${this.stderr}`)));
  }

  send(command) {
    if (this.error) throw this.error;
    this.commands.push(command);
    this.child.stdin.write(command + '\n');
  }

  waitFor(predicate) {
    if (this.pending) return Promise.reject(new Error('Overlapping UCI requests are unsupported'));
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.pending = null; };
      const timer = setTimeout(() => {
        this.pending?.reject(new Error('Timed out waiting for UCI response'));
        this.child.kill();
      }, this.timeoutMs);
      this.pending = {
        predicate,
        resolve: line => { cleanup(); resolve(line); },
        reject: error => { cleanup(); reject(error); },
      };
    });
  }

  async request(command, predicate) {
    const response = this.waitFor(predicate);
    // Attaching the rejection handler before sending also covers a synchronous
    // write failure, without leaving the pending response unhandled.
    try { this.send(command); } catch (error) { this.pending?.reject(error); }
    return response;
  }

  async init() {
    await this.request('uci', line => line === 'uciok');
    await this.ready();
  }

  ready() { return this.request('isready', line => line === 'readyok'); }

  async configure(options) {
    for (const [name, value] of Object.entries(options)) {
      if (!this.options.some(option => option.startsWith(`option name ${name} type `))) throw new Error(`Engine does not advertise UCI option ${name}`);
      this.send(`setoption name ${name} value ${value}`);
    }
    await this.ready();
  }

  async newGame() {
    this.send('ucinewgame');
    this.send('setoption name Clear Hash');
    await this.ready();
  }

  async chooseMove(history, nodes) {
    this.send(`position startpos${history.length ? ` moves ${history.join(' ')}` : ''}`);
    let info = null;
    this.collect = line => {
      if (!line.startsWith('info ') || !/\bnodes \d+/.test(line)) return;
      const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
      info = {
        depth: Number(/\bdepth (\d+)/.exec(line)?.[1] || 0),
        nodes: Number(/\bnodes (\d+)/.exec(line)?.[1] || 0),
        timeMs: Number(/\btime (\d+)/.exec(line)?.[1] || 0),
        score: score ? { type: score[1], value: Number(score[2]) } : null,
        pv: /\bpv (.+)/.exec(line)?.[1]?.trim().split(/\s+/) || [],
      };
    };
    try {
      const line = await this.request(`go nodes ${nodes}`, value => value.startsWith('bestmove '));
      return { move: line.split(/\s+/)[1], info };
    } finally { this.collect = null; }
  }

  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    if (!this.error) this.send('quit');
    this.child.stdin.end();
    await new Promise(resolve => {
      const timer = setTimeout(() => { this.child.kill(); }, 1000);
      this.child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    this.lines.close();
  }
}
