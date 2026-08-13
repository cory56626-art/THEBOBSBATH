// Setup panel: the roster editor, match settings, and the action buttons.
// Everything here is plain DOM — the canvas stays purely for the simulation.

import { WEAPONS, WEAPON_KEYS } from './weapons.js';
import { ABILITIES, ABILITY_KEYS } from './abilities.js';
import { SETTINGS, PALETTE, NAMES } from './config.js';
import { pick, randInt } from './utils.js';

const MAX_FIGHTERS = 8;
const MIN_FIGHTERS = 2;

function defaultRoster() {
  const presets = [
    { weapon: 'sword', ability: 'vampire' },
    { weapon: 'flail', ability: 'titan' },
    { weapon: 'laser', ability: 'shield' },
    { weapon: 'dagger', ability: 'berserk' },
  ];
  return presets.map((p, i) => ({
    name: NAMES[i],
    color: PALETTE[i],
    weapon: p.weapon,
    ability: p.ability,
  }));
}

const SLIDERS = [
  { key: 'ballSpeed', label: 'Ball speed', min: 200, max: 900, step: 10 },
  { key: 'maxHp', label: 'Starting HP', min: 40, max: 300, step: 10 },
  { key: 'aggression', label: 'Aggression', min: 0, max: 1, step: 0.05 },
  { key: 'pickupInterval', label: 'Pickup rate (s)', min: 2, max: 20, step: 1 },
];

const TOGGLES = [
  { key: 'pickups', label: 'Health & power drops' },
  { key: 'supers', label: 'Super moves' },
  { key: 'hpSizeMode', label: 'Size follows HP' },
  { key: 'trails', label: 'Motion trails' },
  { key: 'showDamage', label: 'Damage numbers' },
  { key: 'sound', label: 'Sound' },
];

export class UI {
  constructor({ onStart, onReset, onRecord, recorderSupported }) {
    this.onStart = onStart;
    this.onReset = onReset;
    this.onRecord = onRecord;
    this.recorderSupported = recorderSupported;

    this.roster = defaultRoster();
    this.hookText = 'Who wins?';

    this.el = {
      roster: document.getElementById('roster'),
      addBtn: document.getElementById('addFighter'),
      randomBtn: document.getElementById('randomize'),
      settings: document.getElementById('settings'),
      startBtn: document.getElementById('startBtn'),
      recBtn: document.getElementById('recBtn'),
      hookInput: document.getElementById('hookInput'),
      panel: document.getElementById('panel'),
      toggleBtn: document.getElementById('panelToggle'),
    };
  }

