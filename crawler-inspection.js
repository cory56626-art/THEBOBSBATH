import { clamp, legPose } from './crawler-motion.js?v=5';

const copy = p => ({ x:p.x, y:p.y });
const mix = (a,b,u) => ({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u});
const ease = u => u*u*(3-2*u);
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

function prepareStroke(kind, points, duration, row, pointerFrom, pointerTo) {
  const lengths=[0];
  for(let i=1;i<points.length;i++) lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
  return {kind,points,lengths,length:lengths.at(-1),duration,row,pointerFrom,pointerTo,ink:kind!=='travel'};
}

// The same sampled path drives both the ink and the drawing leg. A circle can
// never get ahead of the physical pen tip, including on a wrapped phrase.
export function strokePrefix(stroke, progress) {
  const u=clamp(progress,0,1);
  if(u>=1) return {points:stroke.points,tip:stroke.points.at(-1)};
  if(u<=0) return {points:[stroke.points[0]],tip:stroke.points[0]};
  const travel=stroke.length*u;
  let i=1;
  while(i<stroke.lengths.length-1 && stroke.lengths[i]<travel) i++;
  const fraction=(travel-stroke.lengths[i-1])/(stroke.lengths[i]-stroke.lengths[i-1]||1);
  const tip=mix(stroke.points[i-1],stroke.points[i],fraction);
  return {points:[...stroke.points.slice(0,i),tip],tip};
}

export function markGeometry(rawBoxes, startAngle=-Math.PI/2) {
  const boxes=rawBoxes.map(b=>({x:b.x,y:b.y,w:Math.max(4,b.right!==undefined?b.right-b.x:(b.w??b.width??4)),h:Math.max(4,b.h??b.height??18)}));
  const contacts=boxes.map(b=>({x:b.x+b.w*.5,y:b.y+b.h+2}));
  const strokes=[];
  let previous=null,previousRow=0,time=0;
  function add(kind,points,duration,row) {
    if(previous && distance(previous,points[0])>.1) {
      const travel=prepareStroke('travel',[previous,points[0]],clamp(distance(previous,points[0])/650,.045,.11),row,contacts[previousRow],contacts[row]);
      travel.start=time;time+=travel.duration;travel.end=time;strokes.push(travel);
    }
    const stroke=prepareStroke(kind,points,duration,row,contacts[row],contacts[row]);
    stroke.start=time;time+=duration;stroke.end=time;strokes.push(stroke);
    previous=points.at(-1);previousRow=row;
  }
  boxes.forEach((b,row)=>{
    const cx=b.x+b.w/2,cy=b.y+b.h/2+1,rx=b.w/2+6,ry=b.h/2+5;
    const angle=row&&previous?Math.atan2((previous.y-cy)/ry,(previous.x-cx)/rx):startAngle;
    const circle=Array.from({length:75},(_,i)=>{
      const t=angle+i/74*Math.PI*2*1.035;
      const x=Math.cos(t)*rx*(1+.014*Math.sin(3*t)),y=Math.sin(t)*ry+.4*Math.sin(2*t);
      return {x:cx+x*Math.cos(-.05)-y*Math.sin(-.05),y:cy+x*Math.sin(-.05)+y*Math.cos(-.05)};
    });
    add('circle',circle,clamp(.4+b.w*.0012,.42,.7),row);
    const underline=Array.from({length:20},(_,i)=>{
      const u=i/19;return {x:b.x-2+(b.w+4)*u,y:b.y+b.h+5+Math.sin(u*Math.PI)*.7};
    });
    add('underline',underline,clamp(.12+b.w*.0008,.13,.25),row);
  });
  return {boxes,contacts,strokes,traceDuration:time,reachDuration:.23,holdDuration:.12,total:.23+time+.12};
}

