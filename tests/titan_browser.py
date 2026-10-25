"""Rendered controls, hero switching, Titan systems and flood integration."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.getenv('ARENA_BASE_URL','http://localhost:8000/')
shots=Path('/workspace/scratch');shots.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1200,'height':820});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.goto(base,wait_until='domcontentloaded');page.wait_for_function('window.__arena?.sim',timeout=60000)
 assert page.locator('[data-hero]').count()==2
 page.click('[data-hero="titan"]');page.wait_for_function('__arena.sim.fighters[0].type==="titan"')
 assert page.locator('#support-name').inner_text()=='SUNDAY UPLINK'
 assert page.evaluate('__arena.sim.fighters[0].missiles.L+__arena.sim.fighters[0].missiles.R')==30
 assert page.locator('[data-ability="gas"]').count()==0
 page.click('[data-enemy="ultron"]')
 page.evaluate('for(const f of __arena.sim.fighters)f.decision=999')
 page.click('#launch');page.click('[data-ability="missiles"]');page.wait_for_function('__arena.sim.stats.missilesFired>0')
 page.click('#pause');page.evaluate('for(let i=0;i<60;i++)__arena.step(1/60)')
 assert page.evaluate('__arena.sim.fighters[0].missiles.L+__arena.sim.fighters[0].missiles.R')<30
 page.screenshot(path=str(shots/'titan-missiles.png'))
 page.click('#pause');page.click('[data-ability="flight"]');page.wait_for_function('__arena.sim.fighters[0].flight>__arena.sim.elapsed')
 page.click('#pause');page.evaluate('for(let i=0;i<300;i++)__arena.step(1/60)')
 assert page.evaluate('__arena.sim.fighters[0].flight>__arena.sim.elapsed')
 page.click('#pause');page.click('[data-ability="flight"]');page.wait_for_function('__arena.sim.fighters[0].flight===0')
 page.click('#pause');page.locator('.extra-systems summary').click();assert page.locator('[data-ability="stealth"]').is_visible()
 page.screenshot(path=str(shots/'titan-systems.png'))
 page.click('#back');page.click('#settings-open');page.select_option('#water-depth','2.4');page.click('[data-close="settings"]')
 page.wait_for_function('__arena.sim.options.waterDepth===2.4')
 page.evaluate('for(const f of __arena.sim.fighters)f.decision=999')
 page.click('#launch');page.click('#pause');page.evaluate('for(let i=0;i<480;i++)__arena.step(1/60)')
 assert page.evaluate('__arena.sim.fighters[0].waterExposure')>0
 assert page.evaluate('__arena.scene.children.some(o=>o.name.includes("water")||o.name.includes("flood"))')
 page.screenshot(path=str(shots/'titan-flood.png'))
 page.click('#back');page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(shots/'titan-mobile-v3.png'))
 page.click('[data-hero="buster"]');page.wait_for_function('__arena.sim.fighters[0].type==="buster"')
 assert page.locator('[data-ability="gas"]').count()==1
 assert page.locator('#support-name').inner_text()=='VERONICA UPLINK'
 print(json.dumps({'status':'passed','errors':errors,'calls':page.evaluate('__arena.renderer.info.render.calls')}),flush=True)
 assert not errors,errors
 browser.close()
