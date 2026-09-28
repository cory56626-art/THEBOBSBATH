/* Noomi Flip Lab: original canvas art and a small deterministic physics sandbox. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const GRAVITY = 930;
  const ROPE = 93;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ground = (...rows) => rows.map(([a, b, y]) => ({a, b, y}));
  const bars = (...rows) => rows.map(([x, y]) => ({x, y}));
  const pads = (...rows) => rows.map(([x, w, y]) => ({x, w, y}));
  const maps = [
    {id:'classic', name:'Classic Bar Park', kind:'BARS', subtitle:'The original feeling. Find your swing.', sky:['#65b9ea','#d3effb'], floor:'#c86155', edge:'#8d3c39', far:'#8daeba', width:2240, grounds:ground([0,2240,586],[510,610,470],[1120,1230,488]), bars:bars([300,389],[650,348],[1010,382],[1390,348],[1740,369]), pads:[], obstacles:[825,1570]},
    {id:'rooftop', name:'Rooftop Lines', kind:'GAPS', subtitle:'Air between every landing.', sky:['#9ed3ef','#ffe6c3'], floor:'#a5a7a3', edge:'#626e72', far:'#b9bbc0', width:2290, grounds:ground([0,450,590],[565,935,570],[1045,1430,594],[1540,2290,570]), bars:bars([365,382],[720,344],[1180,380],[1630,351],[1960,375]), pads:[], obstacles:[800,1770]},
    {id:'trampoline', name:'Trampoline Yard', kind:'BOUNCE', subtitle:'Bounce high. Spin harder.', sky:['#62b6ea','#d7f5fa'], floor:'#d68061', edge:'#954c47', far:'#9bb8af', width:2240, grounds:ground([0,2240,587],[1210,1320,480]), bars:bars([500,340],[985,326],[1470,315],[1830,351]), pads:pads([344,118,587],[820,124,587],[1400,130,587],[1900,120,587]), obstacles:[]},
    {id:'concrete', name:'Concrete Gym', kind:'PARKOUR', subtitle:'Columns, ledges, and stubborn rails.', sky:['#aac8d0','#f6e8ce'], floor:'#b1aaa0', edge:'#716f69', far:'#a1aba9', width:2390, grounds:ground([0,660,586],[680,980,522],[1000,1540,586],[1570,1900,530],[1920,2390,586]), bars:bars([320,382],[765,328],[1170,386],[1670,325],[2110,384]), pads:pads([1310,110,586]), obstacles:[570,1450,2070]},
    {id:'neon', name:'Neon Underpass', kind:'NIGHT', subtitle:'Glow rails and long night flights.', sky:['#12284e','#673f83'], floor:'#35415b', edge:'#182542', far:'#23345b', width:2360, grounds:ground([0,475,590],[575,1125,590],[1235,1740,590],[1850,2360,590]), bars:bars([270,398],[665,358],[1040,375],[1430,350],[1960,365]), pads:pads([900,100,590],[1580,110,590]), obstacles:[410,1680]},
    {id:'canopy', name:'Canopy Run', kind:'JUNGLE', subtitle:'Hang on above the forest floor.', sky:['#79b7b7','#dcdfb0'], floor:'#72936d', edge:'#435e4a', far:'#80a189', width:2310, grounds:ground([0,550,600],[660,1110,580],[1210,1670,600],[1790,2310,580]), bars:bars([320,379],[760,348],[1070,379],[1450,353],[1920,361]), pads:pads([1510,100,600]), obstacles:[880]},
    {id:'chimp', name:'Chimp Chase', kind:'ESCAPE', subtitle:'Keep moving. It climbs after you.', sky:['#83b9a6','#dbe1ae'], floor:'#977761', edge:'#5a453b', far:'#668c75', width:2520, grounds:ground([0,850,598],[870,1340,562],[1360,2050,598],[2070,2520,575]), bars:bars([400,387],[900,340],[1250,362],[1670,365],[2110,345]), pads:pads([1850,120,598]), obstacles:[720,1150,1560,2290], chimp:true}
  ];

  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', {alpha:false});
  const ui = {menu:$('menu'), finish:$('finish'), grid:$('mapGrid'), ai:$('aiButton'), map:$('mapButton'), score:$('score'), combo:$('combo'), callout:$('callout')};
  const key = new Set();
  const touch = new Set();
  const confetti = [];
  const trail = [];
  let selected = 0, map = maps[0], player, chimp;
  let ai = false, menuOpen = true, finished = false, completionDelay = 0, started = 0;
  let camera = 0, t = 0, w = 0, h = 0, scale = 1, viewport = 0, dpr = 1;
  let last = 0, accumulator = 0, hudTimer = 0, aiJumpTimer = 0, aiFlipDir = 1;
  let toastUntil = 0, lastTap = false;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('noomi-flip-lab-best') || '{}') || {}; } catch (_) { saved = {}; }

  function resize() {
    const box = canvas.getBoundingClientRect();
    w = box.width; h = box.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    scale = h / 720;
    viewport = w / scale;
  }

  function floorAt(x, y = Infinity) {
    let best = null;
    for (const g of map.grounds) if (x >= g.a && x <= g.b && g.y <= y && (!best || g.y < best.y)) best = g;
    return best;
  }

  function floorUnder(x) {
    let best = null;
    for (const g of map.grounds) if (x >= g.a && x <= g.b && (!best || g.y > best.y)) best = g;
    return best;
  }

  function resetRun(announce = false) {
    const startFloor = floorUnder(80);
    player = {x:80,y:startFloor.y-40,vx:0,vy:0,angle:0,av:0,grounded:true,holding:-1,theta:0,omega:0,holdTime:0,grabCooldown:0,jumpCooldown:0,grabIntent:0,airTime:0,airTurn:0,grabs:0,score:0,combo:0,bestLanding:0,lastSafeX:80,flipping:false,wasJump:false,stuntClock:0};
    chimp = {x:-330,y:startFloor.y-35,phase:0,climbing:false};
    camera = 0; finished = false; completionDelay = 0; started = performance.now(); aiJumpTimer = .8; trail.length = 0; confetti.length = 0;
    ui.finish.hidden = true;
    $('chimpHud').hidden = !map.chimp;
    $('courseName').textContent = map.name;
    $('courseTag').textContent = `MAP ${String(selected+1).padStart(2,'0')}`;
    $('themeTag').textContent = map.kind;
    $('playType').textContent = map.chimp ? 'ESCAPE TO THE RIGHT →' : 'FREE PLAY · NO FINISH LINE';
    $('mapNumber').textContent = `${String(selected+1).padStart(2,'0')}/07`;
    $('introTip').classList.remove('hidden');
    document.title = `${map.name} — Noomi Flip Lab`;
    if (announce) toast('RUN RESET', .8);
    updateHud();
  }

  function selectMap(index, start = false) {
    selected = (index + maps.length) % maps.length; map = maps[selected];
    resetRun();
    document.querySelectorAll('.map-card').forEach((el, i) => {
      el.classList.toggle('selected', i === selected);
      el.setAttribute('aria-pressed', i === selected ? 'true' : 'false');
    });
    try { history.replaceState(null,'',`#${map.id}`); } catch (_) { /* file previews */ }
    if (start) closeMenu();
  }

  function toast(message, duration = 1.3) {
    ui.callout.textContent = message;
    toastUntil = t + duration;
    ui.callout.classList.add('show');
  }

  function openMenu() {
    menuOpen = true; ui.menu.hidden = false; ui.finish.hidden = true;
    touch.clear(); key.clear();
  }
  function closeMenu() {
    menuOpen = false; ui.menu.hidden = true; started = performance.now();
  }
  function setAI(value) {
    ai = !!value;
    ui.ai.setAttribute('aria-pressed', String(ai));
    ui.ai.setAttribute('aria-label', ai ? 'Turn AI mode off' : 'Turn AI mode on');
    if (ai) {
      if (finished) resetRun();
      closeMenu();
      aiJumpTimer = .45;
      toast('AI MODE ON · WATCH THE LINE', 1.7);
    } else {
      toast('MANUAL CONTROL', 1);
    }
  }

  function releaseBar() {
    if (player.holding < 0) return;
    const p = player;
    const forward = Math.max(175, p.omega * ROPE * Math.cos(p.theta) + 170);
    p.vx = clamp(forward, 175, ai ? 590 : 540);
    p.vy = clamp(-220 - Math.max(0,p.theta)*140 - Math.abs(p.omega)*23, -495, -165);
    p.av = clamp((p.omega * .75) + (ai ? aiFlipDir * (map.chimp ? 7.2 : 3.5) : 1.2), -8.8, 8.8);
    p.holding = -1; p.grabCooldown = .42; p.airTime = 0; p.airTurn = 0; p.grounded = false;
    p.x += 4; p.y -= 3;
    toast('RELEASE!', .72);
  }

  function grabAction() {
    if (menuOpen || finished || ai) return;
    if (player.holding >= 0) releaseBar();
    else player.grabIntent = .55;
  }

  function populateMaps() {
    ui.grid.innerHTML = '';
    maps.forEach((m,i) => {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'map-card';
      card.style.setProperty('--sky-a',m.sky[0]);card.style.setProperty('--sky-b',m.sky[1]);card.style.setProperty('--floor',m.floor);
      card.innerHTML = `<div class="map-art"><i class="tiny-bar"></i><i class="tiny-figure"></i>${m.chimp?'<span class="tiny-chimp">●</span>':''}</div><div class="map-meta"><small>${String(i+1).padStart(2,'0')} / ${m.kind}</small><strong>${m.name}</strong><span>${m.subtitle}</span></div><i class="selection-check">✓</i>`;
      card.setAttribute('aria-label',`Select ${m.name}`);
      card.addEventListener('click',() => selectMap(i));
      ui.grid.append(card);
    });
  }

  function controls() {
    if (ai) return aiControls();
    const down = (...v) => v.some(k => key.has(k) || touch.has(k));
    return {moveLeft:down('KeyA','moveLeft'),moveRight:down('KeyD','moveRight'),jump:down('Space','jump'),tuck:down('Space','KeyS','tuck'),arch:down('ArrowLeft','arch'),straight:down('ArrowRight'),grab:false,sprint:down('ShiftLeft','ShiftRight')};
  }

  function aiControls() {
    const p = player;
    const nextGap = map.grounds.filter(g => g.a >= p.x + 35 && g.a < p.x + 270 && g.y >= p.y + 32).sort((a,b)=>a.a-b.a)[0];
    const runningOut = map.grounds.some(g => p.x <= g.b && p.x > g.b - 195 && g.b < map.width - 250 && (!nextGap || nextGap.a > g.b+25));
    const hazard = map.obstacles.some(x => x > p.x+28 && x < p.x+155);
    const bar = map.bars.find(b => b.x > p.x+40 && b.x < p.x+188 && Math.abs(b.y - p.y) < 205);
    const jump = p.grounded && p.jumpCooldown <= 0 && (runningOut || hazard || !!bar || aiJumpTimer <= 0);
    const tuck = !p.grounded && p.holding < 0 && (p.vy < 135 || Math.abs(p.angle % TAU) < 1.2);
    const arch = !p.grounded && p.holding < 0 && p.vy > 135;
    return {moveLeft:false,moveRight:true,jump,tuck,arch,straight:false,grab:false,sprint:false};
  }

  function attachBar(index) {
    const p = player, b = map.bars[index];
    p.holding = index;
    p.theta = clamp(Math.atan2(p.x-b.x, p.y-b.y), -1.5, 1.5);
    p.omega = clamp(p.vx / ROPE * .68, -4, 4);
    p.holdTime = 0; p.vy = 0; p.grounded = false; p.grabs++;
    p.grabIntent = 0;
    p.score += 85 * (1+p.combo);
    toast(p.grabs > 1 ? 'REGRAB +85' : 'BAR CATCH +85', 1);
    emit(b.x,b.y, '#fff2b8', 8);
  }

  function emit(x,y,color,count=8) {
    for(let i=0;i<count;i++) confetti.push({x,y,vx:(Math.random()-.5)*170,vy:-Math.random()*180-20,life:.45+Math.random()*.35,color,size:2+Math.random()*3});
  }

  function land(on) {
    const p = player;
    const trampoline = map.pads.find(pad => Math.abs(pad.y-on.y)<4 && p.x > pad.x-pad.w*.5 && p.x < pad.x+pad.w*.5);
    p.y=on.y-40;
    if (trampoline) {
      p.vy = -735 - Math.min(85,p.airTime*35);
      p.av = clamp(p.av + (ai ? aiFlipDir*3 : 1.4),-9,9);
      p.grounded=false; p.score+=120; p.combo++;
      toast('SUPER BOUNCE +120',1.1);
      emit(p.x,on.y,'#ffe083',16);
      return;
    }
    if (p.airTime > .22) {
      const flips = Math.floor(p.airTurn / (TAU*.89));
      const orientation = Math.atan2(Math.sin(p.angle), Math.cos(p.angle));
      const clean = Math.abs(orientation) < 1.15 || ai;
      const points = Math.max(30,Math.round(p.airTime*70)) + flips * 220 + p.grabs * 65;
      p.combo = clean ? p.combo+1 : 0;
      p.score += Math.round(points*Math.max(1,Math.min(4,p.combo*.5)));
      if (flips) toast(`${flips}× FLIP ${clean?'LANDED':'TUMBLED'}!`,1.35);
      else if (p.grabs) toast(clean?'CLEAN LANDING':'ROUGH LANDING',1.05);
      if (!clean) p.vx *= .58;
      if (clean) emit(p.x,on.y,'#fff1b0',5+Math.min(10,flips*3));
    }
    p.grounded=true; p.vy=0; p.av=0; p.angle=0; p.grabs=0; p.airTime=0; p.airTurn=0;
    p.lastSafeX=p.x;
    aiJumpTimer=1.05+Math.random()*.6;
    aiFlipDir *= -1;
  }

  function rescue() {
    const p = player;
    if (ai) {
      const next = map.grounds.filter(g => g.a >= p.x-50 && g.y > 500).sort((a,b)=>a.a-b.a)[0];
      p.x = next ? next.a+25 : clamp(p.x+110,80,map.width-160);
    } else p.x = p.lastSafeX;
    const f = floorUnder(p.x) || map.grounds[0];
    p.y=f.y-40; p.vx=ai?300:0; p.vy=0; p.angle=0; p.av=0; p.holding=-1; p.grounded=true; p.airTime=0; p.airTurn=0; p.combo=0; p.grabs=0; p.grabCooldown=.45;
    toast(ai?'RECOVERY ROLL':'TRY AGAIN',.9);
  }

  function update(dt) {
    t += dt;
    if (ui.callout.classList.contains('show') && t>toastUntil) ui.callout.classList.remove('show');
    for (let i=confetti.length-1;i>=0;i--) {
      const s=confetti[i]; s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=400*dt;s.life-=dt;
      if(s.life<=0)confetti.splice(i,1);
    }
    if (menuOpen) return;
    if (finished) {
      if(ai && (completionDelay-=dt)<=0) resetRun();
      return;
    }
    if (performance.now()-started>7500) $('introTip').classList.add('hidden');
    const p=player, c=controls();
    aiJumpTimer-=dt;
    p.grabCooldown=Math.max(0,p.grabCooldown-dt);p.jumpCooldown=Math.max(0,p.jumpCooldown-dt);p.grabIntent=Math.max(0,p.grabIntent-dt);
    const move=(c.moveRight?1:0)-(c.moveLeft?1:0);
    if(p.holding>=0) {
      const b=map.bars[p.holding];p.holdTime+=dt;
      const torque=(move*4.4)+(c.tuck?1.4:0)-(c.arch?1.1:0);
      p.omega += (-GRAVITY/ROPE*.47*Math.sin(p.theta)+torque)*dt;
      p.omega*=Math.pow(.994,dt*60); p.omega=clamp(p.omega,-5.6,5.6);
      p.theta+=p.omega*dt;
      p.theta=clamp(p.theta,-1.55,1.55);
      p.x=b.x+Math.sin(p.theta)*ROPE;p.y=b.y+Math.cos(p.theta)*ROPE;
      p.angle= -p.theta*.65;
      if(ai && ((p.holdTime>.45 && p.theta>.24) || p.holdTime>1.15)) releaseBar();
    } else {
      const targetSpeed=move*(ai?350:(c.sprint?400:315));
      const smoothing=(p.grounded?8.5:3.6)*dt;
      p.vx=lerp(p.vx,targetSpeed,clamp(smoothing,0,1));
      if(!move) p.vx*=Math.pow(p.grounded?.72:.96,dt*60);
      if (p.grounded && c.jump && p.jumpCooldown<=0) {
        p.vy=ai&&map.chimp?-585:-520; p.y-=2; p.grounded=false; p.jumpCooldown=.4;
        p.av=ai?aiFlipDir*(map.chimp?8.2:6.4):(Math.abs(p.vx)>120?-4.3:-3.7);
        p.airTime=0;p.airTurn=0;
        if (ai) aiJumpTimer=2.0;
        emit(p.x,p.y+38,'#f7ebcd',5);
      }
      const oldY=p.y;
      p.x+=p.vx*dt;
      p.x=clamp(p.x,18,map.width-20);
      if (p.grounded) {
        const foot=p.y+40;
        const floor=map.grounds.filter(g=>p.x>=g.a&&p.x<=g.b&&g.y>=foot-18&&g.y<=foot+18).sort((a,b)=>a.y-b.y)[0];
        if (floor) p.y=floor.y-40;
        else {p.grounded=false;p.vy=0;p.airTime=0;p.airTurn=0;}
      }
      if(!p.grounded) {
        p.vy+=GRAVITY*dt;
        p.y+=p.vy*dt;
        p.airTime+=dt;
        if(c.tuck) p.av=clamp(p.av*1.008+Math.sign(p.av||1)*1.2*dt,-8.8,8.8);
        if(c.arch) p.av=lerp(p.av,-1.8,clamp(2.9*dt,0,1));
        if(c.straight) p.av=lerp(p.av,1.6,clamp(2.5*dt,0,1));
        if (ai && p.vy>220 && floorUnder(p.x)) {
          const angle=Math.atan2(Math.sin(p.angle),Math.cos(p.angle));
          if (p.y+40>floorUnder(p.x).y-85) p.av=clamp(-angle*4.4,-8,8);
        }
        const turn=p.av*dt;p.angle+=turn;p.airTurn+=Math.abs(turn);
        if (p.grabCooldown<=0 && (ai || p.grabIntent>0 || !key.has('ArrowUp'))) {
          let nearest=-1,dist=111;
          map.bars.forEach((b,i)=>{
            const d=Math.hypot(p.x-b.x,p.y-b.y);
            if(d<dist && p.y>b.y-25 && p.y<b.y+125 && (ai ? p.x < b.x+55 : true)) {nearest=i;dist=d;}
          });
          if(nearest>=0) attachBar(nearest);
        }
        if (p.holding<0 && p.vy>=0) {
          let collision=null;
          for(const g of map.grounds) if (p.x>=g.a && p.x<=g.b && oldY+40<=g.y+8 && p.y+40>=g.y && (!collision || g.y<collision.y)) collision=g;
          if(collision) land(collision);
        }
        if (p.y>780) rescue();
      }
      if (p.grounded) {
        p.angle=lerp(p.angle,0,clamp(6*dt,0,1));
        for(const ox of map.obstacles) if (Math.abs(p.x-ox)<17 && Math.abs(p.y+40-(floorUnder(ox)?.y||586))<55 && Math.abs(p.vx)>90 && p.jumpCooldown<=0) {
          p.vx*=.38;p.vy=-235;p.grounded=false;p.jumpCooldown=.7;p.av=-2.6;
          toast('RAIL CLIP!',.7);break;
        }
      }
    }
    if(map.chimp && updateChimp(dt)) return;
    if(map.chimp && p.x>map.width-112) complete();
    if(!map.chimp && ai && p.x>map.width-95) {
      const carryScore=p.score;
      resetRun();
      player.score=carryScore;
      player.vx=310;
      toast('NEW LINE · KEEP FLIPPING',1.1);
      updateHud();
      return;
    }
    const target=clamp(p.x-viewport*(map.chimp?.36:.32),0,Math.max(0,map.width-viewport));
    camera=lerp(camera,target,clamp(dt*5.5,0,1));
    if(Math.abs(p.vx)>135 && !p.grounded && Math.random()<dt*29) trail.push({x:p.x,y:p.y,life:.25});
    for(let i=trail.length-1;i>=0;i--) if((trail[i].life-=dt)<0)trail.splice(i,1);
    hudTimer+=dt;if(hudTimer>.09){hudTimer=0;updateHud();}
  }

  function updateChimp(dt) {
    const p=player, c=chimp;
    c.phase+=dt*9;
    const distance=p.x-c.x;
    let speed=distance>390?365:distance>180?345:328;
    if(ai) speed-=27;
    c.x+=speed*dt;
    const f=floorUnder(c.x);
    const targetY=(f?.y||598)-35;
    c.climbing = Math.abs(targetY-c.y)>25 || (Math.abs(p.x-c.x)<175 && p.y<c.y-90);
    c.y=lerp(c.y,c.climbing?Math.min(targetY,p.y+40):targetY,clamp(dt*(c.climbing?4.2:7),0,1));
    if(distance<44 && Math.abs(p.y-c.y)<93) {
      const currentScore=Math.max(0,p.score-150);
      toast('THE CHIMP CAUGHT YOU!',1.5);
      resetRun();
      player.score=currentScore;
      if (ai) {player.vx=325;chimp.x=player.x-470;}
      return true;
    }
  }

  function complete() {
    if(finished || !map.chimp)return;
    finished=true;player.vx=0;
    const score=Math.round(player.score+Math.max(0,400-(performance.now()-started)/200));
    player.score=score;
    if(score>(saved[map.id]||0)) {
      saved[map.id]=score;
      try {localStorage.setItem('noomi-flip-lab-best',JSON.stringify(saved));} catch(_){}
    }
    updateHud();
    toast('CHIMP ESCAPED!',1.8);
    if(ai){completionDelay=2.0;return;}
    $('finishKicker').textContent='YOU OUTRAN THE CHIMP';
    $('finishTitle').textContent='You escaped.';
    $('finishText').textContent='He can climb, but you can fly.';
    $('finishScore').textContent=score.toLocaleString();
    ui.finish.hidden=false;
  }

  function updateHud() {
    if(player.score>(saved[map.id]||0)){
      saved[map.id]=Math.round(player.score);
      try {localStorage.setItem('noomi-flip-lab-best',JSON.stringify(saved));} catch(_){}
    }
    $('record').textContent=`BEST ${(saved[map.id]||0).toLocaleString()}`;
    ui.score.textContent=String(Math.round(player.score)).padStart(5,'0');
    ui.combo.textContent=player.holding>=0?'BAR SWING · REGRAB':player.grounded?`COMBO ×${Math.max(1,player.combo)}`:`AIRBORNE · ${player.airTime.toFixed(1)}s`;
    $('grabButton').textContent=player.holding>=0?'LET GO':'GRAB';
    if(map.chimp){
      const dist=Math.max(0,Math.round(player.x-chimp.x));
      $('chimpDistance').textContent=`${dist}m`;
      $('threatFill').style.width=`${clamp((350-dist)/350,0,1)*100}%`;
    }
  }

  function hexToRgb(hex){return [1,3,5].map(n=>parseInt(hex.slice(n,n+2),16));}
  function mix(a,b,v){const x=hexToRgb(a),y=hexToRgb(b);return `rgb(${x.map((z,i)=>Math.round(lerp(z,y[i],v))).join(',')})`;}
  function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fill();}

  function drawBackground() {
    const night=map.id==='neon';
    const gradient=ctx.createLinearGradient(0,0,0,h);
    gradient.addColorStop(0,map.sky[0]);gradient.addColorStop(.82,map.sky[1]);gradient.addColorStop(1,night?'#80749b':'#f4e6c8');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    const scroll=camera*scale;
    if(night){
      for(let i=0;i<75;i++){
        const sx=((i*137.4-scroll*.06)%(w+70)+w+70)%(w+70)-30;
        const sy=((i*61.3)%(h*.69));
        ctx.fillStyle=`rgba(236,230,255,${.2+(i%4)*.08})`;ctx.fillRect(sx,sy,1.2,1.2);
      }
      ctx.fillStyle='#efe2bb';ctx.beginPath();ctx.arc(w*.8-scroll*.015,90,29,0,TAU);ctx.fill();
    } else {
      ctx.fillStyle='#fff8e1';ctx.globalAlpha=.75;ctx.beginPath();ctx.arc(w*.78-scroll*.016,110,44,0,TAU);ctx.fill();ctx.globalAlpha=1;
      for(let i=-1;i<12;i++){
        const sx=i*218-(scroll*.14)%218+30, sy=70+(i*43)%160;
        ctx.fillStyle='#f5f8f3a8';ctx.beginPath();ctx.ellipse(sx,sy,58,13,0,0,TAU);ctx.ellipse(sx+29,sy-9,40,14,0,0,TAU);ctx.fill();
      }
    }
    const horizon=520*scale;
    ctx.fillStyle=night?'#334b70':map.far;
    ctx.globalAlpha=.31;
    ctx.beginPath();ctx.moveTo(0,horizon);
    for(let x=0;x<=w+50;x+=45)ctx.lineTo(x,horizon-32*scale+Math.sin((x+scroll*.16)/94)*20*scale+Math.sin((x+scroll*.16)/43)*10*scale);
    ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();ctx.globalAlpha=1;
    for(let i=0;i<18;i++){
      const x=(i*146-scroll*.28)%(w+200);const sx=(x+w+200)%(w+200)-100;
      const tall=((i*29)%110+55)*scale;
      const width=(i%3===0?23:13)*scale;
      ctx.fillStyle=night?'#30436955':(map.kind==='JUNGLE'||map.chimp?'#426f5a55':'#8c9aa044');
      ctx.fillRect(sx,horizon-tall,width,tall+150*scale);
      if(map.kind==='JUNGLE'||map.chimp){
        ctx.beginPath();ctx.ellipse(sx+width/2,horizon-tall,39*scale,21*scale,0,0,TAU);ctx.fill();
      }
    }
  }

  function drawGround() {
    for(const g of map.grounds){
      if(g.b<camera-100||g.a>camera+viewport+100)continue;
      ctx.fillStyle=map.edge;ctx.fillRect(g.a,g.y+8,g.b-g.a,720-g.y);
      ctx.fillStyle=map.floor;ctx.fillRect(g.a,g.y,g.b-g.a,720-g.y);
      ctx.fillStyle=map.id==='neon'?'#ff73d7':'#fff1d6';ctx.globalAlpha=.62;ctx.fillRect(g.a,g.y,g.b-g.a,5);ctx.globalAlpha=1;
      for(let x=Math.ceil(g.a/83)*83;x<g.b;x+=83){
        ctx.fillStyle='#ffffff0e';ctx.fillRect(x,g.y+27,1,90);
        ctx.fillStyle='#2a36411b';ctx.fillRect(x+3,g.y+90,58,3);
      }
      polygon([[g.a,g.y],[g.a+14,g.y+17],[g.a+14,720],[g.a,720]],'#ffffff29');
      polygon([[g.b-13,g.y+8],[g.b,g.y],[g.b,720],[g.b-13,720]],'#21333b20');
    }
    for(const pad of map.pads){
      ctx.fillStyle='#283945';ctx.fillRect(pad.x-pad.w/2-5,pad.y-5,pad.w+10,13);
      ctx.fillStyle=map.id==='neon'?'#fb8cf0':'#f6bb55';ctx.fillRect(pad.x-pad.w/2,pad.y-12,pad.w,9);
      ctx.fillStyle='#fff6d8';for(let x=pad.x-pad.w/2+9;x<pad.x+pad.w/2;x+=16)ctx.fillRect(x,pad.y-11,5,4);
      ctx.fillStyle='#3a4849';ctx.fillRect(pad.x-pad.w/2+9,pad.y+7,4,23);ctx.fillRect(pad.x+pad.w/2-13,pad.y+7,4,23);
    }
  }

  function drawStructures() {
    const night=map.id==='neon';
    for(let i=0;i<map.bars.length;i++){
      const b=map.bars[i];if(b.x<camera-130||b.x>camera+viewport+130)continue;
      const floor=floorUnder(b.x+31)||{y:600};
      const concrete=night?'#5b6187':'#e5e7df';
      const side=night?'#333e65':'#adbab8';
      polygon([[b.x+34,b.y+3],[b.x+52,b.y-5],[b.x+52,floor.y],[b.x+34,floor.y]],side);
      ctx.fillStyle=concrete;ctx.fillRect(b.x+26,b.y+4,17,Math.max(18,floor.y-b.y));
      polygon([[b.x-37,b.y+4],[b.x-26,b.y-3],[b.x+51,b.y-5],[b.x+38,b.y+2]],night?'#f497d4':'#3d484a');
      ctx.fillStyle=night?'#ff9ae1':'#536268';ctx.fillRect(b.x-39,b.y-2,79,4);
      ctx.fillStyle=night?'#ffcaf0':'#c7d8d9';ctx.fillRect(b.x-39,b.y-3,79,1);
      ctx.fillStyle=night?'#cf6dbc':'#79898b';ctx.beginPath();ctx.arc(b.x,b.y-2,4,0,TAU);ctx.fill();
    }
    for(const x of map.obstacles){
      const floor=floorUnder(x)||{y:590};
      ctx.fillStyle=night?'#633d83':'#565b59';ctx.fillRect(x-5,floor.y-38,10,38);
      ctx.fillStyle=night?'#ff8ad3':'#e9e7d7';ctx.fillRect(x-19,floor.y-41,38,6);
      ctx.fillStyle='#ffffff89';ctx.fillRect(x-11,floor.y-36,3,14);
    }
    if(map.kind==='JUNGLE'||map.chimp){
      for(let i=0;i<16;i++){
        const x=i*170+62;if(x<camera-90||x>camera+viewport+90)continue;
        const f=floorUnder(x)||{y:610};ctx.fillStyle='#325b4d';ctx.fillRect(x,f.y-85,8,92);
        ctx.fillStyle='#648c5a';ctx.beginPath();ctx.ellipse(x-9,f.y-88,32,15,-.25,0,TAU);ctx.ellipse(x+13,f.y-99,29,16,.25,0,TAU);ctx.fill();
      }
    }
    if(map.id==='neon'){
      for(let x=90;x<map.width;x+=240){
        ctx.fillStyle='#ff81d466';ctx.fillRect(x,610,135,2);ctx.fillStyle='#ff9eea22';ctx.fillRect(x,613,135,10);
      }
    }
    if(map.chimp){
      const goal=map.width-115;
      ctx.fillStyle='#b3ffc0';ctx.globalAlpha=.24;ctx.fillRect(goal-15,250,35,400);ctx.globalAlpha=1;
      ctx.fillStyle='#fbf6df';ctx.fillRect(goal,324,6,255);
      polygon([[goal+6,326],[goal+62,341],[goal+6,356]],'#61d18c');
      ctx.font='800 15px DM Sans, sans-serif';ctx.fillStyle='#fff';ctx.fillText('ESCAPE',goal-14,309);
    }
  }

  function capsule(ax,ay,bx,by,width,base,highlight){
    ctx.strokeStyle=base;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
    ctx.strokeStyle=highlight;ctx.lineWidth=width*.23;ctx.beginPath();ctx.moveTo(ax-width*.13,ay-width*.12);ctx.lineTo(bx-width*.13,by-width*.12);ctx.stroke();
  }

  function drawPlayer() {
    const p=player;
    if(p.x<camera-90||p.x>camera+viewport+90)return;
    const f=floorUnder(p.x);
    if(f){
      const gap=clamp((f.y-p.y-40)/250,0,1);
      ctx.fillStyle=`rgba(25,41,47,${.22*(1-gap)})`;
      ctx.beginPath();ctx.ellipse(p.x+10,f.y+3,26+gap*15,6+gap*2,0,0,TAU);ctx.fill();
    }
    for(const q of trail){ctx.fillStyle=`rgba(246,245,219,${q.life*.55})`;ctx.beginPath();ctx.arc(q.x,q.y,10,0,TAU);ctx.fill();}
    const hold=p.holding>=0, spin=Math.sin(t*13), tuck=!p.grounded&&!hold&&(ai?Math.abs(p.av)>2:key.has('Space')||touch.has('tuck'));
    if(hold){
      const b=map.bars[p.holding];
      capsule(p.x-7,p.y-27,b.x-7,b.y,7,'#27383d','#647c7d');
      capsule(p.x+7,p.y-27,b.x+7,b.y,7,'#27383d','#647c7d');
      ctx.fillStyle='#27383d';ctx.beginPath();ctx.arc(b.x-7,b.y,4,0,TAU);ctx.arc(b.x+7,b.y,4,0,TAU);ctx.fill();
    }
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.fillStyle='#28353b';ctx.beginPath();ctx.ellipse(0,-11,11,22,0,0,TAU);ctx.fill();
    ctx.fillStyle='#728a8d';ctx.beginPath();ctx.ellipse(-3,-14,3,15,-.1,0,TAU);ctx.fill();
    const armTilt=hold?0:p.grounded?spin*3:p.av>0?8:-9;
    if(!hold){
      capsule(-7,-27,-19,-14+armTilt,7,'#28373c','#607478');
      capsule(-19,-14+armTilt,-31,-6+armTilt,6,'#2e4145','#7f9392');
      capsule(7,-27,18,-16-armTilt,7,'#26383c','#586b70');
      capsule(18,-16-armTilt,28,-7-armTilt,6,'#304246','#73898b');
    }
    const kneeY=tuck?4:20, footY=tuck?-5:39, stride=p.grounded?Math.sin(t*15*clamp(Math.abs(p.vx)/280,0,1))*11:0;
    capsule(-5,0,-10+stride,kneeY,10,'#26373c','#687d7c');
    capsule(-10+stride,kneeY,tuck?-24:-13-stride,footY,8,'#2c3c40','#879a96');
    capsule(5,0,10-stride,kneeY+1,10,'#26353a','#4f676b');
    capsule(10-stride,kneeY+1,tuck?23:13+stride,footY,8,'#293940','#637d7e');
    capsule(tuck?-24:-13-stride,footY,tuck?-16:-5-stride,footY+1,5,'#1a272c','#5a7072');
    capsule(tuck?23:13+stride,footY,tuck?31:22+stride,footY+1,5,'#1d2c32','#6d8585');
    ctx.fillStyle='#26343a';ctx.beginPath();ctx.arc(0,-45,10.5,0,TAU);ctx.fill();
    ctx.fillStyle='#9bafa9';ctx.beginPath();ctx.ellipse(-3,-47,2.3,5,-.2,0,TAU);ctx.fill();
    ctx.restore();
    if(ai){ctx.fillStyle='#baffd4';ctx.font='800 10px DM Sans,sans-serif';ctx.textAlign='center';ctx.fillText('✦ AI',p.x,p.y-73);ctx.textAlign='left';}
  }

  function drawChimp() {
    if(!map.chimp)return;
    const c=chimp;if(c.x<camera-100||c.x>camera+viewport+100)return;
    ctx.save();ctx.translate(c.x,c.y);const stride=Math.sin(c.phase)*10;
    ctx.fillStyle='#33302d';ctx.beginPath();ctx.ellipse(0,-9,24,18,c.climbing?-.45:0,0,TAU);ctx.fill();
    capsule(-13,-2,-26+stride,17,10,'#292723','#61574c');capsule(14,-2,28-stride,18,11,'#272521','#584d42');
    capsule(-9,-18,-31-stride,-6,11,'#2d2a25','#605143');capsule(10,-17,33+stride,-2,11,'#302b26','#67584a');
    ctx.fillStyle='#312c28';ctx.beginPath();ctx.arc(20,-25,17,0,TAU);ctx.fill();
    ctx.fillStyle='#b38d70';ctx.beginPath();ctx.ellipse(28,-19,10,8,-.2,0,TAU);ctx.fill();
    ctx.fillStyle='#d5b596';ctx.beginPath();ctx.arc(26,-29,2.4,0,TAU);ctx.fill();
    ctx.fillStyle='#f9e0aa';ctx.fillRect(26,-30,2,2);
    ctx.fillStyle='#302b27';ctx.beginPath();ctx.arc(7,-32,6,0,TAU);ctx.fill();
    ctx.restore();
    const dist=player.x-c.x;
    if(dist<280){ctx.fillStyle='#fff1d9';ctx.font='800 13px DM Sans,sans-serif';ctx.textAlign='center';ctx.fillText('!',c.x,c.y-60);ctx.textAlign='left';}
  }

  function draw() {
    if(!w||!h)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    drawBackground();
    ctx.save();ctx.scale(scale,scale);ctx.translate(-camera,0);
    drawGround();drawStructures();
    for(const s of confetti){ctx.globalAlpha=clamp(s.life*1.8,0,1);ctx.fillStyle=s.color;ctx.fillRect(s.x,s.y,s.size,s.size);}ctx.globalAlpha=1;
    drawChimp();drawPlayer();
    ctx.restore();
  }

  function frame(now) {
    if(!last)last=now;
    accumulator+=Math.min((now-last)/1000,.05);last=now;
    let steps=0;
    while(accumulator>=1/120&&steps++<6){update(1/120);accumulator-=1/120;}
    draw();requestAnimationFrame(frame);
  }

  function bindEvents() {
    $('mapButton').addEventListener('click',openMenu);
    $('closeMenu').addEventListener('click',closeMenu);
    $('playButton').addEventListener('click',closeMenu);
    $('aiButton').addEventListener('click',()=>setAI(!ai));
    $('resetButton').addEventListener('click',()=>resetRun(true));
    $('retryButton').addEventListener('click',()=>resetRun(true));
    $('nextButton').addEventListener('click',openMenu);
    document.addEventListener('keydown',e=>{
      const block=['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyS','KeyR','Escape'];
      if(block.includes(e.code))e.preventDefault();
      if(e.repeat)return;
      if(e.code==='KeyR'){resetRun(true);return;}
      if(e.code==='Escape'){menuOpen?closeMenu():openMenu();return;}
      if(e.code==='ArrowUp'){grabAction();return;}
      key.add(e.code);
    });
    document.addEventListener('keyup',e=>key.delete(e.code));
    window.addEventListener('blur',()=>{key.clear();touch.clear();document.querySelectorAll('[data-control]').forEach(el=>el.classList.remove('down'));});
    for(const el of document.querySelectorAll('[data-control]')){
      const action=el.dataset.control;
      el.addEventListener('pointerdown',e=>{
        e.preventDefault();el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        if(action==='grab')grabAction();else touch.add(action);
      });
      const up=e=>{e.preventDefault();touch.delete(action);el.classList.remove('down');};
      el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);
    }
    window.addEventListener('resize',resize);
    document.addEventListener('visibilitychange',()=>{last=0;accumulator=0;});
  }

  populateMaps(); bindEvents(); resize();
  const hash=location.hash.slice(1);
  selectMap(Math.max(0,maps.findIndex(m=>m.id===hash)));
  requestAnimationFrame(frame);
})();
