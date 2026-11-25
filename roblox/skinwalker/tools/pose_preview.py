"""Write build/pose.html: renders the rig in named poses using tools/pose.js (the same math as the in-game animator).

    python3 tools/export_rig.py && python3 tools/pose_preview.py
Then screenshot with: node <shoot script> build/pose.html <out dir> <pose:view> ...
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(os.path.dirname(HERE), "build")

HTML = r"""<!doctype html><html><head><meta charset="utf-8"><title>Skinwalker Poses</title>
<style>html,body{margin:0;background:#1d2026;overflow:hidden}#lbl{position:fixed;left:12px;top:8px;color:#eee;font:600 20px system-ui}</style>
</head><body><div id="lbl"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>const RIG = __RIG__;</script>
<script>__POSEJS__</script>
<script>
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8a94a6);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3530, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(20, 40, -25); sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -15; sun.shadow.camera.right = sun.shadow.camera.top = 15;
sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({color: 0x5b5d63}));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(80, 40, 0x333333, 0x444444); grid.position.y = 0.01; scene.add(grid);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 300);

const GEO = {Block: new THREE.BoxGeometry(1,1,1), Ellipsoid: new THREE.SphereGeometry(0.5, 16, 12),
  Ball: new THREE.SphereGeometry(0.5, 12, 10), Cylinder: new THREE.CylinderGeometry(0.5,0.5,1,12).rotateZ(-Math.PI/2)};
const col = c => new THREE.Color(c[0]/255, c[1]/255, c[2]/255).convertSRGBToLinear();
const cfm = c => new THREE.Matrix4().set(c[3],c[4],c[5],c[0], c[6],c[7],c[8],c[1], c[9],c[10],c[11],c[2], 0,0,0,1);
const meshes = RIG.parts.map(p => {
  let sc = p.size;
  if (p.shape === 'Cylinder') { const d = Math.min(p.size[1], p.size[2]); sc = [p.size[0], d, d]; }
  if (p.shape === 'Ball') { const d = Math.min(...p.size); sc = [d, d, d]; }
  const m = new THREE.Mesh(GEO[p.shape] || GEO.Block, p.material === 'Neon'
    ? new THREE.MeshBasicMaterial({color: col(p.color).multiplyScalar(2)})
    : new THREE.MeshStandardMaterial({color: col(p.color).multiplyScalar(1.6), roughness: 0.7}));
  m.castShadow = true; m.matrixAutoUpdate = false; scene.add(m);
  const j = RIG.bones[p.bone].joint;
  return {m, bone: p.bone, local: new THREE.Matrix4().makeTranslation(-j[0], -j[1], -j[2]).multiply(cfm(p.cf))
    .multiply(new THREE.Matrix4().makeScale(...sc))};
});

// rig info for the pose math (same as the Luau side reads from Motor6D C0s)
const J = n => RIG.bones[n].joint;
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const R = {legs: {}, arms: {}, shoulderOff: {}};
for (const s of ['Left', 'Right']) {
  const k = sub(J(s+'Shin'), J(s+'Thigh')), h = sub(J(s+'Meta'), J(s+'Shin')), a = sub(J(s+'Foot'), J(s+'Meta'));
  R.legs[s] = {K0: [k[1], k[2]], H0: [h[1], h[2]], A0: [a[1], a[2]], a: 0, b: 0};
  R.arms[s] = {E0: sub(J(s+'LowerArm'), J(s+'UpperArm')), W0: sub(J(s+'Hand'), J(s+'LowerArm')), a: 0, r: 0, b: 0};
  R.shoulderOff[s] = sub(J(s+'UpperArm'), J('Chest'));
}
R.abdOff = sub(J('Abdomen'), J('Pelvis')); R.chestOff = sub(J('Chest'), J('Abdomen'));

function applyPose(pose) {
  const world = {};
  for (const [name, b] of Object.entries(RIG.bones)) {
    let w;
    if (!b.parent) w = new THREE.Matrix4().makeTranslation(...b.joint);
    else {
      const pj = RIG.bones[b.parent].joint, o = sub(b.joint, pj);
      w = world[b.parent].clone().multiply(new THREE.Matrix4().makeTranslation(...o));
    }
    const tr = pose[name];
    if (tr) {
      w.multiply(new THREE.Matrix4().makeTranslation(...tr.t));
      w.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tr.r[0], tr.r[1], tr.r[2], tr.order)));
    }
    world[name] = w;
  }
  for (const it of meshes) it.m.matrix.copy(world[it.bone]).multiply(it.local);
}

const base = {crouch:0, lean:0.2, quad:0, phase:0, gait:0, stride:0, lift:0, wig:0, sway:0, breath:0, yaw:0, pitch:0,
  tilt:0.1, jaw:0.08, air:0, atk:-1, atkSide:1, dead:0, curl:0.15, t:1, tendril:{spd:1.3, amp:1, flat:0}};
const walk = (sp) => ({gait: Math.min(1, sp/6), stride: Math.min(2.2, 0.9 + sp*0.065), lift: Math.min(1.2, sp*0.07)});
const POSES = {
  stand: {},
  walk: {lean:0.25, phase:Math.PI/2, ...walk(10)},
  stalk: {crouch:0.7, lean:0.5, quad:0.35, phase:Math.PI/2, ...walk(7)},
  ambush: {crouch:1, lean:0.55, quad:0.65, curl:0.35, tendril:{spd:1, amp:0.4, flat:-0.35}},
  lookback: {crouch:1, lean:0.55, quad:0.65, curl:0.35, yaw:1.0, pitch:0.1, tendril:{spd:1, amp:0.4, flat:-0.35}},
  chase: {crouch:0.1, lean:0.35, quad:1, phase:Math.PI/2, jaw:0.35, ...walk(19.5), tendril:{spd:4, amp:1.3, flat:0.25}},
  chase2: {crouch:0.1, lean:0.35, quad:1, phase:Math.PI, jaw:0.35, ...walk(19.5), tendril:{spd:4, amp:1.3, flat:0.25}},
  pounce: {air:1, jaw:0.5, curl:0.4, tendril:{spd:4, amp:1.3, flat:0.25}},
  attack: {lean:0.4, crouch:0.25, atk:0.6, atkSide:1, jaw:0.3},
  dead: {dead:1, tendril:{spd:0, amp:0, flat:-0.25}},
};
const VIEWS = {side: [[16, 6, -2], [0, 4.5, -1.5]], front: [[9, 7, -14], [0, 5, -1.5]], back: [[-7, 9, 12], [0, 5, 0]]};
window.show = (name, view) => {
  const P = Object.assign({}, base, POSES[name] || {});
  for (let i = 0; i < 4; i++) applyPose(computePose(P, R)); // let the IK settle
  const [e, t] = VIEWS[view] || VIEWS.side;
  camera.position.set(...e); camera.lookAt(...t);
  document.getElementById('lbl').textContent = name + ' / ' + view;
  renderer.render(scene, camera);
};
window.READY = true;
</script></body></html>
"""

rig = open(os.path.join(BUILD, "rig.json")).read()
posejs = open(os.path.join(HERE, "pose.js")).read()
with open(os.path.join(BUILD, "pose.html"), "w") as fh:
    fh.write(HTML.replace("__RIG__", rig).replace("__POSEJS__", posejs))
print("wrote build/pose.html")
