import asyncio
import json
import os

from playwright.async_api import async_playwright


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:3001")
NOW = "2026-08-21T00:00:00.000Z"


def workflow(name="Save race fixture", revision=7, graph=None):
    return {
        "id": "workflow-save-race",
        "ownerUserId": "browser-owner",
        "ownerDisplayName": "Browser owner",
        "name": name,
        "revision": revision,
        "graph": graph or {
            "nodes": [{
                "id": "text-node",
                "type": "input.text",
                "version": 1,
                "position": {"x": 100, "y": 100},
                "config": {"text": "fixture"},
            }],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


async def main():
    patch_bodies = []
    first_started = asyncio.Event()
    release_first = asyncio.Event()
    second_started = asyncio.Event()
    active_patches = 0
    max_active_patches = 0
    seen_routes = []
    browser_errors = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        async def route_handler(route):
            nonlocal active_patches, max_active_patches
            request = route.request
            path = request.url.split("?", 1)[0]
            seen_routes.append((request.method, path))
            if path.endswith("/api/canvas/workflows") and request.method == "GET":
                payload = {"workflows": [workflow()]}
            elif path.endswith("/api/canvas/workflows/workflow-save-race") and request.method == "PATCH":
                body = request.post_data_json
                patch_bodies.append(body)
                active_patches += 1
                max_active_patches = max(max_active_patches, active_patches)
                try:
                    if len(patch_bodies) == 1:
                        first_started.set()
                        await release_first.wait()
                    else:
                        second_started.set()
                    payload = {"workflow": workflow(body["name"], body["revision"] + 1, body["graph"])}
                finally:
                    active_patches -= 1
            elif path.endswith("/api/canvas/runs"):
                payload = {"runs": [], "latestSuccessfulNodeRuns": []}
            elif path.endswith("/api/canvas/schedules"):
                payload = {"schedules": []}
            else:
                payload = {"ok": True}
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

        await page.route("**/api/canvas/**", route_handler)
        page.on("pageerror", lambda error: browser_errors.append(str(error)))
        page.on("console", lambda message: browser_errors.append(message.text) if message.type == "error" else None)
        await page.goto(f"{BASE_URL}/canvas", wait_until="domcontentloaded", timeout=30_000)
        name_input = page.locator("input[aria-label='画布名称']")
        await name_input.wait_for(timeout=30_000)
        try:
            await name_input.wait_for(state="visible", timeout=5_000)
            await page.wait_for_function("document.querySelector('input[aria-label=\"画布名称\"]')?.disabled === false", timeout=5_000)
        except Exception as error:
            raise AssertionError({"routes": seen_routes, "browserErrors": browser_errors}) from error
        await name_input.fill("First edit")
        await asyncio.wait_for(first_started.wait(), timeout=5)

        await name_input.fill("Latest edit")
        saving_button = page.get_by_role("button", name="保存中", exact=True)
        await saving_button.click()
        assert await saving_button.is_enabled(), "manual save must remain actionable while workflow saving is active"
        assert len(patch_bodies) == 1, "manual save must not start a concurrent PATCH"

        release_first.set()
        await asyncio.wait_for(second_started.wait(), timeout=5)
        await page.get_by_role("button", name="画布已保存", exact=True).wait_for(timeout=5_000)

        assert max_active_patches == 1, max_active_patches
        assert [body["revision"] for body in patch_bodies] == [7, 8], patch_bodies
        assert [body["name"] for body in patch_bodies] == ["First edit", "Latest edit"], patch_bodies
        assert "is-dirty" not in (await page.locator(".canvas-message span").get_attribute("class") or "")

        await page.close()
        await browser.close()


asyncio.run(main())
print("Canvas save race browser checks passed.")
