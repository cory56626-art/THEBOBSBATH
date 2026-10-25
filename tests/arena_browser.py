"""Arena integration checks. Start npm run serve, then python tests/arena_browser.py.
ARENA_BASE_URL may point to GitHub Pages for a deployed smoke test.
"""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.getenv('ARENA_BASE_URL','http://localhost:8000/')
SHOTS=Path(os.getenv('ARENA_SHOTS','/workspace/scratch'));SHOTS.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('window.__arena?.sim',timeout=60000)
 assert page.locator('#launch').is_enabled()
 page.screenshot(path=str(SHOTS/'arena-desktop.png'))
 page.click('#guide-open');assert page.locator('#guide').is_visible();page.click('[data-close="guide"]')
 page.click('#settings-open');page.select_option('#graphics','low');page.uncheck('#military');page.click('[data-close="settings"]')
 page.wait_for_function('__arena.sim.options.military===false')
 page.click('#launch');page.wait_for_function('__arena.sim.elapsed>0.03');page.click('#pause')
 before=page.evaluate('__arena.sim.elapsed');page.wait_for_timeout(350);assert page.evaluate('__arena.sim.elapsed')==before
 page.evaluate('for(let i=0;i<900;i++)__arena.sim.step(1/30);__arena.step(0)')
 assert page.evaluate('__arena.sim.elapsed')>29
 assert page.evaluate('__arena.sim.fighters.some(f=>f.health<f.maxHealth)')
 assert page.evaluate('__arena.sim.world.bodies.every(b=>Number.isFinite(b.position.x+b.position.y+b.position.z))')
 page.screenshot(path=str(SHOTS/'arena-combat.png'))
 page.click('#back');page.click('[data-enemy="venom"]');page.select_option('#arena','grass');page.click('#launch');page.click('#pause')
 assert page.evaluate('__arena.sim.options.enemy')=='venom'
 assert page.evaluate('__arena.sim.options.arena')=='grass'
 page.evaluate('for(let i=0;i<180;i++)__arena.sim.step(1/30);__arena.step(0)')
 page.screenshot(path=str(SHOTS/'arena-grass.png'))
 page.click('#back');page.click('[data-enemy="ultron"]');page.click('#launch');page.click('#pause')
 assert page.evaluate('__arena.sim.options.networkTransfer') is True
 page.evaluate('for(let i=0;i<300;i++)__arena.sim.step(1/30);__arena.step(0)')
 assert page.evaluate('__arena.sim.fighters[1].type')=='ultron'
 page.click('#restart');assert page.evaluate('__arena.sim.elapsed')<1
 page.click('#back');page.set_viewport_size({'width':390,'height':844})
 page.wait_for_timeout(350);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('#launch').is_visible();assert page.locator('[data-enemy="ultron"]').is_visible()
 page.screenshot(path=str(SHOTS/'arena-mobile.png'))
 page.click('#launch');page.click('#pause');assert page.locator('#back').is_visible()
 page.screenshot(path=str(SHOTS/'arena-mobile-combat.png'))
 print(json.dumps({'status':'passed','errors':errors,'calls':page.evaluate('__arena.renderer.info.render.calls'),'bodies':page.evaluate('__arena.sim.world.bodies.length')}))
 assert not errors,errors
 browser.close()
