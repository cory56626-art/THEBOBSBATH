"""Synthesise the chess club's sounds (no samples) into one sound sheet: build/sounds/chess.ogg + regions.json.

    python3 tools/chess_sounds.py && python3 tools/upload_sounds.py
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(os.path.dirname(ROOT), "skinwalker", "tools"))
import sounds as S  # noqa: E402  (DSP helpers from the horror game's synthesiser)

SR = S.SR
S.OUT = os.path.join(ROOT, "build", "sounds")
rng = np.random.default_rng(64)


def wood_knock(bright=1.0, body=700, length=0.22, level=1.0):
    n = int(length * SR)
    click = S.bp(rng.standard_normal(n), 1800, 6500) * S.decay(n, 0.006 * bright)
    res = S.peak(rng.standard_normal(n), body, 18) * S.decay(n, 0.035) * 0.6
    res2 = S.peak(rng.standard_normal(n), body * 1.73, 22) * S.decay(n, 0.022) * 0.4
    t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * 170 * t) * S.decay(n, 0.03) * 0.5
    x = S.norm(click) * 0.8 + S.norm(res) * 0.7 + S.norm(res2) * 0.4 + thump
    return S.norm(S.reverb(S.norm(x), 0.35, 0.12, 5000), 0.85 * level)


def move(variant):
    return wood_knock(1.0 + 0.15 * variant, 640 + 70 * variant, 0.24)


def capture():
    a = wood_knock(1.2, 760, 0.2)
    b = wood_knock(0.9, 590, 0.26)
    gap = int(0.07 * SR)
    out = np.zeros(gap + len(b))
    out[: len(a)] += a * 0.8
    out[gap:] += b
    slide = S.bp(rng.standard_normal(len(out)), 2500, 7000) * S.env(len(out), 0.02, True, 3) * 0.05
    return S.norm(out + slide, 0.95)


def tick():
    n = int(0.06 * SR)
    x = S.bp(rng.standard_normal(n), 3000, 9000) * S.decay(n, 0.004)
    return S.norm(x, 0.5)


def bell(f, length=1.2, level=0.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for ratio, amp, tau in ((1, 1.0, 0.5), (2.76, 0.45, 0.22), (5.4, 0.25, 0.1), (8.9, 0.1, 0.05)):
        x += amp * np.sin(2 * np.pi * f * ratio * t) * S.decay(n, tau)
    x *= np.minimum(1, t / 0.003)
    return S.norm(S.reverb(x, 1.0, 0.25, 6000), level)


def marimba(f, length=0.7, level=0.7):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * S.decay(n, 0.32) + 0.3 * np.sin(2 * np.pi * 4 * f * t) * S.decay(n, 0.06)
    x += S.bp(rng.standard_normal(n), 2000, 6000) * S.decay(n, 0.004) * 0.15
    x *= np.minimum(1, t / 0.002)
    return S.norm(x, level)


def seq(notes, step, tail=1.2, voice=marimba, level=0.8):
    total = int((step * len(notes) + tail) * SR)
    out = np.zeros(total)
    for i, f in enumerate(notes):
        s = voice(f)
        a = int(i * step * SR)
        out[a:a + len(s)] += s[: total - a]
    return S.norm(S.reverb(out, 1.2, 0.22, 7000), level)


def note(name):
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    semis = names[name[0]] + 12 * (int(name[-1]) - 4)
    return 440 * 2 ** (semis / 12)


def main():
    items = [
        ("Move1", move(0)), ("Move2", move(1)), ("Move3", move(2)),
        ("Capture", capture()),
        ("Check", bell(note("A5"), 1.3, 0.5)),
        ("Select", tick()),
        ("Start", seq([note("C5"), note("G5")], 0.13, 0.8, level=0.6)),
        ("Win", seq([note("C5"), note("E5"), note("G5"), note("C6"), note("E6")], 0.11, 1.4)),
        ("Lose", seq([note("G4"), note("E4"), note("C4")], 0.22, 1.2, level=0.6)),
        ("Draw", seq([note("E5"), note("C5")], 0.2, 1.0, level=0.6)),
    ]
    regions = S.sheet("chess", items)
    with open(os.path.join(S.OUT, "regions.json"), "w") as fh:
        json.dump({"Chess": regions}, fh, indent=1)


if __name__ == "__main__":
    main()
