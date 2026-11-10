// Original reconstruction inspired by the user's everything.bends reference.
// The character clock and the fingertips share the same contact phase.
export const CONTACT_PHASE=.55;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const fingers=['pinky','ring','middle','index','thumb'];
export const OMEGA_SAMPLES=[
  'Hello, world.\n\nTen fingers. Every character.\nThese hands type exactly what you write.\n\nEven THIS bit. Even the spaces.',
  'The omega typer\n\nA thought becomes a keystroke.\nA keystroke becomes a sentence.\n\nMade for Bobs Bath.',
  'Keep the little things:\n  the spaces,\n  the new lines,\n  the punctuation.\n\nCafé. 世界. ✨'
];

export function graphemes(text) {
  if(typeof Intl.Segmenter==='function') return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(p=>p.segment);
  return Array.from(text);
}

const rows=[
  [['`',1],...Array.from('1234567890-=',c=>[c,1]),['Backspace',1.6]],
  [['Tab',1.5],...Array.from('qwertyuiop[]\\',c=>[c,1])],
  [['Caps',1.8],...Array.from("asdfghjkl;'",c=>[c,1]),['Enter',1.8]],
  [['ShiftL',2.3],...Array.from('zxcvbnm,./',c=>[c,1]),['ShiftR',2.3]],
  [['Ctrl',1.4],['AltL',1.4],['Space',8.2],['AltR',1.4],['Compose',1.8]]
];
const names={ShiftL:'SHIFT',ShiftR:'SHIFT',Space:'SPACE',Backspace:'⌫',Compose:'Ω',AltL:'ALT',AltR:'ALT'};
export function keyboardLayout() {
  return rows.flatMap((row,r)=>{
    const total=row.reduce((n,k)=>n+k[1],0),unit=405/total;let x=107.5;
    return row.map(([id,size])=>{
      const w=size*unit-2.5,y=51+r*22,key={id,label:names[id]||id.toUpperCase(),x,y,w,h:18};
      key.center={x:x+w/2,y:y+9};x+=size*unit;return key;
    });
  });
}
export const KEYS=keyboardLayout();
const keyMap=new Map(KEYS.map(k=>[k.id,k]));
const shifted=new Map(Array.from('~!@#$%^&*()_+{}|:"<>?').map((c,i)=>[c,Array.from('`1234567890-=[]\\;\',./')[i]]));
const leftGroups={pinky:'`1qaz',ring:'2wsx',middle:'3edc',index:'45rtfgvb'};
const rightGroups={pinky:"0-=p[]\\;'\/",ring:'9ol.',middle:'8ik,',index:'67yuhjnm'};
export function strokeFor(text) {
  let id,shift=false;
  if(text===' ' || text==='\u00a0') id='Space';
  else if(text==='\n' || text==='\r\n' || text==='\r') id='Enter';
  else if(text==='\t') id='Tab';
  else if(shifted.has(text)) {id=shifted.get(text);shift=true;}
  else if(/^[A-Z]$/.test(text)) {id=text.toLowerCase();shift=true;}
  else id=keyMap.has(text)?text:'Compose';
  let hand='right',finger='index';
  if(id==='Space') {hand='left';finger='thumb';}
  else if(id==='Tab') {hand='left';finger='pinky';}
  else if(id==='Enter' || id==='Backspace') finger='pinky';
  else {
    for(const [side,groups] of [['left',leftGroups],['right',rightGroups]]) for(const [f,chars] of Object.entries(groups)) if(chars.includes(id) && id.length===1) {hand=side;finger=f;}
  }
  return {key:keyMap.get(id),hand,finger,shiftKey:shift?keyMap.get(hand==='left'?'ShiftR':'ShiftL'):null,text};
}

export function createTyper(text) {
  const source=String(text).slice(0,30000);let offset=0,start=0;
  const units=graphemes(source).map(text=>{
    offset+=text.length;
    const duration=text===' '? .075:/[\r\n]/.test(text)?.2:/[.!?。！？]/.test(text)?.18:.115;
    const unit={...strokeFor(text),endOffset:offset,start,duration};start+=duration;return unit;
  });
  return {text:source,units,time:0,index:0,offset:0,emitted:0,total:start,complete:!units.length};
}

export function advanceTyper(state,dt,{running=true,pace=1}={}) {
  if(!running || state.complete) return state;
  state.time=Math.min(state.total,state.time+Math.max(0,dt)*clamp(pace,.35,100));
  while(state.index<state.units.length) {
    const unit=state.units[state.index];
    if(state.time+1e-10>=unit.start+unit.duration*CONTACT_PHASE) {
      state.offset=unit.endOffset;state.emitted=state.index+1;
    }
    if(state.time+1e-10<unit.start+unit.duration) break;
    state.index++;
  }
  state.complete=state.index>=state.units.length;
  return state;
}

export function typerFrame(state) {
  const unit=state.units[Math.min(state.index,state.units.length-1)];
  const phase=unit&&!state.complete?clamp((state.time-unit.start)/unit.duration,0,1):1;
  return {unit,phase,keyDown:!!unit&&!state.complete&&phase>=.5&&phase<=.72,progress:state.units.length?state.emitted/state.units.length:0};
}

