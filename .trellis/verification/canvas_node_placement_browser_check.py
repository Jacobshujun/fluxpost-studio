"""Node-library placement regression using intercepted APIs on an isolated server."""
import asyncio
import copy
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1") and urlparse(BASE).port != 3001


async def check(browser, width, theme, empty=False):
    page = await browser.new_page(viewport=dict(width=width, height=960))
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    workflow = dict(id="placement", name="Placement fixture", revision=1, ownerUserId="fixture",
                    createdAt="2026-10-20T00:00:00Z", updatedAt="2026-10-20T00:00:00Z",
                    graph=dict(nodes=[] if empty else [dict(id="seed", type="input.text", version=1,
                                                           position=dict(x=-2400, y=1800), config=dict(text="Seed"))],
                               edges=[], viewport=dict(x=1200, y=-900, zoom=0.6)))
    errors, violations, saves = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def intercept(route):
        nonlocal workflow
        request, url = route.request, urlparse(route.request.url)
        if url.netloc != urlparse(BASE).netloc:
            violations.append("external request")
            await route.abort()
            return
        if not url.path.startswith("/api/"):
            await route.continue_()
            return
        payload = {}
        if url.path == "/api/accounts/session":
            payload = dict(account=dict(id="fixture", displayName="Fixture", username="fixture", role="admin"), hasAccounts=True)
        elif url.path == "/api/canvas/workflows":
            payload = dict(workflows=[workflow])
        elif url.path == "/api/canvas/workflows/placement":
            if request.method == "PATCH":
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
                saves.append(copy.deepcopy(workflow))
            payload = dict(workflow=workflow)
        elif url.path == "/api/canvas/runs":
            payload = dict(runs=[], latestNodeAttempts=[], latestSuccessfulNodeRuns=[])
        elif url.path == "/api/canvas/schedules":
            payload = dict(schedules=[])
        elif request.method != "GET":
            violations.append(f"{request.method} {url.path}")
        await route.fulfill(json=payload)

    await page.route("**/*", intercept)
    await page.goto(BASE + "/canvas?workflowId=placement", wait_until="networkidle")
    stage = page.get_by_test_id("canvas-stage")
    await expect(stage.locator(".react-flow__pane")).to_be_visible()
    await page.get_by_role("button", name="显示节点库", exact=True).click()
    palette = page.locator(".canvas-palette-group").get_by_role("button").filter(has=page.get_by_text("文字", exact=True))
    await expect(palette).to_be_enabled()

    async def assert_at(point, action):
        before = {node["id"] for node in workflow["graph"]["nodes"]}
        transform = await stage.locator(".react-flow__viewport").evaluate("el => getComputedStyle(el).transform")
        await action()
        created = page.locator('.react-flow__node.selected').filter(has=page.locator(".canvas-node-head"))
        await expect(created).to_have_count(1)
        # Check rendered screen geometry, including the viewport and stage offsets.
        await page.wait_for_function("""({x,y}) => {
            const rect = document.querySelector('.react-flow__node.selected')?.getBoundingClientRect();
            return rect && Math.abs(rect.x-x) < 3 && Math.abs(rect.y-y) < 3;
        }""", arg=point, timeout=5000)
        box = await created.bounding_box()
        bounds = await stage.bounding_box()
        assert bounds["x"] <= box["x"] < bounds["x"] + bounds["width"], (bounds, box)
        assert bounds["y"] <= box["y"] < bounds["y"] + bounds["height"], (bounds, box)
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
        assert await stage.locator(".react-flow__viewport").evaluate("el => getComputedStyle(el).transform") == transform
        added = [node for node in workflow["graph"]["nodes"] if node["id"] not in before]
        assert len(added) == 1, added
        return added[0]

    bounds = await stage.bounding_box()
    center = dict(x=bounds["x"] + bounds["width"] / 2, y=bounds["y"] + bounds["height"] / 2)
    # With no canvas pointer history, use the visible center, even far from graph (80,80).
    await assert_at(center, palette.click)

    # The pointer survives leaving for the library; use current pan/zoom rather than node count.
    bounds = await stage.bounding_box()
    point = dict(x=bounds["x"] + 50, y=bounds["y"] + 100)
    await page.mouse.move(point["x"], point["y"])
    await page.mouse.wheel(0, 500)
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    await assert_at(point, palette.click)

    # Pan the canvas, then add from the library at a different mouse position.
    bounds = await stage.bounding_box()
    start = dict(x=bounds["x"] + 40, y=bounds["y"] + bounds["height"] - 100)
    point = dict(x=start["x"] + 110, y=start["y"] - 65)
    await page.mouse.move(start["x"], start["y"])
    await page.mouse.down()
    await page.mouse.move(point["x"], point["y"], steps=6)
    await page.mouse.up()
    await assert_at(point, palette.click)

    # Explicit quick-add must retain the menu-open coordinate while the cursor moves in the menu.
    bounds = await stage.bounding_box()
    point = dict(x=bounds["x"] + 60, y=bounds["y"] + 200)
    await page.mouse.click(point["x"], point["y"], button="right")
    search = page.get_by_placeholder("搜索节点", exact=True)
    await search.fill("文字")
    await assert_at(point, page.locator('.canvas-quick-add [role="option"]').first.click)
    assert saves and not errors and not violations, (errors, violations)
    await page.close()
    print(f"PASS placement: {theme} {width}, empty={empty}", flush=True)


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ("professional", "editorial", "creator"):
                for width in (1440, 1000):
                    await check(browser, width, theme)
            await check(browser, 1440, "professional", empty=True)
        except Exception:
            Path("test-artifacts").mkdir(exist_ok=True)
            for context in browser.contexts:
                for page in context.pages:
                    await page.screenshot(path="test-artifacts/canvas-node-placement-failure.png", full_page=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
