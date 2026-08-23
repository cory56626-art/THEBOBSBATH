import * as THREE from '../vendor/three.module.min.js';
import { COL } from './config.js';

const SEGS = 40;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The rope: a Catmull-Rom curve threaded through every puller's hands with a
 * golden knot in the middle. Rebuilt from a fixed pool of cylinders each frame
 * so it can sag, snap taut and shiver under strain without allocating.
 */
export class Rope {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const matA = new THREE.MeshLambertMaterial({ color: COL.rope });
    const matB = new THREE.MeshLambertMaterial({ color: COL.ropeD });

    this.segs = [];
    for (let i = 0; i < SEGS; i++) {
      const m = new THREE.Mesh(geo, i % 2 ? matB : matA);
      m.castShadow = true;
      this.group.add(m);
      this.segs.push(m);
    }

    // Golden knot + pennant — the thing you're actually racing.
    this.knot = new THREE.Group();
    this.knotBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 12),
      new THREE.MeshStandardMaterial({
        color: COL.gold, roughness: 0.3, metalness: 0.4, emissive: 0x6b4500,
      })
    );
    this.knotBall.castShadow = true;
    this.knot.add(this.knotBall);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.055, 8, 18),
      new THREE.MeshLambertMaterial({ color: 0xfff0b0 })
    );
    ring.rotation.y = Math.PI / 2;
    this.knot.add(ring);
    this.knotRing = ring;

    this.flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.52),
      new THREE.MeshLambertMaterial({ color: 0xffd24a, side: THREE.DoubleSide })
    );
    this.flag.position.set(0, 0.78, 0.42);
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 1.05, 6),
      new THREE.MeshLambertMaterial({ color: 0xf6f2e2 })
    );
    stick.position.y = 0.54;
    this.knot.add(stick, this.flag);
    this.group.add(this.knot);

    // A shadow-catching mark on the ground directly under the knot, so the
    // rope's position is legible even when the camera is low.
    this.tracker = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe36b, transparent: true, opacity: 0.55 })
    );
    this.tracker.rotation.x = -Math.PI / 2;
    this.tracker.position.y = 0.07;
    scene.add(this.tracker);

    this.pts = [];
    for (let i = 0; i <= SEGS; i++) this.pts.push(new THREE.Vector3());
    this.curve = new THREE.CatmullRomCurve3([], false, 'catmullrom', 0.4);

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.t = 0;
  }

  /**
   * @param {THREE.Vector3[]} left   left team's grips, front-most first
   * @param {THREE.Vector3[]} right  right team's grips, front-most first
   * @param {number} strain 0..1 — how hard the rope is being fought over
   */
  update(dt, left, right, strain = 0) {
    this.t += dt;
    const taut = THREE.MathUtils.clamp(strain, 0, 1);
    const sag = 0.42 * (1 - taut * 0.72);

    const ctrl = [];
    // Trailing tail behind the left team.
    const lb = left[left.length - 1];
    ctrl.push(new THREE.Vector3(lb.x - 1.9, 0.12, lb.z));
    ctrl.push(new THREE.Vector3(lb.x - 0.9, lb.y * 0.55, lb.z));
    for (let i = left.length - 1; i >= 0; i--) ctrl.push(left[i]);

    const mid = this._a.copy(left[0]).add(right[0]).multiplyScalar(0.5);
    this.knotX = mid.x;
    ctrl.push(new THREE.Vector3(mid.x, mid.y - sag, 0));

    for (let i = 0; i < right.length; i++) ctrl.push(right[i]);
    const rb = right[right.length - 1];
    ctrl.push(new THREE.Vector3(rb.x + 0.9, rb.y * 0.55, rb.z));
    ctrl.push(new THREE.Vector3(rb.x + 1.9, 0.12, rb.z));

    this.curve.points = ctrl;

    // Sample and shiver: the harder the pull, the more the rope buzzes.
    const buzz = taut * 0.055;
    for (let i = 0; i <= SEGS; i++) {
      const p = this.curve.getPoint(i / SEGS, this.pts[i]);
      if (buzz > 0.001 && i > 1 && i < SEGS - 1) {
        p.y += Math.sin(this.t * 46 + i * 1.9) * buzz;
        p.z += Math.cos(this.t * 39 + i * 2.4) * buzz * 0.8;
      }
    }

    for (let i = 0; i < SEGS; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const m = this.segs[i];
      this._d.subVectors(b, a);
      const len = this._d.length() || 0.0001;
      m.position.copy(a).addScaledVector(this._d, 0.5);
      this._q.setFromUnitVectors(UP, this._d.divideScalar(len));
      m.quaternion.copy(this._q);
      const r = 0.092 + taut * 0.012;
      m.scale.set(r, len * 1.12, r);
      m.rotateY(i * 0.42);            // facet twist reads as a braided rope
    }

    const kp = this.curve.getPoint(0.5, this._b);
    this.knot.position.copy(kp);
    this.knot.rotation.z = Math.sin(this.t * 3) * 0.12 + taut * 0.2;
    const pump = 1 + Math.sin(this.t * 9) * 0.05 * taut;
    this.knotBall.scale.setScalar(pump);
    this.knotRing.rotation.x += dt * (1.2 + taut * 5);
    this.flag.rotation.y = Math.sin(this.t * 6) * 0.5;

    this.tracker.position.x = kp.x;
    this.tracker.material.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 5));
    const s = 1 + 0.12 * Math.sin(this.t * 5);
    this.tracker.scale.setScalar(s);
  }
}
