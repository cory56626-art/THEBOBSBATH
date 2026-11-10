// Original reconstruction inspired by the user's everything.bends reference.
// The character clock and the fingertips share the same contact phase.
import {createHandMotion,advanceHandMotion,drawHands,keyTrails} from './omega-hands.js?v=7';
export {handPoses,solveFinger} from './omega-hands.js?v=7';
export const CONTACT_PHASE=.55;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
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
  [['Escape',1.3],...Array.from({length:12},(_,i)=>[`F${i+1}`,1]),['Delete',1.3]],
  [['`',1],...Array.from('1234567890-=',c=>[c,1]),['Backspace',1.6]],
  [['Tab',1.5],...Array.from('qwertyuiop[]\\',c=>[c,1])],
  [['Caps',1.8],...Array.from("asdfghjkl;'",c=>[c,1]),['Enter',1.8]],
  [['ShiftL',2.3],...Array.from('zxcvbnm,./',c=>[c,1]),['ShiftR',2.3]],
  [['Ctrl',1.4],['AltL',1.4],['Space',8.2],['AltR',1.4],['Compose',1.8]]
];
const names={ShiftL:'SHIFT',ShiftR:'SHIFT',Space:'SPACE',Backspace:'⌫',Compose:'Ω',AltL:'ALT',AltR:'ALT',Escape:'ESC',Delete:'DEL'};
export function keyboardLayout() {
  return rows.flatMap((row,r)=>{
    const total=row.reduce((n,k)=>n+k[1],0),unit=405/total;let x=107.5;
    return row.map(([id,size])=>{
      const w=size*unit-2.5,y=42+r*24,key={id,label:names[id]||id.toUpperCase(),x,y,w,h:21};
      const corner=(a,b)=>({x:310+(a-310)*(1+(b-100)*.0005),y:b});
      key.corners=[corner(x,y),corner(x+w,y),corner(x+w,y+21),corner(x,y+21)];
      key.center=corner(x+w/2,y+10.5);x+=size*unit;return key;
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
    const unit={...strokeFor(text),endOffset:offset,start,duration,contact:start+duration*CONTACT_PHASE};start+=duration;return unit;
  });
  const state={text:source,units,time:0,index:0,offset:0,emitted:0,typingEnd:start,total:start+(units.length?.24:0),complete:!units.length};
  createHandMotion(state);return state;
}

export function advanceTyper(state,dt,{running=true,pace=1}={}) {
  if(!running || state.complete) return state;
  const previousTime=state.time;
  state.time=Math.min(state.total,state.time+Math.max(0,dt)*clamp(pace,.35,100));
  while(state.index<state.units.length) {
    const unit=state.units[state.index];
    if(state.time+1e-10>=unit.start+unit.duration*CONTACT_PHASE) {
      state.offset=unit.endOffset;state.emitted=state.index+1;
    }
    if(state.time+1e-10<unit.start+unit.duration) break;
    state.index++;
  }
  advanceHandMotion(state,previousTime,state.time);
  state.complete=state.time>=state.total-1e-10;
  return state;
}

export function typerFrame(state) {
  const unit=state.units[Math.min(state.index,state.units.length-1)];
  const phase=unit&&!state.complete?clamp((state.time-unit.start)/unit.duration,0,1):1;
  return {unit,phase,keyDown:!!unit&&!state.complete&&phase>=CONTACT_PHASE&&phase<=.74,progress:state.units.length?state.emitted/state.units.length:0};
}

export function paintTyper(ctx,state,width,height,{reduced=false}={}) {
  ctx.clearRect(0,0,width,height);
  const scale=Math.min(width/620,height/350),ox=(width-620*scale)/2,oy=(height-350*scale)/2;
  ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
  const frame=typerFrame(state),trails=keyTrails(state);
  const palette=['#78cbb8','#91b9dc','#c7a0cb','#ceca91','#87c8c8'];
  ctx.font='7px monospace';ctx.fillStyle='#275a4b';ctx.fillRect(108,12,222,12);ctx.fillRect(108,25,177,10);
  ctx.fillStyle='#b9e6d3';ctx.fillText('OMEGA TYPER  //  TEN FINGERS',112,21);
  ctx.font='6.5px monospace';ctx.fillText(`TYPED ${String(state.emitted).padStart(5,'0')}  /  ${frame.unit?.key.label||'READY'}`,112,32);
  for(const key of KEYS) {
    const light=trails.get(key.id),down=light?.down;
    ctx.beginPath();key.corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle='#14191b';ctx.fill();
    if(light) {
      ctx.save();ctx.globalAlpha=light.alpha*.70;
      ctx.fillStyle=down?'#c4ffe6':palette[light.index%palette.length];ctx.fill();ctx.restore();
    }
    ctx.strokeStyle=down?'#c5ffe7':'#59645e';ctx.lineWidth=down?1:.55;ctx.stroke();
    ctx.font=`${key.label.length>2?5.8:7}px monospace`;ctx.textAlign='center';ctx.fillStyle=down?'#0e2b1f':light?'#c5d8c6':'#738a7c';
    ctx.fillText(key.label,key.center.x,key.center.y+2.5);
  }
  ctx.textAlign='left';drawHands(ctx,state,{reduced});ctx.restore();
}
