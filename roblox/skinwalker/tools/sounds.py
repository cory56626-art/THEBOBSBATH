"""Synthesise every sound in the game from scratch (no samples), packed into 3 "sound sheets".

Roblox limits how many audio files an account can upload, so each sheet holds many sounds back to back and
the game plays slices of it (Sound.PlaybackRegion). Writes build/sounds/<sheet>.ogg and
src/ReplicatedStorage/SoundRegions.luau (name -> {start, end} for each sheet).

    python3 tools/sounds.py
"""
from __future__ import annotations

import json
import os
import subprocess

import numpy as np
from scipy import signal

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "build", "sounds")
rng = np.random.default_rng(1313)


# ----------------------------------------------------------------------------- DSP helpers
def t(sec):
    return np.arange(int(sec * SR)) / SR


def noise(sec):
    return rng.standard_normal(int(sec * SR))


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype="high", fs=SR, output="sos"), x)


def peak(x, f, q):
    b, a = signal.iirpeak(f, q, fs=SR)
    return signal.lfilter(b, a, x)


def env(n, attack, release, curve=2.0):
    """Attack then decay envelope over n samples."""
    a = max(1, int(attack * SR))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) ** 0.7
    r = n - a
    if r > 0:
        e[a:] = (1 - np.linspace(0, 1, r)) ** curve
    return e[:n] if release else e


