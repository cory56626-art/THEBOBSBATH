export const DT=1/60, SIZE=72, WATER=-0.62, SAVE_VERSION=3;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function rng(seed=84219){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function height(x,z){
  const base=.32*Math.sin(x*.105)*Math.cos(z*.12)+.18*Math.sin(z*.21+x*.14);
  const hill=4.5*Math.exp(-((x+34)**2+(z+23)**2)/350)+3.7*Math.exp(-((x-32)**2+(z+32)**2)/350);
  const pool=-2.3*Math.exp(-((x-15)**2/110+(z-5)**2/190));
  const rim=Math.max(0,(Math.max(Math.abs(x),Math.abs(z))-53)/7)**2;
  return base+hill+pool+rim;
}
export function terrainData(n=144){const p=[],ix=[];for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){let x=-SIZE+i*SIZE*2/n,z=-SIZE+j*SIZE*2/n;p.push(x,height(x,z),z);}for(let j=0;j<n;j++)for(let i=0;i<n;i++){let a=j*(n+1)+i;ix.push(a,a+n+1,a+1,a+1,a+n+1,a+n+2);}return {positions:new Float32Array(p),indices:new Uint32Array(ix)};}
export const ITEMS={
 branch:{name:'Branch',icon:'╱',color:'#b89165',mass:.5,stack:30,material:'wood'},
 stone:{name:'Stone',icon:'◆',color:'#b8c4c5',mass:2,stack:30,material:'stone'},
 fiber:{name:'Plant fiber',icon:'≋',color:'#a9c77b',mass:.12,stack:30,material:'soft'},
 wood:{name:'Wood',icon:'▰',color:'#ba8c57',mass:3,stack:30,material:'wood'},
 berries:{name:'Berries',icon:'●',color:'#dd99aa',mass:.15,stack:20,material:'soft',food:14},
 mushroom:{name:'Amber cap',icon:'♠',color:'#e7b960',mass:.2,stack:20,material:'soft',food:8},
 meal:{name:'Forest roast',icon:'◉',color:'#f6c989',mass:.3,stack:20,material:'soft',food:38},
 axe:{name:'Stone hatchet',icon:'⚒',color:'#ced1c4',mass:1.8,stack:1,material:'stone'},
 spear:{name:'Field spear',icon:'↗',color:'#ead8ab',mass:.8,stack:6,material:'wood'},
 campfire:{name:'Campfire kit',icon:'♨',color:'#eaaa6b',mass:4,stack:4,material:'wood',build:true},
 chest:{name:'Storage crate',icon:'▣',color:'#c7a97f',mass:6,stack:3,material:'wood',build:true},
 shelter:{name:'Lean-to kit',icon:'⌂',color:'#b2c894',mass:9,stack:2,material:'wood',build:true},
 plank:{name:'Loose timber',icon:'▱',color:'#ba8c57',mass:5,stack:8,material:'wood',build:true}
};
export const RECIPES=[
 {id:'axe',out:1,cost:{branch:2,stone:2,fiber:2},note:'Harvest standing trees.'},
 {id:'spear',out:1,cost:{branch:2,stone:1,fiber:1},note:'Hold to charge. Release to throw. Recover with E.'},
 {id:'campfire',out:1,cost:{stone:4,branch:3},note:'Place, add wood, and cook amber caps.'},
 {id:'chest',out:1,cost:{wood:5,fiber:3},note:'Stores 12 stacks. Use to deposit or recover items.'},
 {id:'shelter',out:1,cost:{wood:7,fiber:5,branch:4},note:'A dry retreat. Rest here through the night.'},
 {id:'plank',out:1,cost:{wood:2},note:'A physical timber. Falls when unsupported.'}
];
export class Inventory{
 constructor(slots=20,raw=[]){this.capacity=slots;this.slots=Array.from({length:slots},(_,i)=>raw[i]?{...raw[i]}:null);}
 count(id){return this.slots.reduce((n,s)=>n+(s?.id===id?s.n:0),0);}
 canAdd(id,n){return this.slots.reduce((n,s)=>n+(!s?ITEMS[id].stack:s.id===id?ITEMS[id].stack-s.n:0),0)>=n;}
 add(id,n=1){if(!ITEMS[id]||!this.canAdd(id,n))return false;for(const s of this.slots)if(s?.id===id){let a=Math.min(n,ITEMS[id].stack-s.n);s.n+=a;n-=a;}for(let i=0;n>0&&i<this.capacity;i++)if(!this.slots[i]){let a=Math.min(n,ITEMS[id].stack);this.slots[i]={id,n:a};n-=a;}return true;}
 remove(id,n=1){if(this.count(id)<n)return false;for(let i=this.slots.length-1;i>=0&&n>0;i--){let s=this.slots[i];if(s?.id===id){let a=Math.min(s.n,n);s.n-=a;n-=a;if(!s.n)this.slots[i]=null;}}return true;}
 craft(id){let r=RECIPES.find(r=>r.id===id);if(!r)return {ok:false,message:'Unknown recipe.'};for(let [k,n]of Object.entries(r.cost))if(this.count(k)<n)return {ok:false,message:`Need ${n-this.count(k)} more ${ITEMS[k].name.toLowerCase()}.`};let copy=new Inventory(this.capacity,this.slots);for(let[k,n]of Object.entries(r.cost))copy.remove(k,n);if(!copy.add(id,r.out))return {ok:false,message:'Your pack is full. Drop or store a stack.'};this.slots=copy.slots;return {ok:true,message:`Crafted ${ITEMS[id].name}.`};}
}
export const SPECIES={
 jaguar:{name:'Jaguar',height:.92,width:.42,length:.92,mass:58,speed:2.2,run:6.3,color:0xc89446,alert:17,territory:22},
 chimp:{name:'Chimpanzee',height:1.02,width:.4,length:.48,mass:42,speed:1.6,run:4.3,color:0x353c39,alert:14,territory:14},
 deer:{name:'Marsh deer',height:1.16,width:.32,length:.7,mass:48,speed:1.8,run:6.7,color:0x98714c,alert:14,territory:0}
};
export function worldLayout(){let r=rng(),trees=[],rocks=[],resources=[];for(let i=0;i<155;i++){let x=(r()-.5)*112,z=(r()-.5)*112;if(Math.hypot(x,z-15)<13||Math.hypot(x+10,z+5)<11||height(x,z)<WATER+.45||Math.hypot(x+31,z+24)<7)continue;trees.push({id:'tree'+i,x,z,scale:1+r()*.9,seed:r(),hp:4});}for(let i=0;i<30;i++){let x=(r()-.5)*105,z=(r()-.5)*105;if(Math.hypot(x,z-15)<9||Math.hypot(x+10,z+5)<10||height(x,z)<WATER)continue;rocks.push({id:'rock'+i,x,z,sx:1+r()*2,sy:.5+r()*1.7,sz:.7+r()*2,seed:r()});}for(let i=0;i<135;i++){let x=(r()-.5)*97,z=(r()-.5)*97;if(height(x,z)<WATER+.3||rocks.some(o=>Math.hypot(o.x-x,o.z-z)<o.sx+1)||trees.some(o=>Math.hypot(o.x-x,o.z-z)<.8))continue;let id=['branch','stone','fiber','berries','mushroom'][i%5];resources.push({id:'res'+i,item:id,x,z,n:id==='fiber'?3:2});}
 // A readable, guaranteed empty-handed start; these are visible world pickups.
 [[-2,14,'branch',3],[1,12,'stone',3],[3,15,'fiber',3],[-3,10,'branch',3],[3,9,'stone',3],[-5,14,'berries',3],[1,18,'mushroom',3],[-2,18,'fiber',3],[-6,8,'branch',3],[5,18,'stone',3]].forEach(([x,z,item,n],i)=>resources.push({id:'start'+i,item,x,z,n}));
 return {trees,rocks,resources};}
export const LANDMARKS=[{id:'pool',name:'Glasswater pool',x:15,z:5,note:'A freshwater spring. Drink at the shore.'},{id:'range',name:'The old range',x:-10,z:-5,note:'Three surfaces. One moving target. Recover every throw.'},{id:'arch',name:'Sentinel arch',x:-31,z:-24,note:'An old survey cache beneath the stone.'},{id:'grove',name:'The lantern grove',x:32,z:-30,note:'Amber caps gather under ancient branches.'}];
