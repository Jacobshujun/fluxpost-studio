import asyncio
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
NOW = "2026-09-16T00:00:00.000Z"
IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH9sAAAAASUVORK5CYII="


def node(node_id, node_type, config, x, y):
    return {"id": node_id, "type": node_type, "version": 1, "config": config,
            "position": {"x": x, "y": y}, "executionMode": "enabled"}


async def check(browser, width, video_bytes):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    errors, violations = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    workflow = {
        "id": "mask-workflow", "name": "Alpha template", "revision": 1,
        "ownerUserId": "fixture-owner", "ownerDisplayName": "Fixture",
        "isTemplate": False, "createdAt": NOW, "updatedAt": NOW,
        "graph": {"viewport": {"x": 0, "y": 0, "zoom": 0.7}, "nodes": [
            node("video", "input.videos", {"urls": ["/generated/mask-browser.mp4"]}, 30, 20),
            node("template", "input.images", {"urls": [IMAGE]}, 30, 280),
            node("mask", "utility.media-mask", {"mask": {"protocolVersion": 1, "regions": []}}, 430, 100),
        ], "edges": [{"id": "base", "source": "video", "sourcePort": "videos", "target": "mask", "targetPort": "videos"}]},
    }
    if width <= 820:
        workflow["graph"]["edges"].append({"id": "overlay", "source": "template", "sourcePort": "images", "target": "mask", "targetPort": "overlayImages"})
    show_result = False

    async def handle(route):
        nonlocal workflow
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE_URL).netloc:
            violations.append(request.url)
            await route.abort()
            return
        if parsed.path == "/generated/mask-browser.mp4":
            await route.fulfill(content_type="video/mp4", body=video_bytes)
            return
        if not parsed.path.startswith("/api/"):
            await route.continue_()
            return
        payload = {}
        if parsed.path == "/api/canvas/workflows":
            payload = {"workflows": [workflow]}
        elif parsed.path == "/api/canvas/workflows/mask-workflow":
            if request.method == "PATCH":
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
            payload = {"workflow": workflow}
        elif parsed.path == "/api/canvas/runs":
            assert request.method == "GET", "Browser check must not launch work"
            run = {"id": "mask-run", "workflowId": workflow["id"], "workflowRevision": workflow["revision"],
                   "status": "completed", "graphSnapshot": copy.deepcopy(workflow["graph"]),
                   "createdAt": NOW, "updatedAt": NOW, "completedAt": NOW}
            payload = {"runs": [run] if show_result else [], "latestNodeAttempts": [], "latestSuccessfulNodeRuns": []}
        elif parsed.path == "/api/canvas/runs/mask-run":
            payload = {"run": {"id": "mask-run", "workflowId": workflow["id"], "status": "completed",
                               "graphSnapshot": copy.deepcopy(workflow["graph"]), "createdAt": NOW, "updatedAt": NOW},
                       "nodeRuns": [{"id": "mask-attempt", "runId": "mask-run", "nodeId": "mask", "nodeType": "utility.media-mask",
                                     "attempt": 1, "status": "completed", "createdAt": NOW, "updatedAt": NOW,
                                     "inputs": {}, "outputs": {"videos": {"kind": "videos", "items": [{"url": "/generated/mask-browser.mp4", "width": 120, "height": 80}]}}}]}
        elif parsed.path == "/api/canvas/schedules":
            payload = {"schedules": []}
        elif request.method != "GET":
            violations.append(f"Unexpected write: {request.method} {parsed.path}")
        await route.fulfill(json=payload)

    await page.route("**/*", handle)
    await page.goto(f"{BASE_URL}/canvas?workflowId=mask-workflow", wait_until="networkidle")
    mask = page.locator('.react-flow__node[data-id="mask"]')
    source = page.locator('.react-flow__node[data-id="template"] .react-flow__handle.source[data-handleid="images"]')
    target = mask.locator('.react-flow__handle.target[data-handleid="overlayImages"]')
    await expect(target).to_have_count(1)
    if width > 820:
        start, end = await source.bounding_box(), await target.bounding_box()
        await page.mouse.move(start["x"] + start["width"] / 2, start["y"] + start["height"] / 2)
        await page.mouse.down()
        await page.mouse.move(end["x"] + end["width"] / 2, end["y"] + end["height"] / 2, steps=15)
        await page.mouse.up()
    await expect(page.locator('.react-flow__edge')).to_have_count(2)
    await mask.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    editor = page.locator('.canvas-inspector .canvas-media-mask-editor')
    await editor.get_by_role("button", name="添加图片模板", exact=True).click()
    await expect(editor.get_by_label("图片来源")).to_have_value("input")
    for label, expected in [("x", "0"), ("y", "0"), ("width", "1"), ("height", "1"), ("opacity", "1")]:
        await expect(editor.get_by_label(label, exact=True)).to_have_value(expected)
    await editor.get_by_label("opacity", exact=True).fill("0.7")
    await editor.get_by_label("开始毫秒", exact=True).fill("200")
    await editor.get_by_label("结束毫秒", exact=True).fill("1500")
    await editor.get_by_label("图片来源").select_option("url")
    await editor.get_by_label("覆盖图片 URL", exact=True).fill(IMAGE)
    await editor.get_by_label("图片来源").select_option("input")
    await expect(editor.get_by_label("覆盖图片 URL", exact=True)).to_have_count(0)
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    saved = workflow["graph"]["nodes"][2]["config"]["mask"]["regions"][0]
    assert saved["imageSource"] == "input" and saved["opacity"] == 0.7
    assert saved["startMs"] == 200 and saved["endMs"] == 1500
    assert any(edge["targetPort"] == "overlayImages" for edge in workflow["graph"]["edges"])
    await page.reload(wait_until="networkidle")
    await expect(page.locator('.react-flow__edge')).to_have_count(2)
    await mask.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    await expect(editor.get_by_label("opacity", exact=True)).to_have_value("0.7")
    await expect(editor.get_by_label("图片来源")).to_have_value("input")
    if width <= 820:
        await page.wait_for_function("getComputedStyle(document.querySelector('.canvas-inspector')).transform === 'matrix(1, 0, 0, 1, 0, 0)'")
        bounds = await page.locator('.canvas-inspector').bounding_box()
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width + 1
        await editor.get_by_label("结束毫秒", exact=True).scroll_into_view_if_needed()
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    for button in await editor.locator("button").all():
        assert await button.evaluate("el => el.scrollWidth <= el.clientWidth + 1"), "Button label must fit"
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-mask-editor-{width}.png", full_page=True)
    show_result = True
    await page.goto(f"{BASE_URL}/canvas?workflowId=mask-workflow&runId=mask-run", wait_until="networkidle")
    await mask.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    preview = page.locator('.react-flow__node[data-id="mask"] video').first
    await expect(preview).to_be_visible()
    await expect(preview).to_have_js_property("videoWidth", 120)
    await preview.evaluate("el => el.play()")
    await page.wait_for_function("document.querySelector('.react-flow__node[data-id=\"mask\"] video').currentTime > 0.1")
    if width <= 820:
        await page.get_by_role("button", name="关闭属性", exact=True).click()
    await page.screenshot(path=f"test-artifacts/canvas-mask-result-{width}.png", full_page=True)
    assert not errors, errors
    assert not violations, violations
    print(json.dumps({"width": width, "result": "passed"}), flush=True)
    await page.close()


async def main():
    parsed = urlparse(BASE_URL)
    if parsed.hostname not in ["127.0.0.1", "localhost", "::1"] or parsed.port in [None, 3001]:
        raise RuntimeError("Use an isolated worker-disabled loopback smoke server")
    with tempfile.TemporaryDirectory(prefix="fluxpost-mask-browser-") as folder:
        video = Path(folder) / "preview.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=120x80:r=10:d=2", "-vf", "drawbox=x=80:y=0:w=40:h=80:color=red:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video)], check=True)
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(channel="chrome", headless=True)
            try:
                for width in [1440, 390]:
                    await check(browser, width, video.read_bytes())
            except Exception:
                Path("test-artifacts").mkdir(exist_ok=True)
                for context_index, context in enumerate(browser.contexts):
                    for page_index, page in enumerate(context.pages):
                        await page.screenshot(path=f"test-artifacts/canvas-mask-failure-{context_index}-{page_index}.png", full_page=True)
                raise
            finally:
                await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
