"""Inline text editing must preserve the user-controlled Canvas viewport."""
import asyncio
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
TEXT = "Text fixture \U0001f642\u200d\u2195\ufe0f"


async def check(browser, width, theme):
    context = await browser.new_context(
        viewport={"width": width, "height": 960},
        permissions=["clipboard-read", "clipboard-write"],
    )
    page = await context.new_page()
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    workflow = {
        "id": "text-viewport-test", "name": "Text viewport fixture", "revision": 1,
        "ownerUserId": "fixture", "isTemplate": False,
        "createdAt": "2026-10-30T00:00:00Z", "updatedAt": "2026-10-30T00:00:00Z",
        "graph": {
            "nodes": [{"id": key, "type": "input.text", "version": 1, "label": label,
                       "position": {"x": x, "y": 100}, "config": {"text": TEXT}}
                      for key, label, x in [("a", "Alpha", 80), ("b", "Beta", 480)]],
            "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 0.6},
        },
    }
    errors, violations, saves = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def intercept(route):
        nonlocal workflow
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE).netloc:
            violations.append(request.url)
            await route.abort()
            return
        if not parsed.path.startswith("/api/"):
            await route.continue_()
            return
        payload = {}
        if parsed.path == "/api/canvas/workflows":
            payload = {"workflows": [workflow]}
        elif parsed.path == "/api/canvas/workflows/text-viewport-test":
            if request.method == "PATCH":
                saves.append(request.post_data_json)
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
            payload = {"workflow": workflow}
        elif parsed.path == "/api/canvas/runs":
            payload = {"runs": [], "latestNodeAttempts": [], "latestSuccessfulNodeRuns": []}
        elif parsed.path == "/api/canvas/schedules":
            payload = {"schedules": []}
        elif request.method != "GET":
            violations.append(f"{request.method} {parsed.path}")
        await route.fulfill(json=payload)
        if request.method == "PATCH":
            await page.evaluate("text => { window.savedFixtureText = text; }", workflow["graph"]["nodes"][0]["config"]["text"])

    await page.route("**/*", intercept)
    await page.goto(BASE + "/canvas?workflowId=text-viewport-test", wait_until="networkidle")
    stage = page.get_by_test_id("canvas-stage")
    viewport = stage.locator(".react-flow__viewport")
    a = stage.locator('.react-flow__node[data-id="a"] .canvas-node-text-editor')
    b = stage.locator('.react-flow__node[data-id="b"] .canvas-node-text-editor')
    await expect(a).to_be_visible()
    if width > 820:
        toggle = page.locator(".canvas-palette-toggle")
        if await toggle.get_attribute("aria-pressed") == "true":
            await toggle.click()
    await stage.locator(".react-flow__controls-fitview").click()
    # Mobile overview zoom intentionally hides unselected editors; stay above it.
    if width > 820:
        await stage.locator(".react-flow__controls-zoomout").click()
        await stage.locator(".react-flow__controls-zoomout").click()
    else:
        await stage.locator(".react-flow__controls-zoomin").click()
    await page.wait_for_timeout(400)

    async def transform():
        return await viewport.evaluate("element => element.style.transform")

    # Track every transform mutation, including a transient fit animation.
    await viewport.evaluate("""element => {
        window.textViewportChanges = [];
        new MutationObserver(() => window.textViewportChanges.push(element.style.transform))
            .observe(element, {attributes: true, attributeFilter: ['style']});
    }""")

    async def assert_stable(action):
        expected = await transform()
        await page.evaluate("window.textViewportChanges = []")
        await action()
        await page.wait_for_timeout(350)
        assert await transform() == expected, (theme, width, "viewport moved")
        assert all(value == expected for value in await page.evaluate("window.textViewportChanges")), "transient viewport movement"

    async def close_inspector():
        await page.get_by_role("button", name="关闭属性", exact=True).click()
        await expect(page.locator(".canvas-inspector")).to_have_count(0)

    await assert_stable(lambda: a.click())
    await expect(stage.locator('.react-flow__node[data-id="a"]')).to_have_class(re.compile(r"\bselected\b"))
    await expect(page.locator(".canvas-inspector input").first).to_have_value("Alpha")
    await assert_stable(lambda: a.press("End"))
    await assert_stable(lambda: a.press("Enter"))
    await assert_stable(lambda: a.press_sequentially("typed", delay=50))
    await close_inspector()
    await assert_stable(lambda: a.click())
    await assert_stable(lambda: a.press("Control+End"))
    await assert_stable(lambda: a.press("ArrowLeft"))
    await assert_stable(lambda: a.press("End"))
    await page.evaluate("navigator.clipboard.writeText(' pasted \u2728')")
    await assert_stable(lambda: a.press("Control+v"))
    edited = await a.input_value()
    assert "typed" in edited and "pasted \u2728" in edited, edited
    assert TEXT in edited, edited
    await close_inspector()
    await assert_stable(lambda: b.click())
    await expect(page.locator(".canvas-inspector input").first).to_have_value("Beta")
    await close_inspector()
    await expect(a).to_be_visible()
    await a.blur()
    await assert_stable(lambda: a.focus())
    await expect(page.locator(".canvas-inspector input").first).to_have_value("Alpha")
    await page.wait_for_function("text => window.savedFixtureText === text", arg=edited)
    assert saves, "editing was not saved"
    assert workflow["graph"]["nodes"][0]["config"]["text"] == edited
    await close_inspector()

    before_zoom = await transform()
    await stage.locator(".react-flow__controls-zoomin").click()
    await page.wait_for_function("old => document.querySelector('.canvas-stage .react-flow__viewport').style.transform !== old", arg=before_zoom)
    await page.wait_for_timeout(400)
    before_pan = await transform()
    bounds = await stage.bounding_box()
    x, y = bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] - 110
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 35, y - 35, steps=8)
    await page.mouse.up()
    assert await transform() != before_pan, "manual pan stopped working"
    before_fit = await transform()
    await stage.locator(".react-flow__controls-fitview").click()
    await page.wait_for_function("old => document.querySelector('.canvas-stage .react-flow__viewport').style.transform !== old", arg=before_fit)
    await page.screenshot(path=f"test-artifacts/canvas-text-viewport-{theme}-{width}.png")
    await page.reload(wait_until="networkidle")
    await expect(a).to_have_value(edited)
    assert not errors, errors
    assert not violations, violations
    print(f"PASS text viewport: {theme} {width}", flush=True)
    await context.close()


async def main():
    parsed = urlparse(BASE)
    if parsed.hostname not in ["127.0.0.1", "localhost", "::1"] or parsed.port in [None, 3001]:
        raise RuntimeError("Use an isolated worker-disabled loopback server, never port 3001")
    Path("test-artifacts").mkdir(exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ["professional", "editorial", "creator"]:
                for width in [1440, 390]:
                    await check(browser, width, theme)
        finally:
            await browser.close()


asyncio.run(main())
