// Original 3D hand rig reconstructed from the supplied motion reference.
// Finger tracks overlap: a hand can prepare a key while another finger types.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(a,n)=>({x:a.x*n,y:a.y*n,z:a.z*n});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const length=a=>Math.hypot(a.x,a.y,a.z);
const unit=a=>mul(a,1/(length(a)||1));
const mix=(a,b,t)=>add(mul(a,1-t),mul(b,t));
const ease=t=>{t=clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
const names=['pinky','ring','middle','index','thumb'];
const roots=[[-29,70,14],[-8,78,18],[14,80,20],[35,70,18],[48,46,10]];
const lengths=[[46,28,21],[53,32,23],[58,35,25],[54,33,24],[43,38,28]].map(b=>b.map((n,i)=>n*[.9,1.4,1.25][i]));
const readyReach=[64,78,85,74,82];
const sides=['left','right'];
const poseFields=['x','y','z','yaw','pitch','roll'];
export const project=p=>({x:310+p.x,y:325-p.y-p.z*.8});
const keyPoint=key=>({x:key.center.x-310,y:325-key.center.y,z:0});

function restPose(side) {
  const sign=side==='left'?1:-1;
  return {x:-140*sign,y:25,z:8,yaw:.30*sign,pitch:.045,roll:-.035*sign};
}

function transform(pose,p,direction=false) {
  // Pitch arches the knuckles, roll banks the palm, yaw turns it toward a key.
  const cp=Math.cos(pose.pitch),sp=Math.sin(pose.pitch),cr=Math.cos(pose.roll),sr=Math.sin(pose.roll),cy=Math.cos(pose.yaw),sy=Math.sin(pose.yaw);
  const a={x:p.x,y:p.y*cp-p.z*sp,z:p.y*sp+p.z*cp};
  const b={x:a.x*cr+a.z*sr,y:a.y,z:-a.x*sr+a.z*cr};
  const c={x:b.x*cy+b.y*sy,y:-b.x*sy+b.y*cy,z:b.z};
  return direction?c:add(c,pose);
}

function localRoot(side,i) {
  const r=roots[i];return {x:r[0]*(side==='left'?1:-1),y:r[1],z:r[2]};
}

function upperBound(events,time) {
  let lo=0,hi=events.length;
  while(lo<hi) {const mid=(lo+hi)>>>1;if(events[mid].contact<=time+1e-10)lo=mid+1;else hi=mid;}
  return lo;
}

function handGoal(state,side,time) {
  const rest=restPose(side),events=state.handEvents[side];
  const start=Math.max(0,upperBound(events,time-.30)-1);
  let weight=0,x=0,y=0,z=0,turn=0,depth=0,pressure=0;
  for(let j=start;j<events.length&&events[j].contact<time+.34;j++) {
    const e=events[j],delta=e.contact-time;
    const w=Math.exp(-Math.pow((delta-.065)/.155,2));
    if(w<.003)continue;
    const i=names.indexOf(e.finger),root=transform(rest,localRoot(side,i)),target=keyPoint(e.key);
    const v=sub(target,root),d=length(v),reach=Math.max(0,d-lengths[i].reduce((a,b)=>a+b,0)*.90);
    const displacement=mul(v,reach/(d||1));
    x+=displacement.x*w;y+=displacement.y*w;z+=Math.min(6,reach*.08)*w;
    turn+=clamp(displacement.x*.004,-.20,.20)*w;
    depth+=clamp((140-e.key.center.y)/130,-.5,1)*w;
    pressure+=Math.exp(-Math.pow(delta/.035,2))*w;
    weight+=w;
  }
  if(weight<.0001)return rest;
  const strength=Math.min(1,weight),div=strength/weight;
  return {...rest,x:rest.x+x*div,y:rest.y+y*div,z:rest.z+z*div-pressure/weight*2.5*strength,
    yaw:rest.yaw+turn*div,pitch:rest.pitch+depth*div*.10,roll:rest.roll-clamp(x*div/90,-.15,.15)};
}

export function createHandMotion(state) {
  state.fingerTracks=Object.fromEntries(sides.map(s=>[s,Object.fromEntries(names.map(f=>[f,[]]))]));
  state.handEvents={left:[],right:[]};
  for(const stroke of state.units) {
    function event(hand,finger,key,shift=false) {
      const e={contact:stroke.contact,hold:Math.min(.025,stroke.duration*.18),key,finger,shift};
      state.fingerTracks[hand][finger].push(e);state.handEvents[hand].push(e);
    }
    event(stroke.hand,stroke.finger,stroke.key);
    if(stroke.shiftKey)event(stroke.hand==='left'?'right':'left','pinky',stroke.shiftKey,true);
  }
  state.motion=Object.fromEntries(sides.map(s=>[s,{pose:handGoal(state,s,0),velocity:Object.fromEntries(poseFields.map(f=>[f,0]))}]));
}

export function advanceHandMotion(state,from,to) {
  // Spring memory older than this window is negligible. Very fast playback can
  // skip invisible history without an unbounded simulation loop.
  const start=Math.max(from,to-.8);
  if(start>from)for(const side of sides) {
    state.motion[side].pose=handGoal(state,side,start);
    for(const f of poseFields)state.motion[side].velocity[f]=0;
  }
  const count=Math.max(1,Math.ceil((to-start)/.012)),h=(to-start)/count;
  for(let i=0;i<count;i++) {
    const time=start+(i+.5)*h;
    for(const side of sides) {
      const goal=handGoal(state,side,time),m=state.motion[side];
      for(const f of poseFields) {
        const frequency=f==='z'?34:['x','y'].includes(f)?26:20;
        const d=m.pose[f]-goal[f],v=m.velocity[f],e=Math.exp(-frequency*h),a=(v+frequency*d)*h;
        m.pose[f]=goal[f]+(d+a)*e;m.velocity[f]=(v-frequency*a)*e;
      }
    }
  }
}

function readyTip(pose,side,i,pressure=0) {
  const sign=side==='left'?1:-1,r=localRoot(side,i);
  const p={x:r.x+(i===4?62*sign:(i-1.5)*4*sign),y:r.y+readyReach[i]-pressure*(i===4?2:6),z:r.z-8+pressure*5};
  return transform(pose,p);
}

function fingerPlan(track,time,ready) {
  const at=upperBound(track,time),previous=track[at-1],next=track[at];
  if(previous && time<=previous.contact+previous.hold) return {tip:keyPoint(previous.key),key:previous.key,down:true,engagement:1};
  if(previous?.shift&&next?.shift&&previous.key.id===next.key.id&&next.contact-previous.contact<.34) return {tip:keyPoint(previous.key),key:previous.key,down:true,engagement:1};
  if(next) {
    const chained=previous&&next.contact-previous.contact<.62;
    const start=chained?previous.contact+previous.hold:next.contact-.19;
    if(time>=start) {
      const u=clamp((time-start)/(next.contact-start),0,1);
      const a=chained?keyPoint(previous.key):ready,b=keyPoint(next.key);
      const tip=mix(a,b,ease(u));tip.z+=Math.sin(Math.PI*u)*(chained?32:26);
      const arriving=ease(clamp((u-.35)/.65,0,1));
      const releasing=chained?1-ease(clamp(u*2,0,1)):0;
      return {tip,key:next.key,down:false,engagement:Math.max(releasing,arriving)};
    }
  }
  if(previous) {
    const u=clamp((time-previous.contact-previous.hold)/.18,0,1);
    const tip=mix(keyPoint(previous.key),ready,ease(u));tip.z+=Math.sin(Math.PI*u)*16;
    return {tip,key:null,down:false,engagement:1-ease(u)};
  }
  return {tip:ready,key:null,down:false,engagement:0};
}

// A three-bone finger: solve the first two bones to a raised distal joint, then
// flex the last phalanx down onto the key. Bone lengths do not change.
export function solveFinger(root,target,bones,pole,tipLean={x:0,y:0,z:0}) {
  const maximum=(bones[0]+bones[1])*.985;
  const reach=maximum+bones[2]-.00001,v=sub(target,root),raw=length(v);
  const tip=raw>reach?add(root,mul(v,reach/(raw||1))):target;
  const direction=unit(sub(tip,root));
  const horizontal=unit({x:direction.x,y:direction.y,z:0});
  const preferred=unit(add(add(mul(horizontal,Math.cos(1.23)),{x:0,y:0,z:-Math.sin(1.23)}),tipLean));
  let distal=preferred;
  if(length(sub(sub(tip,mul(distal,bones[2])),root))>maximum) {
    let lo=0,hi=1;
    for(let i=0;i<18;i++) {
      const u=(lo+hi)/2,d=unit(mix(preferred,direction,u));
      if(length(sub(sub(tip,mul(d,bones[2])),root))>maximum)lo=u;else hi=u;
    }
    distal=unit(mix(preferred,direction,hi));
  }
  const dip=sub(tip,mul(distal,bones[2])),axis=unit(sub(dip,root));
  const d=clamp(length(sub(dip,root)),Math.abs(bones[0]-bones[1])+.00001,maximum);
  const along=(bones[0]**2-bones[1]**2+d*d)/(2*d),height=Math.sqrt(Math.max(0,bones[0]**2-along*along));
  let bend=sub(pole,mul(axis,dot(pole,axis)));
  if(length(bend)<.00001)bend=cross(axis,{x:0,y:1,z:0});
  const pip=add(add(root,mul(axis,along)),mul(unit(bend),height));
  return [root,pip,dip,tip];
}

export function handPoses(state,{reduced=false}={}) {
  return sides.map(side=>{
    const pose={...(reduced?restPose(side):state.motion[side].pose)},sign=side==='left'?1:-1;
    const events=reduced?[]:state.handEvents[side];
    const index=upperBound(events,state.time);
    let pressure=0;
    for(let j=Math.max(0,index-2);j<Math.min(events.length,index+2);j++)pressure+=Math.exp(-Math.pow((events[j].contact-state.time)/.05,2));
    function plans() {return names.map((f,i)=>fingerPlan(reduced?[]:state.fingerTracks[side][f],state.time,readyTip(pose,side,i,pressure)));}
    let targetPlans=plans();
    // A small reach correction protects a contacting fingertip while the palm
    // follows with inertia. Other fingers stay bent rather than stretching.
    let correction={x:0,y:0,z:0},strongest=0;
    for(let i=0;i<targetPlans.length;i++) {
      const p=targetPlans[i];if(!p.engagement)continue;
      const root=transform(pose,localRoot(side,i)),v=sub(p.tip,root),d=length(v),limit=lengths[i].reduce((a,b)=>a+b,0)*.965;
      const amount=Math.max(0,d-limit)*p.engagement;
      if(amount>strongest){strongest=amount;correction=mul(v,amount/(d||1));}
    }
    pose.x+=correction.x;pose.y+=correction.y;pose.z+=correction.z;
    targetPlans=plans();
    const axis=transform(pose,{x:1,y:0,z:0},true);
    const bases=names.map((_,i)=>transform(pose,localRoot(side,i)));
    const fingerPoses=names.map((finger,i)=>{
      const p=targetPlans[i],fan=[-.95,-.60,-.50,-.38,.85][i]*sign;
      const pole=add({x:0,y:0,z:i===4?.4:.25},mul(axis,fan));
      const worldPoints=solveFinger(bases[i],p.tip,lengths[i],pole,mul(axis,fan*.32));
      return {finger,key:p.key,down:p.down,points:worldPoints.map(project),worldPoints,bones:lengths[i],axis};
    });
    return {side,pose,wrist:project(pose),bases:bases.map(project),fingers:fingerPoses};
  });
}

export function keyTrails(state) {
  const trails=new Map();
  const end=upperBound(state.units,state.time),start=Math.max(0,upperBound(state.units,state.time-.75)-1);
  for(let i=start;i<end;i++) {
    const stroke=state.units[i],age=state.time-stroke.contact;if(age<0||age>.75)continue;
    for(const key of [stroke.key,stroke.shiftKey].filter(Boolean))trails.set(key.id,{key,alpha:Math.max(.07,1-age/.75),index:i,down:age<=Math.min(.025,stroke.duration*.18)});
  }
  return trails;
}

export function drawHands(ctx,state,{reduced=false}={}) {
  const line=(points,color='#e9eee7',width=.9,close=false)=>{
    const p=points.map(project);ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));if(close)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  };
  const face=(points,color='#111115')=>{
    const p=points.map(project);ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fillStyle=color;ctx.fill();
  };
  function box(a,b,axis,width,depth,color='#edf0e9') {
    const direction=unit(sub(b,a));
    const side=unit(sub(axis,mul(direction,dot(axis,direction)))),normal=unit(cross(direction,side));
    const corners=p=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>add(p,add(mul(side,x*width/2),mul(normal,z*depth/2))));
    const from=corners(a),to=corners(b);
    face([from[0],from[1],to[1],to[0]]);face([from[1],from[2],to[2],to[1]]);
    line(from,color,.7,true);line(to,color,.7,true);for(let i=0;i<4;i++)line([from[i],to[i]],color,.7);
  }
  for(const hand of handPoses(state,{reduced})) {
    const sign=hand.side==='left'?1:-1;
    const local=(x,y,z)=>transform(hand.pose,{x:x*sign,y,z});
    const outline=[[-23,0],[-29,20],[-31,54],[-25,73],[16,80],[36,67],[36,36],[25,4]];
    const top=outline.map(([x,y])=>local(x,y,16)),bottom=outline.map(([x,y])=>local(x,y,5));
    for(let i=0;i<top.length;i++) {const next=(i+1)%top.length;face([top[i],top[next],bottom[next],bottom[i]],'#0c0e11');}
    face(top);line(top,'#e0e7df',.95,true);line(bottom,'#a6b2a7',.65,true);
    for(const i of [0,2,3,4,5,7])line([bottom[i],top[i]],'#c1cbbf',.7);
    for(const x of [-7,12])line([[x,3],[x-5,27],[x-2,51],[x+2,74]].map(([a,b])=>local(a,b,16.5)),'#a7b5a5',.75);
    const thumbBase=[local(24,12,15),local(44,31,18),local(48,47,17),local(31,56,16)];
    face(thumbBase);line(thumbBase,'#d5dfd2',.8,true);
    const cuffTop=[local(-23,-5,18),local(23,-5,18),local(23,-25,18),local(-23,-25,18)];
    const cuffBottom=[local(-23,-5,4),local(23,-5,4),local(23,-25,4),local(-23,-25,4)];
    face(cuffTop);line(cuffTop,'#d7e0d3',.85,true);line(cuffBottom,'#bac7b8',.65,true);
    for(let i=0;i<4;i++)line([cuffTop[i],cuffBottom[i]],'#d0dccc',.65);
    for(const finger of hand.fingers) {
      const p=finger.worldPoints;
      for(let i=0;i<3;i++)box(p[i],p[i+1],finger.axis,[6.5,2.5,1.5][i],[5,1.8,1.1][i],finger.down?'#ffffff':'#ecf1e8');
      for(let i=0;i<4;i++) {
        const point=project(p[i]),size=[5,5.6,4.4,2.4][i];
        if(i===0){ctx.strokeStyle='#eaf0e6';ctx.lineWidth=.8;ctx.strokeRect(point.x-size/2,point.y-size/2,size,size);}
        else {ctx.fillStyle=i===3?'#ffabd4':'#ff4f9f';ctx.fillRect(point.x-size/2,point.y-size/2,size,size);}
      }
      if(finger.down){const tip=project(p[3]);ctx.fillStyle='#caffed';ctx.beginPath();ctx.arc(tip.x,tip.y,2,0,Math.PI*2);ctx.fill();}
    }
  }
}
