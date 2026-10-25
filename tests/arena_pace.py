"""Wall-clock, autonomous spectacle and rendered browser acceptance checks.
Run a server first. ARENA_BASE_URL overrides localhost; screenshots stay outside repo.
"""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.getenv('ARENA_BASE_URL','http://localhost:8000/')
shots=Path(os.getenv('ARENA_SHOTS','/workspace/scratch'));shots.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1100,'height':740},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('window.__arena?.sim',timeout=60000)
 results=[]
 for enemy in ['hulk','venom','ultron']:
  if enemy!='hulk':
   page.click('#back');page.click('[data-enemy="'+enemy+'"]')
  page.click('#launch')
  page.evaluate('''() => {
   window.__pace={peak:0,effects:new Set(),frames:0,now:performance.now()};
   function sample(){if(!__arena.started)return;__pace.frames++;
    for(const f of __arena.sim.fighters)__pace.peak=Math.max(__pace.peak,f.parts.torso.body.velocity.length());
    for(const e of __arena.sim.effects)__pace.effects.add(e.type);
    window.__paceRaf=requestAnimationFrame(sample);
   }sample();
  }''')
  page.wait_for_timeout(14000)
  result=page.evaluate('''() => ({enemy:__arena.sim.options.enemy,
    wall:(performance.now()-__pace.now)/1000,elapsed:__arena.sim.elapsed,
    peakSpeed:__pace.peak,effects:[...__pace.effects],frames:__pace.frames,
    brokenFacades:__arena.sim.props.filter(p=>p.kind==='building'&&p.damageVersion>0).length,
    renderCalls:__arena.renderer.info.render.calls,
    finite:__arena.sim.world.bodies.every(b=>Number.isFinite(b.position.x+b.position.y+b.position.z)),
    telemetry:__arena.timing,events:__arena.sim.events.slice(0,8)})''')
  page.click('#pause');page.evaluate('cancelAnimationFrame(window.__paceRaf)')
  page.screenshot(path=str(shots/f'combat-v2-{enemy}.png'))
  print(json.dumps(result),flush=True);results.append(result)
  assert result['finite']
  assert result['elapsed']/result['wall']>.7,'Rendering must not slow the 1x simulation clock'
  assert result['peakSpeed']>9,'Combat should produce substantial physical launches'
  assert any(t in result['effects'] for t in ['explosion','shockwave','landing','launch'])
 assert not errors,errors
 print(json.dumps({'status':'passed','errors':errors}),flush=True)
 browser.close()
