import asyncio
import json
import os

from playwright.async_api import async_playwright


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:3001")
NOW = "2026-08-31T00:00:00.000Z"


def workflow():
    return {
        "id": "workflow-canvas-interaction",
        "name": "Canvas interaction browser fixture",
        "revision": 1,
        "ownerUserId": "browser-owner",
        "ownerDisplayName": "Browser owner",
        "createdAt": NOW,
        "updatedAt": NOW,
        "graph": {
            "nodes": [
                {
                    "id": "first-node",
                    "type": "input.text",
                    "version": 1,
                    "position": {"x": 80, "y": 80},
                    "config": {"text": "first"},
                },
                {
                    "id": "second-node",
                    "type": "input.text",
                    "version": 1,
                    "position": {"x": 420, "y": 80},
                    "config": {"text": "second"},
                },
            ],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
    }


async def install_routes(page):
    async def route_handler(route):
        request = route.request
        path = request.url.split("?", 1)[0]
        if path.endswith("/api/canvas/workflows") and request.method == "GET":
            payload = {"workflows": [workflow()]}
        elif path.endswith("/api/canvas/runs"):
            payload = {"runs": [], "latestNodeAttempts": [], "latestSuccessfulNodeRuns": []}
        elif path.endswith("/api/canvas/schedules"):
            payload = {"schedules": []}
        else:
            payload = {"ok": True}
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

    await page.route("**/api/canvas/**", route_handler)


async def transform(page):
    return await page.locator(".react-flow__viewport").evaluate(
        "element => getComputedStyle(element).transform"
    )


async def drag(page, start, end, modifiers=None):
    await page.mouse.move(start["x"], start["y"])
    await page.mouse.down()
    if modifiers:
        await page.keyboard.down(modifiers[0])
    await page.mouse.move(end["x"], end["y"], steps=6)
    await page.mouse.up()
    if modifiers:
        await page.keyboard.up(modifiers[0])


async def desktop_check(browser):
    page = await browser.new_page(viewport={"width": 1440, "height": 900})
    await install_routes(page)
    await page.goto(f"{BASE_URL}/canvas", wait_until="domcontentloaded", timeout=30_000)
    await page.locator('.react-flow__node[data-id="first-node"]').wait_for()

    palette = page.locator(".canvas-palette")
    assert await palette.get_attribute("class") and "canvas-palette-collapsed" in await palette.get_attribute("class")
    toggle = page.locator(".canvas-palette-toggle")
    await toggle.click()
    assert "canvas-palette-collapsed" not in (await palette.get_attribute("class") or "")
    await toggle.click()

    stage = page.locator('[data-testid="canvas-stage"]')
    box = await stage.bounding_box()
    assert box
    start = {"x": box["x"] + 24, "y": box["y"] + 24}
    end = {"x": start["x"] + 100, "y": start["y"] + 70}
    before = await transform(page)
    await drag(page, start, end)
    after = await transform(page)
    assert before != after, {"before": before, "after": after}
    assert await page.locator(".react-flow__selection").count() == 0

    nodes = page.locator(".react-flow__node")
    first_box = await nodes.nth(0).bounding_box()
    second_box = await nodes.nth(1).bounding_box()
    assert first_box and second_box
    selection_start = {
        "x": min(first_box["x"], second_box["x"]) - 18,
        "y": min(first_box["y"], second_box["y"]) - 18,
    }
    selection_end = {
        "x": max(first_box["x"] + first_box["width"], second_box["x"] + second_box["width"]) + 18,
        "y": max(first_box["y"] + first_box["height"], second_box["y"] + second_box["height"]) + 18,
    }
    await page.mouse.move(selection_start["x"], selection_start["y"])
    await page.keyboard.down("Alt")
    await page.mouse.down()
    await page.mouse.move(selection_end["x"], selection_end["y"], steps=6)
    assert await page.locator(".react-flow__selection").count() == 1
    await page.mouse.up()
    await page.keyboard.up("Alt")
    assert await page.locator(".react-flow__node.selected").count() == 2
    await page.close()


async def mobile_check(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
    await install_routes(page)
    await page.goto(f"{BASE_URL}/canvas", wait_until="domcontentloaded", timeout=30_000)
    await page.locator('.react-flow__node[data-id="first-node"]').wait_for()
    await page.locator(".canvas-mobile-menu").click()
    assert "canvas-palette-open" in (await page.locator(".canvas-palette").get_attribute("class") or "")
    overflow = await page.locator(".canvas-shell").evaluate("element => ({ scroll: element.scrollWidth, client: element.clientWidth })")
    assert overflow["scroll"] <= overflow["client"] + 1, overflow
    await page.close()


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        await desktop_check(browser)
        await mobile_check(browser)
        await browser.close()


asyncio.run(main())
print("Canvas interaction browser checks passed.")
