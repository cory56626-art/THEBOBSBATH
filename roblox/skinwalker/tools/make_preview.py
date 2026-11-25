"""Write build/preview.html: a three.js viewer of the exported scene (for checking the model outside Roblox)."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")

TEMPLATE = r"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Skinwalker Preview</title>
<style>html,body{margin:0;height:100%;background:#07080b;overflow:hidden}canvas{display:block}</style>
</head><body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
const PARTS = __DATA__;
const ROUGH = {Neon:1, Metal:0.45, SmoothPlastic:0.35, Concrete:0.85, Fabric:0.95, Ground:1, Mud:0.6, Wood:0.9, Slate:0.9};
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
scene.fog = new THREE.FogExp2(0x1a1e26, location.search.includes('noceil') ? 0.0 : 0.012);
scene.add(new THREE.HemisphereLight(0x3a4458, 0x0c0a08, 0.55));
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 600);

function wedgeGeo(){
  const g = new THREE.BufferGeometry();
  const v = [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[-.5,.5,.5],[.5,.5,.5]];
  const f = [[0,2,1],[0,3,2],[3,4,5],[3,5,2],[0,1,5],[0,5,4],[0,4,3],[1,2,5]];
  const pos=[]; f.forEach(t=>t.forEach(i=>pos.push(...v[i])));
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.computeVertexNormals(); return g;
}
const GEO = {
  Block: new THREE.BoxGeometry(1,1,1),
  Ellipsoid: new THREE.SphereGeometry(0.5, 20, 14),
  Ball: new THREE.SphereGeometry(0.5, 16, 12),
  Cylinder: new THREE.CylinderGeometry(0.5,0.5,1,18).rotateZ(-Math.PI/2),
  Wedge: wedgeGeo(),
};
const col = c => new THREE.Color(c[0]/255, c[1]/255, c[2]/255).convertSRGBToLinear();
const NOCEIL = location.search.includes('noceil');
const QS = new URLSearchParams(location.search);
const NEAR = QS.get('near') ? QS.get('near').split(',').map(Number) : null; // x,z,r: only lights near here
const NOLIGHTS = QS.has('nolights');
if (NOLIGHTS) scene.add(new THREE.AmbientLight(0xffffff, 0.9));
for (const p of PARTS) {
  if (p.transparency >= 1 && !p.lights.length) continue;
  if (NOCEIL && (p.name === 'Ceiling' || p.name === 'Lamp' || p.name === 'BrokenLamp')) continue;
  const c = p.cf, s = p.size;
  const M = new THREE.Matrix4().set(c[3],c[4],c[5],c[0], c[6],c[7],c[8],c[1], c[9],c[10],c[11],c[2], 0,0,0,1);
  if (p.transparency < 1) {
    let sc;
    if (p.shape === 'Cylinder') { const d=Math.min(s[1],s[2]); sc=[s[0],d,d]; }
    else if (p.shape === 'Ball') { const d=Math.min(...s); sc=[d,d,d]; }
    else sc = s;
    const mat = p.material === 'Neon'
      ? new THREE.MeshBasicMaterial({color: col(p.color).multiplyScalar(2.2)})
      : new THREE.MeshStandardMaterial({color: col(p.color), roughness: ROUGH[p.material] ?? 0.7,
          metalness: p.material==='Metal'?0.6:0});
    const mesh = new THREE.Mesh(GEO[p.shape] || GEO.Block, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(M).multiply(new THREE.Matrix4().makeScale(...sc));
    mesh.castShadow = p.name !== 'Ground'; mesh.receiveShadow = true;
    scene.add(mesh);
  }
  for (const L of p.lights) {
    if (NOLIGHTS) break;
    if (NEAR && Math.hypot(c[0]-NEAR[0], c[2]-NEAR[1]) > NEAR[2]) continue;
    const pos = new THREE.Vector3(c[0],c[1],c[2]);
    const lc = new THREE.Color(L.color[0]/255, L.color[1]/255, L.color[2]/255);
    if (L.type === 'SpotLight') {
      const axis = L.face === 0 ? new THREE.Vector3(c[3],c[6],c[9]) : new THREE.Vector3(-c[5],-c[8],-c[11]);
      const sl = new THREE.SpotLight(lc, L.brightness*1.6, L.range*1.3, THREE.MathUtils.degToRad(L.angle/2), 0.5, 1);
      sl.position.copy(pos); sl.target.position.copy(pos.clone().add(axis.multiplyScalar(10)));
      sl.castShadow = L.brightness > 5; sl.shadow.mapSize.set(2048,2048); sl.shadow.bias = -0.0004;
      scene.add(sl, sl.target);
    } else {
      const pl = new THREE.PointLight(lc, L.brightness * 1.5, L.range * 1.2); pl.position.copy(pos); pl.position.y -= 0.6; scene.add(pl);
    }
  }
}
const views = {
  top: [[0,190,40],[0,0,0]], lobby: [[-80,9,40],[-40,5,10]], corridor: [[-40,7,-22],[60,4,-20]],
  morgue: [[-70,10,-25],[-60,3,-55]], ward: [[-40,9,-4],[10,3,-4]],
  spawn: [[0,5,-30],[0,7,0]], front: [[2.5,8.5,-13],[0,7.2,-1.5]], face: [[1.2,9.6,-8.2],[0,9.3,-4.3]],
  side: [[-13,7,-2],[0,6,-0.5]], back: [[6,10,11],[0,7.5,0]],
};
function applyView(name){ const [e,t]=views[name]||views.front; camera.position.set(...e); camera.lookAt(...t); camera.userData.t=new THREE.Vector3(...t); }
applyView((location.hash||'#front').slice(1));
window.setView = (n)=>{ applyView(n); renderer.render(scene,camera); };
// drag to orbit (for touch screens too)
let drag=null; const el=renderer.domElement;
el.addEventListener('pointerdown',e=>drag={x:e.clientX,y:e.clientY});
addEventListener('pointerup',()=>drag=null);
addEventListener('pointermove',e=>{ if(!drag) return; const t=camera.userData.t; const off=camera.position.clone().sub(t);
  const sph=new THREE.Spherical().setFromVector3(off); sph.theta-=(e.clientX-drag.x)*0.006; sph.phi=Math.min(2.9,Math.max(0.2,sph.phi-(e.clientY-drag.y)*0.006));
  camera.position.copy(t).add(new THREE.Vector3().setFromSpherical(sph)); camera.lookAt(t); drag={x:e.clientX,y:e.clientY}; });
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
renderer.render(scene,camera);
window.READY = true;
</script></body></html>
"""

with open(os.path.join(BUILD, "preview.json")) as fh:
    data = fh.read()
with open(os.path.join(BUILD, "preview.html"), "w") as fh:
    fh.write(TEMPLATE.replace("__DATA__", data))
print("wrote build/preview.html")
