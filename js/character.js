import * as THREE from '../vendor/three.module.min.js';
import { COL } from './config.js';

const TAU = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const _tmp = new THREE.Vector3();

// Geometry is shared by every puller on the field — six characters, one set.
const G = {
  head:  new THREE.SphereGeometry(0.31, 16, 12),
  torso: new THREE.CapsuleGeometry(0.29, 0.44, 4, 14),
  upper: new THREE.CapsuleGeometry(0.10, 0.20, 3, 8),
  fore:  new THREE.CapsuleGeometry(0.092, 0.18, 3, 8),
  leg:   new THREE.CapsuleGeometry(0.125, 0.34, 3, 8),
  hand:  new THREE.SphereGeometry(0.135, 10, 8),
  foot:  new THREE.BoxGeometry(0.36, 0.16, 0.26),
  eye:   new THREE.SphereGeometry(0.078, 10, 8),
  pupil: new THREE.SphereGeometry(0.042, 8, 6),
  cap:   new THREE.SphereGeometry(0.325, 16, 10, 0, TAU, 0, Math.PI * 0.54),
  brim:  new THREE.BoxGeometry(0.2, 0.05, 0.44),
  mouth: new THREE.SphereGeometry(0.08, 10, 8),
  belt:  new THREE.TorusGeometry(0.285, 0.05, 6, 16),
  brow:  new THREE.BoxGeometry(0.13, 0.045, 0.055),
};

const MAT = {
  white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  dark:  new THREE.MeshLambertMaterial({ color: 0x22161a }),
  mouth: new THREE.MeshLambertMaterial({ color: 0x7a2230 }),
};

const ARM_UPPER = 0.36;   // shoulder → elbow
const ARM_FORE  = 0.34;   // elbow → hand

/**
 * A stubby little tug-of-war puller, built facing +X.
 * The right-hand team gets `group.rotation.y = Math.PI` so both sides face the rope.
 */
