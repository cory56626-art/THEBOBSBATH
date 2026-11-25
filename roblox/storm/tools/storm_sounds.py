"""Synthesise Steal a Storm's sounds into one sheet (build/sounds/storm.ogg + regions.json)."""
from __future__ import annotations

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(os.path.dirname(ROOT), "skinwalker", "tools"))
import sounds as S  # noqa: E402

SR = S.SR
S.OUT = os.path.join(ROOT, "build", "sounds")
rng = np.random.default_rng(99)


def tt(sec):
    return np.arange(int(sec * SR)) / SR


def tone(f, sec, tau=0.3, harm=((1, 1.0),), attack=0.003):
    t = tt(sec)
    x = sum(a * np.sin(2 * np.pi * f * r * t) for r, a in harm)
    return x * np.exp(-t / tau) * np.minimum(1, t / attack)


def mix(parts, total):
    out = np.zeros(int(total * SR))
    for start, x in parts:
        a = int(start * SR)
        n = min(len(x), len(out) - a)
        out[a:a + n] += x[:n]
    return out


def note(name):
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    return 440 * 2 ** ((names[name[0]] + 12 * (int(name[-1]) - 4)) / 12)


def bell(f, sec=0.8):
    return tone(f, sec, 0.35, ((1, 1), (2.76, 0.4), (5.4, 0.2)))


def sweep(f0, f1, sec, kind="sine"):
    t = tt(sec)
    f = f0 * (f1 / f0) ** (t / sec)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) if kind == "sine" else np.sign(np.sin(ph)) * 0.6


def catch():
    n = int(0.6 * SR)
    t = tt(0.6)
    noise = rng.standard_normal(n)
    # rising filtered whoosh
    out = np.zeros(n)
    for i, f in enumerate(np.geomspace(400, 4000, 12)):
        a, b = int(i * n / 12), int((i + 1) * n / 12)
        out[a:b] = S.bp(noise, f * 0.7, f * 1.3)[a:b]
    out *= np.sin(np.pi * t / 0.6) ** 2
    chime = mix([(0.25, bell(note("E6"), 0.5) * 0.4), (0.33, bell(note("B6"), 0.5) * 0.35)], 0.9)
    return S.norm(mix([(0, S.norm(out) * 0.7)], 0.9) + chime, 0.8)


def place():
    coins = sum(mix([(0.02 * k, bell(rng.uniform(2500, 4200), 0.25) * 0.25)], 0.6) for k in range(6))
    ding = mix([(0, bell(note("C6"), 0.7)), (0.09, bell(note("G6"), 0.7) * 0.9)], 0.9)
    return S.norm(S.reverb(ding + mix([(0, coins)], 0.9), 0.6, 0.15), 0.8)


def steal():
    sneaky = mix([(0, tone(note("E4"), 0.15, 0.08, ((1, 1), (2, 0.4)))), (0.16, tone(note("G4"), 0.15, 0.08, ((1, 1), (2, 0.4)))),
                  (0.32, tone(note("B4"), 0.3, 0.2, ((1, 1), (2, 0.4))))], 0.9)
    return S.norm(sneaky + place()[: int(0.9 * SR)] * 0.5, 0.8)


def alarm():
    parts = []
    for k in range(3):
        parts.append((k * 0.36, sweep(700, 1000, 0.18, "square") * 0.5))
        parts.append((k * 0.36 + 0.18, sweep(1000, 700, 0.18, "square") * 0.5))
    return S.norm(S.lp(mix(parts, 1.15), 5000), 0.7)


def bonk():
    t = tt(0.35)
    b = sweep(700, 140, 0.35) * np.exp(-t / 0.09)
    thud = S.lp(rng.standard_normal(len(t)), 300) * np.exp(-t / 0.05)
    return S.norm(b + S.norm(thud) * 0.6, 0.9)


