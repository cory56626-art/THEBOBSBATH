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


def whoosh(sec, f0, f1, level=0.8):
    n = int(sec * SR)
    t = tt(sec)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    steps = 10
    for i, f in enumerate(np.geomspace(f0, f1, steps)):
        a, b = int(i * n / steps), int((i + 1) * n / steps)
        out[a:b] = S.bp(noise, f * 0.6, f * 1.4)[a:b]
    return S.norm(out * np.sin(np.pi * t / sec) ** 1.5, level)


def dash():
    return whoosh(0.35, 600, 3000, 0.7)


def launch():
    boing = sweep(180, 520, 0.4) * np.exp(-tt(0.4) / 0.25) * 0.6
    return S.norm(mix([(0, whoosh(0.9, 300, 2500, 0.8)), (0, boing)], 1.0), 0.85)


def warn():
    t = tt(1.0)
    x = sweep(500, 1400, 1.0) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 14 * t))) * np.minimum(1, t / 0.05)
    crackle = S.hp(rng.standard_normal(len(t)), 3000) * (rng.random(len(t)) < 0.004) * 3
    return S.norm(S.lp(x * 0.5 + crackle, 6000), 0.55)


def charge():
    t = tt(0.5)
    growl = np.sin(2 * np.pi * (80 + 120 * t / 0.5) * t + 4 * np.sin(2 * np.pi * 9 * t))
    hiss = S.bp(rng.standard_normal(len(t)), 1500, 4000) * (t / 0.5) ** 2
    return S.norm((growl * 0.7 + hiss * 0.4) * np.minimum(1, t / 0.05), 0.75)


def mutate():
    seq = [note(n) for n in ("C6", "E6", "G6", "B6", "D7", "G7")]
    parts = [(i * 0.035, bell(f, 0.5) * 0.6) for i, f in enumerate(seq)]
    shimmer = S.hp(rng.standard_normal(int(0.8 * SR)), 6000) * np.exp(-tt(0.8) / 0.3) * 0.15
    return S.norm(S.reverb(mix(parts + [(0, shimmer)], 1.0), 0.8, 0.25), 0.8)


def discover():
    fan = announce()
    return S.norm(mix([(0, fan), (0.5, mutate() * 0.6)], 2.0), 0.85)


def tick():
    n = int(0.03 * SR)
    return S.norm(S.bp(rng.standard_normal(n), 2000, 6000) * np.exp(-np.arange(n) / (0.004 * SR)), 0.6)


def crate_win():
    seq = [note(n) for n in ("G5", "C6", "E6", "G6")]
    parts = [(i * 0.09, bell(f, 0.9)) for i, f in enumerate(seq)] + [(0.4, bell(note("C7"), 1.2) * 0.7)]
    return S.norm(S.reverb(mix(parts, 1.8), 1.0, 0.25), 0.85)


def rebirth():
    def pad(f, sec):
        t = tt(sec)
        x = S.saw(np.full(len(t), f)) + S.saw(np.full(len(t), f * 1.005)) + 0.5 * S.saw(np.full(len(t), f * 2))
        return S.lp(x, 3000) * np.minimum(1, t / 0.4) * np.exp(-np.maximum(0, t - 1.2) / 0.5)
    chord = pad(note("C4"), 2.2) + pad(note("E4"), 2.2) * 0.8 + pad(note("G4"), 2.2) * 0.8 + pad(note("C5"), 2.2) * 0.6
    return S.norm(S.reverb(chord + mix([(0.8, upgrade())], 2.2), 1.4, 0.3), 0.85)


def event():
    rumble = S.lp(rng.standard_normal(int(2.0 * SR)), 120) * np.exp(-tt(2.0) / 0.9)
    return S.norm(mix([(0, S.norm(rumble) * 0.8), (0.05, announce())], 2.2), 0.9)


def boom():
    sec = 1.8
    t = tt(sec)
    low = np.sin(2 * np.pi * (70 * np.exp(-t / 0.3) + 30) * t) * np.exp(-t / 0.4)
    noise = S.lp(rng.standard_normal(len(t)), 900) * np.exp(-t / 0.35)
    crack = S.hp(rng.standard_normal(len(t)), 2000) * np.exp(-t / 0.03)
    return S.norm(S.reverb(low + S.norm(noise) * 0.8 + S.norm(crack) * 0.5, 1.2, 0.25, 1500), 0.95)


def whistle():
    t = tt(1.8)
    x = sweep(2200, 500, 1.8) * np.minimum(1, t / 0.2) * 0.5
    air = S.bp(rng.standard_normal(len(t)), 1500, 5000) * 0.2 * (t / 1.8)
    return S.norm(x + air, 0.6)


def coin():
    return S.norm(mix([(0, bell(3200, 0.3)), (0.05, bell(4300, 0.35) * 0.8)], 0.45), 0.6)


def blast():
    t = tt(0.35)
    zap = sweep(1800, 400, 0.35, "square") * np.exp(-t / 0.08) * 0.5
    hiss = S.hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.05) * 0.5
    return S.norm(zap + hiss + sweep(900, 200, 0.35) * np.exp(-t / 0.12), 0.7)


def stun():
    t = tt(0.6)
    x = sum(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.25) for f in (1800, 2400, 3100)) * (0.6 + 0.4 * np.sin(2 * np.pi * 18 * t))
    return S.norm(x, 0.55)


def crack():
    t = tt(1.2)
    creak = S.bp(rng.standard_normal(len(t)), 1500, 5000) * (rng.random(len(t)) < 0.01) * 4
    tone_ = sweep(300, 900, 1.2) * 0.2 * np.minimum(1, t / 0.3)
    return S.norm(creak * np.minimum(1, t / 1.2) + tone_, 0.5)


