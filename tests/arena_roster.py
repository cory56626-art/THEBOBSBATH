"""Rendered integration checks for the six-opponent balance update."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.getenv('ARENA_BASE_URL','http://localhost:8000/')
shots=Path('/workspace/scratch');shots.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1200,'height':820});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.goto(base,wait_until='domcontentloaded');page.wait_for_function('window.__arena?.sim',timeout=60000)
 assert page.locator('[data-enemy]').count()==6
 for enemy in ['carnage','thing','wolverine']:
  page.click(f'[data-enemy="{enemy}"]');page.wait_for_function('(type)=>__arena.sim.options.enemy===type',arg=enemy)
  assert page.evaluate('__arena.sim.fighters[1].type')==enemy
  page.screenshot(path=str(shots/f'roster-{enemy}.png'))
  page.evaluate('for(const f of __arena.sim.fighters)f.decision=999')
  page.click('#launch');page.click('[data-ability="flight"]')
  page.wait_for_function('__arena.sim.fighters[0].flight>__arena.sim.elapsed',timeout=5000)
  assert page.evaluate('__arena.sim.fighters[0].flightMaxDuration')==2.8
  page.click('#pause')
  page.evaluate('for(let i=0;i<150;i++)__arena.sim.step(1/30);__arena.step(0)')
  assert page.evaluate('__arena.sim.fighters[0].flight')==0
  page.click('#back')
 page.click('[data-enemy="hulk"]')
 page.evaluate('''() => {for(const f of __arena.sim.fighters)f.decision=999;const h=__arena.sim.fighters[1];for(const p of Object.values(h.parts))p.body.position.x-=9;__arena.sim.random=()=>0;}''')
 page.click('#launch');page.click('[data-ability="gas"]')
 page.wait_for_function('__arena.sim.stats.gasSuccesses===1')
 page.click('#pause');page.screenshot(path=str(shots/'roster-gas.png'))
 page.click('#back');page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('[data-enemy="wolverine"]').is_visible()
 page.screenshot(path=str(shots/'roster-mobile.png'))
 page.click('#launch');page.click('#pause')
 assert page.locator('[data-ability="gas"]').is_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(shots/'roster-mobile-combat.png'))
 print(json.dumps({'status':'passed','errors':errors,'calls':page.evaluate('__arena.renderer.info.render.calls')}),flush=True)
 assert not errors,errors
 b.close()
