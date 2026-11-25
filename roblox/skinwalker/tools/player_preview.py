"""Filmstrip of the player animations (walk / sprint / crouch-walk) on a standard-proportioned R15 mannequin,
using the same pose math as StarterPlayerScripts/CharacterAnimator (ported 1:1 below).

    python3 tools/player_preview.py  -> build/player_anim.html
"""
import os

BUILD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")

HTML = r"""<!doctype html><html><head><meta charset="utf-8"><title>Player Animation</title>
<style>html,body{margin:0;background:#20242b}#l{position:fixed;left:10px;top:6px;color:#eee;font:600 18px system-ui}</style>
</head><body><div id="l"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({antialias: true}); renderer.setSize(W, H);
renderer.outputEncoding = THREE.sRGBEncoding; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8f98a8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(5, 10, -6); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x5c5f66}));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

// R15 parts: size and where each joint sits relative to its parent part centre (standard block rig, scale 1)
const P = {
  HumanoidRootPart: {size: [2, 2, 1], parent: null},
  LowerTorso: {size: [2, 0.4, 1], parent: 'HumanoidRootPart', joint: 'Root', c0: [0, -1, 0], c1: [0, -0.2, 0]},
  UpperTorso: {size: [2, 1.6, 1], parent: 'LowerTorso', joint: 'Waist', c0: [0, 0.2, 0], c1: [0, -0.8, 0]},
  Head: {size: [1.2, 1.2, 1.2], parent: 'UpperTorso', joint: 'Neck', c0: [0, 0.8, 0], c1: [0, -0.6, 0]},
  LeftUpperArm: {size: [1, 1.17, 1], parent: 'UpperTorso', joint: 'LeftShoulder', c0: [-1, 0.56, 0], c1: [0.5, 0.39, 0]},
  LeftLowerArm: {size: [1, 1.05, 1], parent: 'LeftUpperArm', joint: 'LeftElbow', c0: [0, -0.33, 0], c1: [0, 0.2, 0]},
  LeftHand: {size: [1, 0.3, 1], parent: 'LeftLowerArm', joint: 'LeftWrist', c0: [0, -0.5, 0], c1: [0, 0.12, 0]},
  RightUpperArm: {size: [1, 1.17, 1], parent: 'UpperTorso', joint: 'RightShoulder', c0: [1, 0.56, 0], c1: [-0.5, 0.39, 0]},
  RightLowerArm: {size: [1, 1.05, 1], parent: 'RightUpperArm', joint: 'RightElbow', c0: [0, -0.33, 0], c1: [0, 0.2, 0]},
  RightHand: {size: [1, 0.3, 1], parent: 'RightLowerArm', joint: 'RightWrist', c0: [0, -0.5, 0], c1: [0, 0.12, 0]},
  LeftUpperLeg: {size: [1, 1.22, 1], parent: 'LowerTorso', joint: 'LeftHip', c0: [-0.5, -0.2, 0], c1: [0, 0.42, 0]},
  LeftLowerLeg: {size: [1, 1.19, 1], parent: 'LeftUpperLeg', joint: 'LeftKnee', c0: [0, -0.41, 0], c1: [0, 0.29, 0]},
  LeftFoot: {size: [1, 0.3, 1], parent: 'LeftLowerLeg', joint: 'LeftAnkle', c0: [0, -0.55, 0], c1: [0, 0.1, 0]},
  RightUpperLeg: {size: [1, 1.22, 1], parent: 'LowerTorso', joint: 'RightHip', c0: [0.5, -0.2, 0], c1: [0, 0.42, 0]},
  RightLowerLeg: {size: [1, 1.19, 1], parent: 'RightUpperLeg', joint: 'RightKnee', c0: [0, -0.41, 0], c1: [0, 0.29, 0]},
  RightFoot: {size: [1, 0.3, 1], parent: 'RightLowerLeg', joint: 'RightAnkle', c0: [0, -0.55, 0], c1: [0, 0.1, 0]},
};
const COL = {UpperTorso: 0x2e7d4f, LowerTorso: 0x2e7d4f, Head: 0xe0c090, LeftUpperLeg: 0x34495e, RightUpperLeg: 0x34495e,
  LeftLowerLeg: 0x34495e, RightLowerLeg: 0x34495e, LeftFoot: 0x222222, RightFoot: 0x222222};
const meshes = {};
for (const [n, p] of Object.entries(P)) {
  if (n === 'HumanoidRootPart') continue;
  const m = new THREE.Mesh(new THREE.BoxGeometry(...p.size), new THREE.MeshStandardMaterial({color: COL[n] || 0xe0c090}));
  m.matrixAutoUpdate = false; scene.add(m); meshes[n] = m;
}

// ---- port of CharacterAnimator (R15 branch). Joint pose = rest C0 * pose; part = parent * C0 * pose * C1^-1
function animPose(st) {
  const out = {};
  const s = Math.sin(st.phase), moving = st.moving;
  const amp = (0.55 + st.sprint * 0.4 - st.crouch * 0.18) * moving;
  const lean = 0.05 * moving + st.sprint * 0.2 + st.crouch * 0.3;
  const bob = -Math.abs(s) * (0.12 + st.sprint * 0.12) * moving;
  const cHip = 0.95 * st.crouch, cKnee = -1.55 * st.crouch, cAnkle = 0.6 * st.crouch;
  for (const [side, ph] of [['Left', st.phase], ['Right', st.phase + Math.PI]]) {
    const sp = Math.sin(ph), cp = Math.cos(ph);
    const hip = amp * sp + cHip;
    const knee = -(0.08 + (0.9 + st.sprint * 0.5) * Math.max(0, cp) * moving) + cKnee;
    const ankle = -(hip + knee) * 0.45 + cAnkle * 0.4;
    out[side + 'Hip'] = [0, 0, 0, hip, 0, 0]; out[side + 'Knee'] = [0, 0, 0, knee, 0, 0]; out[side + 'Ankle'] = [0, 0, 0, ankle, 0, 0];
  }
  for (const [side, ph] of [['Left', st.phase + Math.PI], ['Right', st.phase]]) {
    const sgn = side === 'Left' ? -1 : 1;
    const swing = -(0.45 + st.sprint * 0.5) * Math.sin(ph) * moving;
    const forward = st.crouch * 0.35 + st.sprint * 0.15;
    const elbow = 0.2 + st.sprint * 1.15 + st.crouch * 0.5 + 0.25 * Math.max(0, -Math.sin(ph)) * moving;
    out[side + 'Shoulder'] = [0, 0, 0, swing + forward, 0, sgn * 0.06]; out[side + 'Elbow'] = [0, 0, 0, elbow, 0, 0];
  }
  out.Root = [0, bob, 0, 0, 0.06 * s * moving, 0];
  out.Waist = [0, 0, 0, -lean, -0.12 * s * moving * (1 + st.sprint), 0];
  out.Neck = [0, 0, 0, lean * 0.8, 0.05 * s * moving, 0];
  return out;
}
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
function draw(pose, x, hipH) {
  const world = {HumanoidRootPart: T(x, hipH + 1, 0)};
  for (const [n, p] of Object.entries(P)) {
    if (!p.parent) continue;
    const q = pose[p.joint] || [0, 0, 0, 0, 0, 0];
    const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(q[3], q[4], q[5], 'XYZ'));
    world[n] = world[p.parent].clone().multiply(T(...p.c0)).multiply(T(q[0], q[1], q[2])).multiply(rot)
      .multiply(T(-p.c1[0], -p.c1[1], -p.c1[2]));
    meshes[n].matrix.copy(world[n]);
  }
}
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
window.show = (mode, phase) => {
  const st = {phase, moving: 1, sprint: mode === 'sprint' ? 1 : 0, crouch: mode === 'crouch' ? 1 : 0};
  const hipH = 2 * (mode === 'crouch' ? 0.7 : 1);
  draw(animPose(st), 0, hipH);
  camera.position.set(13, 4.5, -8); camera.lookAt(0, 2.4, 0); // three-quarter view; character faces -Z
  document.getElementById('l').textContent = mode + '  ' + Math.round(phase * 57.3) + '°';
  renderer.render(scene, camera);
};
window.READY = true;
</script></body></html>
"""
with open(os.path.join(BUILD, "player_anim.html"), "w") as fh:
    fh.write(HTML)
print("wrote build/player_anim.html")
