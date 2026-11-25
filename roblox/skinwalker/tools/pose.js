// Skinwalker pose math, used by the offline previewer (tools/pose_preview.py).
// SkinwalkerAnimator.client.luau mirrors this function line for line, so poses tuned here look the same in game.
// Conventions: every bone frame is aligned with the model at rest (model faces -Z); Transform = T(t) * Rx*Ry*Rz.

const K_META = 0.8; // metatarsal counter-rotation: c = -K_META * b
const GROUND_Y = -6; // ground height relative to the HumanoidRootPart centre

function rot2(v, a) { // rotate [y, z] about X
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}
function legFK(L, a, b) {
  const k = rot2(L.K0, a), h = rot2(L.H0, a + b), an = rot2(L.A0, a + b - K_META * b);
  return [k[0] + h[0] + an[0], k[1] + h[1] + an[1]];
}
function solveLeg(L, T) {
  let a = L.a, b = L.b;
  for (let i = 0; i < 8; i++) {
    const p = legFK(L, a, b), ey = T[0] - p[0], ez = T[1] - p[1];
    if (Math.hypot(ey, ez) < 0.01) break;
    const e = 1e-3, pa = legFK(L, a + e, b), pb = legFK(L, a, b + e);
    const j11 = (pa[0] - p[0]) / e, j12 = (pb[0] - p[0]) / e, j21 = (pa[1] - p[1]) / e, j22 = (pb[1] - p[1]) / e;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-6) break;
    let da = (j22 * ey - j12 * ez) / det, db = (-j21 * ey + j11 * ez) / det;
    const s = Math.min(1, 0.4 / Math.max(Math.abs(da), Math.abs(db), 1e-6));
    a = Math.min(1.3, Math.max(-1.3, a + da * s));
    b = Math.min(1.2, Math.max(-1.7, b + db * s));
  }
  L.a = a; L.b = b;
}

// 3-vector helpers
const vadd = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const vsub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
function rx(a, v) { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; }
function rz(a, v) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }
// arm: UpperArm Transform = Rx(a)Rz(r), LowerArm = Rx(b); returns wrist in the UpperArm joint's parent frame
function armFK(A, a, r, b) {
  const R = v => rx(a, rz(r, v));
  return vadd(R(A.E0), R(rx(b, A.W0)));
}
function solveArm(A, T) {
  let x = [A.a, A.r, A.b];
  const lo = [-1.4, -0.7, -0.15], hi = [2.4, 0.7, 2.4];
  for (let i = 0; i < 8; i++) {
    const p = armFK(A, x[0], x[1], x[2]);
    const err = vsub(T, p);
    if (Math.hypot(...err) < 0.02) break;
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let k = 0; k < 3; k++) {
      const xx = x.slice(); xx[k] += 1e-3;
      const q = armFK(A, xx[0], xx[1], xx[2]);
      for (let r = 0; r < 3; r++) J[r][k] = (q[r] - p[r]) / 1e-3;
    }
    // damped least squares: dx = J^T (J J^T + l I)^-1 err
    const l = 0.05;
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      let s = 0; for (let k = 0; k < 3; k++) s += J[r][k] * J[c][k];
      M[r][c] = s + (r === c ? l : 0);
    }
    const y = solve3(M, err);
    for (let k = 0; k < 3; k++) {
      let d = 0; for (let r = 0; r < 3; r++) d += J[r][k] * y[r];
      x[k] = Math.min(hi[k], Math.max(lo[k], x[k] + Math.max(-0.4, Math.min(0.4, d))));
    }
  }
  A.a = x[0]; A.r = x[1]; A.b = x[2];
}
function solve3(M, b) {
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(M);
  if (Math.abs(d) < 1e-9) return [0, 0, 0];
  const out = [];
  for (let k = 0; k < 3; k++) {
    const m = M.map((row, r) => row.map((v, c) => (c === k ? b[r] : v)));
    out.push(det(m) / d);
  }
  return out;
}

