"""Real Chromium/WebGL checks for the local GitHub Pages build.

Run a static server first, then: python tests/browser_smoke.py
Optional: BOBS_BASE_URL=http://127.0.0.1:8000/ BOBS_SHOTS=/tmp/bobs-qa
The test intentionally observes real animation frames and clicks the public UI.
"""

import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright


BASE = os.environ.get("BOBS_BASE_URL", "http://127.0.0.1:8000/").rstrip("/") + "/"
SHOTS = Path(os.environ.get("BOBS_SHOTS", "/workspace/scratch"))
SHOTS.mkdir(parents=True, exist_ok=True)


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def sim_time(page):
    return page.evaluate("window.bobsBath.simulation.time")


def wait_frames(page, count=6):
    # Software WebGL can render slowly in CI. Equal real animation-frame
    # windows verify the speed multiplier without assuming a hardware GPU.
    page.evaluate("""count => new Promise(resolve => {
      function next() { if (--count <= 0) resolve(); else requestAnimationFrame(next); }
      requestAnimationFrame(next);
    })""", count)


def observe_progress(page, before):
    return page.evaluate("""before => new Promise(resolve => {
      let frames = 0;
      function next() {
        ++frames;
        if (window.bobsBath.simulation.time - before >= .4 || frames > 180) resolve(frames);
        else requestAnimationFrame(next);
      }
      requestAnimationFrame(next);
    })""", before)


def record_failures(page, errors):
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("requestfailed", lambda request: errors.append(f"{request.url}: {request.failure}"))


def ready(page):
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_function("window.bobsBath?.ready === true", timeout=40000)
    check(page.locator("#boot-error").is_hidden(), "Boot error is visible")
    check(page.locator("#start-button").is_enabled(), "Start button is disabled")
    check(page.locator("#scene canvas").count() == 1, "Missing 3D canvas")
    gl = page.evaluate("""() => {
      const renderer = window.bobsBath.renderer.renderer;
      const gl = renderer.getContext();
      return { lost: gl.isContextLost(), triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
    }""")
    check(not gl["lost"], "WebGL context was lost")
    check(gl["triangles"] > 1000 and gl["calls"] > 10, "WebGL did not draw the house geometry")
    return gl


def paused_time_stays_still(page):
    page.wait_for_timeout(200)
    before = sim_time(page)
    page.wait_for_timeout(700)
    check(sim_time(page) == before, "Simulation continued while paused")


def screenshot(page, filename):
    path = SHOTS / filename
    page.screenshot(path=str(path))
    # Inspect a region clear of text/panels. A blank WebGL scene has almost no
    # pixel variation, even if the canvas itself initialized successfully.
    with Image.open(path) as shot:
        w, h = shot.size
        center = shot.crop((int(w * .34), int(h * .31), int(w * .72), int(h * .70))).convert("RGB")
        check(max(ImageStat.Stat(center).stddev) > 4, "Rendered scene appears blank")
        check(len(center.getcolors(center.width * center.height)) > 100, "Rendered scene lacks geometry detail")
    return str(path)


def terminal_flows(page):
    outcomes = []
    for seed, expected, title in [(2, "escaped", "The door opened."), (1, "lost", "The house kept its guest.")]:
        if outcomes:
            page.locator("#restart-button").click()
            page.locator("#pause-button").click()
        outcome = page.evaluate("""seed => {
          const sim = window.bobsBath.simulation;
          sim.reset(seed);
          for (let second = 0; second < 1800 && sim.status === 'running'; ++second) sim.update(1);
          return {seed, status: sim.status, time: sim.time, lives: sim.survivor.lives,
            items: sim.items.filter(item => item.collected).length};
        }""", seed)
        check(outcome["status"] == expected, f"Natural terminal outcome changed for seed {seed}: {outcome}")
        page.locator("#result").wait_for(state="visible", timeout=30000)
        check(page.locator("#result-title").inner_text() == title, f"Incorrect {expected} result title")
        check(page.locator("#result-stats > div").count() == 3, "Result statistics did not render")
        page.screenshot(path=str(SHOTS / f"bobs-{expected}.png"))
        page.locator("#inspect-button").click()
        check(page.locator("#result").is_hidden(), "Inspect did not dismiss the terminal dialog")
        before = sim_time(page)
        wait_frames(page, 2)
        check(sim_time(page) == before, "Finished simulation kept advancing while inspecting")
        outcomes.append(outcome)

    # The result's new-attempt button also resets the entire simulation.
    page.locator("#restart-button").click()
    page.locator("#pause-button").click()
    page.evaluate("""() => {
      const sim = window.bobsBath.simulation; sim.reset(1);
      for (let i = 0; i < 1800 && sim.status === 'running'; ++i) sim.update(1);
    }""")
    page.locator("#result").wait_for(state="visible", timeout=30000)
    page.locator("#again-button").click()
    page.locator("#pause-button").click()
    check(page.locator("#result").is_hidden(), "New attempt left the result dialog visible")
    check(page.evaluate("window.bobsBath.simulation.status") == "running", "New attempt did not resume a fresh simulation")
    check(page.evaluate("window.bobsBath.simulation.survivor.lives") == 3, "New attempt did not reset lives")
    return outcomes


