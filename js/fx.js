import * as THREE from '../vendor/three.module.min.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/** Dust, sweat, mud and confetti. Fixed pools, no allocation during play. */
export class Fx {
  constructor(scene, puffTex) {
    this.scene = scene;

    // ── puffs (dust + mud) ──
    this.puffs = [];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffTex, transparent: true, depthWrite: false, opacity: 0,
      }));
      s.visible = false;
      scene.add(s);
      this.puffs.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1 });
    }
    this.puffI = 0;

    // ── sweat droplets ──
    const dropGeo = new THREE.SphereGeometry(0.07, 7, 5);
    const dropMat = new THREE.MeshLambertMaterial({ color: 0x9fd8ff });
    this.drops = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.visible = false;
      scene.add(m);
      this.drops.push({ m, life: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.dropI = 0;

    // ── confetti ──
    const N = 190;
    this.confN = N;
    this.conf = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.24, 0.02),
      new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
      N
    );
    this.conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.conf.visible = false;
    this.conf.frustumCulled = false;
    scene.add(this.conf);
    const palette = [0xffd24a, 0xff6b8b, 0x5cc0ff, 0x6ee79a, 0xffffff, 0xa77bff];
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) this.conf.setColorAt(i, col.setHex(palette[i % palette.length]));
    this.conf.instanceColor.needsUpdate = true;
    this.confP = [];
    for (let i = 0; i < N; i++) {
      this.confP.push({ p: new THREE.Vector3(), v: new THREE.Vector3(),
                        r: new THREE.Euler(), rv: new THREE.Vector3(), life: 0 });
    }
    this.confActive = false;

    // ── shockwave rings ──
    this.rings = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.62, 28),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, life: 0 });
    }
    this.ringI = 0;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  puff(x, y, z, { color = 0xf2e6c8, size = 0.7, life = 0.55, up = 1.1, spread = 0.7 } = {}) {
    const p = this.puffs[this.puffI = (this.puffI + 1) % this.puffs.length];
    p.s.visible = true;
    p.s.position.set(x, y, z);
    p.s.material.color.setHex(color);
    p.s.material.opacity = 0.85;
    p.s.scale.setScalar(size);
    p.life = p.max = life;
    p.grow = size * 2.4;
    p.vx = rnd(-spread, spread);
    p.vy = rnd(up * 0.5, up);
    p.vz = rnd(-spread, spread);
  }

  sweat(x, y, z, dir = -1) {
    const d = this.drops[this.dropI = (this.dropI + 1) % this.drops.length];
    d.m.visible = true;
    d.m.position.set(x, y, z);
    d.life = 0.7;
    d.vx = dir * rnd(0.6, 2.2);
    d.vy = rnd(1.4, 3.0);
    d.vz = rnd(-1.2, 1.2);
  }

  ring(x, y, z, color = 0xffffff) {
    const r = this.rings[this.ringI = (this.ringI + 1) % this.rings.length];
    r.m.visible = true;
    r.m.position.set(x, y + 0.05, z);
    r.m.scale.setScalar(0.4);
    r.m.material.color.setHex(color);
    r.m.material.opacity = 0.75;
    r.life = 0.5;
  }

  confetti(x = 0) {
    this.conf.visible = true;
    this.confActive = true;
    for (const c of this.confP) {
      c.p.set(x + rnd(-9, 9), rnd(9, 17), rnd(-7, 7));
      c.v.set(rnd(-0.6, 0.6), rnd(-1.5, -0.4), rnd(-0.6, 0.6));
      c.r.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      c.rv.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
      c.life = rnd(4.5, 8);
    }
  }

  clearConfetti() { this.confActive = false; this.conf.visible = false; }

  update(dt) {
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = p.life / p.max;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.vy -= dt * 1.4;
      p.s.material.opacity = k * 0.85;
      p.s.scale.setScalar(p.grow * (1.25 - k * 0.7));
    }

    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.m.visible = false; continue; }
      d.m.position.x += d.vx * dt;
      d.m.position.y += d.vy * dt;
      d.m.position.z += d.vz * dt;
      d.vy -= dt * 9;
      if (d.m.position.y < 0.05) { d.life = 0; d.m.visible = false; }
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.m.visible = false; continue; }
      const k = 1 - r.life / 0.5;
      r.m.scale.setScalar(0.4 + k * 3.6);
      r.m.material.opacity = 0.75 * (1 - k);
    }

    if (this.confActive) {
      let alive = 0;
      for (let i = 0; i < this.confN; i++) {
        const c = this.confP[i];
        if (c.life <= 0) { this._m.makeScale(0, 0, 0); this.conf.setMatrixAt(i, this._m); continue; }
        alive++;
        c.life -= dt;
        c.v.y -= dt * 2.4;
        c.v.x += Math.sin(c.p.y * 1.7 + i) * dt * 1.2;
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.rv.x * dt; c.r.y += c.rv.y * dt; c.r.z += c.rv.z * dt;
        if (c.p.y < -1) c.life = 0;
        this._q.setFromEuler(c.r);
        this._m.compose(c.p, this._q, this._s);
        this.conf.setMatrixAt(i, this._m);
      }
      this.conf.instanceMatrix.needsUpdate = true;
      if (!alive) this.clearConfetti();
    }
  }
}