// --------------------------------------------------------------------------- the pose
// P: crouch, lean, quad, phase, gait, stride, lift, wig, sway, breath, yaw, pitch, tilt, jaw,
//    air (0..1), atk (-1 or 0..1), atkSide (+1 right / -1 left), dead (0..1), curl, t, tendril {spd, amp, flat}
// R: rig info {legs:{Left,Right}, arms:{Left,Right}, abdOff, chestOff, shoulderOff:{Left,Right}}
function computePose(P, R) {
  const out = {};
  const set = (n, t, r, order) => { out[n] = { t: t || [0, 0, 0], r: r || [0, 0, 0], order: order || "XYZ" }; };
  const drop = P.crouch * 1.7 + P.quad * 0.8;
  const bob = -Math.abs(Math.sin(P.phase)) * 0.2 * P.gait;

  // ---- spine (pelvis stays level so the leg IK frame stays simple)
  let abd = -(P.lean * 0.30 + P.quad * 0.40) + P.breath * 0.03;
  let chest = -(P.lean * 0.36 + P.quad * 0.50) + P.breath * 0.045;
  if (P.air > 0) { abd = abd * (1 - P.air) - 0.3 * P.air; chest = chest * (1 - P.air) - 0.35 * P.air; }
  if (P.dead > 0) { abd = abd * (1 - P.dead) + 0.3 * P.dead; chest = chest * (1 - P.dead) + 0.25 * P.dead; }
  const pelvisT = [0, -drop + bob - 4.4 * P.dead, 0];
  set("Pelvis", pelvisT, [0.15 * P.dead, P.wig + P.sway, P.wig * 0.6 + 1.3 * P.dead]);
  set("Abdomen", null, [abd, -Math.sin(P.phase) * 0.05 * P.gait, 0]);
  set("Chest", null, [chest, Math.sin(P.phase) * 0.08 * P.gait, 0]);
  const spine = abd + chest;

  // ---- legs (IK in the pelvis frame)
  ["Left", "Right"].forEach((side, i) => {
    const L = R.legs[side];
    const ph = P.phase + i * Math.PI;
    let a, b;
    if (P.air > 0.5) { a = -0.75; b = 0.5; }
    else if (P.dead > 0.5) { a = 0.9; b = -1.2; }
    else {
      const footZ = -P.stride * (1 - 0.25 * P.quad) * Math.sin(ph) + P.quad * 0.2;
      const footY = P.lift * Math.max(0, Math.cos(ph));
      const rest = [L.K0[0] + L.H0[0] + L.A0[0], L.K0[1] + L.H0[1] + L.A0[1]];
      solveLeg(L, [rest[0] + drop - bob + footY, rest[1] + footZ]);
      a = L.a; b = L.b;
    }
    const c = -K_META * b;
    set(side + "Thigh", null, [a, 0, 0]);
    set(side + "Shin", null, [b, 0, 0]);
    set(side + "Meta", null, [c, 0, 0]);
    set(side + "Foot", null, [-(a + b + c), 0, 0]);
  });

  // ---- arms: hang (blend) -> planted on all fours via IK
  const abdOff = R.abdOff, chestOff = R.chestOff;
  const pelvisJ = [0, pelvisT[1], 0];
  const abdJ = vadd(pelvisJ, abdOff);
  const chestJ = vadd(abdJ, rx(abd, chestOff));
  ["Left", "Right"].forEach((side, i) => {
    const s = side === "Left" ? -1 : 1;
    const A = R.arms[side];
    const ph = P.phase + i * Math.PI + Math.PI; // diagonal to the legs
    // hanging pose: compensate the torso lean so arms hang down, swing gently
    let ua = -spine * 0.85 + 0.18 * Math.sin(ph) * P.gait + 0.08;
    let ur = s * 0.04;
    let la = 0.18 + 0.1 * P.gait;
    let hand = 0.15;
    if (P.quad > 0.01 && P.air < 0.5 && P.dead < 0.5) {
      const shoulder = vadd(chestJ, rx(spine, R.shoulderOff[side]));
      const reachZ = -1.6 - P.stride * 0.9 * Math.sin(ph);
      const lift = P.lift * 0.8 * Math.max(0, Math.cos(ph));
      const target = [shoulder[0] * 1.1, GROUND_Y + 1.5 + lift, shoulder[2] + reachZ];
      const local = rx(-spine, vsub(target, shoulder));
      solveArm(A, local);
      const q = P.quad;
      ua = ua * (1 - q) + A.a * q;
      ur = ur * (1 - q) + A.r * q;
      la = la * (1 - q) + A.b * q;
      hand = hand * (1 - q) + (-(spine + A.a + A.b) + 0.1) * q;
    }
    if (P.air > 0) { const k = P.air; ua = ua * (1 - k) + 1.45 * k; ur *= 1 - k; la = la * (1 - k) + 0.1 * k; hand = hand * (1 - k) + 0.5 * k; }
    if (P.atk >= 0 && s === P.atkSide) {
      const k = P.atk;
      const swing = k < 0.35 ? -1.0 * (k / 0.35) : -1.0 + 2.9 * ((k - 0.35) / 0.65);
      ua += swing; la -= 0.5 * Math.sin(k * Math.PI); ur += s * 0.4 * Math.sin(k * Math.PI);
    }
    if (P.dead > 0) { const k = P.dead; ua = ua * (1 - k) + 0.5 * k; ur = ur * (1 - k) + (s > 0 ? -1.3 : 0.3) * k; la = la * (1 - k) + 0.6 * k; }
    set(side + "UpperArm", null, [ua, 0, ur]);
    set(side + "LowerArm", null, [la, 0, 0]);
    set(side + "Hand", null, [hand, 0, 0]);
    for (let f = 1; f <= 4; f++) {
      const curl = P.curl + Math.sin(P.t * 1.6 + f * 0.8 + i) * 0.1;
      set(side + "Finger" + f + "A", null, [curl, 0, 0]);
      set(side + "Finger" + f + "B", null, [curl * 1.4, 0, 0]);
    }
  });

  // ---- head: keep the gaze level against the torso lean, then look
  const comp = -spine;
  const lunge = P.atk >= 0 ? Math.sin(P.atk * Math.PI) : 0;
  set("Neck", null, [P.pitch * 0.4 + comp * 0.55 - lunge * 0.3 - 0.4 * P.dead, P.yaw * 0.4, P.tilt * 0.3], "YXZ");
  set("Head", null, [P.pitch * 0.6 + comp * 0.3 - 0.3 * P.dead, P.yaw * 0.6, P.tilt], "YXZ");
  set("Jaw", null, [-(P.jaw + lunge * 0.55), 0, 0]);

  // ---- tendrils
  for (let ti = 1; ti <= 12; ti++) {
    for (let k = 1; k <= 6; k++) {
      const T = P.tendril, amp = (0.12 + k * 0.02) * T.amp, tt = P.t * T.spd;
      set(`Tendril${ti}_${k}`, null, [
        Math.sin(tt + ti * 1.3 + k * 0.6) * amp + (k === 1 ? T.flat : 0),
        Math.sin(tt * 0.7 + ti * 2.1 + k * 0.4) * amp * 0.6,
        Math.cos(tt * 0.9 + ti + k * 0.5) * amp,
      ]);
    }
  }
  return out;
}