def quality_controls(page):
    states = {}
    for mode, cap, shadows in [("low", .7, False), ("high", 2, True), ("auto", 1, True)]:
        page.locator("#quality").select_option(mode)
        state = page.evaluate("""() => ({ selected: window.bobsBath.renderer.quality,
          ratio: window.bobsBath.renderer.renderer.getPixelRatio(),
          shadows: window.bobsBath.renderer.renderer.shadowMap.enabled,
          deviceRatio: devicePixelRatio, width: innerWidth })""")
        expected_cap = 1.25 if mode == "auto" and state["width"] < 760 else cap
        check(state["selected"] == mode, f"Graphics selection did not apply: {mode}")
        check(abs(state["ratio"] - min(state["deviceRatio"], expected_cap)) < .01, f"Incorrect {mode} drawing resolution: {state}")
        check(state["shadows"] == shadows, f"Incorrect {mode} shadows: {state}")
        states[mode] = state
    return states


def desktop(browser):
    errors = []
    page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
    record_failures(page, errors)
    gl = ready(page)
    intro_shot = screenshot(page, "bobs-intro.png")
    check(sim_time(page) == 0, "Simulation advanced before start")
    page.locator("#start-button").click()
    page.wait_for_function("window.bobsBath.simulation.time > 0.3")
    check(page.locator("#intro").is_hidden() and page.locator(".session-heading").is_visible(), "Start did not show observation UI")
    initial_position = page.evaluate("({x: window.bobsBath.simulation.survivor.x, z: window.bobsBath.simulation.survivor.z})")
    before = sim_time(page)
    observation_frames = observe_progress(page, before)
    one_x = sim_time(page) - before
    check(one_x > 0.2, "Autonomous simulation did not progress")
    now = page.evaluate("({x: window.bobsBath.simulation.survivor.x, z: window.bobsBath.simulation.survivor.z})")
    check(now != initial_position, "Survivor NPC did not move")
    page.locator("#sound-button").click()
    page.wait_for_function("document.getElementById('sound-button').getAttribute('aria-pressed') === 'true'")
    check(page.locator("#sound-button").is_enabled(), "House audio failed to initialize")
    page.locator("#sound-button").click()
    page.wait_for_function("document.getElementById('sound-button').getAttribute('aria-pressed') === 'false'")
    page.locator("#pause-button").click()
    check(page.evaluate("window.bobsBath.paused"), "Pause did not toggle")
    paused_time_stays_still(page)

    for mode in ["survivor", "monster", "overview"]:
        page.locator(f'[data-camera="{mode}"]').click()
        check(page.locator(f'[data-camera="{mode}"]').get_attribute("aria-pressed") == "true", f"{mode} camera selection failed")
        check(page.evaluate("window.bobsBath.renderer.cameraMode") == mode, "Renderer camera did not change")

    page.locator("#perception-button").click()
    page.wait_for_function("window.bobsBath.renderer.perceptionGroup.visible")
    check(page.locator("#perception-button").get_attribute("aria-pressed") == "true", "Senses did not toggle on")
    check(page.evaluate("window.bobsBath.renderer.perceptionGroup.visible"), "Senses did not display sight cone")
    page.locator("#perception-button").click()
    page.wait_for_function("!window.bobsBath.renderer.perceptionGroup.visible")
    check(not page.evaluate("window.bobsBath.renderer.perceptionGroup.visible"), "Senses did not toggle off")

    # Field guide preserves the previous paused/running state.
    page.locator("#help-button").click()
    check(page.locator("#help").is_visible(), "Field guide did not open")
    check(page.evaluate("window.bobsBath.paused"), "Field guide did not pause")
    graphics = quality_controls(page)
    page.keyboard.press("Escape")
    check(page.locator("#help").is_hidden(), "Escape did not close field guide")
    check(page.evaluate("window.bobsBath.paused"), "Closing guide changed previously paused state")
    page.locator("#pause-button").click()
    page.locator("#help-button").click()
    paused_time_stays_still(page)
    page.locator("#close-help").click()
    check(not page.evaluate("window.bobsBath.paused"), "Closing guide did not restore running state")

    page.locator("#speed").select_option("4")
    before = sim_time(page)
    wait_frames(page, observation_frames)
    four_x = sim_time(page) - before
    check(four_x > one_x * 2, f"4x speed not effective: 1x={one_x}, 4x={four_x}")

    # A prior run may have collected items by the time the browser reaches this
    # action. Reset should always reset lives, objects, time and random seed.
    old_seed = page.evaluate("window.bobsBath.simulation.seed")
    page.locator("#restart-button").click()
    page.locator("#pause-button").click()
    reset = page.evaluate("window.bobsBath.simulation.snapshot()")
    check(reset["seed"] != old_seed, "Restart reused the previous seed")
    check(reset["time"] < 2, "Restart did not reset elapsed time")
    check(reset["survivor"]["lives"] == 3 and not any(i["collected"] for i in reset["items"]), "Restart did not reset lives/items")
    check(page.locator("#result").is_hidden(), "Restart left a result modal open")
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Desktop horizontal overflow")
    desktop_shot = screenshot(page, "bobs-desktop.png")
    print("Desktop controls, rendered pixels, audio, and reset passed.", flush=True)

    # Keyboard pause and camera cycle use the same controls.
    page.locator("#scene").click(position={"x": 700, "y": 400})
    page.keyboard.press("c")
    check(page.evaluate("window.bobsBath.renderer.cameraMode") == "survivor", "C did not cycle cameras")
    page.keyboard.press("Space")
    check(not page.evaluate("window.bobsBath.paused"), "Space did not resume")
    page.keyboard.press("Space")
    check(page.evaluate("window.bobsBath.paused"), "Space did not pause")
    terminal = terminal_flows(page)
    print("Natural escaped/lost result dialogs passed.", flush=True)
    check(not errors, f"Desktop browser errors: {errors}")
    page.close()
    return {"webgl": gl, "one_x_elapsed": one_x, "four_x_elapsed": four_x, "intro_screenshot": intro_shot, "screenshot": desktop_shot, "terminal": terminal, "graphics": graphics, "errors": errors}


