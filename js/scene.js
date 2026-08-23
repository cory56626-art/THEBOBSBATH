import * as THREE from '../vendor/three.module.min.js';
import { CFG, COL } from './config.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

/* ══════════════════════════════════════════════════════════════════════════
   Textures painted at runtime — keeps the repo tiny and the look consistent.
   ══════════════════════════════════════════════════════════════════════════ */

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.00, '#1f7fd0');
  grd.addColorStop(0.34, '#4bb8f0');
  grd.addColorStop(0.68, '#9fe0fb');
  grd.addColorStop(1.00, '#ffeab5');
  g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The whole pitch — turf stripes, mud pit, chalk lines — drawn once into one
// square texture that gets mapped across the ground disc.
function pitchTexture(maxAniso) {
  const S = 1024, R = CFG.arenaR;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const X = x => (x / R * 0.5 + 0.5) * S;
  const Z = z => (z / R * 0.5 + 0.5) * S;
  const M = X(1) - X(0);            // pixels per metre

  g.fillStyle = '#6ec25a'; g.fillRect(0, 0, S, S);

  // Mown stripes running across the pull direction.
  for (let x = -R; x < R; x += 1.6) {
    g.fillStyle = (Math.round((x + R) / 1.6) % 2) ? '#6cbd5a' : '#78c966';
    g.fillRect(X(x), 0, M * 1.6 + 1, S);
  }

  // Grass flecks for a bit of tooth.
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(30,80,30,.09)';
    g.fillRect(x, y, 3, 6);
  }

  // Mud pit in the middle — the thing nobody wants to be dragged into.
  const mud = g.createRadialGradient(X(0), Z(0), M * 0.5, X(0), Z(0), M * 2.5);
  mud.addColorStop(0, '#4a3018');
  mud.addColorStop(0.62, '#5d4025');
  mud.addColorStop(1, 'rgba(93,64,37,0)');
  g.save();
  g.translate(X(0), Z(0)); g.scale(1, 1.55); g.translate(-X(0), -Z(0));
  g.fillStyle = mud;
  g.beginPath(); g.arc(X(0), Z(0), M * 2.5, 0, TAU); g.fill();
  g.restore();
  for (let i = 0; i < 220; i++) {            // splatter
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * M * 2.2;
    g.fillStyle = `rgba(${40 + Math.random() * 40 | 0},${26 + Math.random() * 26 | 0},12,.5)`;
    g.beginPath(); g.arc(X(0) + Math.cos(a) * r, Z(0) + Math.sin(a) * r * 1.5, rnd(2, 9), 0, TAU); g.fill();
  }

  // Chalk: centre line, goal lines, metre hashes.
  const line = (x, w, style) => { g.fillStyle = style; g.fillRect(X(x) - w / 2, 0, w, S); };
  g.globalAlpha = 0.9;
  for (let m = -CFG.goal; m <= CFG.goal + 0.01; m += 1) {
    if (Math.abs(m) < 0.01) continue;
    line(m, 4, 'rgba(255,255,255,.5)');
  }
  g.globalAlpha = 1;
  line(0, 14, '#fdfdf5');
  line(-CFG.goal, 18, '#a9dcff');
  line(CFG.goal, 18, '#ffc0b0');

  // Team end zones.
  g.globalAlpha = 0.16;
  g.fillStyle = '#3b8ef0'; g.fillRect(0, 0, X(-CFG.goal), S);
  g.fillStyle = '#f4573c'; g.fillRect(X(CFG.goal), 0, S - X(CFG.goal), S);
  g.globalAlpha = 1;

  // Soft darkening at the island rim.
  const vig = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.52);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(12,40,16,.42)');
  g.fillStyle = vig; g.fillRect(0, 0, S, S);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// A little triangular pennant, drawn straight into a buffer.
function pennant() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(
    [0, 0.3, 0, 0, -0.3, 0, 0.95, 0.02, 0], 3));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  return geo;
}

function puffTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,.95)');
  grd.addColorStop(0.45, 'rgba(255,255,255,.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ══════════════════════════════════════════════════════════════════════════
   World
   ══════════════════════════════════════════════════════════════════════════ */

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xa9e0f7, 44, 116);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    this.aim = new THREE.Vector3(0, 1.9, 0);
    this.aimX = 0;
    this.shakeAmt = 0;
    this.zoom = 1;
    this.zoomTarget = 1;
    this.aimFactor = 0.42;
    this.time = 0;
    this.cheerLevel = 0;

    this.puffTex = puffTexture();

    this._lights();
    this._island();
    this._markers();
    this._props();
    this._crowd();
    this._clouds();

    this.layout(1.6);
  }

  /* ── static furniture ────────────────────────────────────────────────── */

  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xcfefff, 0x5d8b4a, 2.1));

    const sun = new THREE.DirectionalLight(0xfff4d8, 2.5);
    sun.position.set(9, 20, 11);
    sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    sun.shadow.camera.left = -13; sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
    sun.shadow.camera.near = 4; sun.shadow.camera.far = 52;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun, sun.target);

    const rim = new THREE.DirectionalLight(0x8fd0ff, 0.9);
    rim.position.set(-10, 8, -12);
    this.scene.add(rim);
  }

  _island() {
    const R = CFG.arenaR;
    const aniso = this.renderer.capabilities.getMaxAnisotropy();

    const top = new THREE.Mesh(
      new THREE.CircleGeometry(R, 72),
      new THREE.MeshLambertMaterial({ map: pitchTexture(aniso) })
    );
    top.rotation.x = -Math.PI / 2;
    top.receiveShadow = true;
    this.scene.add(top);

    // Soil underside so the island reads as a floating chunk of world.
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R * 0.62, 7, 48, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x8a6338, side: THREE.DoubleSide })
    );
    soil.position.y = -3.5;
    this.scene.add(soil);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(R * 0.62, 6, 48),
      new THREE.MeshLambertMaterial({ color: 0x74522e })
    );
    tip.position.y = -10;
    this.scene.add(tip);

    // Grass lip that hangs over the edge.
    const lip = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.22, R + 0.05, 0.7, 64, 1, true),
      new THREE.MeshLambertMaterial({ color: COL.grassD, side: THREE.DoubleSide })
    );
    lip.position.y = -0.3;
    this.scene.add(lip);

    // Wet-looking mud slick so the pit catches the light.
    const slick = new THREE.Mesh(
      new THREE.CircleGeometry(2.9, 40),
      new THREE.MeshStandardMaterial({
        color: 0x33200e, roughness: 0.55, metalness: 0,
        transparent: true, opacity: 0.32,
      })
    );
    slick.rotation.x = -Math.PI / 2;
    slick.scale.set(0.62, 1, 1);
    slick.position.y = 0.012;
    this.scene.add(slick);
  }

  _markers() {
    this.goalMarks = [];
    const mk = (x, color) => {
      const g = new THREE.Group();
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.06, 13),
        new THREE.MeshBasicMaterial({ color })
      );
      strip.position.y = 0.05;
      g.add(strip);

      // One pennant per goal line, on the far side so nothing blocks the pull.
      for (const z of [-8.2, 8.2]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.08, 2.8, 8),
          new THREE.MeshLambertMaterial({ color: 0xf2f2ea })
        );
        pole.position.set(0, 1.4, z);
        pole.castShadow = true;
        g.add(pole);

        const flag = new THREE.Mesh(
          pennant(),
          new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
        );
        flag.position.set(0.04, 2.45, z);
        g.add(flag);
        g.userData.flags = g.userData.flags || [];
        g.userData.flags.push(flag);
      }
      g.position.x = x;
      this.scene.add(g);
      this.goalMarks.push(g);
      return g;
    };
    mk(-CFG.goal, 0x9fd7ff);
    mk(CFG.goal, 0xffb3a2);

    // Centre line — deliberately loud, it's the thing you watch.
    this.centreLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.05, 13.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.centreLine.position.y = 0.055;
    this.scene.add(this.centreLine);
  }

  _crowd() {
    const perBank = 78;
    const geo = new THREE.SphereGeometry(0.3, 10, 8);
    const mat = new THREE.MeshLambertMaterial();
    this.crowd = new THREE.InstancedMesh(geo, mat, perBank * 2);
    this.crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.crowdData = [];

    const palette = [0xff7d5c, 0x5cc0ff, 0xffd24a, 0xa77bff, 0x6ee79a, 0xff9ad2, 0xfff0d0];
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    let i = 0;

    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 26; k++) {
          const x = -12 + k * 0.96 + rnd(-0.16, 0.16);
          const z = side * (11.4 + row * 1.05);
          const y = 1.15 + row * 0.85 + rnd(-0.05, 0.05);
          this.crowdData.push({ x, y, z, phase: Math.random() * TAU, sp: rnd(2.2, 3.6) });
          m.makeTranslation(x, y, z);
          this.crowd.setMatrixAt(i, m);
          this.crowd.setColorAt(i, col.setHex(palette[(Math.random() * palette.length) | 0]));
          i++;
        }
      }

      // Bleachers underneath them.
      for (let row = 0; row < 3; row++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(23.5, 0.85 + row * 0.85, 1.05),
          new THREE.MeshLambertMaterial({ color: row % 2 ? 0xe9e2d0 : 0xd9d0bb })
        );
        step.position.set(0, (0.85 + row * 0.85) / 2 - 0.1, side * (11.4 + row * 1.05));
        step.receiveShadow = true;
        this.scene.add(step);
      }
    }
    this.crowd.instanceColor.needsUpdate = true;
    this.scene.add(this.crowd);
  }

  // Trees and bushes at the ends of the island, framing the pitch.
  _props() {
    const trunkM = new THREE.MeshLambertMaterial({ color: 0x8a5a33 });
    const leafM  = [0x4fae4a, 0x3f9c46, 0x66c257].map(c => new THREE.MeshLambertMaterial({ color: c }));
    const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 1.5, 7);
    const leafG  = new THREE.SphereGeometry(1, 9, 7);

    for (let i = 0; i < 26; i++) {
      const end = Math.random() < 0.5 ? -1 : 1;
      const x = end * rnd(8.5, 13.6);
      const z = rnd(-13.5, 13.5);
      if (Math.hypot(x, z) > CFG.arenaR - 1.1) continue;
      if (Math.abs(z) > 10.2 && Math.abs(z) < 14.2) continue;   // keep the stands clear

      const g = new THREE.Group();
      const tall = Math.random() < 0.55;
      if (tall) {
        const tr = new THREE.Mesh(trunkG, trunkM);
        tr.position.y = 0.75; tr.castShadow = true;
        g.add(tr);
        for (let k = 0; k < 3; k++) {
          const b = new THREE.Mesh(leafG, leafM[k % 3]);
          b.scale.setScalar(rnd(0.7, 1.05));
          b.position.set(rnd(-0.4, 0.4), 1.7 + k * 0.42, rnd(-0.4, 0.4));
          b.castShadow = true;
          g.add(b);
        }
      } else {
        for (let k = 0; k < 3; k++) {
          const b = new THREE.Mesh(leafG, leafM[k % 3]);
          const s = rnd(0.38, 0.7);
          b.scale.set(s, s * 0.8, s);
          b.position.set(rnd(-0.5, 0.5), s * 0.7, rnd(-0.5, 0.5));
          b.castShadow = true;
          g.add(b);
        }
      }
      g.position.set(x, 0, z);
      g.scale.setScalar(rnd(0.85, 1.3));
      this.scene.add(g);
    }
  }

  _clouds() {
    this.clouds = [];
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const n = 3 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const s = rnd(1.4, 2.9);
        const b = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat);
        b.position.set(rnd(-3, 3) + k * 1.6 - n * 0.8, rnd(-0.5, 0.6), rnd(-1, 1));
        b.scale.y = 0.66;
        g.add(b);
      }
      g.position.set(rnd(-40, 40), rnd(11, 22), rnd(-38, -6));
      g.userData.sp = rnd(0.25, 0.65);
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  /* ── camera ──────────────────────────────────────────────────────────── */

  // The pitch is a long horizontal line, which is murder on a portrait phone.
  // So the camera swings further off-axis (and higher) as the screen narrows,
  // letting the rope run diagonally and use both dimensions.
  layout(aspect) {
    let az, el, fov, halfWidth;
    if (aspect >= 1.5)      { az = 0.11; el = 0.27; fov = 40; halfWidth = 10.4; }
    else if (aspect >= 1.0) { az = 0.34; el = 0.34; fov = 46; halfWidth = 9.4; }
    else if (aspect >= 0.7) { az = 0.62; el = 0.40; fov = 52; halfWidth = 8.4; }
    else                    { az = 0.86; el = 0.40; fov = 56; halfWidth = 7.4; }

    this.az = az; this.el = el;
    this.camera.fov = fov;
    this.camera.aspect = aspect;

    const hRad = THREE.MathUtils.degToRad(fov) / 2;
    // Horizontal span the line actually occupies once swung off-axis.
    const need = halfWidth * Math.cos(az);
    const distH = (need * 1.1) / (Math.tan(hRad) * Math.max(aspect, 0.35));
    const distV = 5.4 / Math.tan(hRad);
    this.baseDist = THREE.MathUtils.clamp(Math.max(distH, distV), 17, 44);
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.layout(w / Math.max(h, 1));
  }

  shake(a) { this.shakeAmt = Math.min(1.4, this.shakeAmt + a); }
  cheer(a = 1) { this.cheerLevel = Math.min(1.6, this.cheerLevel + a); }
  setZoom(z) { this.zoomTarget = z; }

  /* ── per-frame ───────────────────────────────────────────────────────── */

  update(dt, focusX = 0) {
    this.time += dt;
    const t = this.time;

    this.aimX += (focusX - this.aimX) * (1 - Math.exp(-dt * 3.2));
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 2.6));
    this.shakeAmt *= Math.exp(-dt * 5.5);
    this.cheerLevel *= Math.exp(-dt * 1.4);

    const d = this.baseDist / this.zoom;
    const ce = Math.cos(this.el), se = Math.sin(this.el);
    const sh = this.shakeAmt;
    const jx = Math.sin(t * 47.3) * sh * 0.28;
    const jy = Math.sin(t * 39.1 + 1.7) * sh * 0.24;

    this.aim.set(this.aimX * this.aimFactor, 2.15, 0);
    this.camera.position.set(
      this.aim.x + Math.sin(this.az) * d * ce + jx,
      this.aim.y + se * d + jy,
      this.aim.z + Math.cos(this.az) * d * ce
    );
    this.camera.lookAt(this.aim.x + jx * 0.4, this.aim.y + jy * 0.5, this.aim.z);

    // Crowd bob — a low idle sway that spikes when someone scores a big pull.
    const m = new THREE.Matrix4();
    const hype = 0.5 + this.cheerLevel;
    for (let i = 0; i < this.crowdData.length; i++) {
      const c = this.crowdData[i];
      const bob = Math.sin(t * c.sp + c.phase) * 0.1 * hype;
      m.makeTranslation(c.x, c.y + Math.max(0, bob) * 2.2, c.z);
      this.crowd.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;

    for (const g of this.clouds) {
      g.position.x += g.userData.sp * dt;
      if (g.position.x > 46) g.position.x = -46;
    }

    for (const gm of this.goalMarks) {
      for (const f of gm.userData.flags) f.rotation.y = Math.sin(t * 2.4 + f.position.z) * 0.35;
    }

    this.centreLine.material.color.setHSL(0.12, 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3)), 0.92);
  }

  // Slides the chalk goal markers inward during sudden death.
  setGoalDistance(d) {
    if (this.goalMarks.length === 2) {
      this.goalMarks[0].position.x = -d;
      this.goalMarks[1].position.x = d;
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
