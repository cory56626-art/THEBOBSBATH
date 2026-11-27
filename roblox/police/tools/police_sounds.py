"""Synthesise Precinct 9's sounds into one sheet (build/sounds/p9.ogg + regions.json).

Loops (Wail, Yelp, Engine) are made to repeat seamlessly: whole cycles, continuous phase.
"""
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
rng = np.random.default_rng(909)


def tt(sec):
    return np.arange(int(round(sec * SR))) / SR


def tone(f, sec, tau=0.3, harm=((1, 1.0),), attack=0.003):
    t = tt(sec)
    x = sum(a * np.sin(2 * np.pi * f * r * t) for r, a in harm)
    return x * np.exp(-t / tau) * np.minimum(1, t / attack)


def mix(parts, total):
    out = np.zeros(int(round(total * SR)))
    for start, x in parts:
        a = int(start * SR)
        n = min(len(x), len(out) - a)
        out[a:a + n] += x[:n]
    return out


def bell(f, sec=0.8):
    return tone(f, sec, 0.35, ((1, 1), (2.76, 0.4), (5.4, 0.2)))


def note(name):
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    return 440 * 2 ** ((names[name[0]] + 12 * (int(name[-1]) - 4)) / 12)


def looped_osc(freq, harmonics):
    """An oscillator over a frequency curve whose total phase is a whole number of cycles (seamless loop)."""
    total = np.sum(freq) / SR
    freq = freq * (round(total) / total)
    ph = 2 * np.pi * np.cumsum(freq) / SR
    return sum(a * np.sin(k * ph) for k, a in harmonics)


def circular_bp(x, lo, hi):
    """Band-pass that wraps around (so a loop stays seamless)."""
    n = len(x)
    y = S.bp(np.concatenate([x, x, x]), lo, hi)
    return y[n:2 * n]


def siren(period, lo, hi, cycles, shape="wail"):
    sec = period * cycles
    t = tt(sec)
    ph = (t / period) % 1.0
    if shape == "wail":
        u = 0.5 - 0.5 * np.cos(2 * np.pi * ph)  # smooth rise and fall
        u = u ** 0.8
    else:  # yelp: fast rise, slower fall
        u = np.where(ph < 0.35, ph / 0.35, 1 - (ph - 0.35) / 0.65)
        u = 0.5 - 0.5 * np.cos(np.pi * u)
    f = lo * (hi / lo) ** u
    harm = [(1, 1.0), (2, 0.55), (3, 0.35), (4, 0.18), (5, 0.12), (6, 0.06)]
    x = looped_osc(f, harm)
    x = np.tanh(x * 1.6)  # horn speaker drive
    x = circular_bp(x, 500, 4500)
    return S.norm(x, 0.75)


def engine():
    sec = 1.0
    t = tt(sec)
    f = np.full(len(t), 48.0)
    x = looped_osc(f, [(1, 1.0), (2, 0.6), (3, 0.45), (4, 0.25), (6, 0.12), (8, 0.06)])
    pulse = 0.75 + 0.25 * np.sin(2 * np.pi * 24 * t)  # firing pulses (whole cycles per loop)
    noise = circular_bp(rng.standard_normal(len(t)), 80, 600) * 0.25
    return S.norm((x * pulse + noise) * 0.8, 0.6)


def taser():
    sec = 1.1
    t = tt(sec)
    n = len(t)
    crackle = np.zeros(n)
    i = 0
    while i < n:
        w = int(rng.uniform(0.0015, 0.004) * SR)
        crackle[i:i + w] += rng.standard_normal(min(w, n - i)) * rng.uniform(0.4, 1.0)
        i += w + int(rng.uniform(0.002, 0.012) * SR)
    crackle = S.hp(crackle, 1800)
    buzz = np.sign(np.sin(2 * np.pi * 52 * t)) * 0.25 + np.sin(2 * np.pi * 3100 * t) * 0.08
    envl = np.minimum(1, t / 0.01) * np.where(t > sec - 0.12, (sec - t) / 0.12, 1)
    pop = S.hp(rng.standard_normal(int(0.05 * SR)), 900) * np.exp(-tt(0.05) / 0.01)
    return S.norm(mix([(0, pop * 1.5), (0.02, (S.norm(crackle) * 0.8 + buzz) * envl)], sec + 0.05), 0.75)


