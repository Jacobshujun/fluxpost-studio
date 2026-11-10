"""Switch Any controls, dynamic handles and persistence with isolated API fixtures."""
import asyncio
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")


async def check(browser, width, theme):
    page = await browser.new_page(viewport={"width": width, "height": 1000})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    source = {"id": "source", "type": "input.text", "version": 1,
              "position": {"x": 30, "y": 30}, "config": {"text": "fixture"}}
    concat = {"id": "switch", "type": "utility.switch-any", "version": 1,
              "position": {"x": 360, "y": 30}, "config": {"index": 0}}
    workflow = {"id": "fixture", "name": "Switch Any", "revision": 1, "ownerUserId": "fixture",
                "createdAt": "2026-11-06T00:00:00Z", "updatedAt": "2026-11-06T00:00:00Z",
                "graph": {"nodes": [source, concat], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 0.8}}}
    errors, violations = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def intercept(route):
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
        elif parsed.path == "/api/canvas/workflows/fixture":
            if request.method == "PATCH":
                workflow.update(request.post_data_json)
                workflow["revision"] += 1
            payload = {"workflow": workflow}
        elif parsed.path == "/api/canvas/runs":
            payload = {"runs": [], "latestNodeAttempts": [], "latestSuccessfulNodeRuns": []}
        elif parsed.path == "/api/canvas/schedules":
            payload = {"schedules": []}
        if request.method != "GET" and not (request.method == "PATCH" and parsed.path == "/api/canvas/workflows/fixture"):
            violations.append(f"{request.method} {parsed.path}")
        await route.fulfill(json=payload)

    await page.route("**/*", intercept)
    await page.goto(BASE + "/canvas?workflowId=fixture", wait_until="networkidle")
    outer = page.locator('.react-flow__node[data-id="switch"]')
    handles = outer.locator('.react-flow__handle.target')
    control = outer.get_by_role("spinbutton", name="Switch Any index")
    plus = outer.get_by_role("button", name="增大 index")
    minus = outer.get_by_role("button", name="减小 index")
    await expect(handles).to_have_count(2)
    await expect(control).to_have_value("0")
    await expect(minus).to_be_disabled()
    await plus.click()
    await expect(control).to_have_value("1")
    await minus.click()
    await expect(control).to_have_value("0")
    await control.fill("3")
    await expect(control).to_have_value("3")
    # Editing keys must not delete the selected node or trigger Canvas undo.
    await control.press("Control+a")
    await control.press("Backspace")
    await expect(outer).to_have_count(1)
    await expect(control).to_have_attribute("aria-invalid", "true")
    await control.fill("0")
    await control.blur()

    if width == 1440:
        for index in range(5):
            start_box = await page.locator('.react-flow__node[data-id="source"] .react-flow__handle.source').bounding_box()
            end_box = await outer.locator(f'.react-flow__handle.target[data-handleid="value{index}"]').bounding_box()
            await page.mouse.move(start_box["x"] + start_box["width"] / 2, start_box["y"] + start_box["height"] / 2)
            await page.mouse.down()
            await page.mouse.move(end_box["x"] + end_box["width"] / 2, end_box["y"] + end_box["height"] / 2, steps=12)
            await page.mouse.up()
            await expect(handles).to_have_count(index + 3)
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
        assert len(workflow["graph"]["edges"]) == 5
        await page.reload(wait_until="networkidle")
        await expect(handles).to_have_count(7)
        start_box = await page.locator('.react-flow__node[data-id="source"] .react-flow__handle.source').bounding_box()
        end_box = await outer.locator('.react-flow__handle.target[data-handleid="index"]').bounding_box()
        await page.mouse.move(start_box["x"] + start_box["width"] / 2, start_box["y"] + start_box["height"] / 2)
        await page.mouse.down()
        await page.mouse.move(end_box["x"] + end_box["width"] / 2, end_box["y"] + end_box["height"] / 2, steps=12)
        await page.mouse.up()
        await expect(control).to_be_disabled()
        await page.keyboard.press("Control+z")
        await expect(control).to_be_enabled()
        # Real Canvas undo/redo of config changes, outside the text control.
        await plus.click()
        await control.blur()
        await page.keyboard.press("Control+z")
        await expect(control).to_have_value("0")
        await page.keyboard.press("Control+Shift+z")
        await expect(control).to_have_value("1")

    await control.fill("7")
    await control.blur()
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    assert workflow["graph"]["nodes"][1]["config"]["index"] == 7
    workflow["graph"]["edges"] = [{"id": "index-edge", "source": "source", "sourcePort": "text", "target": "switch", "targetPort": "index"}]
    await page.reload(wait_until="networkidle")
    await expect(control).to_be_disabled()
    await expect(plus).to_be_disabled()
    await expect(minus).to_be_disabled()
    await expect(outer.get_by_text("上游控制")).to_be_visible()
    await expect(control).to_have_value("7")
    workflow["graph"]["edges"] = []
    await page.reload(wait_until="networkidle")
    await expect(control).to_be_enabled()
    await expect(control).to_have_value("7")

    for ports, count in [([0, 2], 5), (list(range(25)), 27), ([2], 5), ([0], 3), ([], 2)]:
        workflow["graph"]["edges"] = [{"id": f"edge-{index}", "source": "source", "sourcePort": "text",
                                        "target": "switch", "targetPort": f"value{index}"} for index in ports]
        await page.reload(wait_until="networkidle")
        await expect(handles).to_have_count(count)
        if ports:
            await expect(outer.locator(f'.react-flow__handle.target[data-handleid="value{ports[-1]}"]')).to_have_count(1)
        if len(ports) == 25:
            assert await outer.locator('.react-flow__handle.source[data-handleid="value"]').count() == 1
    # A readable compact reference screenshot with 5 connected values.
    workflow["graph"]["edges"] = [{"id": f"edge-{index}", "source": "source", "sourcePort": "text", "target": "switch", "targetPort": f"value{index}"} for index in range(5)]
    await page.reload(wait_until="networkidle")
    artifacts = Path("test-artifacts/canvas-switch-any")
    artifacts.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(artifacts / f"{theme}-{width}.png"), full_page=True)
    if width == 1440:
        await page.mouse.click(100, 150, button="right")
        await page.get_by_placeholder("搜索节点", exact=True).fill("Switch Any")
        await expect(page.locator('.canvas-quick-add [role="option"]')).to_have_count(1)
        await page.locator('.canvas-quick-add [role="option"]').click()
        await expect(page.get_by_role("spinbutton", name="Switch Any index")).to_have_count(2)
        await page.keyboard.press("Control+z")
        await expect(page.get_by_role("spinbutton", name="Switch Any index")).to_have_count(1)
    assert not errors, errors
    assert not violations, violations
    await page.close()
    print(f"Switch Any browser passed: {theme} / {width}")


async def main():
    parsed = urlparse(BASE)
    assert parsed.hostname in {"localhost", "127.0.0.1"} and parsed.port != 3001
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        for theme in ["professional", "editorial", "creator"]:
            for width in [1440, 390]:
                await check(browser, width, theme)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
