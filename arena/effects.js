import * as THREE from '../house/vendor/three.module.js';

// Visual aftermath follows simulation events; it never moves or damages bodies.
// Fixed particle/instance budgets keep a collapsing street from creating hundreds
// of independent meshes, geometries, materials or draw calls.
const UP = new THREE.Vector3(0, 1, 0);
const FLOOR = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const finite = p => p && Number.isFinite(p.x + p.y + p.z);

function cloudTexture(kind) {
  const size = 96, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const r = Math.sqrt(u * u + v * v), index = (y * size + x) * 4;
    const n = (Math.sin(u * 9 + Math.sin(v * 8) * 2) + Math.cos(v * 12 - u * 4)) * .11;
    const edge = Math.max(0, 1 - r);
    let alpha;
    if (kind === 'smoke') alpha = Math.pow(clamp(edge + n * edge, 0, 1), 1.35) * .72;
    else if (kind === 'scorch') alpha = Math.pow(edge, .5) * (hash(x * 3 + y * 7) * .45 + .55) * .8;
    else if (kind === 'spark') alpha = Math.pow(edge, 3.2);
    else alpha = Math.pow(edge, 2.2);
    data[index] = data[index + 1] = data[index + 2] = 255;
    data[index + 3] = Math.round(alpha * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  return texture;
}

class ParticlePool {
  constructor(capacity, texture, additive) {
    this.capacity = capacity; this.cursor = 0; this.alive = 0; this._color = new THREE.Color(); this._endColor = new THREE.Color();
    this.particles = Array.from({ length: capacity }, () => ({ life: 0 }));
    this.positions = new Float32Array(capacity * 3); this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity); this.alphas = new Float32Array(capacity);
    this.angles = new Float32Array(capacity); this.stretches = new Float32Array(capacity);
    const geometry = new THREE.BufferGeometry();
    for (const [name, array, size] of [['position', this.positions, 3], ['particleColor', this.colors, 3], ['size', this.sizes, 1], ['opacity', this.alphas, 1], ['angle', this.angles, 1], ['stretch', this.stretches, 1]]) {
      geometry.setAttribute(name, new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: { sprite: { value: texture }, viewportScale: { value: 600 } },
      vertexShader: `
        attribute vec3 particleColor; attribute float size; attribute float opacity;
        attribute float angle; attribute float stretch; uniform float viewportScale;
        varying vec3 vColor; varying float vAlpha; varying float vAngle; varying float vStretch;
        void main(){
          vec4 mv=modelViewMatrix*vec4(position,1.);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp(size*viewportScale/max(.1,-mv.z),0.,700.);
          vColor=particleColor;vAlpha=opacity;vAngle=angle;vStretch=stretch;
        }`,
      fragmentShader: `
        uniform sampler2D sprite; varying vec3 vColor; varying float vAlpha;
        varying float vAngle; varying float vStretch;
        void main(){
          vec2 p=gl_PointCoord-.5;float c=cos(vAngle),s=sin(vAngle);
          p=mat2(c,-s,s,c)*p;p.x*=vStretch;
          vec4 texel=texture2D(sprite,p+.5);
          float a=texel.a*vAlpha;
          if(a<.006)discard;
          gl_FragColor=vec4(vColor,a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
    });
    this.object = new THREE.Points(geometry, this.material); this.object.frustumCulled = false;
    this.object.renderOrder = additive ? 5 : 3;
    const resolution = new THREE.Vector2();
    this.object.onBeforeRender = (renderer, scene, camera) => {
      renderer.getDrawingBufferSize(resolution);
      this.material.uniforms.viewportScale.value = resolution.y * camera.projectionMatrix.elements[5] * .5;
    };
  }
  spawn(position, options = {}) {
    const p = this.particles[this.cursor]; this.cursor = (this.cursor + 1) % this.capacity;
    p.x = position.x; p.y = position.y; p.z = position.z;
    p.vx = options.vx || 0; p.vy = options.vy || 0; p.vz = options.vz || 0;
    p.life = p.maxLife = options.life ?? .8; p.age = options.age ?? .016;
    p.size = options.size ?? 1; p.growth = options.growth ?? 0;
    p.drag = options.drag ?? 1; p.gravity = options.gravity ?? 0;
    p.alpha = options.alpha ?? 1; p.angle = options.angle ?? Math.random() * Math.PI * 2;
    p.spin = options.spin ?? (Math.random() - .5); p.stretch = options.stretch ?? 1;
    const color = this._color.set(options.color ?? 0xffffff), end = this._endColor.set(options.endColor ?? options.color ?? 0xffffff);
    p.r = color.r * (options.brightness ?? 1); p.g = color.g * (options.brightness ?? 1); p.b = color.b * (options.brightness ?? 1);
    p.er = end.r; p.eg = end.g; p.eb = end.b;
    p.fadeIn = options.fadeIn ?? .025;
    return p;
  }
  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (p.life <= 0) { this.sizes[i] = this.alphas[i] = 0; continue; }
      p.life -= dt; p.age += dt;
      if (p.life <= 0) { this.sizes[i] = this.alphas[i] = 0; continue; }
      const damping = Math.exp(-p.drag * dt); p.vx *= damping; p.vz *= damping; p.vy = p.vy * damping + p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < .08) { p.y = .08; p.vy = Math.abs(p.vy) * .18; p.vx *= .8; p.vz *= .8; }
      p.angle += p.spin * dt;
      const progress = clamp(p.age / p.maxLife, 0, 1), remaining = p.life / p.maxLife;
      const j = i * 3;
      this.positions[j] = p.x; this.positions[j + 1] = p.y; this.positions[j + 2] = p.z;
      this.colors[j] = mix(p.r, p.er, progress); this.colors[j + 1] = mix(p.g, p.eg, progress); this.colors[j + 2] = mix(p.b, p.eb, progress);
      this.sizes[i] = Math.max(.01, p.size + p.growth * p.age);
      this.alphas[i] = p.alpha * Math.min(1, p.age / Math.max(.001, p.fadeIn)) * Math.pow(remaining, .8);
      this.angles[i] = p.angle; this.stretches[i] = p.stretch;
      alive++;
    }
    for (const attribute of Object.values(this.object.geometry.attributes)) attribute.needsUpdate = true;
    this.alive = alive; this.object.visible = alive > 0;
  }
  clear() { for (const p of this.particles) p.life = 0; this.sizes.fill(0); this.alphas.fill(0); this.update(0); }
  dispose() { this.object.geometry.dispose(); this.material.dispose(); }
}

function instancedMaterial(options) {
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, ...options });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float effectAlpha; varying float vEffectAlpha;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvEffectAlpha=effectAlpha;');
    shader.fragmentShader = 'varying float vEffectAlpha;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a*=vEffectAlpha;');
  };
  material.customProgramCacheKey = () => 'combat-effect-instance-alpha';
  return material;
}

class InstancePool {
  constructor(geometry, capacity, material) {
    this.capacity = capacity; this.geometry = geometry;
    this.alpha = new Float32Array(capacity);
    geometry.setAttribute('effectAlpha', new THREE.InstancedBufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.object = new THREE.InstancedMesh(geometry, material, capacity); this.object.frustumCulled = false;
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.object.count = 0;
    this.matrix = new THREE.Matrix4(); this.position = new THREE.Vector3(); this.scale = new THREE.Vector3(); this.rotation = new THREE.Quaternion(); this.color = new THREE.Color();
    this.count = 0;
  }
  begin() { this.count = 0; }
  put(position, scale, rotation, color, alpha = 1) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.matrix.compose(position, rotation, scale); this.object.setMatrixAt(i, this.matrix);
    this.object.setColorAt(i, this.color.set(color)); this.alpha[i] = alpha;
  }
  end() {
    this.object.count = this.count; this.object.visible = this.count > 0;
    this.object.instanceMatrix.needsUpdate = true;
    if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true;
    this.geometry.attributes.effectAlpha.needsUpdate = true;
  }
  dispose() { this.geometry.dispose(); this.object.material.dispose(); }
}

export class CombatEffects {
  constructor(scene, { onImpact } = {}) {
    this.scene = scene; this.onImpact = onImpact; this.group = new THREE.Group(); this.group.name = 'combat-effects'; scene.add(this.group);
    this.textures = { glow: cloudTexture('glow'), smoke: cloudTexture('smoke'), spark: cloudTexture('spark'), scorch: cloudTexture('scorch') };
    this.fire = new ParticlePool(320, this.textures.glow, true);
    this.smoke = new ParticlePool(420, this.textures.smoke, false);
    this.sparks = new ParticlePool(360, this.textures.spark, true);
    this.blood = new ParticlePool(120, this.textures.spark, false);
    this.rings = new InstancePool(new THREE.RingGeometry(.88, 1, 64), 28, instancedMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending }));
    this.beams = new InstancePool(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), 80, instancedMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending }));
    this.tendrils = new InstancePool(new THREE.CylinderGeometry(1, 1, 1, 7), 192, instancedMaterial({ color: 0xffffff, blending: THREE.NormalBlending }));
    this.decals = new InstancePool(new THREE.PlaneGeometry(1, 1), 56, instancedMaterial({ color: 0xffffff, map: this.textures.scorch, polygonOffset: true, polygonOffsetFactor: -1 }));
    for (const layer of [this.fire, this.smoke, this.sparks, this.blood, this.rings, this.beams, this.tendrils, this.decals]) this.group.add(layer.object);
    this.rings.object.renderOrder = 4; this.beams.object.renderOrder = 5; this.decals.object.renderOrder = 1;
    this.lights = Array.from({ length: 3 }, () => { const light = new THREE.PointLight(0xffb16c, 0, 18, 2); this.group.add(light); return { light, life: 0, maxLife: 1, power: 0 }; });
    this.seen = new Set(); this.lines = []; this.waves = []; this.marks = [];
    this.lastSim = null; this.lastTime = 0; this.trailTimes = new Map();
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._direction = new THREE.Vector3(); this._mid = new THREE.Vector3();
    this._q = new THREE.Quaternion(); this._twist = new THREE.Quaternion(); this._twistAxis = new THREE.Vector3(0, 0, 1); this._previous = new THREE.Vector3(); this._scale = new THREE.Vector3();
  }

  _flash(position, color, intensity, radius) {
    const item = this.lights.reduce((best, current) => current.life < best.life ? current : best, this.lights[0]);
    item.life = item.maxLife = .22; item.power = 25 * intensity; item.light.color.set(color); item.light.position.copy(position); item.light.distance = Math.max(10, radius * 4);
    this.fire.spawn(position, { color: 0xfff3d2, size: radius * 2.4, life: .13, alpha: .95, brightness: 2.5, growth: radius * 3, drag: 0 });
  }

  _burst(event) {
    const type = event.type, p = event.position;
    const intensity = clamp(event.intensity ?? 1, .25, 3), color = event.color ?? 0xffb451;
    const explosive = type === 'explosion', dusty = type === 'dust' || type === 'landing';
    const radius = clamp(event.radius ?? (explosive ? 4.5 : dusty ? 3.8 : 1.8), .4, 16);
    const count = Math.round((explosive ? 32 : dusty ? 24 : 15) * Math.sqrt(intensity));
    if (!dusty || type === 'landing') this._flash(p, color, intensity, radius);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, y = Math.random(), radial = (1.5 + Math.random() * 3.5) * radius;
      const origin = { x: p.x + (Math.random() - .5) * radius * .5, y: Math.max(.2, p.y + (Math.random() - .25) * radius * .6), z: p.z + (Math.random() - .5) * radius * .5 };
      const smokeColor = dusty ? 0xa39986 : explosive ? 0x514b43 : 0x8a8170;
      this.smoke.spawn(origin, { vx: Math.cos(a) * radial * .3, vy: (explosive ? 1.8 : .8) + y * radius * .65, vz: Math.sin(a) * radial * .3, size: radius * (.38 + Math.random() * .5), growth: radius * .65, life: 1.5 + Math.random() * (explosive ? 2.1 : 1.3), alpha: explosive ? .48 : dusty ? .38 : .26, color: smokeColor, endColor: 0xb3aea1, drag: 1.2, fadeIn: .03 + Math.random() * .1 });
      if (explosive && i < count * .8) this.fire.spawn(origin, { vx: Math.cos(a) * radial * .35, vy: 1.5 + y * 7, vz: Math.sin(a) * radial * .35, size: radius * (.45 + Math.random() * .5), growth: radius * .5, life: .32 + Math.random() * .4, color: 0xffdb70, endColor: 0xff3b07, alpha: .9, brightness: 2.3, drag: 1.8 });
      if (!dusty || type === 'landing') this.sparks.spawn(p, { vx: Math.cos(a) * radial * 1.8, vy: 2 + y * radial, vz: Math.sin(a) * radial * 1.8, size: .3 + Math.random() * .22, stretch: 3.5, gravity: -13, drag: .5, life: .4 + Math.random() * .6, color, endColor: 0xd15322, brightness: 2, alpha: 1 });
    }
    if (explosive || dusty) this._mark(p, radius * .9, explosive ? 0x26231e : 0x6f6557, .55, 65);
    if (explosive || type === 'landing') this._wave(p, radius * 2.6, explosive ? 0xffbb71 : 0xd2c4a3, .65, .85);
    this.onImpact?.({ type, position: p, color, radius, intensity });
  }

  _mark(position, radius, color, alpha, life) {
    if (position.y > 8) return;
    if (this.marks.length >= 56) this.marks.shift();
    this.marks.push({ position: new THREE.Vector3(position.x, .035 + this.marks.length * .0001, position.z), radius, color, alpha, life, maxLife: life, angle: Math.random() * Math.PI * 2 });
  }
  _wave(position, radius, color, alpha = .8, life = .7) {
    if (this.waves.length >= 28) this.waves.shift();
    this.waves.push({ position: new THREE.Vector3(position.x, .11, position.z), radius, color, alpha, life, maxLife: life });
  }
  _line(event, mode) {
    if (!finite(event.to)) return;
    const start = new THREE.Vector3().copy(event.position), end = new THREE.Vector3().copy(event.to);
    const life = Math.min(1.1, Math.max(mode === 'tendril' ? .15 : .1, event.ttl ?? .3));
    if (this.lines.length >= 40) this.lines.shift();
    this.lines.push({ start, end, mode, life, maxLife: life, width: event.width ?? (mode === 'beam' ? .18 : mode === 'tendril' ? .13 : .045), color: event.color ?? (mode === 'repair' ? 0x80f7ff : 0xb9efff), phase: Math.random() * 10 });
    if (mode !== 'tendril' && mode !== 'tracer') {
      this.fire.spawn(start, { color: event.color ?? 0x94eaff, size: mode === 'beam' ? 2.8 : .9, life: .18, alpha: .85, brightness: 2, growth: 2 });
      this.fire.spawn(end, { color: event.color ?? 0x94eaff, size: mode === 'beam' ? 1.5 : .5, life: .15, alpha: .8, brightness: 2 });
    }
  }
  _charge(event) {
    const radius = clamp(event.radius ?? 1.3, .3, 5), color = event.color ?? 0x85dfff;
    this.fire.spawn(event.position, { color, size: radius * 2, life: Math.min(.6, event.ttl ?? .4), alpha: .8, growth: radius * 2, brightness: 1.8 });
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, offset = radius * (1 + Math.random());
      const p = { x: event.position.x + Math.cos(a) * offset, y: event.position.y + (Math.random() - .5) * offset, z: event.position.z + Math.sin(a) * offset };
      this.sparks.spawn(p, { vx: (event.position.x - p.x) * 5, vy: (event.position.y - p.y) * 5, vz: (event.position.z - p.z) * 5, color, size: .25, stretch: 2, life: .22, drag: 0, brightness: 2 });
    }
  }
  _shockwave(event) {
    const radius = clamp(event.radius ?? 13, 3, 25), color = event.color ?? 0xa5d7ef;
    this._wave(event.position, radius, color, .85, .75);
    this._wave(event.position, radius * .83, 0xffffff, .45, .55);
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, offset = .7 + Math.random() * .7;
      const p = { x: event.position.x + Math.cos(a) * offset, y: .2, z: event.position.z + Math.sin(a) * offset };
      this.smoke.spawn(p, { vx: Math.cos(a) * radius * 1.6, vy: .3 + Math.random(), vz: Math.sin(a) * radius * 1.6, size: 1 + Math.random() * 1.2, growth: 2.6, color: 0xb9ad94, endColor: 0xb9b2a1, life: .65 + Math.random() * .55, alpha: .3, drag: 2.1 });
    }
    this._flash(event.position, color, .7, 1.4);
    this.onImpact?.({ type: event.type, position: event.position, color, radius, intensity: event.intensity ?? 1.3 });
  }
  _blood(event) {
    for (let i = 0; i < 13; i++) {
      const color = event.color ?? 0x771c1b;
      this.blood.spawn(event.position, { vx: (Math.random() - .5) * 6, vy: Math.random() * 5, vz: (Math.random() - .5) * 6, gravity: -12, drag: .2, life: .55 + Math.random() * .4, size: .1 + Math.random() * .17, stretch: 1.8, color, alpha: .8 });
    }
    this._mark(event.position, .35 + Math.random() * .3, event.color ?? 0x5b1819, .7, 90);
  }
  _consume(event, sim) {
    if (!finite(event.position)) return;
    if (event.type === 'blood') { if (sim.options?.blood !== false) this._blood(event); return; }
    if (['beam', 'tracer', 'tendril', 'repair', 'gravity'].includes(event.type)) { this._line(event, event.type === 'gravity' ? 'beam' : event.type); return; }
    if (event.type === 'shockwave' || event.type === 'sonic') { this._shockwave(event); return; }
    if (event.type === 'charge') { this._charge(event); return; }
    if (event.type === 'trail' || event.type === 'launch' || event.type === 'boost') {
      this._charge({ ...event, radius: event.radius ?? .9, ttl: .22 });
      if (event.to) this._line({ ...event, width: .08, ttl: .2 }, 'tracer');
      if (event.type === 'launch') this.onImpact?.({ type: 'launch', position: event.position, color: event.color, radius: event.radius ?? 2, intensity: event.intensity ?? 1 });
      return;
    }
    this._burst(event);
  }

  _automaticTrails(sim) {
    for (const fighter of sim.fighters || []) {
      if (!fighter.alive) continue;
      const body = fighter.parts?.torso?.body;
      if (!body?.velocity || !finite(body.position)) continue;
      const velocity = body.velocity, speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      if (speed < 8 || (this.trailTimes.get(fighter.id) ?? -1) > sim.elapsed) continue;
      this.trailTimes.set(fighter.id, sim.elapsed + .045);
      const color = fighter.type === 'buster' ? 0x8cdbff : fighter.type === 'ultron' ? 0xff5b36 : 0xc0b7a3;
      const p = body.position;
      const metal = fighter.type === 'buster' || fighter.type === 'ultron';
      if (metal && (fighter.flight > sim.elapsed || fighter.boostUntil > sim.elapsed || fighter.action?.kind === 'boost' || fighter.type === 'ultron')) {
        this.fire.spawn({ x: p.x, y: p.y - .8, z: p.z }, { vx: -velocity.x * .25, vy: -4 - Math.max(0, velocity.y * .3), vz: -velocity.z * .25, color, life: .15, size: 1, growth: 2, brightness: 2.5, alpha: .6 });
      }
      this.smoke.spawn(p, { vx: -velocity.x * .1, vy: .5, vz: -velocity.z * .1, color: 0xc4bca7, life: .25 + Math.random() * .2, size: .45, growth: 2.5, alpha: .16, drag: .4 });
    }
    for (const projectile of sim.projectiles || []) {
      const body = projectile.body;
      if (!finite(body?.position) || projectile.kind === 'bullet') continue;
      const key = `projectile-${projectile.id}`;
      if ((this.trailTimes.get(key) ?? -1) > sim.elapsed) continue;
      this.trailTimes.set(key, sim.elapsed + .025);
      const color = projectile.kind === 'ultron' ? 0xff5530 : projectile.kind === 'shell' ? 0xffbf69 : 0x8de9ff;
      this.fire.spawn(body.position, { color, endColor: color, size: projectile.kind === 'shell' ? .6 : .8, life: .12, alpha: .7, brightness: 2, growth: .5 });
      if (projectile.kind === 'shell') this.smoke.spawn(body.position, { size: .45, growth: 1, life: .35, alpha: .18, color: 0x928a79, vy: .5 });
    }
  }

  _drawInstances(dt) {
    this.rings.begin(); this.beams.begin(); this.tendrils.begin(); this.decals.begin();
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.life -= dt; if (w.life <= 0) { this.waves.splice(i, 1); continue; }
      const progress = 1 - w.life / w.maxLife, radius = .4 + w.radius * (1 - Math.pow(1 - progress, 2));
      this._scale.set(radius, radius, 1); this.rings.put(w.position, this._scale, FLOOR, w.color, w.alpha * Math.pow(1 - progress, 1.5));
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i]; line.life -= dt; if (line.life <= 0) { this.lines.splice(i, 1); continue; }
      const opacity = Math.min(1, line.life / Math.min(.12, line.maxLife));
      if (line.mode === 'tendril') {
        this._previous.copy(line.start);
        for (let segment = 1; segment <= 12; segment++) {
          const t = segment / 12;
          this._a.lerpVectors(line.start, line.end, t);
          this._a.y += Math.sin(t * Math.PI) * (1.2 + Math.sin(line.phase + line.life * 12) * .25);
          this._a.x += Math.sin(t * Math.PI * 3 + line.phase) * Math.sin(t * Math.PI) * .2;
          this._segment(this.tendrils, this._previous, this._a, line.width * (1 - t * .35), 0x182b2e, opacity);
          this._previous.copy(this._a);
        }
      } else {
        const width = line.width * (1 + Math.sin(line.life * 75 + line.phase) * .08);
        this._segment(this.beams, line.start, line.end, width * 2.6, line.color, opacity * .18);
        this._segment(this.beams, line.start, line.end, width, line.color, opacity * .8);
        if (line.mode === 'beam') this._segment(this.beams, line.start, line.end, width * .37, 0xffffff, opacity);
      }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mark = this.marks[i]; mark.life -= dt;
      if (mark.life <= 0) { this.marks.splice(i, 1); continue; }
      this._q.copy(FLOOR).multiply(this._twist.setFromAxisAngle(this._twistAxis, mark.angle));
      this._scale.set(mark.radius * 2, mark.radius * 1.7, 1);
      this.decals.put(mark.position, this._scale, this._q, mark.color, mark.alpha * Math.min(1, mark.life / 10));
    }
    this.rings.end(); this.beams.end(); this.tendrils.end(); this.decals.end();
  }
  _segment(pool, from, to, width, color, alpha) {
    this._direction.subVectors(to, from); const length = this._direction.length(); if (length < .01) return;
    this._mid.copy(from).add(to).multiplyScalar(.5); this._q.setFromUnitVectors(UP, this._direction.multiplyScalar(1 / length)); this._scale.set(width, length, width);
    pool.put(this._mid, this._scale, this._q, color, alpha);
  }

  update(sim, dt = 0) {
    if (!sim) return;
    if (this.lastSim !== sim || sim.elapsed < this.lastTime) { this.clear(); this.lastSim = sim; this.lastTime = sim.elapsed; }
    // The simulation clock controls visuals. A paused game freezes aftermath too.
    const elapsed = Math.max(0, sim.elapsed - this.lastTime), delta = Math.min(elapsed, .35);
    this.lastTime = sim.elapsed;
    for (const layer of [this.fire, this.smoke, this.sparks, this.blood]) layer.update(delta);
    for (const light of this.lights) { light.life = Math.max(0, light.life - delta); light.light.intensity = light.power * (light.life / light.maxLife) ** 2; }
    this._drawInstances(delta);
    for (const event of sim.effects || []) if (!this.seen.has(event.id)) { this.seen.add(event.id); this._consume(event, sim); }
    if (elapsed > 0) this._automaticTrails(sim);
    // IDs are monotonically increasing within a run; bound bookkeeping in long fights.
    if (this.seen.size > 1200) { const live = new Set((sim.effects || []).map(e => e.id)); for (const id of this.seen) if (!live.has(id)) this.seen.delete(id); }
    if (this.trailTimes.size > 500) { const ids = new Set((sim.projectiles || []).map(p => `projectile-${p.id}`)); for (const id of this.trailTimes.keys()) if (typeof id === 'string' && id.startsWith('projectile-') && !ids.has(id)) this.trailTimes.delete(id); }
    // Spawned particles appear immediately, including when inspected at pause.
    for (const layer of [this.fire, this.smoke, this.sparks, this.blood]) layer.update(0);
    this._drawInstances(0);
    for (const light of this.lights) light.light.intensity = light.power * (light.life / light.maxLife) ** 2;
  }
  clear() {
    for (const layer of [this.fire, this.smoke, this.sparks, this.blood]) layer.clear();
    this.lines.length = this.waves.length = this.marks.length = 0; this.seen.clear(); this.trailTimes.clear();
    for (const light of this.lights) { light.life = 0; light.light.intensity = 0; }
    this._drawInstances(0); this.lastSim = null; this.lastTime = 0;
  }
  dispose() {
    this.clear(); this.scene.remove(this.group);
    for (const layer of [this.fire, this.smoke, this.sparks, this.blood, this.rings, this.beams, this.tendrils, this.decals]) layer.dispose();
    for (const texture of Object.values(this.textures)) texture.dispose();
  }
}