def click(pitch=1.0, sec=0.05):
    t = tt(sec)
    x = S.hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.004)
    x += tone(2400 * pitch, sec, 0.01, ((1, 1), (2.3, 0.5))) * 0.5
    return x


def cuffs():
    parts = []
    for k in range(7):
        parts.append((0.035 * k, click(1.0 + 0.05 * (k % 2)) * 0.8))
    for k in range(6):
        parts.append((0.45 + 0.035 * k, click(0.9) * 0.8))
    jingle = mix([(0.02 * k, bell(rng.uniform(3200, 5200), 0.25) * 0.12) for k in range(5)], 0.4)
    return S.norm(mix(parts + [(0.25, jingle)], 0.9), 0.8)


def radio():
    sec = 0.75
    sq = S.bp(rng.standard_normal(int(0.16 * SR)), 900, 3500) * np.exp(-tt(0.16) / 0.05)
    beep = tone(1250, 0.09, 1, attack=0.002) * np.where(tt(0.09) > 0.08, 0, 1)
    beep2 = tone(1650, 0.09, 1, attack=0.002) * np.where(tt(0.09) > 0.08, 0, 1)
    hiss = S.bp(rng.standard_normal(int(0.35 * SR)), 1500, 5000) * 0.06
    return S.norm(mix([(0, sq * 0.7), (0.14, beep * 0.5), (0.25, beep2 * 0.5), (0.36, hiss),
                       (0.6, sq[: int(0.1 * SR)] * 0.5)], sec), 0.65)


def cash():
    coins = mix([(0.025 * k, bell(rng.uniform(2600, 4300), 0.3) * 0.35) for k in range(7)], 0.8)
    ding = mix([(0, bell(note("E6"), 0.6)), (0.08, bell(note("B6"), 0.6) * 0.8)], 0.8)
    return S.norm(S.reverb(ding * 0.8 + coins, 0.5, 0.15), 0.75)


def crash():
    sec = 1.3
    t = tt(sec)
    thud = S.lp(rng.standard_normal(len(t)), 220) * np.exp(-t / 0.12)
    metal = sum(tone(f, sec, 0.25, ((1, 1), (1.47, 0.6), (2.31, 0.4))) * a for f, a in ((180, 0.5), (310, 0.4), (520, 0.3)))
    crunch = S.bp(rng.standard_normal(len(t)), 600, 4000) * np.exp(-t / 0.18)
    glass = mix([(0.05 + rng.uniform(0, 0.4), bell(rng.uniform(3500, 7000), 0.25) * 0.15) for _ in range(9)], sec)
    return S.norm(S.reverb(S.norm(thud) + S.norm(metal) * 0.5 + S.norm(crunch) * 0.6 + glass, 0.6, 0.15), 0.85)


def wanted():
    def brass(f, sec):
        t = tt(sec)
        x = sum(a * np.sin(2 * np.pi * f * k * t) for k, a in ((1, 1), (2, 0.6), (3, 0.4), (4, 0.25), (5, 0.12)))
        return np.tanh(x * 1.4) * np.minimum(1, t / 0.03) * np.exp(-t / 0.6)
    hit = mix([(0, brass(note("D3"), 0.9) * 0.7), (0, brass(note("A3"), 0.9) * 0.5),
               (0.32, brass(note("D3"), 1.0) * 0.8), (0.32, brass(note("G#3".replace("#", "")), 1.0) * 0.5)], 1.4)
    tick = mix([(0.12 * k, S.hp(rng.standard_normal(int(0.02 * SR)), 4000) * 0.2) for k in range(10)], 1.4)
    return S.norm(S.reverb(hit + tick, 0.7, 0.2), 0.8)


