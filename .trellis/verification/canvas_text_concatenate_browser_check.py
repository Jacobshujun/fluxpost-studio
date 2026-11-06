"""Text input expansion and save/reload with isolated API fixtures."""
import asyncio
import os
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")


async def check(browser, width, theme):
    page = await browser.new_page(viewport={"width": width, "height": 1000})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    source = {"id": "source", "type": "input.text", "version": 1,
              "position": {"x": 30, "y": 30}, "config": {"text": "fixture"}}
    concat = {"id": "concat", "type": "utility.text-concatenate", "version": 1,
              "position": {"x": 360, "y": 30}, "config": {"delimiter": "\\n", "clean_whitespace": True}}
    workflow = {"id": "fixture", "name": "Text concat", "revision": 1, "ownerUserId": "fixture",
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
    outer = page.locator('.react-flow__node[data-id="concat"]')
    handles = outer.locator('.react-flow__handle.target')
    await expect(handles).to_have_count(1)
    if width == 1440:
        for index, letter in enumerate("abcde"):
            start = await page.locator('.react-flow__node[data-id="source"] .react-flow__handle.source').bounding_box()
            end = await outer.locator(f'.react-flow__handle.target[data-handleid="text_{letter}"]').bounding_box()
            await page.mouse.move(start["x"] + start["width"] / 2, start["y"] + start["height"] / 2)
            await page.mouse.down()
            await page.mouse.move(end["x"] + end["width"] / 2, end["y"] + end["height"] / 2, steps=12)
            await page.mouse.up()
            await expect(handles).to_have_count(index + 2)
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
        assert len(workflow["graph"]["edges"]) == 5
        await page.reload(wait_until="networkidle")
        await expect(handles).to_have_count(6)
        assert workflow["graph"]["nodes"][1]["config"] == concat["config"]

    for letters, count in [("d", 5), ("abcdefghijklmnop", 16), ("b", 3), ("", 1)]:
        workflow["graph"]["edges"] = [{"id": letter, "source": "source", "sourcePort": "text",
                                        "target": "concat", "targetPort": f"text_{letter}"} for letter in letters]
        await page.reload(wait_until="networkidle")
        await expect(handles).to_have_count(count)
        if letters:
            await expect(outer.locator(f'.react-flow__handle.target[data-handleid="text_{letters[-1]}"]')).to_have_count(1)
    assert not errors, errors
    assert not violations, violations
    await page.close()
    print(f"Text concat browser passed: {theme} / {width}")


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
