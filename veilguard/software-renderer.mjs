import * as T from '../backrooms/vendor/three.js';

// Compatibility path: project the same Three.js meshes to a 2D canvas when a
// browser blocks WebGL. Camera transforms and animated geometry still run in 3D.
export class SoftwareRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.domElement = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D is unavailable.');
    this.shadowMap = { enabled: false };
    this.info = { render: { triangles: 0, calls: 0 } };
    this.pixelRatio = 1;
    this.isSoftwareRenderer = true;
  }

  setPixelRatio(ratio) { this.pixelRatio = Math.min(1, ratio); }

  setSize(width, height) {
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  render(scene, camera) {
    const ctx = this.ctx, width = this.canvas.width, height = this.canvas.height;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    ctx.fillStyle = `#${scene.background.getHexString()}`;
    ctx.fillRect(0, 0, width, height);

    const view = camera.matrixWorldInverse, projection = camera.projectionMatrix.elements;
    const faces = [], temp = new T.Matrix4(), mv = new T.Matrix4(), point = new T.Vector3();
    const light = new T.Vector3(-.4, .8, .3).normalize();
    const background = scene.background, near = .075, far = 100;
    const fx = projection[0] * width / 2, fy = projection[5] * height / 2;

    const clipNear = vertices => {
      const output = [];
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length];
        const aIn = a.z < -near, bIn = b.z < -near;
        if (aIn) output.push(a);
        if (aIn !== bIn) {
          const ratio = (-near - a.z) / (b.z - a.z);
          output.push({ x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio, z: -near });
        }
      }
      return output;
    };

    const drawMesh = (object, matrix) => {
      const geometry = object.userData.cpuGeometry || object.geometry;
      if (!geometry?.attributes?.position || object.userData.cpuSkip || object.isLineSegments) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (!material || material.visible === false || material.opacity === 0) return;
      const center = new T.Vector3().setFromMatrixPosition(matrix).applyMatrix4(view);
      if (center.z > 12 || center.z < -far || Math.abs(center.x) > -center.z * camera.aspect + 26) return;

      mv.multiplyMatrices(view, matrix);
      const positions = geometry.attributes.position, normals = geometry.attributes.normal;
      const indices = geometry.index?.array, base = material.color || new T.Color(0x79a699);
      const vertices = new Array(positions.count), elements = mv.elements;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);
        vertices[i] = {
          x: elements[0] * point.x + elements[4] * point.y + elements[8] * point.z + elements[12],
          y: elements[1] * point.x + elements[5] * point.y + elements[9] * point.z + elements[13],
          z: elements[2] * point.x + elements[6] * point.y + elements[10] * point.z + elements[14],
        };
      }
      const count = indices ? indices.length : positions.count;
      for (let i = 0; i < count; i += 3) {
        const ia = indices ? indices[i] : i, ib = indices ? indices[i + 1] : i + 1, ic = indices ? indices[i + 2] : i + 2;
        const a = vertices[ia], b = vertices[ib], c = vertices[ic];
        if ((a.z > -near && b.z > -near && c.z > -near) || (a.z < -far && b.z < -far && c.z < -far)) continue;
        const polygon = clipNear([a, b, c]);
        if (polygon.length < 3) continue;
        const screen = polygon.map(v => camera.isOrthographicCamera
          ? [width / 2 + v.x * fx, height / 2 - v.y * fy]
          : [width / 2 + v.x / -v.z * fx, height / 2 - v.y / -v.z * fy]);
        if (screen.every(v => v[0] < 0) || screen.every(v => v[0] > width) || screen.every(v => v[1] < 0) || screen.every(v => v[1] > height)) continue;
        const winding = (screen[1][0] - screen[0][0]) * (screen[2][1] - screen[0][1]) - (screen[1][1] - screen[0][1]) * (screen[2][0] - screen[0][0]);
        if (material.side !== T.DoubleSide && winding >= 0) continue;
        let shade = .92;
        if (normals) { point.fromBufferAttribute(normals, ia).transformDirection(matrix); shade = .66 + Math.max(0, point.dot(light)) * .48; }
        const color = new T.Color(base).multiplyScalar(shade).lerp(background, Math.min(.45, 1 - Math.exp(-(-a.z - b.z - c.z) / 3 * .0002)));
        faces.push({ screen, depth: -(a.z + b.z + c.z) / 3, color: `#${color.getHexString()}`, opacity: material.transparent ? material.opacity : 1 });
      }
    };

    scene.traverseVisible(object => {
      if (object.isMesh && !object.isInstancedMesh) drawMesh(object, object.matrixWorld);
      else if (object.isInstancedMesh && !object.userData.cpuSkip) {
        for (let i = 0; i < object.count; i++) {
          if (object.userData.cpuStride && i % object.userData.cpuStride) continue;
          object.getMatrixAt(i, temp);
          drawMesh(object, new T.Matrix4().multiplyMatrices(object.matrixWorld, temp));
        }
      }
    });
    faces.sort((a, b) => b.depth - a.depth);
    ctx.lineJoin = 'round';
    for (const face of faces) {
      ctx.globalAlpha = face.opacity;
      ctx.fillStyle = face.color;
      ctx.beginPath();
      ctx.moveTo(face.screen[0][0], face.screen[0][1]);
      for (let i = 1; i < face.screen.length; i++) ctx.lineTo(face.screen[i][0], face.screen[i][1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.info.render.triangles = faces.length;
    this.info.render.calls = faces.length;
  }
}
