import asyncio
import copy
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE_URL).hostname in ["127.0.0.1", "localhost"] and urlparse(BASE_URL).port != 3001
NOW = "2026-09-16T00:00:00.000Z"
IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH9sAAAAASUVORK5CYII="
CONFIG = dict(format="jpeg", compressionMode="quality", quality=90, minQuality=75, targetPercent=50,
              targetKB=500, resizeMode="original", scalePercent=100, longestEdge=2160,
              width=1080, height=1440, fit="inside", background="#ffffff")


async def check(browser, width):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    workflow = dict(id="image-process", name="图片处理测试", revision=1, ownerUserId="owner",
                    ownerDisplayName="Fixture", isTemplate=False, createdAt=NOW, updatedAt=NOW,
                    graph=dict(viewport=dict(x=0, y=0, zoom=1), nodes=[
                        dict(id="process", type="utility.image-process", version=1, config=copy.deepcopy(CONFIG),
                             executionMode="enabled", position=dict(x=40, y=40)),
                        dict(id="preview", type="utility.image-preview", version=1, config={},
                             executionMode="enabled", position=dict(x=400, y=40)),
                    ], edges=[]))
    report = dict(configKey=json.dumps(CONFIG, separators=(",", ":")), sourceUrl=IMAGE,
                  sourceWidth=640, sourceHeight=480, sourceBytes=200000, outputBytes=100000,
                  outputWidth=640, outputHeight=480, quality=90, savingsPercent=50)
    node_run = dict(id="node-run", runId="run", nodeId="process", nodeType="utility.image-process",
                    attempt=1, status="completed", inputs={}, outputs={"images": {"kind": "images", "items": [
                        dict(url=IMAGE, name="result.jpg", width=640, height=480, imageProcessing=report)]}},
                    startedAt=NOW, finishedAt=NOW, createdAt=NOW, updatedAt=NOW)
    latest = dict(runId="run", workflowRevision=1, runCreatedAt=NOW, nodeVersion=1,
                  nodeConfig=CONFIG, nodeRun=node_run)
    saves = []

    async def handler(route):
        nonlocal workflow
        request = route.request
        endpoint = urlparse(request.url).path
        payload = {}
        if endpoint == "/api/canvas/workflows":
            assert request.method == "GET"
            payload = {"workflows": [workflow]}
        elif endpoint == "/api/canvas/workflows/image-process":
            if request.method == "PATCH":
                saves.append(request.post_data_json)
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
            payload = {"workflow": workflow}
        elif endpoint == "/api/canvas/runs":
            assert request.method == "GET", "Browser checks cannot start real processing"
            payload = {"runs": [], "latestNodeAttempts": [latest], "latestSuccessfulNodeRuns": [latest]}
        elif endpoint == "/api/canvas/schedules":
            assert request.method == "GET"
            payload = {"schedules": []}
        elif request.method != "GET":
            raise AssertionError(f"Unexpected write {endpoint}")
        await route.fulfill(status=200, json=payload)

    await page.route("**/api/**", handler)
    await page.goto(f"{BASE_URL}/canvas?workflowId=image-process", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="process"]')
    await expect(node).to_be_visible()
    await expect(node.get_by_text("节省 50.0%", exact=False)).to_be_visible()
    await node.get_by_label("压缩方式", exact=True).select_option("percent")
    await expect(node.get_by_label("最低画质", exact=True)).to_be_visible()
    await node.get_by_label("不超过原文件 %", exact=True).fill("40")
    await node.get_by_label("分辨率", exact=True).select_option("custom")
    await node.get_by_label("宽度 px", exact=True).fill("1200")
    await node.get_by_label("高度 px", exact=True).fill("800")
    await node.get_by_label("尺寸适配", exact=True).select_option("contain")
    await node.get_by_label("输出格式", exact=True).select_option("png")
    await expect(node.get_by_label("画质", exact=True)).to_have_count(0)
    await node.get_by_label("透明补边", exact=True).check()
    await expect(node.get_by_text("参数已修改，请重新运行", exact=False)).to_be_visible()
    # Editing must not drag or delete the node.
    field = node.get_by_label("宽度 px", exact=True)
    await field.press("End")
    await field.press("Backspace")
    await expect(node).to_have_count(1)
    await field.fill("1200")
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    assert workflow["graph"]["nodes"][0]["position"] == dict(x=40, y=40)
    assert workflow["graph"]["nodes"][0]["config"]["background"] == "transparent"
    # Open inspector through the header and verify it uses the same controls.
    await node.locator(".canvas-node-head strong").click()
    inspector = page.locator(".canvas-inspector-content")
    await expect(inspector.get_by_label("宽度 px", exact=True)).to_have_value("1200")
    await inspector.get_by_label("输出格式", exact=True).select_option("webp")
    await expect(node.get_by_label("输出格式", exact=True)).to_have_value("webp")
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    await page.reload(wait_until="networkidle")
    await expect(node.get_by_label("输出格式", exact=True)).to_have_value("webp")
    await expect(node.get_by_label("宽度 px", exact=True)).to_have_value("1200")
    await page.locator(".react-flow__controls-fitview").click()
    await expect(node.get_by_role("button", name="预览成品 1", exact=True)).to_be_in_viewport()
    # Real pointer connection on desktop; existing graph round-trip covers mobile persistence.
    if width > 820:
        source = node.locator('.react-flow__handle.source[data-handleid="images"]')
        target = page.locator('.react-flow__node[data-id="preview"] .react-flow__handle.target[data-handleid="images"]')
        a, b = await source.bounding_box(), await target.bounding_box()
        await page.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2)
        await page.mouse.down()
        await page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=15)
        await page.mouse.up()
        await expect(page.locator(".react-flow__edge")).to_have_count(1)
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
        assert workflow["graph"]["edges"][0]["sourcePort"] == "images"
    await node.get_by_role("button", name="预览成品 1", exact=True).click()
    await expect(page.locator(".canvas-image-viewer")).to_be_visible()
    await page.keyboard.press("Escape")
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    assert not errors, errors
    assert saves
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-image-process-{width}.png", full_page=True)
    await page.close()
    print(json.dumps(dict(width=width, saves=len(saves), result="passed")), flush=True)


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width in [1440, 390]:
                await check(browser, width)
        except Exception:
            Path("test-artifacts").mkdir(exist_ok=True)
            for context in browser.contexts:
                for page in context.pages:
                    await page.screenshot(path="test-artifacts/canvas-image-process-failure.png", full_page=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