def decay(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def norm(x, p=0.9):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * p


def reverb(x, size=0.9, wet=0.25, tone=4000):
    n = int(size * SR)
    ir = lp(noise(size), tone) * decay(n, size / 4.5)
    ir[0] = 0
    wetsig = signal.fftconvolve(x, ir)
    out = np.concatenate([x, np.zeros(len(wetsig) - len(x))])
    return out * (1 - wet) + norm(wetsig, np.max(np.abs(x)) + 1e-9) * wet


def jitter(n, rate, depth):
    """Smooth random modulation, e.g. for pitch wobble."""
    k = max(2, int(n / SR * rate) + 2)
    pts = rng.uniform(-1, 1, k)
    return 1 + depth * np.interp(np.linspace(0, k - 1, n), np.arange(k), pts)


def saw(freq_curve):
    phase = np.cumsum(freq_curve) / SR
    return 2 * (phase % 1.0) - 1


def tanh_drive(x, d):
    return np.tanh(x * d) / np.tanh(d)


def trim(x, sec):
    return x[: int(sec * SR)]


# ----------------------------------------------------------------------------- creature sounds
def breath(kind="in", length=1.4, depth=1.0):
    n = int(length * SR)
    base = noise(length)
    if kind == "in":
        x = bp(base, 500, 3800) * 0.7 + peak(base, 900, 4) * 0.5 + peak(base, 2600, 6) * 0.35
        e = env(n, length * 0.55, True, 1.6)
    else:
        x = bp(base, 160, 1800) * 0.8 + peak(base, 420, 3) * 0.6
        e = env(n, length * 0.18, True, 1.2)
        tt = t(length)
        f0 = 62 * jitter(n, 6, 0.08)
        x += lp(saw(f0), 600) * 0.25 * depth  # a growl underneath the exhale
    # wet rattle in the throat
    rattle = 1 + 0.6 * np.sign(np.sin(2 * np.pi * np.cumsum(28 * jitter(n, 8, 0.4)) / SR))
    x = x * (0.65 + 0.35 * rattle)
    crackles = np.zeros(n)
    for i in rng.integers(0, n - 400, int(length * 40)):
        crackles[i] = rng.uniform(-1, 1)
    x += bp(crackles, 2500, 7000) * 3.0
    return norm(reverb(x * e, 0.7, 0.2))


def click(pitch=1.0):
    n = int(0.12 * SR)
    imp = np.zeros(n)
    imp[0] = 1
    x = peak(imp, 2100 * pitch, 12) * 3 + peak(imp, 620 * pitch, 6) * 2 + peak(imp, 4200 * pitch, 20)
    x += lp(noise(0.12), 900) * decay(n, 0.006) * 0.4
    return norm(x * decay(n, 0.025))


def chatter(count=12, length=1.1):
    out = np.zeros(int(length * SR))
    pos = 0.0
    for i in range(count):
        c = click(rng.uniform(0.8, 1.25)) * rng.uniform(0.5, 1.0)
        s = int(pos * SR)
        if s + len(c) > len(out):
            break
        out[s:s + len(c)] += c
        pos += rng.uniform(0.03, 0.09) * (1.6 if i % 4 == 3 else 1)
    return norm(reverb(out, 0.6, 0.25))


def throat_clicks(length=1.4):
    """Slow wet glottal clicks: tok... tok-tok..."""
    out = np.zeros(int(length * SR))
    pos = 0.05
    while pos < length - 0.15:
        n = int(0.09 * SR)
        imp = np.zeros(n)
        imp[0] = 1
        tok = peak(imp, rng.uniform(380, 520), 5) * 3 + peak(imp, rng.uniform(1100, 1500), 9) * 1.5
        tok = tok * decay(n, 0.018) + bp(noise(0.09), 1500, 5000) * decay(n, 0.004) * 0.3
        s = int(pos * SR)
        out[s:s + n] += tok * rng.uniform(0.6, 1)
        pos += rng.choice([0.09, 0.12, 0.35, 0.5])
    return norm(reverb(out, 0.8, 0.3))


def growl(length=2.0, f0=68, rough=1.0):
    n = int(length * SR)
    f = f0 * jitter(n, 9, 0.12) * np.linspace(1.05, 0.92, n)
    src = saw(f) + 0.6 * saw(f * 0.5) + 0.3 * noise(length)
    trem = 1 + 0.55 * rough * np.sin(2 * np.pi * np.cumsum(21 * jitter(n, 5, 0.3)) / SR)
    x = (peak(src, 420, 2.5) * 1.2 + peak(src, 820, 3) + peak(src, 2350, 5) * 0.5) * trem
    x = tanh_drive(norm(x), 3.0)
    x += bp(noise(length), 300, 2000) * 0.15
    e = env(n, length * 0.3, True, 1.3)
    return norm(reverb(lp(x * e, 5000), 1.0, 0.25))


def screech(length=1.7):
    n = int(length * SR)
    tt = t(length)
    f = (950 + 500 * np.minimum(tt / 0.25, 1)) * (1 + 0.04 * np.sin(2 * np.pi * 7 * tt)) * jitter(n, 12, 0.03)
    x = saw(f) + 0.7 * saw(f * 1.497) + 0.5 * saw(f * 0.5 * 1.06)
    x = bp(x, 600, 7000) + bp(noise(length), 2500, 8000) * 0.6
    x = tanh_drive(norm(x), 4)
    x += growl(length, 55, 1.2)[:n] * 0.5
    e = env(n, 0.06, True, 1.4)
    return norm(reverb(x * e, 1.2, 0.3))


def creature_step(heavy=1.0):
    n = int(0.45 * SR)
    tt = t(0.45)
    thud = np.sin(2 * np.pi * np.cumsum(70 * np.exp(-tt * 8) + 38) / SR) * decay(n, 0.07) * heavy
    body = lp(noise(0.45), 700) * decay(n, 0.03) * 0.8
    x = thud + body
    for k in range(rng.integers(2, 4)):  # claws tapping the tiles
        s = int(rng.uniform(0.01, 0.06) * SR)
        cl = click(rng.uniform(1.2, 1.7)) * 0.35
        x[s:s + len(cl)] += cl[: n - s]
    return norm(reverb(x, 0.6, 0.18))


def claw_ticks():
    out = np.zeros(int(0.35 * SR))
    for k in range(4):
        s = int(k * rng.uniform(0.05, 0.08) * SR)
        c = click(rng.uniform(1.4, 2.0)) * rng.uniform(0.4, 1)
        out[s:s + len(c)] += c[: len(out) - s]
    return norm(out)


def swipe():
    n = int(0.35 * SR)
    tt = t(0.35)
    x = noise(0.35)
    sweep = np.zeros(n)
    # time-varying band: process in chunks
    chunks = 14
    for i in range(chunks):
        a, b = i * n // chunks, (i + 1) * n // chunks
        fc = 500 + 2600 * (i / chunks)
        sweep[a:b] = bp(x, fc * 0.7, fc * 1.3)[a:b]
    return norm(sweep * np.sin(np.pi * np.minimum(tt / 0.35, 1)) ** 2)


def hit():
    n = int(0.4 * SR)
    tt = t(0.4)
    x = np.sin(2 * np.pi * np.cumsum(110 * np.exp(-tt * 12) + 50) / SR) * decay(n, 0.06)
    x += lp(noise(0.4), 1500) * decay(n, 0.05) * 0.7
    x += bp(noise(0.4), 2500, 6000) * decay(n, 0.02) * 0.25  # a little wet
    return norm(reverb(x, 0.5, 0.15))


def stinger():
    n = int(2.6 * SR)
    tt = t(2.6)
    x = np.zeros(n)
    for f in (110, 116.5, 155.6, 233.1, 246.9):
        x += saw(np.full(n, f) * jitter(n, 3, 0.004))
    x = lp(x, 2500) * env(n, 0.04, True, 2.2)
    x += bp(noise(2.6), 800, 6000) * decay(n, 0.25) * 0.6
    return norm(reverb(x, 1.6, 0.35))


# ----------------------------------------------------------------------------- player + world sounds
def footstep(kind="walk"):
    n = int(0.3 * SR)
    loud = {"walk": 0.8, "run": 1.0, "crouch": 0.35}[kind]
    x = bp(noise(0.3), 2500, 9000) * decay(n, 0.004) * (0.8 if kind != "crouch" else 0.2)
    x += bp(noise(0.3), rng.uniform(180, 260), rng.uniform(900, 1400)) * decay(n, 0.03 if kind == "run" else 0.045)
    tt = t(0.3)
    x += np.sin(2 * np.pi * rng.uniform(80, 110) * tt) * decay(n, 0.03) * (0.9 if kind == "run" else 0.5)
    if kind == "run":  # second slap of the toe
        s = int(0.03 * SR)
        x[s:] += bp(noise(0.3), 1500, 6000)[: n - s] * decay(n - s, 0.006) * 0.5
    return norm(reverb(x, 0.5, 0.16), 0.9 * loud)


def panting(length=2.4):
    out = np.zeros(int(length * SR))
    pos = 0.0
    inhale = True
    while pos < length - 0.3:
        d = 0.28 if inhale else 0.34
        n = int(d * SR)
        b = noise(d)
        x = (bp(b, 600, 2800) + peak(b, 1300, 4) * 0.5) if inhale else (bp(b, 300, 1800) + peak(b, 700, 3) * 0.6)
        x *= np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
        s = int(pos * SR)
        out[s:s + n] += x * (0.7 if inhale else 1.0)
        pos += d + 0.04
        inhale = not inhale
    return norm(out, 0.7)


def heartbeat():
    n = int(0.6 * SR)
    tt = t(0.6)
    out = np.zeros(n)
    for start, amp in ((0.0, 1.0), (0.17, 0.7)):
        s = int(start * SR)
        m = n - s
        beat = np.sin(2 * np.pi * np.cumsum(58 * np.exp(-tt[:m] * 6) + 30) / SR) * decay(m, 0.06)
        out[s:] += beat * amp
    return norm(lp(out, 300))


def metal_clank(base=220):
    n = int(1.2 * SR)
    tt = t(1.2)
    x = np.zeros(n)
    for ratio, amp, tau in ((1, 1, 0.25), (2.56, 0.6, 0.18), (4.76, 0.4, 0.12), (8.1, 0.25, 0.07)):
        x += np.sin(2 * np.pi * base * ratio * tt) * amp * decay(n, tau)
    x += bp(noise(1.2), 1500, 7000) * decay(n, 0.01)
    return norm(reverb(x, 0.6, 0.2))


def creak(length=0.9):
    n = int(length * SR)
    f = np.linspace(380, 560, n) * jitter(n, 30, 0.08)
    stick = (np.sin(2 * np.pi * np.cumsum(f) / SR) > 0.6).astype(float)
    x = bp(stick, 300, 3000) * env(n, 0.1, True, 1.0)
    return norm(reverb(x, 0.5, 0.2))


def locker_open():
    c = creak(0.8)
    clank = metal_clank(260)[: int(0.3 * SR)] * 0.5
    out = np.zeros(max(len(c), len(clank)) + int(0.05 * SR))
    out[: len(c)] += c
    out[: len(clank)] += clank
    return norm(out)


def locker_close():
    return metal_clank(205)


def flashlight_click():
    n = int(0.1 * SR)
    x = np.zeros(n)
    for s in (0, int(0.035 * SR)):
        x[s:] += bp(noise(0.1), 2000, 8000)[: n - s] * decay(n - s, 0.002)
    return norm(x, 0.7)


def ambience(length=32.0):
    n = int(length * SR)
    tt = t(length)
    hum = sum(np.sin(2 * np.pi * f * tt) * a for f, a in ((60, 0.5), (120, 0.35), (180, 0.15), (240, 0.08)))
    buzz = bp(noise(length), 110, 130) * 0.25 * (1 + 0.3 * np.sin(2 * np.pi * 0.13 * tt))
    drone = lp(noise(length), 60) * 6
    x = hum * 0.25 + buzz + drone * 0.5
    # distant drips and creaks
    for _ in range(14):
        s = int(rng.uniform(0, length - 1.5) * SR)
        f = rng.uniform(900, 1800)
        m = int(0.4 * SR)
        drip = np.sin(2 * np.pi * np.cumsum(np.linspace(f, f * 1.5, m)) / SR) * decay(m, 0.03) * 0.25
        x[s:s + m] += drip
    for _ in range(3):
        s = int(rng.uniform(0, length - 2) * SR)
        c = creak(1.2) * 0.25
        x[s:s + len(c)] += c[: n - s]
    x = reverb(x, 2.0, 0.35, 2500)[:n]
    fade = int(2 * SR)  # seamless loop: crossfade the tail into the head
    x[:fade] = x[:fade] * np.linspace(0, 1, fade) + x[n - fade:] * np.linspace(1, 0, fade)
    return norm(x[: n - fade], 0.6)


# ----------------------------------------------------------------------------- sheets
def sheet(name, items):
    gap = np.zeros(int(0.25 * SR))
    parts, regions, pos = [], {}, 0.0
    for key, snd in items:
        parts += [snd, gap]
        regions[key] = [round(pos, 4), round(pos + len(snd) / SR, 4)]
        pos += (len(snd) + len(gap)) / SR
    data = np.concatenate(parts)
    os.makedirs(OUT, exist_ok=True)
    wav = os.path.join(OUT, name + ".wav")
    from scipy.io import wavfile
    wavfile.write(wav, SR, (np.clip(data, -1, 1) * 32767).astype(np.int16))
    ogg = os.path.join(OUT, name + ".ogg")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "libvorbis", "-q:a", "6", ogg], check=True)
    print(f"{name}: {len(items)} sounds, {pos:.1f}s, {os.path.getsize(ogg) // 1024} KB")
    return regions


