"""Render the game's thumbnail (1920x1080) and icon (512x512): the real rig, posed, in the real hospital corridor.

    python3 tools/build_place.py && python3 tools/export_rig.py && python3 tools/thumbnail.py
    node <shoot script>   (see below; writes build/thumbnail.png and build/icon.png)
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(os.path.dirname(HERE), "build")

preview = json.load(open(os.path.join(BUILD, "preview.json")))
# the corridor in front of the ward (row 3), minus the creature's resting parts and ceiling clutter
CREATURE_NAMES = {"Flesh", "Muscle", "Rib", "Vertebra", "Tendril", "Pelt", "Tooth", "Claw", "Blood"}
scene = [p for p in preview
         if -14 < p["cf"][0] < 96 and -44 < p["cf"][2] < -6 and p["name"] not in ("Ground",)
         and not (p["cf"][0] < -40 and p["cf"][2] < -28)]

HTML = r"""<!doctype html><html><head><meta charset="utf-8"><title>Thumbnail</title>
<link href="https://fonts.googleapis.com/css2?family=Creepster&family=Special+Elite&display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:#000;overflow:hidden}
#title{position:fixed;left:0;right:0;bottom:7%;text-align:center;font-family:'Creepster',cursive;color:#e8e2d8;
  letter-spacing:.06em;text-shadow:0 0 18px rgba(160,0,0,.85),0 4px 0 #300;}
#sub{position:fixed;left:0;right:0;bottom:3.2%;text-align:center;font-family:'Special Elite',monospace;color:#b9b1a6;
  letter-spacing:.35em}
</style></head><body><div id="title"></div><div id="sub"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>const RIG = __RIG__; const SCENE = __SCENE__;</script>
<script>__POSEJS__</script>
<script>
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(W, H); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x030405);
scene.fog = new THREE.FogExp2(0x080a0b, 0.03);
scene.add(new THREE.HemisphereLight(0x2a3434, 0x080606, 0.35));
const col = c => new THREE.Color(c[0]/255, c[1]/255, c[2]/255).convertSRGBToLinear();
const cfm = c => new THREE.Matrix4().set(c[3],c[4],c[5],c[0], c[6],c[7],c[8],c[1], c[9],c[10],c[11],c[2], 0,0,0,1);
const GEO = {Block: new THREE.BoxGeometry(1,1,1), Ellipsoid: new THREE.SphereGeometry(0.5, 24, 16),
  Ball: new THREE.SphereGeometry(0.5, 16, 12), Cylinder: new THREE.CylinderGeometry(0.5,0.5,1,16).rotateZ(-Math.PI/2)};
const ROUGH = {SmoothPlastic:0.35, Concrete:0.9, Fabric:0.95, Metal:0.45, Marble:0.4, Slate:0.8, Wood:0.8, Neon:1};
function mesh(p, matrix) {
  let sc = p.size;
  if (p.shape === 'Cylinder') { const d = Math.min(p.size[1], p.size[2]); sc = [p.size[0], d, d]; }
  if (p.shape === 'Ball') { const d = Math.min(...p.size); sc = [d, d, d]; }
  const mat = p.material === 'Neon' ? new THREE.MeshBasicMaterial({color: col(p.color).multiplyScalar(2.2)})
    : new THREE.MeshStandardMaterial({color: col(p.color), roughness: ROUGH[p.material] ?? 0.7,
        metalness: p.material === 'Metal' ? 0.5 : 0, transparent: p.transparency > 0, opacity: 1 - p.transparency});
  const m = new THREE.Mesh(GEO[p.shape] || GEO.Block, mat);
  m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
  m.matrix.copy(matrix).multiply(new THREE.Matrix4().makeScale(...sc));
  scene.add(m); return m;
}
for (const p of SCENE) if (p.transparency < 1) mesh(p, cfm(p.cf));

// ---- the creature, posed, in the corridor coming toward the camera
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
const POSE = Object.assign({crouch:0.75, lean:0.5, quad:0.45, phase:Math.PI/2, gait:0.6, stride:1.4, lift:0.4,
  wig:0, sway:0, breath:0.5, yaw:0, pitch:0.35, tilt:-0.45, jaw:0.42, air:0, atk:-1, atkSide:1, dead:0, curl:0.45,
  t:2.2, tendril:{spd:1, amp:1.4, flat:0.2}}, __POSE__);