def mobile(browser):
    errors = []
    context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1,
                                  is_mobile=True, has_touch=True)
    page = context.new_page()
    record_failures(page, errors)
    gl = ready(page)
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Intro has horizontal overflow on phone")
    page.locator("#start-button").tap()
    page.wait_for_function("window.bobsBath.simulation.time > 0.2")
    page.locator("#pause-button").tap()
    paused_time_stays_still(page)
    for mode in ["survivor", "monster", "overview"]:
        page.locator(f'[data-camera="{mode}"]').tap()
        check(page.locator(f'[data-camera="{mode}"]').get_attribute("aria-pressed") == "true", f"Phone {mode} camera control failed")
    page.locator("#perception-button").tap()
    page.wait_for_function("window.bobsBath.renderer.perceptionGroup.visible")
    check(page.evaluate("window.bobsBath.renderer.perceptionGroup.visible"), "Phone Senses failed")
    page.locator("#speed").select_option("4")
    check(page.locator("#speed").input_value() == "4", "Phone speed control failed")
    page.locator("#help-button").tap()
    check(page.locator("#help").is_visible(), "Phone guide did not open")
    page.locator("#close-help").tap()
    check(page.evaluate("window.bobsBath.paused"), "Phone guide failed to preserve pause")
    bounds = page.locator(".camera-toolbar").bounding_box()
    check(bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 390, "Phone toolbar is offscreen")
    for selector in ["#pause-button", "#speed", "#perception-button", "#restart-button"]:
        box = page.locator(selector).bounding_box()
        check(box and box["x"] >= 0 and box["x"] + box["width"] <= 390 and box["y"] + box["height"] <= 844, f"Phone control offscreen: {selector}")
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Game has horizontal overflow on phone")
    mobile_shot = screenshot(page, "bobs-mobile.png")
    page.locator('[data-camera="survivor"]').tap()
    wait_frames(page, 8)
    page.screenshot(path=str(SHOTS / "bobs-mobile-follow.png"))
    old_seed = page.evaluate("window.bobsBath.simulation.seed")
    page.locator("#restart-button").tap()
    check(page.evaluate("window.bobsBath.simulation.seed") != old_seed, "Phone restart did not change seed")
    check(not errors, f"Phone browser errors: {errors}")
    print("Phone controls, rendering, overflow, and restart passed.", flush=True)
    context.close()
    return {"webgl": gl, "toolbar": bounds, "screenshot": mobile_shot, "errors": errors}


def old_paths(browser):
    page = browser.new_page()
    paths = {}
    for path, expected in [("meridian/", "Meridian"), ("appeals/", "LATCH")]:
        response = page.request.get(BASE + path)
        check(response.ok, f"Preserved game path failed: {path}")
        check(expected.lower() in response.text().lower(), f"Unexpected content at {path}")
        paths[path] = response.status
    page.close()
    return paths


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM", "/usr/bin/chromium"), headless=True,
                                    args=["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--disable-dev-shm-usage"])
        if "--quality-only" in sys.argv:
            page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
            errors = []
            record_failures(page, errors)
            ready(page)
            page.locator("#help-button").click()
            report = {"base_url": BASE, "graphics": quality_controls(page)}
            page.locator("#close-help").click()
            page.locator("#start-button").click()
            page.wait_for_function("window.bobsBath.simulation.time > .2")
            page.locator("#pause-button").click()
            screenshot(page, "bobs-final-desktop.png")
            check(not errors, f"Graphics browser errors: {errors}")
            report["errors"] = errors
            report_name = "bobs-graphics-report.json"
        else:
            report = {"base_url": BASE, "desktop": desktop(browser), "mobile": mobile(browser), "preserved_paths": old_paths(browser)}
            report_name = "bobs-browser-report.json"
        browser.close()
        (SHOTS / report_name).write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