export class Character {
  constructor({ shirt, accent, skin, size = 1, phase = 0 }) {
    const shirtM  = new THREE.MeshLambertMaterial({ color: shirt });
    const accentM = new THREE.MeshLambertMaterial({ color: accent });
    const skinM   = new THREE.MeshLambertMaterial({ color: skin });

    this.group = new THREE.Group();
    this.group.scale.setScalar(size);
    this.size = size;
    this.phase = phase;
    this.t = Math.random() * 10;
    this.yank = 0;
    this.mood = 'idle';
    this.moodT = 0;
    this.lean = 0; this.bodyY = 0; this.armZ = -0.2; this.bend = 0.3;
    this.legF = 0.3; this.legB = -0.25;

    // Everything hangs off `body` so the whole figure can lean and squat.
    this.body = new THREE.Group();
    this.group.add(this.body);

    const torso = new THREE.Mesh(G.torso, shirtM);
    torso.position.y = 1.12;
    torso.castShadow = true;
    this.body.add(torso);

    const belt = new THREE.Mesh(G.belt, accentM);
    belt.position.y = 0.9;
    belt.rotation.x = Math.PI / 2;
    this.body.add(belt);

    // ── head ──
    this.head = new THREE.Group();
    this.head.position.y = 1.66;
    this.body.add(this.head);

    const skull = new THREE.Mesh(G.head, skinM);
    skull.castShadow = true;
    this.head.add(skull);

    const cap = new THREE.Mesh(G.cap, accentM);
    cap.position.y = 0.05;
    cap.rotation.z = -0.1;
    this.head.add(cap);
    const brim = new THREE.Mesh(G.brim, accentM);
    brim.position.set(0.27, 0.11, 0);
    brim.rotation.z = 0.12;
    this.head.add(brim);

    this.eyes = [];
    this.brows = [];
    for (const z of [-0.125, 0.125]) {
      const e = new THREE.Mesh(G.eye, MAT.white);
      e.position.set(0.245, 0.02, z);
      this.head.add(e);
      const p = new THREE.Mesh(G.pupil, MAT.dark);
      p.position.set(0.30, 0.02, z * 1.05);
      this.head.add(p);
      this.eyes.push(e, p);

      const b = new THREE.Mesh(G.brow, MAT.dark);
      b.position.set(0.275, 0.145, z);
      this.brows.push(b);
      this.head.add(b);
    }

    this.mouth = new THREE.Mesh(G.mouth, MAT.mouth);
    this.mouth.position.set(0.265, -0.135, 0);
    this.head.add(this.mouth);

    // ── arms: swing (about the character's Z) → yaw (converge on the rope)
    //         → upper arm → elbow → forearm + hand ──
    this.arms = [];
    this.elbows = [];
    this.hands = [];
    for (const z of [-0.3, 0.3]) {
      const swing = new THREE.Group();
      swing.position.set(0.02, 1.32, z);
      this.body.add(swing);

      const yaw = new THREE.Group();
      yaw.rotation.y = z > 0 ? 0.44 : -0.44;
      swing.add(yaw);

      const upper = new THREE.Mesh(G.upper, skinM);
      upper.rotation.z = -Math.PI / 2;
      upper.position.x = ARM_UPPER / 2;
      upper.castShadow = true;
      yaw.add(upper);

      const elbow = new THREE.Group();
      elbow.position.x = ARM_UPPER;
      yaw.add(elbow);

      const fore = new THREE.Mesh(G.fore, skinM);
      fore.rotation.z = -Math.PI / 2;
      fore.position.x = ARM_FORE / 2;
      fore.castShadow = true;
      elbow.add(fore);

      const hand = new THREE.Mesh(G.hand, skinM);
      hand.position.x = ARM_FORE;
      elbow.add(hand);

      this.arms.push(swing);
      this.elbows.push(elbow);
      this.hands.push(hand);
    }

    // ── legs ──
    this.legs = [];
    for (const z of [-0.17, 0.17]) {
      const hip = new THREE.Group();
      hip.position.set(0, 0.86, z);
      this.body.add(hip);

      const limb = new THREE.Mesh(G.leg, accentM);
      limb.position.y = -0.29;
      limb.castShadow = true;
      hip.add(limb);

      const foot = new THREE.Mesh(G.foot, MAT.dark);
      foot.position.set(0.09, -0.56, 0);
      hip.add(foot);

      this.legs.push(hip);
    }
  }

  /** World-space point where this puller grips the rope: right between the hands. */
  ropeAnchor(out) {
    this.hands[0].getWorldPosition(out);
    this.hands[1].getWorldPosition(_tmp);
    return out.add(_tmp).multiplyScalar(0.5);
  }

  /** Called on every tap this character is pulling for. */
  tug(power = 1) { this.yank = Math.min(1.35, this.yank + 0.75 * power); }

  setMood(m) { if (this.mood !== m) { this.mood = m; this.moodT = 0; } }