def release():
    return S.norm(S.reverb(mix([(0, bell(note("G5"), 0.8)), (0.12, bell(note("C6"), 0.8)), (0.24, bell(note("E6"), 1.0))],
                               1.4), 0.6, 0.2), 0.7)


def promotion():
    def brass(f, sec):
        t = tt(sec)
        x = sum(a * np.sin(2 * np.pi * f * k * t) for k, a in ((1, 1), (2, 0.7), (3, 0.5), (4, 0.3), (5, 0.15)))
        return np.tanh(x * 1.2) * np.minimum(1, t / 0.02) * np.exp(-t / 0.9)
    seq = [("C4", 0, 0.18), ("E4", 0.16, 0.18), ("G4", 0.32, 0.18), ("C5", 0.48, 1.2)]
    parts = [(s, brass(note(n), d + 0.3) * 0.6) for n, s, d in seq]
    parts += [(0.48, brass(note("E4"), 1.4) * 0.35), (0.48, brass(note("G4"), 1.4) * 0.35)]
    return S.norm(S.reverb(mix(parts, 2.2), 0.8, 0.25), 0.8)


def error():
    t = tt(0.32)
    x = np.sign(np.sin(2 * np.pi * 190 * t)) * 0.4 * np.where(t > 0.3, 0, 1)
    return S.norm(S.lp(x, 2500), 0.5)


def booked():
    stamp = S.lp(rng.standard_normal(int(0.2 * SR)), 400) * np.exp(-tt(0.2) / 0.03)
    door = S.lp(rng.standard_normal(int(0.4 * SR)), 900) * np.exp(-tt(0.4) / 0.08) * 0.5
    return S.norm(mix([(0, door), (0.3, S.norm(stamp)), (0.55, cash() * 0.8)], 1.5), 0.8)


def door():
    sec = 0.4
    t = tt(sec)
    thunk = S.lp(rng.standard_normal(len(t)), 300) * np.exp(-t / 0.05)
    latch = click(0.6, 0.05)
    return S.norm(mix([(0, latch * 0.4), (0.03, S.norm(thunk))], sec), 0.7)


def horn():
    sec = 0.55
    t = tt(sec)
    x = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (420, 500))
    x = S.bp(x, 300, 3000) * np.minimum(1, t / 0.01) * np.where(t > sec - 0.05, (sec - t) / 0.05, 1)
    return S.norm(x, 0.6)


def chirp():
    """A short siren chirp ("whoop") used when lights come on."""
    sec = 0.45
    t = tt(sec)
    f = 500 * (1400 / 500) ** (np.sin(np.pi * t / sec))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.tanh(sum(a * np.sin(k * ph) for k, a in ((1, 1), (2, 0.5), (3, 0.3))) * 1.5)
    return S.norm(S.bp(x, 500, 4500) * np.minimum(1, t / 0.02) * np.minimum(1, (sec - t) / 0.08), 0.6)


def whoosh():
    sec = 0.5
    n = int(sec * SR)
    t = tt(sec)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    for i, f in enumerate(np.geomspace(500, 2500, 10)):
        a, b = int(i * n / 10), int((i + 1) * n / 10)
        out[a:b] = S.bp(noise, f * 0.6, f * 1.4)[a:b]
    return S.norm(out * np.sin(np.pi * t / sec) ** 1.5, 0.6)


def main():
    items = [("Wail", siren(3.2, 640, 1480, 2, "wail")), ("Yelp", siren(0.34, 700, 1500, 9, "yelp")),
             ("Engine", engine()), ("Taser", taser()), ("Cuffs", cuffs()), ("Radio", radio()), ("Cash", cash()),
             ("Crash", crash()), ("Wanted", wanted()), ("Release", release()), ("Promotion", promotion()),
             ("Error", error()), ("Booked", booked()), ("Door", door()), ("Horn", horn()), ("Chirp", chirp()),
             ("Whoosh", whoosh())]
    regions = S.sheet("p9", items)
    with open(os.path.join(S.OUT, "regions.json"), "w") as fh:
        json.dump({"P9": regions}, fh, indent=1)


if __name__ == "__main__":
    main()
