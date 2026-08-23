import { Game } from './game.js';
import { Sfx } from './audio.js';
import { BOTS } from './bots.js';
import { Store } from './store.js';
import { CFG } from './config.js';

const $ = id => document.getElementById(id);

export class App {
  constructor() {
    Store.load();
    this.sfx = new Sfx();
    this.game = new Game($('stage'), this.sfx, {
      onCountdown: t => this.countdown(t),
      onEnd: s => this.showResult(s),
      onPop: (t, o) => this.pop(t, o),
    });

    this.pick = Math.min(Store.data.unlocked - 1, BOTS.length - 1);
    this.screen = 'title';

    this.buildRail();
    this.wire();
    this.refreshTitle();
    this.game.setBot(BOTS[this.pick]);
    this.resize();
  }

  /* ── screens ─────────────────────────────────────────────────────────── */

  show(name) {
    for (const id of ['titleScreen', 'howScreen', 'selectScreen', 'resultScreen']) {
      $(id).classList.toggle('show', id === name + 'Screen');
    }
    this.screen = name;
    $('hud').hidden = name !== 'hud';
    if (name === 'title' || name === 'select') this.game.abort();
  }

  refreshTitle() {
    $('statBest').textContent = Store.data.bestCps.toFixed(1);
    $('statWins').textContent = String(Store.data.wins);
    $('statBelt').textContent = Store.rank();
  }

