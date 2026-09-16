import asyncio
import copy
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
NOW = "2026-09-16T00:00:00.000Z"


def image_node(node_id="image"):
    return {"id": node_id, "type": "model.gpt-image", "version": 2,
            "position": {"x": 300, "y": 0}, "config": {
                "ratio": "3:4", "resolution": "2k", "quality": "medium", "count": 1,
                "outputFormat": "jpeg", "outputCompression": 100, "referenceUrls": []}}


async def check(browser, width):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    sources = [{"id": f"source-{index}", "type": "input.images", "version": 1,
                "position": {"x": 0, "y": index * 130}, "config": {"urls": []}}
               for index in [1, 2]]
    root = {"id": "root", "type": "input.iteration-item", "version": 1,
            "position": {"x": 0, "y": 0}, "config": {}}
    region = {"id": "region", "type": "utility.image-iterate", "version": 1,
              "position": {"x": 610, "y": 0}, "config": {"concurrency": 1, "failurePolicy": "all"},
              "iteration": {"schemaVersion": 1, "inputNodeId": "root",
                            "graph": {"nodes": [root, image_node("inner")], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}},
                            "outputs": {"images": {"nodeId": "inner", "outputPort": "images"}}}}
    workflow = {"id": "ordered", "name": "GPT ordered inputs", "revision": 1,
                "isTemplate": False, "createdAt": NOW, "updatedAt": NOW,
                "graph": {"nodes": [*sources, image_node(), region], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}}

    async def route_handler(route):
        nonlocal workflow
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE_URL).netloc:
            await route.abort()
            return
        if not parsed.path.startswith("/api/"):
            await route.continue_()
            return
        payload = {}
        if parsed.path == "/api/canvas/workflows":
            assert request.method == "GET"
            payload = {"workflows": [workflow]}
        elif parsed.path == "/api/canvas/workflows/ordered":
            if request.method == "PATCH":
                workflow = {**workflow, **copy.deepcopy(request.post_data_json), "revision": workflow["revision"] + 1}
            payload = {"workflow": workflow}
        else:
            assert request.method == "GET", f"Unexpected mutation: {parsed.path}"
            if parsed.path == "/api/canvas/runs":
                payload = {"runs": [], "latestNodeAttempts": [], "latestSuccessfulNodeRuns": []}
            elif parsed.path == "/api/canvas/schedules":
                payload = {"schedules": []}
        await route.fulfill(status=200, json=payload)

    await page.route("**/*", route_handler)
    await page.goto(f"{BASE_URL}/canvas?workflowId=ordered", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="image"]')
    handle = lambda slot: node.locator(f'.target[data-handleid="image_{slot}"]')
    await expect(handle(1)).to_have_count(1)
    await expect(handle(2)).to_have_count(0)
    if width > 820:
        for slot in [1, 2]:
            source = page.locator(f'.react-flow__node[data-id="source-{slot}"] .source[data-handleid="images"]')
            start, end = await source.bounding_box(), await handle(slot).bounding_box()
            await page.mouse.move(start["x"] + start["width"] / 2, start["y"] + start["height"] / 2)
            await page.mouse.down()
            await page.mouse.move(end["x"] + end["width"] / 2, end["y"] + end["height"] / 2, steps=15)
            await page.mouse.up()
            await expect(handle(slot + 1)).to_have_count(1)
        source = page.locator('.react-flow__node[data-id="source-1"]')
        await source.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
        await source.focus()
        await page.keyboard.press("Delete")
        await expect(source).to_have_count(0)
        await expect(handle(3)).to_have_count(1)
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
        assert [edge["targetPort"] for edge in workflow["graph"]["edges"]] == ["image_2"]
    controls = node.locator(".canvas-gpt-image-controls")
    await controls.get_by_label("背景").select_option("transparent", force=True)
    await expect(controls.get_by_label("格式")).to_have_value("png")
    await expect(controls.get_by_label("格式").locator('option[value="jpeg"]')).to_have_js_property("disabled", True)
    await controls.get_by_label("分辨率").select_option("4k", force=True)
    await expect(controls.get_by_label("Official 像素尺寸")).to_have_text("Official: 2480x3312 px")
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    await page.reload(wait_until="networkidle")
    await expect(controls.get_by_label("背景")).to_have_value("transparent")
    await expect(controls.get_by_label("分辨率")).to_have_value("4k")
    await expect(handle(3)).to_have_count(1 if width > 820 else 0)
    await page.screenshot(path=f"test-artifacts/canvas-gpt-inputs-{width}.png", full_page=True)

    region_node = page.locator('.react-flow__node[data-id="region"]')
    await region_node.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    await page.get_by_role("button", name="编辑逐图区域", exact=True).click()
    dialog = page.get_by_role("dialog", name="逐图区域编辑器")
    await dialog.locator(".canvas-iteration-connections summary").click()
    inner = dialog.locator('.react-flow__node[data-id="inner"]')
    target = dialog.get_by_label("连线终点")
    await expect(target.locator('option[value=\'["inner","image_2"]\']')).to_have_count(0)
    for slot in [1, 2]:
        await dialog.get_by_label("连线起点").select_option('["root","images"]')
        await target.select_option(f'["inner","image_{slot}"]')
        await dialog.get_by_role("button", name="连接内层端口", exact=True).click()
        await expect(inner.locator(f'.target[data-handleid="image_{slot + 1}"]')).to_have_count(1)
    await dialog.get_by_role("button", name="删除内层连线 1", exact=True).click()
    await expect(inner.locator('.target[data-handleid="image_3"]')).to_have_count(1)
    await dialog.get_by_role("button", name="返回外层画布", exact=True).click()
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    saved_region = next(item for item in workflow["graph"]["nodes"] if item["id"] == "region")
    assert [edge["targetPort"] for edge in saved_region["iteration"]["graph"]["edges"]] == ["image_2"]
    assert not errors, errors
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    await page.close()
    print(f"GPT ordered inputs, controls, reload and nested editing passed at {width}px")


async def main():
    parsed = urlparse(BASE_URL)
    assert parsed.hostname in ["127.0.0.1", "localhost"] and parsed.port != 3001
    Path("test-artifacts").mkdir(exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width in [1440, 390]:
                await check(browser, width)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
