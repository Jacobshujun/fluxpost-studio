"""Shared node status sizing, real resize and preview regressions; intercepted APIs only."""
import asyncio
import base64
import copy
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
NOW = "2026-10-30T05:00:00Z"
DETAIL = "Fixture diagnostic must remain readable. " * 24
IMAGE = {"url": BASE + "/fixture-status.png", "width": 1, "height": 1}
SCENARIOS = [
    ("text", "input.text", "completed", {"text": "MONA M03"}, {}, None),
    ("images", "input.images", "completed", {"urls": [IMAGE["url"]]}, {}, None),
    ("wait", "utility.prompt-switch", "queued", {"strategy": "scene"}, {}, DETAIL),
    ("failure", "publish.feishu", "failed", {}, {}, DETAIL),
    ("failure-preview", "model.gpt-text", "failed", {}, {"text": {"kind": "text", "value": "Earlier successful output"}}, DETAIL),
    ("pending", "model.gpt-text", "running", {}, {}, None),
    ("idle", "utility.image-preview", None, {}, {}, None),
    ("text-result", "model.gpt-text", "completed", {}, {"text": {"kind": "text", "value": "Fixture output"}}, None),
    ("image-result", "utility.image-preview", "completed", {}, {"images": {"kind": "images", "items": [IMAGE]}}, None),
    ("video-result", "utility.display-any", "completed", {}, {"preview": {"kind": "videos", "items": [{"url": BASE + "/fixture-status.mp4"}]}}, None),
]