def main():
    creature = [("BreathIn1", breath("in", 1.3)), ("BreathOut1", breath("out", 1.7)),
                ("BreathIn2", breath("in", 1.0)), ("BreathOut2", breath("out", 2.1, 1.4)),
                ("Clicks1", throat_clicks(1.4)), ("Clicks2", throat_clicks(1.1)), ("Chatter", chatter(12, 1.1)),
                ("Growl1", growl(2.0, 68)), ("Growl2", growl(2.6, 58, 1.3)), ("Growl3", growl(1.4, 80, 0.8)),
                ("Screech", screech(1.7)), ("Step1", creature_step(1.0)), ("Step2", creature_step(0.85)),
                ("Step3", creature_step(1.1)), ("Claws", claw_ticks()), ("Swipe", swipe()), ("Hit", hit()),
                ("Stinger", stinger())]
    player = [*[(f"Walk{i}", footstep("walk")) for i in range(1, 5)],
              *[(f"Run{i}", footstep("run")) for i in range(1, 5)],
              *[(f"Crouch{i}", footstep("crouch")) for i in range(1, 3)],
              ("Panting", panting()), ("Heartbeat", heartbeat()), ("LockerOpen", locker_open()),
              ("LockerClose", locker_close()), ("FlashClick", flashlight_click())]
    world = [("Ambience", ambience())]
    regions = {"Creature": sheet("creature", creature), "Player": sheet("player", player),
               "World": sheet("world", world)}
    with open(os.path.join(OUT, "regions.json"), "w") as fh:
        json.dump(regions, fh, indent=1)


if __name__ == "__main__":
    main()