  mount() {
    this.buildSettings();
    this.renderRoster();

    this.el.addBtn.addEventListener('click', () => this.addFighter());
    this.el.randomBtn.addEventListener('click', () => this.randomize());
    this.el.startBtn.addEventListener('click', () => this.onStart());
    this.el.hookInput.value = this.hookText;
    this.el.hookInput.addEventListener('input', (e) => { this.hookText = e.target.value; });

    if (!this.recorderSupported) {
      this.el.recBtn.disabled = true;
      this.el.recBtn.title = 'This browser cannot record canvas video';
    }
    this.el.recBtn.addEventListener('click', () => this.onRecord());

    this.el.toggleBtn.addEventListener('click', () => {
      this.el.panel.classList.toggle('collapsed');
      this.el.toggleBtn.textContent = this.el.panel.classList.contains('collapsed') ? '⚙' : '✕';
    });

    // Roster edits are delegated so cards can be rebuilt freely.
    this.el.roster.addEventListener('input', (e) => {
      const card = e.target.closest('[data-i]');
      if (!card) return;
      const i = Number(card.dataset.i);
      const field = e.target.dataset.field;
      if (!field) return;
      this.roster[i][field] = e.target.value;
      if (field === 'weapon' || field === 'ability') this.renderRoster();
      if (field === 'color') card.style.setProperty('--c', e.target.value);
    });

    this.el.roster.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act="remove"]');
      if (!btn) return;
      const i = Number(btn.closest('[data-i]').dataset.i);
      if (this.roster.length <= MIN_FIGHTERS) return;
      this.roster.splice(i, 1);
      this.renderRoster();
    });
  }

  addFighter() {
    if (this.roster.length >= MAX_FIGHTERS) return;
    const used = new Set(this.roster.map((r) => r.name));
    const name = NAMES.find((n) => !used.has(n)) || `Ball ${this.roster.length + 1}`;
    this.roster.push({
      name,
      color: PALETTE[this.roster.length % PALETTE.length],
      weapon: pick(WEAPON_KEYS),
      ability: pick(ABILITY_KEYS),
    });
    this.renderRoster();
  }

  randomize() {
    for (const r of this.roster) {
      r.weapon = pick(WEAPON_KEYS);
      r.ability = pick(ABILITY_KEYS);
    }
    this.renderRoster();
  }

  renderRoster() {
    const weaponOpts = (sel) => WEAPON_KEYS
      .map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${WEAPONS[k].label}</option>`)
      .join('');
    const abilityOpts = (sel) => ABILITY_KEYS
      .map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${ABILITIES[k].label}</option>`)
      .join('');

    this.el.roster.innerHTML = this.roster.map((r, i) => `
      <div class="fighter" data-i="${i}" style="--c:${r.color}">
        <div class="fighter-head">
          <input class="swatch" type="color" value="${r.color}" data-field="color" aria-label="Colour" />
          <input class="fname" type="text" value="${escapeAttr(r.name)}" data-field="name" maxlength="9" aria-label="Name" />
          <button class="remove" data-act="remove" title="Remove" ${this.roster.length <= MIN_FIGHTERS ? 'disabled' : ''}>×</button>
        </div>
        <div class="fighter-grid">
          <label>Weapon<select data-field="weapon">${weaponOpts(r.weapon)}</select></label>
          <label>Ability<select data-field="ability">${abilityOpts(r.ability)}</select></label>
        </div>
        <p class="blurb"><b>${WEAPONS[r.weapon].label}:</b> ${WEAPONS[r.weapon].blurb}</p>
        <p class="blurb"><b>${ABILITIES[r.ability].label}:</b> ${ABILITIES[r.ability].blurb}</p>
      </div>
    `).join('');

    this.el.addBtn.disabled = this.roster.length >= MAX_FIGHTERS;
  }

  buildSettings() {
    const sliders = SLIDERS.map((s) => `
      <label class="ctl">
        <span>${s.label}<b data-out="${s.key}">${fmt(SETTINGS[s.key])}</b></span>
        <input type="range" data-set="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${SETTINGS[s.key]}" />
      </label>
    `).join('');

    const toggles = TOGGLES.map((t) => `
      <label class="chk">
        <input type="checkbox" data-toggle="${t.key}" ${SETTINGS[t.key] ? 'checked' : ''} />
        <span>${t.label}</span>
      </label>
    `).join('');

    this.el.settings.innerHTML = sliders + `<div class="chk-grid">${toggles}</div>`;

    this.el.settings.addEventListener('input', (e) => {
      const sKey = e.target.dataset.set;
      if (sKey) {
        SETTINGS[sKey] = Number(e.target.value);
        const out = this.el.settings.querySelector(`[data-out="${sKey}"]`);
        if (out) out.textContent = fmt(SETTINGS[sKey]);
        return;
      }
      const tKey = e.target.dataset.toggle;
      if (tKey) {
        SETTINGS[tKey] = e.target.checked;
        if (tKey === 'sound') this.onSoundToggle?.(e.target.checked);
      }
    });
  }

  setState(state) {
    this.el.startBtn.textContent = state === 'running' ? 'Restart battle' : 'Start battle';
  }

  setRecording(on, elapsed = 0) {
    this.el.recBtn.classList.toggle('recording', on);
    this.el.recBtn.textContent = on ? `■ Stop (${elapsed.toFixed(0)}s)` : '● Record';
  }
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