def shatter():
    t = tt(0.8)
    x = S.hp(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.12)
    chimes = mix([(0.02 * k, bell(rng.uniform(2500, 6000), 0.5) * 0.15) for k in range(6)], 0.8)
    return S.norm(x + chimes[: len(x)], 0.8)


def rumble():
    t = tt(1.3)
    x = S.lp(rng.standard_normal(len(t)), 120) * np.minimum(1, t / 1.0) * (1 + 0.3 * np.sin(2 * np.pi * 7 * t))
    return S.norm(x, 0.7)


def geyser_():
    t = tt(1.6)
    roar = S.bp(rng.standard_normal(len(t)), 200, 2500) * np.exp(-t / 0.7) * np.minimum(1, t / 0.05)
    low = S.lp(rng.standard_normal(len(t)), 90) * np.exp(-t / 0.5)
    return S.norm(S.norm(roar) + S.norm(low) * 0.7, 0.9)


def burn():
    t = tt(0.8)
    sizzle = S.hp(rng.standard_normal(len(t)), 4000) * np.exp(-t / 0.3) * (0.5 + 0.5 * (rng.random(len(t)) < 0.3))
    whoomp = S.lp(rng.standard_normal(len(t)), 400) * np.exp(-t / 0.15)
    return S.norm(sizzle + whoomp, 0.75)


def clap():
    t = tt(2.0)
    crack_ = S.hp(rng.standard_normal(len(t)), 1500) * np.exp(-t / 0.04)
    boom_ = np.sin(2 * np.pi * (60 * np.exp(-t / 0.4) + 25) * t) * np.exp(-t / 0.6)
    roll = S.lp(rng.standard_normal(len(t)), 200) * np.exp(-t / 0.9)
    return S.norm(S.reverb(S.norm(crack_) * 0.8 + boom_ + S.norm(roll) * 0.6, 1.4, 0.3, 1800), 0.95)


def roar():
    sec = 1.4
    t = tt(sec)
    f = 70 + 30 * np.sin(np.pi * t / sec)
    growl = S.saw(f * (1 + 0.04 * np.sin(2 * np.pi * 23 * t)))
    breath = S.bp(rng.standard_normal(len(t)), 300, 1500)
    env = np.sin(np.pi * t / sec) ** 0.8
    return S.norm(S.reverb(S.lp(S.tanh_drive(growl * 0.7 + breath * 0.5, 2), 1800) * env, 1.0, 0.3), 0.85)


def pull():
    return S.norm(mix([(0, whoosh(2.6, 1200, 200, 0.8)), (0, rumble()[: int(2.6 * SR)] * 0.5)], 2.7), 0.8)


def portal_():
    t = tt(0.9)
    x = sweep(200, 1600, 0.9) * (0.6 + 0.4 * np.sin(2 * np.pi * 30 * t)) * np.sin(np.pi * t / 0.9)
    return S.norm(S.reverb(x + whoosh(0.9, 400, 3000, 0.5), 0.8, 0.3), 0.75)


def boss_horn():
    def horn(f, sec):
        t = tt(sec)
        x = S.saw(np.full(len(t), f)) + 0.6 * S.saw(np.full(len(t), f * 1.5)) + 0.4 * S.saw(np.full(len(t), f * 0.5))
        return S.lp(x, 1400) * np.minimum(1, t / 0.15) * np.exp(-np.maximum(0, t - sec * 0.6) / 0.3)
    return S.norm(S.reverb(mix([(0, horn(110, 1.0)), (0.9, horn(104, 1.4)), (0, rumble() * 0.6)], 2.6), 1.6, 0.3), 0.9)


def victory():
    seq = [(0, "C5"), (0.15, "E5"), (0.3, "G5"), (0.45, "C6"), (0.7, "G5"), (0.85, "C6")]
    parts = [(st, bell(note(n), 0.9)) for st, n in seq]
    chord = [(1.0, bell(note("C6"), 2.0)), (1.0, bell(note("E6"), 2.0) * 0.8), (1.0, bell(note("G6"), 2.0) * 0.7)]
    return S.norm(S.reverb(mix(parts + chord, 3.2), 1.4, 0.25), 0.9)


def stage():
    return S.norm(mix([(0, whoosh(1.2, 200, 1500, 0.6)), (0.3, bell(note("G5"), 1.2) * 0.6), (0.45, bell(note("D6"), 1.2) * 0.5)], 1.8), 0.75)


def main():
    items = [("Catch", catch()), ("Place", place()), ("Steal", steal()), ("Alarm", alarm()), ("Bonk", bonk()),
             ("Howl", howl()), ("Upgrade", upgrade()), ("Announce", announce()), ("Lock", lock()), ("Zap", zap()),
             ("Sell", sell()), ("Error", error()), ("Thunder", thunder()), ("Dash", dash()), ("Launch", launch()),
             ("Warn", warn()), ("Charge", charge()), ("Mutate", mutate()), ("Discover", discover()), ("Tick", tick()),
             ("CrateWin", crate_win()), ("Rebirth", rebirth()), ("Event", event()), ("Boom", boom()),
             ("Whistle", whistle()), ("Coin", coin()), ("Blast", blast()), ("Stun", stun()), ("Crack", crack()),
             ("Shatter", shatter()), ("Rumble", rumble()), ("Geyser", geyser_()), ("Burn", burn()), ("Clap", clap()),
             ("Roar", roar()), ("Pull", pull()), ("Portal", portal_()), ("Boss", boss_horn()), ("Victory", victory()),
             ("Stage", stage())]
    regions = S.sheet("storm", items)
    with open(os.path.join(S.OUT, "regions.json"), "w") as fh:
        json.dump({"Storm": regions}, fh, indent=1)


if __name__ == "__main__":
    main()