  update(dt, effort = 0) {
    this.t += dt;
    this.moodT += dt;
    this.yank *= Math.exp(-dt * 7.5);
    const t = this.t + this.phase;
    const y = this.yank;
    const e = clamp(effort, 0, 1);
    let lean, bodyY, armZ, bend, legF, legB, headTilt = 0, sideSway = 0;

    switch (this.mood) {
      case 'win': {
        const hop = Math.abs(Math.sin(this.moodT * 6.4));
        lean = -0.12 + Math.sin(this.moodT * 6.4) * 0.1;
        bodyY = hop * 0.55;
        armZ = 1.5 + Math.sin(this.moodT * 12) * 0.2;
        bend = 0.15;
        legF = -0.35 + hop * 0.5; legB = 0.35 - hop * 0.5;
        headTilt = Math.sin(this.moodT * 6.4) * 0.2;
        break;
      }
      case 'lose': {
        // Faceplant forward — right into the mud they were trying to avoid.
        const p = clamp(this.moodT * 2.1, 0, 1);
        const ease = p * p * (3 - 2 * p);
        lean = -1.42 * ease;
        bodyY = -0.34 * ease + Math.sin(this.moodT * 3) * 0.02 * (1 - ease);
        armZ = -0.9 * ease + Math.sin(this.moodT * 9) * 0.3 * (1 - ease);
        bend = 0.9 * (1 - ease) + 0.1;
        legF = 0.7 * ease; legB = 0.5 * ease;
        headTilt = 0.5 * ease;
        break;
      }
      case 'ready': {
        const b = Math.sin(t * 2.2) * 0.03;
        lean = 0.13 + b;
        bodyY = -0.05 + b * 0.5;
        armZ = -0.2; bend = 0.34;
        legF = 0.42; legB = -0.32;
        break;
      }
      case 'pull': {
        const shuffle = Math.sin(t * 9 + e * 4) * 0.055 * (0.3 + e);
        lean  = 0.19 + 0.38 * e + 0.20 * y;
        bodyY = -0.05 - 0.11 * e - 0.13 * y;
        armZ  = -0.20 - 0.10 * e - 0.30 * y;
        bend  = 0.30 + 0.40 * e + 0.95 * y;   // elbows fold on every heave
        legF  = 0.48 + 0.28 * e + shuffle;
        legB  = -0.36 - 0.26 * e - shuffle;
        headTilt = 0.10 * e + 0.16 * y;
        sideSway = Math.sin(t * 4.4) * 0.035 * e;
        break;
      }
      default: {           // idle
        const b = Math.sin(t * 1.8) * 0.05;
        lean = 0.02 + b * 0.3;
        bodyY = b * 0.05;
        armZ = -0.1 + b * 0.2; bend = 0.22 + b * 0.3;
        legF = 0.06; legB = -0.06;
      }
    }

    const k = 1 - Math.exp(-dt * 16);
    this.lean  = lerp(this.lean, lean, k);
    this.bodyY = lerp(this.bodyY, bodyY, k);
    this.armZ  = lerp(this.armZ, armZ, k);
    this.bend  = lerp(this.bend, bend, k);
    this.legF  = lerp(this.legF, legF, k);
    this.legB  = lerp(this.legB, legB, k);

    this.body.rotation.z = this.lean;
    this.body.rotation.x = sideSway;
    this.body.position.y = this.bodyY;
    this.head.rotation.z = headTilt;

    for (const a of this.arms) a.rotation.z = this.armZ;
    for (const el of this.elbows) el.rotation.z = this.bend;
    this.legs[0].rotation.z = this.legF;
    this.legs[1].rotation.z = this.legB;

    // Face: squint and gasp harder the more they're straining.
    const strain = this.mood === 'win' ? 0 : clamp(e * 0.8 + y * 0.5, 0, 1);
    for (const p of this.eyes) p.scale.y = 1 - strain * 0.5;
    for (const b of this.brows) { b.rotation.z = 0.1 + strain * 0.6; b.position.y = 0.145 - strain * 0.03; }

    if (this.mood === 'win') this.mouth.scale.set(0.8, 0.85, 1.5);
    else this.mouth.scale.set(0.5 + strain * 0.5, 0.45 + strain * 0.95, 1.25);
  }
}

/** Builds one side's line of pullers, front-most first. */
export function makeTeam({ side, shirt, accent, count, frontX, spacing }) {
  const team = [];
  for (let i = 0; i < count; i++) {
    const c = new Character({
      shirt, accent,
      skin: COL.skin[(Math.random() * COL.skin.length) | 0],
      size: i === 0 ? 1.14 : 1.0 + Math.random() * 0.08,
      phase: i * 1.7,
    });
    c.group.position.set(side * (frontX + i * spacing), 0, (i % 2 ? 0.36 : -0.36) * side);
    c.group.rotation.y = side > 0 ? Math.PI : 0;
    team.push(c);
  }
  return team;
}