async def check(browser, width, theme):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    workflows, attempts, successful = {}, [], []
    for key, node_type, status, config, outputs, detail in SCENARIOS:
        node = {"id": key, "type": node_type, "version": 1, "label": key,
                "position": {"x": 60, "y": 60}, "size": {"width": 360, "height": 560}, "config": config}
        workflows[key] = {"id": key, "name": key, "revision": 1, "ownerUserId": "fixture", "isTemplate": False,
                          "createdAt": NOW, "updatedAt": NOW,
                          "graph": {"nodes": [node], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 0.7}}}
        if status:
            attempt = {"id": "attempt-" + key, "runId": "fixture-run", "nodeId": key, "nodeType": node_type,
                       "attempt": 1, "status": status, "inputs": {}, "outputs": outputs, "createdAt": NOW, "updatedAt": NOW,
                       **({"waitReason" if key == "wait" else "error": detail} if detail else {})}
            attempts.append({"workflowRevision": 1, "runId": "fixture-run", "runCreatedAt": NOW,
                             "nodeVersion": 1, "nodeConfig": config, "nodeRun": attempt})
            if key == "failure-preview":
                successful.append({**attempts[-1], "nodeRun": {**attempt, "id": "earlier-success", "status": "completed", "error": None}})
                attempt["outputs"] = {}
    errors, violations = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def intercept(route):
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE).netloc:
            violations.append(request.url)
            await route.abort()
            return
        if parsed.path == "/fixture-status.png":
            await route.fulfill(content_type="image/png", body=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="))
            return
        if parsed.path == "/fixture-status.mp4":
            await route.fulfill(content_type="video/mp4", body=b"")
            return
        if not parsed.path.startswith("/api/"):
            await route.continue_()
            return
        payload = {}
        if parsed.path == "/api/canvas/workflows":
            payload = {"workflows": list(workflows.values())}
        elif parsed.path.startswith("/api/canvas/workflows/"):
            key = parsed.path.rsplit("/", 1)[-1]
            if request.method == "PATCH":
                workflows[key] = {**workflows[key], **request.post_data_json, "revision": workflows[key]["revision"] + 1}
                await page.evaluate("size => { window.savedStatusSize = size; }", workflows[key]["graph"]["nodes"][0].get("size"))
            payload = {"workflow": workflows[key]}
        elif parsed.path == "/api/canvas/runs":
            payload = {"runs": [], "latestNodeAttempts": attempts, "latestSuccessfulNodeRuns": successful}
        elif parsed.path == "/api/canvas/schedules":
            payload = {"schedules": []}
        elif request.method != "GET":
            violations.append(f"{request.method} {parsed.path}")
        await route.fulfill(json=payload)

    await page.route("**/*", intercept)

    async def inspect(key, compact, detail):
        node = page.locator(f'.react-flow__node[data-id="{key}"]')
        result = node.locator(".canvas-node-result")
        await expect(result).to_have_count(1)
        metrics = await result.evaluate("""element => {
            const header = element.querySelector('.canvas-node-result-status');
            return {height: element.offsetHeight, header: header?.offsetHeight || 0,
                grow: getComputedStyle(element).flexGrow, scroll: element.scrollHeight,
                client: element.clientHeight, headerGrow: header ? getComputedStyle(header).flexGrow : '0'};
        }""")
        if compact:
            assert metrics["grow"] == "0", (key, width, theme, metrics)
            if not detail and metrics["header"]:
                assert metrics["height"] <= metrics["header"] + 2, (key, "empty status space", metrics)
            assert metrics["scroll"] <= metrics["client"] + 1, (key, "diagnostic clipped", metrics)
        elif width > 820:
            assert metrics["grow"] == "1", (key, "preview lost expansion", metrics)
        assert metrics["headerGrow"] == "0"
        if detail:
            await expect(result.locator(":scope > p")).to_have_text(detail.strip())
            assert metrics["scroll"] <= metrics["client"] + 1, (key, "diagnostic/preview clipped", metrics)
        return node, result

    for key, node_type, status, config, outputs, detail in SCENARIOS:
        await page.goto(BASE + "/canvas?workflowId=" + key, wait_until="networkidle")
        compact = not outputs
        node, result = await inspect(key, compact, detail)
        if key == "text" and width > 820:
            await node.locator(".canvas-node-head strong").click()
            stage = page.get_by_test_id("canvas-stage")
            await stage.locator(".react-flow__controls-fitview").click()
            await stage.locator(".react-flow__controls-zoomout").click()
            await stage.locator(".react-flow__controls-zoomout").click()
            await page.wait_for_timeout(400)
            before = await node.evaluate("e => ({height:e.offsetHeight, editor:e.querySelector('textarea').offsetHeight})")
            handle = node.locator(".canvas-node-resize-handle.bottom.right")
            box = await handle.bounding_box()
            node_box = await node.bounding_box()
            scale = node_box["height"] / before["height"]
            x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            await page.mouse.move(x, y)
            await page.mouse.down()
            await page.mouse.move(x + 30 * scale, y + 100 * scale, steps=12)
            await page.mouse.up()
            await page.wait_for_function("old => document.querySelector('.react-flow__node[data-id=text]').offsetHeight > old + 80", arg=before["height"])
            await inspect(key, True, None)
            assert await node.locator("textarea").evaluate("e => e.offsetHeight") > before["editor"] + 80
            await page.wait_for_function("old => window.savedStatusSize?.height > old + 80", arg=before["height"])
            await page.screenshot(path=f"test-artifacts/canvas-compact-status-{theme}-{width}.png")
            saved_size = copy.deepcopy(workflows[key]["graph"]["nodes"][0]["size"])
            await page.reload(wait_until="networkidle")
            await inspect(key, True, None)
            assert abs(await node.evaluate("e => e.offsetHeight") - saved_size["height"]) < 2
        if width > 820:
            workflows[key]["graph"]["nodes"][0]["size"] = {"width": 240, "height": 240}
            await page.reload(wait_until="networkidle")
            await inspect(key, compact, detail)
        if key == "image-result" or (key == "text" and width == 390):
            await page.screenshot(path=f"test-artifacts/canvas-compact-{key}-{theme}-{width}.png")
    assert not errors, errors
    assert not violations, violations
    print(f"PASS compact status: {theme} {width} (10 node/state cases)", flush=True)
    await page.close()


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