def howl():
    sec = 1.6
    t = tt(sec)
    noise = rng.standard_normal(len(t))
    f = 300 + 500 * np.sin(np.pi * t / sec) + 60 * np.sin(2 * np.pi * 5 * t)
    out = np.zeros(len(t))
    hop = 2048
    for a in range(0, len(t), hop):
        seg = slice(a, min(len(t), a + hop * 2))
        out[seg] += S.peak(noise[seg], float(f[a]), 12) * np.hanning(len(out[seg]))
    growl = np.sin(2 * np.pi * 70 * t + 3 * np.sin(2 * np.pi * 11 * t)) * 0.3
    env = np.sin(np.pi * t / sec) ** 1.5
    return S.norm(S.reverb((S.norm(out) + growl) * env, 0.8, 0.25), 0.75)


def upgrade():
    seq = [note(n) for n in ("C5", "E5", "G5", "C6", "E6", "G6")]
    parts = [(i * 0.06, bell(f, 0.6) * 0.7) for i, f in enumerate(seq)]
    return S.norm(S.reverb(mix(parts, 1.1), 0.8, 0.2), 0.8)


def announce():
    def brass(f, sec):
        t = tt(sec)
        x = S.saw(np.full(len(t), f)) + 0.5 * S.saw(np.full(len(t), f * 1.003))
        return S.lp(x, 2500) * np.minimum(1, t / 0.03) * np.exp(-t / (sec * 0.8))
    parts = [(0, brass(note("C4"), 0.22)), (0.18, brass(note("E4"), 0.22)), (0.36, brass(note("G4"), 0.22)),
             (0.54, brass(note("C5"), 0.8) + brass(note("E5"), 0.8) * 0.6)]
    return S.norm(S.reverb(mix(parts, 1.6), 1.0, 0.2), 0.75)


def lock():
    t = tt(0.6)
    x = sweep(120, 600, 0.6) * (1 + 0.3 * np.sin(2 * np.pi * 30 * t))
    buzz = sweep(240, 1200, 0.6, "square") * 0.25
    return S.norm(S.lp(x + buzz, 4000) * np.sin(np.pi * np.minimum(1, t / 0.6)) ** 0.5, 0.7)


def zap():
    t = tt(0.3)
    x = S.hp(rng.standard_normal(len(t)), 1500) * np.exp(-t / 0.05) + sweep(2000, 300, 0.3, "square") * np.exp(-t / 0.08)
    return S.norm(x, 0.7)


def sell():
    return S.norm(mix([(0.03 * k, bell(rng.uniform(3000, 4500), 0.3) * 0.5) for k in range(4)], 0.6), 0.7)


def error():
    return S.norm(mix([(0, sweep(220, 200, 0.12, "square")), (0.16, sweep(200, 170, 0.18, "square"))], 0.4) * 0.6, 0.6)


def thunder():
    sec = 2.8
    t = tt(sec)
    crack = S.hp(rng.standard_normal(len(t)), 800) * np.exp(-t / 0.08)
    rumble = S.lp(rng.standard_normal(len(t)), 160) * (np.exp(-t / 1.1) * (1 + 0.5 * np.sin(2 * np.pi * 3 * t)))
    return S.norm(S.reverb(S.norm(crack) * 0.6 + S.norm(rumble), 1.5, 0.3, 2000), 0.9)


def main():
    items = [("Catch", catch()), ("Place", place()), ("Steal", steal()), ("Alarm", alarm()), ("Bonk", bonk()),
             ("Howl", howl()), ("Upgrade", upgrade()), ("Announce", announce()), ("Lock", lock()), ("Zap", zap()),
             ("Sell", sell()), ("Error", error()), ("Thunder", thunder())]
    regions = S.sheet("storm", items)
    with open(os.path.join(S.OUT, "regions.json"), "w") as fh:
        json.dump({"Storm": regions}, fh, indent=1)


if __name__ == "__main__":
    main()