export function inspectionFrame(state) {
  const g=state.geometry,t=state.time;
  const trace=clamp(t-g.reachDuration,0,g.traceDuration);
  const touched=t>=g.reachDuration;
  const paths=[];
  let current=g.strokes.at(-1),u=1,drawn=0,totalInk=0;
  for(const stroke of g.strokes) {
    const progress=clamp((trace-stroke.start)/stroke.duration,0,1);
    if(stroke.ink) {
      totalInk+=stroke.length;drawn+=stroke.length*progress;
      if(progress>0) paths.push({...stroke,...strokePrefix(stroke,progress),progress});
    }
    if(trace<=stroke.end && current===g.strokes.at(-1)) { current=stroke;u=progress; }
  }
  const reached=ease(clamp(t/g.reachDuration,0,1));
  const penTarget=strokePrefix(current,u).tip;
  const pointerTarget=mix(current.pointerFrom,current.pointerTo,ease(u));
  const tip=touched?penTarget:mix(state.fromPen,g.strokes[0].points[0],reached);
  const pointer=touched?pointerTarget:mix(state.fromPointer,g.contacts[0],reached);
  const complete=t>=g.total;
  const phase=!touched?'reaching':trace>=g.traceDuration?(complete?'done':'holding'):current.kind==='circle'?'circling':current.kind==='underline'?'underlining':'moving-pen';
  return {tip,pointer,paths,touched,complete,phase,penDown:touched&&trace<g.traceDuration&&current.ink,progress:totalInk?drawn/totalInk:1,labelProgress:clamp((t-g.reachDuration)/.16,0,1),row:current.row};
}

export function attachInspection(rig,state) {
  if(state.rig===rig) return;
  state.rig=rig;
  for(const [index,role] of [[state.pointerLeg,'pointer'],[state.penLeg,'pen']]) {
    const leg=rig.legs[index];
    leg.guidedKnee=copy(legPose(rig,leg).knee);
    leg.controlled=role;leg.stepping=false;
    // A resize may replace the rig while paused. Keep both hands attached to
    // the reflowed word/ink without advancing the gesture's clock.
    if(state.frame) leg.toe=copy(role==='pen'?state.frame.tip:state.frame.pointer);
    const contact=state.geometry.contacts[0];
    leg.gestureBend=-leg.side*(contact.y>=rig.body.y?1:-1);
  }
}

export function createInspection(rig,boxes,target) {
  const first=boxes[0],w=first.right!==undefined?first.right-first.x:(first.w??first.width??4),h=first.h??first.height??18,centerX=first.x+w/2;
  const pointerLeg=centerX<rig.body.x?0:4,penLeg=pointerLeg===0?4:0;
  const fromPen=copy(rig.legs[penLeg].toe),fromPointer=copy(rig.legs[pointerLeg].toe);
  const startAngle=Math.atan2((fromPen.y-first.y-h/2)/(h/2+5),(fromPen.x-centerX)/(w/2+6));
  const state={target,time:0,pointerLeg,penLeg,fromPen,fromPointer,startAngle,geometry:markGeometry(boxes,startAngle),recorded:false,rig:null};
  state.frame=inspectionFrame(state);
  attachInspection(rig,state);
  return state;
}

export function retargetInspection(state,boxes) {
  const old=state.geometry,t=state.time;
  const g=markGeometry(boxes,state.startAngle);
  if(t<=old.reachDuration) state.time=t/old.reachDuration*g.reachDuration;
  else if(t<=old.reachDuration+old.traceDuration) state.time=g.reachDuration+(t-old.reachDuration)/old.traceDuration*g.traceDuration;
  else state.time=g.reachDuration+g.traceDuration+Math.min(g.holdDuration,t-old.reachDuration-old.traceDuration);
  state.geometry=g;state.rig=null;state.frame=inspectionFrame(state);
}

export function advanceInspection(rig,state,dt,{running=true,reduced=false,pace=1}={}) {
  attachInspection(rig,state);
  if(!running) return state.frame;
  state.time=reduced?state.geometry.total:Math.min(state.geometry.total,state.time+dt*pace);
  const frame=state.frame=inspectionFrame(state);
  const center=state.geometry.contacts[frame.row];
  rig.attentionLean=clamp((center.x-rig.body.x)/120,-1,1)*.16;
  for(const [index,point] of [[state.pointerLeg,frame.pointer],[state.penLeg,frame.tip]]) {
    const leg=rig.legs[index];leg.toe=copy(point);
    const desired=legPose(rig,leg,{ignoreGuidance:true}).knee;
    leg.guidedKnee=reduced?copy(desired):mix(leg.guidedKnee||desired,desired,1-Math.exp(-dt*20*pace));
  }
  return frame;
}

export function releaseInspection(rig,state) {
  if(!rig) return;
  for(const index of [state.pointerLeg,state.penLeg]) {
    const leg=rig.legs[index];leg.controlled=false;delete leg.gestureBend;
    leg.from=copy(leg.toe);leg.to=copy(leg.toe);leg.stepping=false;
  }
  rig.attentionLean=0;
}