const ROOTPOS = __ROOT__, YAW = __YAW__;
const placement = new THREE.Matrix4().makeTranslation(...ROOTPOS).multiply(new THREE.Matrix4().makeRotationY(YAW))
  .multiply(new THREE.Matrix4().makeTranslation(...J('HumanoidRootPart').map(v => -v)));
let pose; for (let i = 0; i < 6; i++) pose = computePose(POSE, R);
const world = {};
for (const [name, b] of Object.entries(RIG.bones)) {
  let w;
  if (!b.parent) w = placement.clone().multiply(new THREE.Matrix4().makeTranslation(...b.joint));
  else w = world[b.parent].clone().multiply(new THREE.Matrix4().makeTranslation(...sub(b.joint, RIG.bones[b.parent].joint)));
  const tr = pose[name];
  if (tr) { w.multiply(new THREE.Matrix4().makeTranslation(...tr.t));
    w.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tr.r[0], tr.r[1], tr.r[2], tr.order))); }
  world[name] = w;
}
for (const p of RIG.parts) {
  const j = RIG.bones[p.bone].joint;
  const m = world[p.bone].clone().multiply(new THREE.Matrix4().makeTranslation(-j[0], -j[1], -j[2])).multiply(cfm(p.cf));
  if (p.material === 'Neon') p.color = [255, 210, 140]; // eyeshine in the torchlight
  mesh(p, m);
}

// ---- light: the player's torch from the camera, a failing fluorescent and red emergency light behind it
const CAM = __CAM__, LOOK = __LOOK__;
const camera = new THREE.PerspectiveCamera(__FOV__, W / H, 0.1, 400);
camera.position.set(...CAM); camera.lookAt(...LOOK);
const torch = new THREE.SpotLight(0xffe9cc, 5.2, 70, THREE.MathUtils.degToRad(22), 0.65, 1.3);
torch.position.set(CAM[0] + 0.6, CAM[1] - 0.5, CAM[2]); torch.target.position.set(...LOOK);
torch.castShadow = true; torch.shadow.mapSize.set(2048, 2048); torch.shadow.bias = -0.0003;
scene.add(torch, torch.target);
const red = new THREE.PointLight(0xff2a1a, 2.6, 40, 1.4); red.position.set(ROOTPOS[0] - 14, 12, ROOTPOS[2] + 2); scene.add(red);
const tube = new THREE.PointLight(0xbfe6d8, 1.4, 30, 1.6); tube.position.set(ROOTPOS[0] - 30, 13, ROOTPOS[2]); scene.add(tube);
renderer.render(scene, camera);
document.getElementById('title').textContent = __TITLE__;
document.getElementById('title').style.fontSize = (H * __TSIZE__) + 'px';
document.getElementById('sub').textContent = __SUB__;
document.getElementById('sub').style.fontSize = (H * 0.028) + 'px';
window.READY = true;
</script></body></html>
"""


def page(name, cam, look, root, yaw, fov, pose, title, sub, tsize):
    rig = open(os.path.join(BUILD, "rig.json")).read()
    posejs = open(os.path.join(HERE, "pose.js")).read()
    html = (HTML.replace("__RIG__", rig).replace("__SCENE__", json.dumps(scene)).replace("__POSEJS__", posejs)
            .replace("__CAM__", json.dumps(cam)).replace("__LOOK__", json.dumps(look))
            .replace("__ROOT__", json.dumps(root)).replace("__YAW__", str(yaw)).replace("__FOV__", str(fov))
            .replace("__POSE__", json.dumps(pose)).replace("__TITLE__", json.dumps(title))
            .replace("__SUB__", json.dumps(sub)).replace("__TSIZE__", str(tsize)))
    with open(os.path.join(BUILD, name), "w") as fh:
        fh.write(html)


# corridor runs along X at z = -24; the creature creeps toward the camera (camera looks down -X)
ROOT = [34, 6, -24]
YAW = -1.5708  # face +X (toward the camera)
page("thumb.html", cam=[58, 5.2, -22.5], look=[33, 6.2, -24.2], root=ROOT, yaw=YAW, fov=42, pose={},
     title="THE WALKERS", sub="IT HUNTS LIKE A CAT", tsize=0.15)
page("icon.html", cam=[49, 7.6, -23.2], look=[37.5, 7.0, -24.0], root=ROOT, yaw=YAW, fov=30, pose={},
     title="", sub="", tsize=0.1)
print("wrote build/thumb.html, build/icon.html")
