/* Original fan game. Swing and body pose create movement; there is no run input. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d', {alpha:false});
  const TAU = Math.PI*2, G = 950, BASE_ROPE = 105;
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const lerp = (a,b,t) => a+(b-a)*t;
  const lines = (...items) => items.map(([a,b,y])=>({a,b,y}));
  const rails = (...items) => items.map(([x,y])=>({x,y}));
  const mats = (...items) => items.map(([x,width,y])=>({x,width,y}));
  const maps = [
    {id:'classic',name:'Classic Bar Park',hint:'bars and concrete',sky:['#3da9e8','#afe4f6'],floor:'#d65b50',edge:'#9d3839',stone:'#e6e3d7',side:'#9c9b91',width:2200,
      ground:lines([0,2200,599],[710,795,510],[1420,1500,530]),bars:rails([215,352],[490,335],[770,355],[1055,336],[1335,352],[1625,335],[1910,353]),tramps:[],blocks:[590,1190,1750]},
    {id:'rooftop',name:'Rooftop Lines',hint:'gaps between bars',sky:['#68b9e8','#d1eefa'],floor:'#c97160',edge:'#8d4b45',stone:'#dddcd3',side:'#93988f',width:2250,
      ground:lines([0,480,599],[555,1000,565],[1080,1560,599],[1645,2250,570]),bars:rails([210,352],[480,342],[765,355],[1050,340],[1340,353],[1635,335],[1935,350]),tramps:[],blocks:[460,1120,1770]},
    {id:'trampoline',name:'Trampoline Yard',hint:'bounce and regrab',sky:['#46abe6','#c8ebf7'],floor:'#d66f54',edge:'#a14540',stone:'#deddd2',side:'#9ca5a1',width:2210,
      ground:lines([0,2210,599]),bars:rails([215,355],[520,330],[835,348],[1150,335],[1460,340],[1775,332],[2060,350]),tramps:mats([365,130,599],[1010,135,599],[1600,140,599]),blocks:[725,1390]},
    {id:'concrete',name:'Concrete Gym',hint:'pillars and ledges',sky:['#6eafce','#deebec'],floor:'#bd7669',edge:'#82534f',stone:'#e8e5db',side:'#9b9f9c',width:2370,
      ground:lines([0,2370,599],[830,950,525],[1560,1700,520]),bars:rails([210,350],[490,340],[775,355],[1070,335],[1360,353],[1660,337],[1950,351],[2210,341]),tramps:mats([1300,100,599]),blocks:[655,1180,1790,2100]},
    {id:'neon',name:'Neon Underpass',hint:'nighttime swing',sky:['#243b6f','#63558e'],floor:'#645775',edge:'#332d52',stone:'#b5b8c7',side:'#555a77',width:2330,night:true,
      ground:lines([0,530,599],[605,1170,599],[1240,1820,599],[1900,2330,599]),bars:rails([210,360],[500,338],[790,353],[1080,338],[1380,353],[1680,335],[1980,346],[2220,350]),tramps:mats([970,115,599],[1755,110,599]),blocks:[675,1490]},
    {id:'canopy',name:'Canopy Run',hint:'bars in the trees',sky:['#6eaeb7','#d2e2c6'],floor:'#8c9772',edge:'#54664c',stone:'#dedbd0',side:'#819586',width:2320,jungle:true,
      ground:lines([0,555,599],[630,1180,580],[1250,1770,599],[1840,2320,570]),bars:rails([215,355],[510,335],[805,352],[1100,335],[1390,351],[1685,332],[1980,350],[2220,337]),tramps:mats([1540,125,599]),blocks:[680,1260,1850]},
    {id:'chimp',name:'Chimp Chase',hint:'escape at the far end',sky:['#6eacaa','#d0dfbc'],floor:'#aa7861',edge:'#65483f',stone:'#e0dcd0',side:'#869287',width:2500,jungle:true,chimp:true,
      ground:lines([0,900,599],[930,1650,570],[1680,2500,599]),bars:rails([210,355],[490,337],[775,352],[1060,333],[1345,348],[1630,330],[1920,352],[2205,334],[2400,350]),tramps:mats([1770,115,599]),blocks:[680,1230,1820,2290]}
  ];
  let index=0,map=maps[0],p,chimp,ai=false,menu=false,done=false;
  let w=0,h=0,scale=1,view=0,dpr=1,camera=0,time=0,last=0,acc=0,uiTick=0,toastUntil=0,finishWait=0;
  const keys=new Set(),held=new Set(),sparks=[],ghosts=[];

  function resize(){
    const rect=canvas.getBoundingClientRect();
    w=rect.width;h=rect.height;dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    scale=h/720;view=w/scale;
  }
  function floorBelow(x){
    let found=null;
    for(const f of map.ground)if(x>=f.a&&x<=f.b&&(!found||f.y>found.y))found=f;
    return found;
  }
  function notice(message,duration=1.2){
    $('flash').textContent=message;toastUntil=time+duration;$('flash').classList.add('visible');
  }
  function pulse(x,y,color,count=8){
    for(let i=0;i<count;i++)sparks.push({x,y,vx:(Math.random()-.5)*170,vy:-50-Math.random()*170,life:.3+Math.random()*.3,color});
  }
  function spawn(barNumber=0,keepCount=0){
    const b=map.bars[barNumber];
    p={x:0,y:0,vx:0,vy:0,angle:0,av:0,holding:barNumber,theta:-.72,omega:.34,len:BASE_ROPE,
      grounded:false,lastBar:barNumber,cooldown:0,grabWindow:0,holdTime:0,airTime:0,airAngle:0,
      regrabs:keepCount,squat:0,wasTuck:false,lastSafe:b.x,flips:0,airFlips:0};
    p.x=b.x+Math.sin(p.theta)*p.len;p.y=b.y+Math.cos(p.theta)*p.len;
    camera=clamp(p.x-view*.40,0,Math.max(0,map.width-view));done=false;finishWait=0;
    chimp={x:-130,y:565,vy:0,phase:0,climbing:false,supportX:null};
    $('escaped').hidden=true;$('chimpWarning').hidden=!map.chimp;
    updateLabels();
  }
  function selectMap(i){
    index=(i+maps.length)%maps.length;map=maps[index];spawn();
    menu=false;$('maps').hidden=true;
    try{history.replaceState(null,'','#'+map.id)}catch(_){}
    document.title=map.name+' — NoomiClone-inspired Flip Playground';
    keys.clear();held.clear();
  }
  function updateLabels(){
    $('regrabs').textContent=p.regrabs+' regrab'+(p.regrabs===1?'':'s');
    $('mapCaption').textContent=map.name;
    $('grabButton').textContent=p.holding>=0?'let go':'grab';
    if(map.chimp)$('chimpDistance').textContent=Math.max(0,Math.round(p.x-chimp.x))+'m';
  }
  function attach(i,first=false){
    const b=map.bars[i];
    p.holding=i;p.lastBar=i;p.len=BASE_ROPE;
    p.theta=clamp(Math.atan2(p.x-b.x,p.y-b.y),-1.37,1.37);
    p.omega=clamp(p.vx/BASE_ROPE*.75,-4.2,4.2);
    p.x=b.x+Math.sin(p.theta)*p.len;p.y=b.y+Math.cos(p.theta)*p.len;
    p.vx=0;p.vy=0;p.holdTime=0;p.cooldown=0;p.grabWindow=0;p.grounded=false;p.airTime=0;
    if(!first){p.regrabs++;notice('regrab!',.8);pulse(b.x,b.y,'#f5eee0',9)}
    updateLabels();
  }
  function nextBar(){
    return map.bars.findIndex((b,i)=>i>p.lastBar&&b.x>p.x+95);
  }
  function release(){
    if(p.holding<0)return;
    const target=nextBar();
    const tangent=p.omega*p.len*Math.cos(p.theta);
    p.vx=tangent;
    p.vy=-p.omega*p.len*Math.sin(p.theta)-185;
    if(ai&&target>=0){
      const dx=map.bars[target].x-p.x;
      p.vx=clamp(Math.max(tangent,dx/.75),250,480);
      p.vy=-415+clamp((map.bars[target].y-map.bars[p.holding].y)*.4,-22,22);
    }
    p.av=ai?(p.regrabs%2===0?13.4:-13.4):(held.has('tuck')||keys.has('Space')?6.2:3.4);
    p.holding=-1;p.grounded=false;p.cooldown=.32;p.airTime=0;p.airAngle=0;p.airFlips=0;
    p.x+=3;p.y-=3;updateLabels();
  }
  function grabAction(){
    if(menu||done||ai)return;
    if(p.holding>=0)release();
    else{p.grabWindow=.85;tryGrab()}
  }
  function tryGrab(){
    if(p.holding>=0||p.cooldown>0||(!ai&&p.grabWindow<=0))return;
    let pick=-1,dist=ai?130:112;
    map.bars.forEach((b,i)=>{
      if(i===p.lastBar&&p.cooldown>0)return;
      const d=Math.hypot(p.x-b.x,p.y-b.y);
      if(d<dist&&p.y>b.y-12&&p.y<b.y+145){pick=i;dist=d}
    });
    if(pick>=0)attach(pick);
  }
  function userPose(){
    return {arch:keys.has('ArrowLeft')||keys.has('KeyA')||held.has('arch'),
      tuck:keys.has('Space')||keys.has('KeyS')||held.has('tuck')};
  }
  function aiPose(){
    if(p.holding>=0){
      return {arch:p.theta>.15&&p.omega>0,tuck:p.theta<.15&&p.omega>0};
    }
    if(p.grounded)return {arch:p.squat>.36,tuck:p.squat<=.36};
    return {arch:p.vy>180,tuck:p.vy<=180};
  }
  function recover(){
    if(ai){
      let next=map.bars.findIndex((b,i)=>i>p.lastBar&&b.x>p.x-80);
      if(next<0)next=map.bars.length-1;
      const count=p.regrabs;
      spawn(next,count);
      p.omega=1.2;
      notice('saved the swing',.8);
    }else{
      const last=Math.max(0,p.lastBar);
      spawn(last,p.regrabs);
      notice('back on the bar',.9);
    }
  }
  function updateChimp(dt){
    const c=chimp;c.phase+=dt*8;
    const dist=p.x-c.x;
    const support=map.bars.reduce((a,b)=>Math.abs(b.x+53-c.x)<Math.abs(a.x+53-c.x)?b:a);
    const supportX=support.x+53;
    const floor=floorBelow(c.x)||{y:599};
    const groundY=floor.y-25;
    const nearPillar=Math.abs(supportX-c.x)<47;
    c.climbing=nearPillar&&c.y>support.y+72;
    c.supportX=nearPillar?supportX:null;
    c.x+=dt*(c.climbing?66:dist>270?141:160);
    if(c.climbing){c.y=Math.max(support.y+70,c.y-175*dt);c.vy=0}
    else {c.vy+=G*.7*dt;c.y=Math.min(groundY,c.y+c.vy*dt);if(c.y>=groundY)c.vy=0}
    if(dist<54&&Math.abs(c.y-p.y)<85){
      notice('the chimp caught you!',1.2);
      spawn(0,p.regrabs);
      if(ai)chimp.x=-260;
      return true;
    }
    if(p.x>map.width-92){
      done=true;notice('you escaped!',2);
      if(ai)finishWait=2.3;else $('escaped').hidden=false;
    }
    return false;
  }
  function loopAI(){
    if(map.chimp)return;
    if(p.x>map.width-105){
      const count=p.regrabs;spawn(0,count);notice('another line',.8);
    }
  }
  function update(dt){
    time+=dt;
    if(time>toastUntil)$('flash').classList.remove('visible');
    for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=G*.55*dt;s.life-=dt;if(s.life<=0)sparks.splice(i,1)}
    if(menu)return;
    if(done){if(ai&&(finishWait-=dt)<=0)spawn();return}
    const c=ai?aiPose():userPose();
    p.cooldown=Math.max(0,p.cooldown-dt);
    p.grabWindow=Math.max(0,p.grabWindow-dt);
    if(p.holding>=0){
      const b=map.bars[p.holding],oldLen=p.len;
      const desired=BASE_ROPE+(c.arch?10:0)-(c.tuck?25:0);
      p.len=lerp(p.len,desired,clamp(dt*13,0,1));
      if(oldLen>0)p.omega*=clamp((oldLen/p.len)**1.45,.93,1.07);
      const direction=Math.sign(p.omega)||1;
      const pump=(c.arch?1.8:0)+(c.tuck?2.4:0);
      p.omega+=(-G/p.len*.56*Math.sin(p.theta)+direction*pump)*dt;
      p.omega*=Math.pow(.997,dt*60);
      p.omega=clamp(p.omega,-5.6,5.6);
      p.theta+=p.omega*dt;
      if(p.theta>1.5){p.theta=1.5;p.omega=-Math.abs(p.omega)*.55}
      if(p.theta< -1.5){p.theta=-1.5;p.omega=Math.abs(p.omega)*.55}
      p.x=b.x+Math.sin(p.theta)*p.len;
      p.y=b.y+Math.cos(p.theta)*p.len;
      p.angle= -p.theta*.50+(c.arch?-.20:0)+(c.tuck?.12:0);
      p.holdTime+=dt;
      if(ai&&((p.theta>.55&&p.omega>2.1)||(p.holdTime>1.65&&p.theta>.25)))release();
    }else{
      const oldY=p.y;
      if(p.grounded){
        p.squat=c.tuck?Math.min(1,p.squat+dt*2):p.squat;
        if(!c.tuck&&p.wasTuck&&p.squat>.16){
          const power=clamp(p.squat,.2,1);
          p.vy=-350-power*115;
          p.vx+=120+power*85;
          p.av=c.arch?-3.6:4.5;
          p.grounded=false;p.airTime=0;p.airAngle=0;p.airFlips=0;p.squat=0;
          pulse(p.x,p.y+38,'#ead5c3',5);
        }
        p.wasTuck=c.tuck;
        if(p.grounded){
          p.vx*=Math.pow(.977,dt*60);
          p.angle=lerp(p.angle,c.arch?-.18:0,clamp(dt*9,0,1));
          if(ai&&p.squat>.68){p.wasTuck=true;p.squat=1;p.vy=-455;p.vx=Math.max(p.vx,215);p.av=6.2;p.grounded=false;p.airTime=0;p.airAngle=0;p.airFlips=0;p.squat=0}
        }
      }
      p.x+=p.vx*dt;
      p.x=clamp(p.x,22,map.width-12);
      if(p.grounded){
        const foot=p.y+40;
        const f=map.ground.find(f=>p.x>=f.a&&p.x<=f.b&&Math.abs(f.y-foot)<18);
        if(f)p.y=f.y-40;
        else{p.grounded=false;p.vy=0;p.airTime=0;p.airAngle=0}
      }
      if(!p.grounded){
        p.vy+=G*dt;p.y+=p.vy*dt;p.airTime+=dt;
        if(c.tuck)p.av=clamp(p.av*1.007+Math.sign(p.av||1)*.6*dt,-14,14);
        if(c.arch)p.av=lerp(p.av,-2.3,clamp(2.3*dt,0,1));
        p.angle+=p.av*dt;p.airAngle+=Math.abs(p.av*dt);
        if(p.airAngle>=(p.airFlips+1)*TAU){p.airFlips++;p.flips++;notice(p.airFlips+'x flip!',.7)}
        p.vx*=Math.pow(.999,dt*60);
        if(ai){
          const n=nextBar();
          if(n>=0&&p.x<map.bars[n].x+80&&p.y<map.bars[n].y+170){
            const dx=map.bars[n].x-p.x;
            p.vx+=clamp(dx*.8-p.vx,-150,150)*dt*.45;
          }
        }
        tryGrab();
        if(p.holding<0&&p.vy>=0){
          let hit=null;
          for(const f of map.ground){
            if(p.x>=f.a&&p.x<=f.b&&oldY+40<=f.y+8&&p.y+40>=f.y&&(!hit||f.y<hit.y))hit=f;
          }
          if(hit){
            const tramp=map.tramps.find(m=>Math.abs(m.y-hit.y)<2&&Math.abs(m.x-p.x)<m.width/2);
            p.y=hit.y-40;
            if(tramp){
              p.vy=-700;p.av+=p.av>=0?2.5:-2.5;p.grounded=false;
              notice('bounce!',.7);pulse(p.x,hit.y,'#f4dd81',13);
            }else{
              if(p.airFlips)notice('landed!',.7);
              p.grounded=true;p.vy=0;p.av=0;p.squat=0;p.wasTuck=false;p.lastSafe=p.x;
              p.angle=0;
            }
          }
        }
        if(p.y>760){recover();return}
      }
    }
    if(map.chimp&&updateChimp(dt))return;
    if(ai)loopAI();
    camera=lerp(camera,clamp(p.x-view*.43,0,Math.max(0,map.width-view)),clamp(dt*5,0,1));
    if(!p.grounded&&p.holding<0&&Math.random()<dt*22)ghosts.push({x:p.x,y:p.y,life:.20});
    for(let i=ghosts.length-1;i>=0;i--)if((ghosts[i].life-=dt)<=0)ghosts.splice(i,1);
    uiTick+=dt;if(uiTick>.11){uiTick=0;updateLabels()}
  }

  function poly(points,fill){
    ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();ctx.fill();
  }
  function limb(x1,y1,x2,y2,size,base='#4d5152',light='#969b9a'){
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=base;ctx.lineWidth=size;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    ctx.strokeStyle=light;ctx.lineWidth=size*.28;
    ctx.beginPath();ctx.moveTo(x1-size*.18,y1-size*.15);ctx.lineTo(x2-size*.18,y2-size*.15);ctx.stroke();
  }
  function stoneBox(x,y,width,height){
    const d=21;
    poly([[x,y],[x+d,y-12],[x+width+d,y-12],[x+width,y]],'#f0eee5');
    poly([[x+width,y],[x+width+d,y-12],[x+width+d,y+height-12],[x+width,y+height]],map.side);
    ctx.fillStyle=map.stone;ctx.fillRect(x,y,width,height);
  }
  function sky(){
    const gradient=ctx.createLinearGradient(0,0,0,h);
    gradient.addColorStop(0,map.sky[0]);gradient.addColorStop(1,map.sky[1]);
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    if(map.night){
      for(let i=0;i<65;i++){
        const x=(i*187-camera*scale*.025)%(w+100);
        ctx.fillStyle=i%4?'#ecedff8c':'#d3bafa';ctx.fillRect((x+w+100)%(w+100),((i*53)%Math.round(h*.68)),1.3,1.3);
      }
    }else for(let i=-1;i<10;i++){
      const x=i*270-(camera*scale*.08)%270+55;
      const y=(100+i*47)%240;
      ctx.fillStyle='#edfaff9c';ctx.beginPath();
      ctx.ellipse(x,y,47,11,-.12,0,TAU);ctx.ellipse(x+25,y-6,30,9,.05,0,TAU);ctx.fill();
    }
  }
  function scenery(){
    for(const f of map.ground){
      if(f.b<camera-80||f.a>camera+view+80)continue;
      ctx.fillStyle=map.edge;ctx.fillRect(f.a,f.y+8,f.b-f.a,720-f.y);
      ctx.fillStyle=map.floor;ctx.fillRect(f.a,f.y,f.b-f.a,720-f.y);
      poly([[f.a,f.y],[f.a+25,f.y+10],[f.a+25,720],[f.a,720]],'#ffffff13');
      for(let x=Math.ceil(f.a/130)*130;x<f.b;x+=130){
        ctx.fillStyle='#ffffff12';ctx.fillRect(x,f.y+56,1,160);
      }
    }
    for(const x of map.blocks){
      if(x<camera-220||x>camera+view+150)continue;
      const floor=floorBelow(x)||{y:600};
      ctx.fillStyle='#312f2b33';ctx.beginPath();ctx.ellipse(x+35,floor.y+4,100,9,0,0,TAU);ctx.fill();
      stoneBox(x-45,floor.y-150,70,150);
    }
    for(const m of map.tramps){
      ctx.fillStyle='#3a4244';ctx.fillRect(m.x-m.width/2-5,m.y-7,m.width+10,14);
      ctx.fillStyle=map.night?'#b5e2ee':'#efb874';ctx.fillRect(m.x-m.width/2,m.y-13,m.width,8);
      for(let x=m.x-m.width/2+8;x<m.x+m.width/2;x+=18){
        ctx.fillStyle='#f7f0dd';ctx.fillRect(x,m.y-12,5,2);
      }
    }
    for(const b of map.bars){
      if(b.x<camera-140||b.x>camera+view+140)continue;
      const f=floorBelow(b.x+44)||{y:600};
      ctx.fillStyle='#272f2f36';ctx.beginPath();ctx.ellipse(b.x+52,f.y+3,41,6,0,0,TAU);ctx.fill();
      stoneBox(b.x+45,b.y-8,19,Math.max(60,f.y-b.y+8));
      poly([[b.x-56,b.y+2],[b.x-41,b.y-12],[b.x+77,b.y-19],[b.x+64,b.y-3]],'#4b5555');
      poly([[b.x-56,b.y+2],[b.x+64,b.y-3],[b.x+64,b.y+3],[b.x-56,b.y+8]],'#87918f');
      ctx.fillStyle='#d5ded7';ctx.fillRect(b.x-4,b.y-8,8,8);
    }
    if(map.jungle)for(let i=0;i<18;i++){
      const x=i*143+80;if(x<camera-100||x>camera+view+100)continue;
      const floor=floorBelow(x)||{y:600};
      ctx.fillStyle='#4772698c';ctx.fillRect(x,floor.y-93,7,92);
      ctx.beginPath();ctx.ellipse(x+3,floor.y-96,35,17,-.25,0,TAU);ctx.fill();
    }
    if(map.chimp){
      const x=map.width-100;stoneBox(x,410,18,190);
      poly([[x+18,411],[x+78,428],[x+18,448]],'#bcd5ae');
      ctx.fillStyle='#334c41';ctx.font='18px Arial';ctx.fillText('ESCAPE',x-24,396);
    }
  }
  function athlete(){
    const f=floorBelow(p.x);
    if(f){
      const alpha=clamp(1-(f.y-p.y-40)/260,0,.36);
      ctx.fillStyle='rgba(37,40,36,'+alpha+')';
      ctx.beginPath();ctx.ellipse(p.x+35,f.y+4,30,6,0,0,TAU);ctx.fill();
    }
    if(p.holding>=0){
      const b=map.bars[p.holding];
      limb(p.x-5,p.y-28,b.x-8,b.y,9);
      limb(p.x+5,p.y-28,b.x+8,b.y,9);
    }
    const tucked=p.holding<0&&!p.grounded&&(held.has('tuck')||keys.has('Space')||ai);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    const knee=tucked?4:20,foot=tucked?-8:42,arch=held.has('arch')||keys.has('ArrowLeft');
    limb(-5,0,-11,knee,13);
    limb(-11,knee,tucked?-28:-10,foot,11);
    limb(5,0,11,knee,13);
    limb(11,knee,tucked?25:12,foot,11);
    if(p.holding<0){
      limb(-6,-29,-22,arch?-42:-21,9);
      limb(-22,arch?-42:-21,-29,arch?-52:-9,8);
      limb(6,-29,21,arch?-42:-21,9);
      limb(21,arch?-42:-21,29,arch?-52:-9,8);
    }
    limb(0,0,0,-35,17,'#44484a','#878e8f');
    const head=ctx.createRadialGradient(-4,-47,2,1,-43,14);
    head.addColorStop(0,'#929797');head.addColorStop(.65,'#575b5c');head.addColorStop(1,'#383b3d');
    ctx.fillStyle=head;ctx.beginPath();ctx.arc(0,-48,13,0,TAU);ctx.fill();
    ctx.restore();
    if(ai){ctx.fillStyle='#315b66';ctx.font='bold 12px Arial';ctx.textAlign='center';ctx.fillText('AI',p.x,p.y-80);ctx.textAlign='left'}
  }
  function drawChimp(){
    if(!map.chimp||chimp.x<camera-80||chimp.x>camera+view+80)return;
    const c=chimp,s=Math.sin(c.phase)*13;
    if(c.climbing&&c.supportX!==null){
      limb(c.x-12,c.y-23,c.supportX-5,c.y-57,10,'#342c26','#776858');
      limb(c.x+8,c.y-20,c.supportX-5,c.y-34,10,'#342c26','#806c5b');
    }
    ctx.save();ctx.translate(c.x,c.y);
    ctx.fillStyle='#302a24';ctx.beginPath();ctx.ellipse(0,-6,25,18,c.climbing?-.55:0,0,TAU);ctx.fill();
    limb(-13,1,-30+s,19,14,'#302823','#736457');
    limb(14,1,28-s,19,15,'#302823','#6b5d52');
    limb(-10,-16,-29-s,-22,13,'#322a25','#78695a');
    limb(12,-17,31+s,-33,13,'#322a25','#78685b');
    ctx.fillStyle='#3a3029';ctx.beginPath();ctx.arc(22,-26,17,0,TAU);ctx.fill();
    ctx.fillStyle='#b79b80';ctx.beginPath();ctx.ellipse(29,-19,11,9,-.25,0,TAU);ctx.fill();
    ctx.fillStyle='#f6e4b7';ctx.beginPath();ctx.arc(28,-30,2.5,0,TAU);ctx.fill();
    ctx.restore();
  }
  function draw(){
    if(!w||!h)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);sky();
    ctx.save();ctx.scale(scale,scale);ctx.translate(-camera,0);
    scenery();
    for(const g of ghosts){ctx.globalAlpha=g.life*.4;ctx.fillStyle='#d7e1df';ctx.beginPath();ctx.arc(g.x,g.y,8,0,TAU);ctx.fill()}ctx.globalAlpha=1;
    drawChimp();athlete();
    for(const s of sparks){ctx.globalAlpha=clamp(s.life*2,0,1);ctx.fillStyle=s.color;ctx.fillRect(s.x,s.y,3,3)}ctx.globalAlpha=1;
    ctx.restore();
  }
  function frame(now){
    if(!last)last=now;acc+=Math.min((now-last)/1000,.05);last=now;
    let steps=0;while(acc>=1/120&&steps++<6){update(1/120);acc-=1/120}
    draw();requestAnimationFrame(frame);
  }
  function initUI(){
    const list=$('mapList');
    maps.forEach((m,i)=>{
      const item=document.createElement('button');item.type='button';item.className='map-choice';
      item.style.setProperty('--sky-a',m.sky[0]);item.style.setProperty('--sky-b',m.sky[1]);item.style.setProperty('--floor',m.floor);
      item.innerHTML='<span class="map-mini"></span><span class="map-choice-copy"><small>MAP '+String(i+1).padStart(2,'0')+(m.chimp?' · ESCAPE':' · FREE PLAY')+'</small><strong>'+m.name+'</strong><em>'+m.hint+'</em></span>';
      item.addEventListener('click',()=>selectMap(i));list.append(item);
    });
    $('mapButton').addEventListener('click',()=>{menu=true;$('maps').hidden=false;keys.clear();held.clear()});
    $('closeMaps').addEventListener('click',()=>{menu=false;$('maps').hidden=true});
    $('resetButton').addEventListener('click',()=>{spawn();notice('reset',.6)});
    $('grabButton').addEventListener('pointerdown',e=>{e.preventDefault();grabAction()});
    for(const button of document.querySelectorAll('[data-hold]')){
      const action=button.dataset.hold;
      button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);held.add(action);button.classList.add('pressed')});
      const up=()=>{held.delete(action);button.classList.remove('pressed')};
      button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
    }
    $('aiButton').addEventListener('click',()=>{
      ai=!ai;$('aiButton').setAttribute('aria-pressed',String(ai));
      $('aiButton').textContent='✦ AI MODE: '+(ai?'ON':'OFF');
      if(ai){menu=false;$('maps').hidden=true;if(done)spawn();notice('AI mode',.8)}
    });
    $('helpButton').addEventListener('click',()=>{$('help').hidden=!$('help').hidden});
    $('replayChimp').addEventListener('click',()=>spawn());
    $('chooseOther').addEventListener('click',()=>{$('escaped').hidden=true;menu=true;$('maps').hidden=false});
    document.addEventListener('keydown',e=>{
      if(['Space','ArrowLeft','ArrowUp','KeyA','KeyS','KeyW','KeyR','KeyM','KeyI'].includes(e.code))e.preventDefault();
      if(e.repeat)return;
      if(e.code==='ArrowUp'||e.code==='KeyW')grabAction();
      else if(e.code==='KeyR')spawn();
      else if(e.code==='KeyM'){$('mapButton').click()}
      else if(e.code==='KeyI')$('aiButton').click();
      else keys.add(e.code);
    });
    document.addEventListener('keyup',e=>keys.delete(e.code));
    window.addEventListener('blur',()=>{keys.clear();held.clear()});
    document.addEventListener('visibilitychange',()=>{last=0;acc=0});
    window.addEventListener('resize',resize);
  }
  initUI();resize();
  const hash=location.hash.slice(1);selectMap(Math.max(0,maps.findIndex(m=>m.id===hash)));
  requestAnimationFrame(frame);
})();
