"""Filmstrip of the R6 player animations on a standard R6 rig (real R6 joint CFrames), using the same pose math
as CharacterAnimator's R6 branch (ported 1:1).   python3 tools/r6_preview.py -> build/r6_anim.html
"""
import os

BUILD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")

HTML = r"""<!doctype html><html><head><meta charset="utf-8"><title>R6 Animation</title>
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
// Roblox CFrame (x,y,z, R00..R22) -> Matrix4
const CF = (x, y, z, r00 = 1, r01 = 0, r02 = 0, r10 = 0, r11 = 1, r12 = 0, r20 = 0, r21 = 0, r22 = 1) =>
  new THREE.Matrix4().set(r00, r01, r02, x, r10, r11, r12, y, r20, r21, r22, z, 0, 0, 0, 1);
const RY = (a) => new THREE.Matrix4().makeRotationY(a);
// standard R6 joints
const ROOT = CF(0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0);
const J = {
  RootJoint: {p0: 'HumanoidRootPart', p1: 'Torso', c0: ROOT, c1: ROOT},
  Neck: {p0: 'Torso', p1: 'Head', c0: CF(0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0), c1: CF(0, -0.5, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0)},
  'Right Shoulder': {p0: 'Torso', p1: 'Right Arm', c0: CF(1, 0.5, 0).multiply(RY(Math.PI / 2)), c1: CF(-0.5, 0.5, 0).multiply(RY(Math.PI / 2))},
  'Left Shoulder': {p0: 'Torso', p1: 'Left Arm', c0: CF(-1, 0.5, 0).multiply(RY(-Math.PI / 2)), c1: CF(0.5, 0.5, 0).multiply(RY(-Math.PI / 2))},
  'Right Hip': {p0: 'Torso', p1: 'Right Leg', c0: CF(1, -1, 0).multiply(RY(Math.PI / 2)), c1: CF(0.5, 1, 0).multiply(RY(Math.PI / 2))},
  'Left Hip': {p0: 'Torso', p1: 'Left Leg', c0: CF(-1, -1, 0).multiply(RY(-Math.PI / 2)), c1: CF(-0.5, 1, 0).multiply(RY(-Math.PI / 2))},
};
const SIZE = {Torso: [2, 2, 1], Head: [2, 1, 1], 'Right Arm': [1, 2, 1], 'Left Arm': [1, 2, 1], 'Right Leg': [1, 2, 1], 'Left Leg': [1, 2, 1]};
const COL = {Torso: 0x2e7d4f, Head: 0xe0c090, 'Right Arm': 0xe0c090, 'Left Arm': 0xc9a070, 'Right Leg': 0x34495e, 'Left Leg': 0x22303e};
const mesh = {};
for (const [n, s] of Object.entries(SIZE)) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshStandardMaterial({color: COL[n]}));
  // a nose so you can see which way the head faces
  if (n === 'Head') { const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.4), new THREE.MeshStandardMaterial({color: 0x993322})); nose.position.set(0, 0, -0.6); m.add(nose); }
  m.matrixAutoUpdate = false; scene.add(m); mesh[n] = m;
}
const ORDER = ['RootJoint', 'Neck', 'Right Shoulder', 'Left Shoulder', 'Right Hip', 'Left Hip'];

// ---- port of CharacterAnimator R6 branch. returns joint -> {t:[x,y,z], r:[x,y,z]} applied as C0 * T(t) * Rxyz(r)
function r6Pose(st) {
  const s = Math.sin(st.phase), m = st.moving;
  const legAmp = (0.55 + st.sprint * 0.4) * m * (1 - 0.5 * st.crouch);
  const armAmp = (0.5 + st.sprint * 0.6) * m * (1 - 0.6 * st.crouch);
  const lean = 0.06 * m + 0.25 * st.sprint + 0.35 * st.crouch;
  const drop = 0.85 * st.crouch;
  const bob = -Math.abs(s) * (0.1 + 0.1 * st.sprint) * m;
  const crouchLegs = 0.95 * st.crouch;
  // legs: forward swing, kept upright against the torso lean
  const legL = legAmp * s + lean + crouchLegs + 0.3 * st.air;
  const legR = -legAmp * s + lean + crouchLegs - 0.2 * st.air;
  const armL = -armAmp * s + 0.45 * st.crouch + 0.15 * st.sprint + 1.1 * st.air;
  const armR = armAmp * s + 0.45 * st.crouch + 0.15 * st.sprint + 1.1 * st.air;
  return {
    RootJoint: {t: [0, 0, -drop + bob], r: [lean, 0, 0]},
    Neck: {t: [0, 0, 0], r: [-lean * 0.7, 0, 0]},
    'Left Hip': {t: [0, 0, 0], r: [0, 0, -legL]}, 'Right Hip': {t: [0, 0, 0], r: [0, 0, legR]},
    'Left Shoulder': {t: [0, 0, 0], r: [0, 0, -armL]}, 'Right Shoulder': {t: [0, 0, 0], r: [0, 0, armR]},
  };
}
function draw(pose) {
  const world = {HumanoidRootPart: CF(0, 3, 0)};
  for (const name of ORDER) {
    const j = J[name], q = pose[name];
    const pm = new THREE.Matrix4().makeTranslation(...q.t).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...q.r, 'XYZ')));
    world[j.p1] = world[j.p0].clone().multiply(j.c0).multiply(pm).multiply(j.c1.clone().invert());
    mesh[j.p1].matrix.copy(world[j.p1]);
  }
}
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
window.show = (mode, phase) => {
  const st = {phase, moving: mode === 'idle' ? 0 : 1, sprint: mode === 'sprint' ? 1 : 0, crouch: mode === 'crouch' ? 1 : 0,
    air: mode === 'jump' ? 1 : 0};
  draw(r6Pose(st));
  camera.position.set(12, 4.5, -9); camera.lookAt(0, 2.6, 0); // three-quarter; character faces -Z (nose)
  document.getElementById('l').textContent = mode + '  ' + Math.round(phase * 57.3) + '°';
  renderer.render(scene, camera);
};
window.READY = true;
</script></body></html>
"""
with open(os.path.join(BUILD, "r6_anim.html"), "w") as fh:
    fh.write(HTML)
print("wrote build/r6_anim.html")
