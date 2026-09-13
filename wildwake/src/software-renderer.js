import * as T from 'three';
// Compatibility renderer: Three.js scene transforms and skinning, painted in Canvas 2D.
// It never changes browser graphics settings or depends on GPU access.
export class SoftwareRenderer {
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});if(!this.ctx)throw new Error('Neither WebGL2 nor Canvas 2D is available.');this.shadowMap={enabled:false};this.info={render:{triangles:0,calls:0}};this.pixelRatio=1;this.isSoftwareRenderer=true;this.cache=new WeakMap();this.frameCount=0;}
 setPixelRatio(n){this.pixelRatio=Math.min(1,n);}
 setSize(w,h){this.width=w;this.height=h;this.canvas.width=Math.round(w*this.pixelRatio);this.canvas.height=Math.round(h*this.pixelRatio);this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';}
 dispose(){this.cache=new WeakMap();}
 render(scene,camera){
  const ctx=this.ctx,W=this.canvas.width,H=this.canvas.height;
  scene.updateMatrixWorld();camera.updateMatrixWorld();camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  ctx.fillStyle='#'+scene.background.getHexString();ctx.fillRect(0,0,W,H);
  const view=camera.matrixWorldInverse,projection=camera.projectionMatrix.elements,faces=[],labels=[],temp=new T.Matrix4(),mv=new T.Matrix4(),ins=new T.Matrix4(),p=new T.Vector3(),light=new T.Vector3(-.4,.8,.3).normalize();
  const bg=scene.background,near=.075,far=75,fx=projection[0]*W/2,fy=projection[5]*H/2;
  const clip=vertices=>{let out=[];for(let i=0;i<vertices.length;i++){let a=vertices[i],b=vertices[(i+1)%vertices.length],ain=a.z<-near,bin=b.z<-near;if(ain)out.push(a);if(ain!==bin){let t=(-near-a.z)/(b.z-a.z);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:-near});}}return out;};
  const drawObject=(o,matrix)=>{
   const g=o.userData.cpuGeometry||o.geometry;if(!g?.attributes?.position||o.userData.cpuSkip||o.isLineSegments)return;
   let material=Array.isArray(o.material)?o.material[0]:o.material;if(!material||material.visible===false||material.opacity===0)return;
   let center=new T.Vector3().setFromMatrixPosition(matrix).applyMatrix4(view);
   if(!o.userData.cpuTerrain&&!o.isSkinnedMesh&&(center.z>12||center.z<-far||Math.abs(center.x)>-center.z*camera.aspect+22))return;
   mv.multiplyMatrices(view,matrix);const pos=g.attributes.position,normal=g.attributes.normal,index=g.index?.array,col=g.attributes.color,verts=new Array(pos.count),m=mv.elements,base=material.color||material.uniforms?.tint?.value||new T.Color(0x79a699);
   for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);if(o.isSkinnedMesh)o.applyBoneTransform(i,p);verts[i]={x:m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],y:m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],z:m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14]};}
   const limit=index?index.length:pos.count;
   for(let j=0;j<limit;j+=3){let ia=index?index[j]:j,ib=index?index[j+1]:j+1,ic=index?index[j+2]:j+2,a=verts[ia],b=verts[ib],c=verts[ic];if(a.z>-.075&&b.z>-.075&&c.z>-.075||a.z<-far&&b.z<-far&&c.z<-far)continue;
    let poly=clip([a,b,c]);if(poly.length<3)continue;let points=poly.map(v=>[W/2+v.x/-v.z*fx,H/2-v.y/-v.z*fy]);if(points.every(v=>v[0]<0)||points.every(v=>v[0]>W)||points.every(v=>v[1]<0)||points.every(v=>v[1]>H))continue;
    let signed=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[1][1]-points[0][1])*(points[2][0]-points[0][0]);if(material.side!==T.DoubleSide&&signed>=0)continue;
    let shade=.87;if(normal){p.fromBufferAttribute(normal,ia).transformDirection(matrix);shade=.55+Math.max(0,p.dot(light))*.55;}
    let surface=o.userData.cpuTerrain?new T.Color(pos.getY(ia)<-.14?0x89947a:0x687b4c):base;let r=surface.r,gc=surface.g,bv=surface.b;if(col){r*=col.getX(ia);gc*=col.getY(ia);bv*=col.getZ(ia);}let z=-(a.z+b.z+c.z)/3,fog=Math.min(.95,1-Math.exp(-z*z*.00020));let color=new T.Color(Math.max(0,r*shade),Math.max(0,gc*shade),Math.max(0,bv*shade)).lerp(bg,fog);faces.push({points,z,color:'#'+color.getHexString(),alpha:material.transparent?material.opacity:1});
   }
   if(material.userData?.label&&center.z<-1){labels.push({text:material.userData.label,x:W/2+center.x/-center.z*fx,y:H/2-center.y/-center.z*fy,size:Math.max(6,Math.min(22,fy/-center.z*.18)),z:-center.z});}
  };
  scene.traverseVisible(o=>{if(!o.isMesh)return;if(o.isInstancedMesh){if(o.userData.cpuSkip)return;for(let i=0;i<o.count;i++){if(o.userData.cpuStride&&i%o.userData.cpuStride)continue;o.getMatrixAt(i,ins);temp.multiplyMatrices(o.matrixWorld,ins);drawObject(o,temp);}}else drawObject(o,o.matrixWorld);});
  faces.sort((a,b)=>b.z-a.z);ctx.lineJoin='round';
  for(let f of faces){ctx.globalAlpha=f.alpha;ctx.fillStyle=f.color;ctx.beginPath();ctx.moveTo(f.points[0][0],f.points[0][1]);for(let i=1;i<f.points.length;i++)ctx.lineTo(f.points[i][0],f.points[i][1]);ctx.closePath();ctx.fill();}
  ctx.globalAlpha=1;ctx.textAlign='center';ctx.fillStyle='#ebe9d4';for(let l of labels){ctx.font=`500 ${l.size}px sans-serif`;ctx.fillText(l.text,l.x,l.y);}
  this.info.render.triangles=faces.length;this.info.render.calls=faces.length;
 }
}