  buildRail() {
    const rail = $('botRail');
    rail.innerHTML = '';
    this.cards = BOTS.map((b, i) => {
      const locked = i + 1 > Store.data.unlocked;
      const beaten = !!Store.data.beaten[b.id];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'botcard' + (locked ? ' locked' : '') + (i === this.pick ? ' sel' : '');
      el.innerHTML = `
        <div class="bc-face">${locked ? '🔒' : b.face}</div>
        <h3>${locked ? '???' : b.name}</h3>
        <div class="bc-blurb">${locked ? 'Beat the rival before this one.' : b.blurb}</div>
        <div class="bc-cps">${locked ? '— cps' : b.cps.toFixed(1) + ' cps'}</div>
        <div class="pips">${Array.from({ length: 8 }, (_, k) =>
          `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="${beaten ? 'bc-beat' : 'bc-lock'}">${beaten ? '✓ BEATEN' : (locked ? 'LOCKED' : 'READY')}</div>`;
      el.addEventListener('click', () => {
        if (locked) { this.pop('LOCKED', { color: '#ffb3a2', size: 30 }); this.sfx.beep(); return; }
        this.select(i);
      });
      rail.appendChild(el);
      return el;
    });
  }

  select(i, scroll = true) {
    this.pick = i;
    this.cards.forEach((c, k) => c.classList.toggle('sel', k === i));
    this.game.setBot(BOTS[i]);
    if (scroll) this.cards[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    this.sfx.beep();
  }

  /* ── wiring ──────────────────────────────────────────────────────────── */

  wire() {
    const armAudio = () => this.sfx.unlock();
    window.addEventListener('pointerdown', armAudio, { once: true });
    window.addEventListener('keydown', armAudio, { once: true });

    $('playBtn').onclick = () => { this.buildRail(); this.select(this.pick, false); this.show('select'); };
    $('howBtn').onclick = () => this.show('how');
    $('howClose').onclick = () => this.show('title');
    $('backBtn').onclick = () => { this.show('title'); this.refreshTitle(); };
    $('fightBtn').onclick = () => this.startMatch();
    $('quitBtn').onclick = () => { this.show('select'); };
    $('againBtn').onclick = () => this.startMatch();
    $('nextBtn').onclick = () => {
      const next = this.pick + 1;
      if (this.game.won && next < BOTS.length && next + 1 <= Store.data.unlocked) {
        this.buildRail(); this.select(next, false); this.startMatch();
      } else {
        this.buildRail(); this.show('select');
      }
    };

    // pointerdown, not click: a clicker game should never wait for the release.
    $('surgeBtn').addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.game.useSurge()) this.game.tap();
      this.hideHint();
    });

    $('muteBtn').onclick = e => {
      e.stopPropagation();
      const on = !this.sfx.enabled;
      this.sfx.setEnabled(on);
      $('muteBtn').textContent = on ? '🔊' : '🔇';
      $('muteBtn').classList.toggle('off', !on);
      if (on) this.sfx.beep();
    };
    $('muteBtn').textContent = this.sfx.enabled ? '🔊' : '🔇';
    $('muteBtn').classList.toggle('off', !this.sfx.enabled);

    // Taps: anything that isn't a control counts, and each finger counts.
    const isControl = t => !!(t && t.closest && t.closest('button, .screen, .chip'));
    window.addEventListener('pointerdown', e => {
      if (this.game.state !== 'play') return;
      if (isControl(e.target)) return;
      e.preventDefault();
      this.game.tap();
      this.hideHint();
    }, { passive: false });

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        if (this.game.state === 'play') { e.preventDefault(); this.game.tap(); this.hideHint(); }
        else if (this.screen === 'select') { e.preventDefault(); this.startMatch(); }
        else if (this.screen === 'title') { e.preventDefault(); $('playBtn').click(); }
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (this.game.state === 'play') this.game.useSurge();
      }
      if (e.code === 'Escape' && this.game.state === 'play') $('quitBtn').click();
      const top = Math.min(Store.data.unlocked, BOTS.length) - 1;   // can't arrow into a locked rival
      if (e.code === 'ArrowRight' && this.screen === 'select') this.select(Math.min(this.pick + 1, top));
      if (e.code === 'ArrowLeft' && this.screen === 'select') this.select(Math.max(this.pick - 1, 0));
    });

    window.addEventListener('contextmenu', e => { if (!isControl(e.target)) e.preventDefault(); });
    document.addEventListener('gesturestart', e => e.preventDefault());
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
  }

  resize() { this.game.world.resize(); }

  hideHint() {
    if (!this._hintOff) { this._hintOff = true; $('tapHint').classList.add('off'); }
  }

  /* ── match ───────────────────────────────────────────────────────────── */

  startMatch() {
    const b = BOTS[this.pick];
    this.game.setBot(b);
    this.game.beginCountdown();
    this.show('hud');
    this._hintOff = false;
    $('tapHint').classList.remove('off');
    $('hudBotName').textContent = b.name;
    $('tbBotFace').textContent = b.face;
    $('surgeBtn').disabled = true;
    this.sfx.unlock();
    this.pop(b.taunt, { color: '#ffd8cf', size: 26, y: 0.33 });
  }

  countdown(text) {
    const el = $('countdown');
    if (text == null) { el.hidden = true; return; }
    el.hidden = false;
    $('cdText').textContent = text;
    $('cdText').style.animation = 'none';
    void $('cdText').offsetWidth;
    $('cdText').style.animation = '';
  }

  showResult(s) {
    const b = s.bot;
    const wasUnlocked = Store.data.unlocked;
    if (s.won) Store.recordWin(b.id, this.pick, s.peakCps);
    else Store.recordLoss(s.peakCps);

    $('resultMedal').textContent = s.won ? '🏆' : '🪣';
    const title = $('resultTitle');
    title.textContent = s.won ? 'YOU WIN!' : 'DRAGGED!';
    title.className = s.won ? 'win' : 'lose';
    $('resultSub').textContent = s.won
      ? `${b.name} is face-down in the mud.`
      : `${b.name} hauled your whole team in.`;
    $('rAvg').textContent = s.avgCps.toFixed(1);
    $('rPeak').textContent = s.peakCps.toFixed(1);
    $('rTaps').textContent = String(s.taps);
    $('rTime').textContent = s.time.toFixed(1) + 's';

    const next = BOTS[this.pick + 1];
    const unlockedNow = s.won && next && Store.data.unlocked > wasUnlocked;
    const u = $('rUnlock');
    u.hidden = !unlockedNow;
    if (unlockedNow) u.textContent = `🔓 Unlocked: ${next.name}`;
    $('nextBtn').textContent = s.won && next ? 'Next rival' : 'Rivals';

    setTimeout(() => { this.show('result'); this.refreshTitle(); }, 1700);
  }

  /* ── HUD ─────────────────────────────────────────────────────────────── */

  hud() {
    const g = this.game;
    $('cpsYou').textContent = g.cps.toFixed(1);
    $('cpsBot').textContent = g.botCps.toFixed(1);
    $('matchTimer').textContent = g.elapsed.toFixed(1);
    document.querySelector('.cps.you').classList.toggle('hot', g.cps > g.botCps + 0.3);
    document.querySelector('.cps.them').classList.toggle('hot', g.botCps > g.cps + 0.3);

    const lead = Math.max(-1, Math.min(1, -g.pos / (g.goalNow || CFG.goal)));
    const knot = 50 - lead * 44;
    $('tbKnot').style.left = knot + '%';
    const fill = $('tbFill');
    fill.classList.toggle('red', lead < 0);
    fill.style.left = (lead > 0 ? knot : 50) + '%';
    fill.style.width = Math.abs(lead) * 44 + '%';

    const btn = $('surgeBtn');
    const live = g.surgeLeft > 0;
    const ready = g.surge >= 100 && !live;
    $('surgeFill').style.width = (live ? (g.surgeLeft / CFG.surgeTime) * 100 : g.surge) + '%';
    btn.disabled = g.state !== 'play';
    btn.classList.toggle('ready', ready);
    btn.classList.toggle('live', live);
    $('surgeSub').textContent = live ? 'DOUBLE POWER!' : (ready ? 'TAP TO FIRE' : `charging ${Math.floor(g.surge)}%`);
  }

  /* ── floating text ───────────────────────────────────────────────────── */

  pop(text, { color = '#fff', size = 34, y = 0.42 } = {}) {
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = size + 'px';
    el.style.left = (48 + (Math.random() * 8 - 4)) + '%';
    el.style.top = (y * 100) + '%';
    $('pops').appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ── loop ────────────────────────────────────────────────────────────── */

  run() {
    let last = performance.now();
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.game.frame(dt);
      if (this.game.state === 'play' || this.game.state === 'over') this.hud();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