const homes={left:{pinky:'a',ring:'s',middle:'d',index:'f',thumb:'Space'},right:{pinky:';',ring:'l',middle:'k',index:'j',thumb:'Space'}};
export function handPoses(state,{reduced=false}={}) {
  const frame=typerFrame(state),u=frame.unit;
  const activity=!u||state.complete||reduced?0:frame.phase<.5?ease(frame.phase/.5):frame.phase<=.72?1:1-ease((frame.phase-.72)/.28);
  return ['left','right'].map(side=>{
    const mirror=p=>side==='left'?p:{x:620-p.x,y:p.y};
    const active=u?.hand===side;
    const shift=u?.shiftKey && (u.shiftKey.id==='ShiftL')===(side==='left');
    const dx=active?(u.key.center.x-(side==='left'?230:390))*activity*.15:0;
    const shiftPoint=p=>({x:p.x+dx,y:p.y});
    const bases=[{x:181,y:183},{x:207,y:173},{x:233,y:175},{x:258,y:190},{x:273,y:220}].map(p=>shiftPoint(mirror(p)));
    const wrist=shiftPoint(mirror({x:213,y:263}));
    const joints=fingers.map((finger,i)=>{
      const home=keyMap.get(homes[side][finger]);
      const idle={x:home.center.x+(finger==='thumb'?(side==='left'?-5:5):0),y:home.center.y-14};
      const pressing=(active&&u.finger===finger)||(shift&&finger==='pinky');
      const key=shift&&finger==='pinky'?u.shiftKey:u?.key;
      const toe=pressing?mix(idle,key.center,activity):idle;
      const base=bases[i];
      const knuckle=mix(base,toe,.34),middle=mix(base,toe,.7);
      const curl=(pressing?1-activity*.55:1)*(finger==='thumb'?7:16);
      knuckle.y-=curl;middle.y-=curl*.55;
      return {finger,key:pressing?key:null,down:pressing&&frame.keyDown,points:[base,knuckle,middle,toe]};
    });
    return {side,wrist,bases,fingers:joints};
  });
}

export function paintTyper(ctx,state,width,height,{reduced=false}={}) {
  ctx.clearRect(0,0,width,height);
  const scale=Math.min(width/620,height/310),ox=(width-620*scale)/2,oy=(height-310*scale)/2;
  ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
  const frame=typerFrame(state);
  const line=(points,color='#d3dbd4',w=.9,close=false)=>{
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(close)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=w;ctx.stroke();
  };
  ctx.font='8px monospace';ctx.fillStyle='#70c2a1';ctx.fillText('OMEGA / HAND RIG 02',109,23);
  ctx.fillStyle='#8f9994';ctx.fillText(`KEYSTROKES ${String(state.emitted).padStart(5,'0')}`,368,23);
  for(const key of KEYS) {
    const down=frame.keyDown&&(frame.unit.key.id===key.id||frame.unit.shiftKey?.id===key.id);
    ctx.fillStyle=down?'#70dfb3':'#15201d';ctx.fillRect(key.x,key.y,key.w,key.h);
    ctx.strokeStyle=down?'#bdffe1':'#3b5750';ctx.lineWidth=down?1.2:.65;ctx.strokeRect(key.x,key.y,key.w,key.h);
    ctx.font=`${key.label.length>2?6.5:8}px monospace`;ctx.textAlign='center';ctx.fillStyle=down?'#101a16':'#9ab8aa';ctx.fillText(key.label,key.center.x,key.center.y+2.5);
    if(down) {ctx.strokeStyle='#71d7ac55';ctx.strokeRect(key.x-3,key.y-3,key.w+6,key.h+6);}
  }
  ctx.textAlign='left';
  for(const hand of handPoses(state,{reduced})) {
    const w=hand.wrist,mirror=hand.side==='left'?1:-1;
    const wl={x:w.x-21,y:w.y-7},wr={x:w.x+21,y:w.y-7};
    const cuff=[wl,wr,{x:wr.x+5*mirror,y:w.y+23},{x:wl.x+5*mirror,y:w.y+23}];
    line(cuff,'#c5d2c8',1,true);line(cuff.map(p=>({x:p.x-4*mirror,y:p.y+5})),'#7f9388',.7,true);
    for(let i=0;i<4;i++) line([cuff[i],{x:cuff[i].x-4*mirror,y:cuff[i].y+5}],'#56645e',.6);
    const palm=[wl,...hand.bases.slice(0,4).sort((a,b)=>a.x-b.x),wr];
    ctx.fillStyle='#0e1114d9';ctx.beginPath();palm.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();line(palm,'#d5dfd6',1.1,true);
    for(const base of hand.bases) {line([wl,base,wr],'#7f9388',.75);}
    for(const finger of hand.fingers) {
      for(let j=0;j<3;j++) {
        const a=finger.points[j],b=finger.points[j+1],len=Math.hypot(b.x-a.x,b.y-a.y)||1;
        const nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len,r=[4.1,3.1,2.1][j];
        const corners=[{x:a.x+nx*r,y:a.y+ny*r},{x:b.x+nx*r*.72,y:b.y+ny*r*.72},{x:b.x-nx*r*.72,y:b.y-ny*r*.72},{x:a.x-nx*r,y:a.y-ny*r}];
        ctx.fillStyle='#0c1013bb';ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();line(corners,finger.down?'#f9fff9':'#c8d3ca',.85,true);
      }
      for(const [i,p] of finger.points.entries()) {const size=i===0?4.3:3.2;ctx.fillStyle='#ff63b3';ctx.fillRect(p.x-size/2,p.y-size/2,size,size);}
      if(finger.down) {const p=finger.points.at(-1);ctx.strokeStyle='#ff82c4';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.stroke();}
    }
  }
  ctx.restore();
}
