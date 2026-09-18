"""Intercepted Canvas editing checks. Requires an isolated worker-disabled server."""
import asyncio
import copy
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")


def node(identifier, kind, x, y, **extra):
    return {"id": identifier, "type": kind, "version": 1, "position": {"x": x, "y": y}, "config": {}, "executionMode": "enabled", **extra}


async def saved(page):
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")


async def drag(page, locator, dx, dy):
    box = await locator.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx / 2, y + dy / 2, steps=8)
    await page.wait_for_timeout(450)  # Exceeds history debounce: still one gesture.
    await page.mouse.move(x + dx, y + dy, steps=8)
    await page.mouse.up()


async def clipboard_copy(page):
    return await page.evaluate("""() => {
      const data = new DataTransfer();
      document.activeElement.dispatchEvent(new ClipboardEvent('copy', {bubbles:true, cancelable:true, clipboardData:data}));
      return data.getData('text/plain');
    }""")


async def clipboard_paste(page, payload):
    await page.evaluate("""payload => {
      const data = new DataTransfer(); data.setData('text/plain', payload);
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', {bubbles:true, cancelable:true, clipboardData:data}));
    }""", payload)


async def check(browser, theme, width):
    page = await browser.new_page(viewport={"width": width, "height": 1000}, accept_downloads=True)
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    inner = {"nodes": [node("root", "input.iteration-item", 60, 100), node("ia", "utility.image-preview", 380, 100), node("ib", "utility.image-preview", 700, 100)], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 0.6}}
    region = node("region", "utility.image-iterate", 80, 420, config={"concurrency": 4, "failurePolicy": "all"}, iteration={"graph": inner, "outputs": {"images": {"nodeId": "root", "outputPort": "images"}}})
    workflow = {"id": "groups-test", "name": "分组测试", "revision": 1, "ownerUserId": "fixture", "ownerDisplayName": "Fixture", "isTemplate": False,
                "createdAt": "2026-09-18T00:00:00Z", "updatedAt": "2026-09-18T00:00:00Z",
                "graph": {"nodes": [node("a", "utility.image-preview", 80, 100), node("b", "utility.image-preview", 420, 100), region], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}}
    errors, violations = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def route_handler(route):
        nonlocal workflow
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE_URL).netloc:
            violations.append(request.url)
            await route.abort()
            return
        if not parsed.path.startswith("/api/"):
            await route.continue_()
            return
        payload = {}
        if parsed.path == "/api/canvas/workflows":
            if request.method == "POST":
                body = request.post_data_json
                workflow = {**workflow, **body, "id": "groups-import", "revision": 1}
                payload = {"workflow": workflow}
            else:
                payload = {"workflows": [workflow]}
        elif parsed.path == f'/api/canvas/workflows/{workflow["id"]}':
            if request.method == "PATCH":
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
            elif request.method == "POST":
                workflow = {**copy.deepcopy(workflow), "id": "groups-duplicate", "revision": 1}
            payload = {"workflow": workflow}
        elif parsed.path == "/api/canvas/runs" and request.method == "GET":
            payload = {"runs": [], "latestNodeAttempts": [], "latestSuccessfulNodeRuns": []}
        elif parsed.path == "/api/canvas/schedules" and request.method == "GET":
            payload = {"schedules": []}
        elif request.method != "GET":
            violations.append(f"{request.method} {parsed.path}")
        await route.fulfill(json=payload)

    await page.route("**/*", route_handler)
    await page.goto(f"{BASE_URL}/canvas?workflowId=groups-test", wait_until="networkidle")
    a = page.locator('.react-flow__node[data-id="a"]')
    b = page.locator('.react-flow__node[data-id="b"]')
    await expect(a).to_be_visible()
    if width == 390:
        await expect(page.locator('button[aria-label="编组"]')).to_be_disabled()
        await page.keyboard.press("Control+g")
        await expect(page.locator('.canvas-group')).to_have_count(0)
    else:
        await a.locator('.canvas-node-head strong').click()
        await b.locator('.canvas-node-head strong').click(modifiers=["Shift"])
        await expect(page.locator('.react-flow__node.selected')).to_have_count(2)
        await a.locator('.canvas-node-head strong').click(modifiers=["Shift"])
        await expect(page.locator('.react-flow__node.selected')).to_have_count(1)
        await a.locator('.canvas-node-head strong').click(modifiers=["Shift"])
        await page.keyboard.press("Control+m")
        await expect(page.locator('.canvas-node-disabled')).to_have_count(2)
        await page.keyboard.press("Control+m")
        await page.keyboard.press("Control+b")
        await expect(page.locator('.canvas-node-bypassed')).to_have_count(2)
        await page.keyboard.press("Control+b")
        await saved(page)
        # Empty Shift selection must not fall back to the inspector's last node.
        await a.locator('.canvas-node-head strong').click(modifiers=["Shift"])
        await b.locator('.canvas-node-head strong').click(modifiers=["Shift"])
        await expect(page.locator('.react-flow__node.selected')).to_have_count(0)
        await page.keyboard.press("Control+m")
        await expect(page.locator('.canvas-node-disabled')).to_have_count(0)
        await a.locator('.canvas-node-head strong').click()
        await page.keyboard.press("Control+b")
        await b.locator('.canvas-node-head strong').click(modifiers=["Shift"])
        await page.keyboard.press("Control+b")
        await expect(a.locator('.canvas-node-bypassed')).to_have_count(0)
        await expect(b.locator('.canvas-node-bypassed')).to_have_count(1)
        await b.locator('.canvas-node-head strong').click()
        await page.keyboard.press("Control+b")
        await a.locator('.canvas-node-head strong').click(modifiers=["Shift"])
        await saved(page)
        before = copy.deepcopy(workflow["graph"])
        await drag(page, a.locator('.canvas-node-head strong'), 25, 35)
        await saved(page)
        moved = workflow["graph"]["nodes"]
        assert moved[0]["position"] != before["nodes"][0]["position"]
        assert moved[1]["position"] != before["nodes"][1]["position"], "multi-drag must move both selected nodes"
        await page.keyboard.press("Control+g")
        await expect(page.locator('.canvas-group')).to_have_count(1)
        await page.get_by_label("分组名称", exact=True).fill("图像处理")
        await page.get_by_label("分组颜色", exact=True).fill("#f97316")
        await page.get_by_label("分组名称", exact=True).press("Control+m")
        await expect(page.locator('.canvas-node-disabled')).to_have_count(0)
        title = page.get_by_role("button", name="选择分组 图像处理", exact=True)
        await title.click()
        await page.get_by_role("button", name="任务中心", exact=True).click()
        await expect(page.get_by_role("dialog", name="Canvas 任务中心")).to_be_visible()
        await page.keyboard.press("Control+m")
        await expect(page.locator('.canvas-node-disabled')).to_have_count(0)
        await page.get_by_role("button", name="关闭任务中心", exact=True).last.click()
        await title.click()
        await page.keyboard.press("Control+b")
        await expect(page.locator('.canvas-node-bypassed')).to_have_count(2)
        await page.keyboard.press("Control+b")
        await saved(page)
        before = copy.deepcopy(workflow["graph"])
        await drag(page, title, 45, 40)
        await saved(page)
        after = copy.deepcopy(workflow["graph"])
        assert after["groups"][0]["position"] != before["groups"][0]["position"]
        assert after["nodes"][0]["position"] != before["nodes"][0]["position"]
        assert after["nodes"][2]["position"] == before["nodes"][2]["position"]
        await page.keyboard.press("Control+z")
        await saved(page)
        assert workflow["graph"]["groups"][0]["position"] == before["groups"][0]["position"], "whole drag must undo in one step"
        await page.keyboard.press("Control+Shift+z")
        await saved(page)
        assert workflow["graph"]["groups"][0]["position"] == after["groups"][0]["position"]
        await title.click()
        await drag(page, page.get_by_label("调整分组大小", exact=True), 60, 40)
        await saved(page)
        assert workflow["graph"]["groups"][0]["size"] != after["groups"][0]["size"]
        assert [n["position"] for n in workflow["graph"]["nodes"]] == [n["position"] for n in after["nodes"]]
        # Membership follows full spatial containment, including drag-out and drag-in.
        await b.locator('.canvas-node-head strong').click()
        await drag(page, b.locator('.canvas-node-head strong'), 0, 300)
        await title.click()
        await page.keyboard.press("Control+m")
        await expect(page.locator('.canvas-node-disabled')).to_have_count(1)
        await expect(b.locator('.canvas-node-disabled')).to_have_count(0)
        await page.keyboard.press("Control+m")
        await b.locator('.canvas-node-head strong').click()
        await drag(page, b.locator('.canvas-node-head strong'), 0, -300)
        await title.click()
        payload = await clipboard_copy(page)
        assert len(json.loads(payload)["nodes"]) == 2
        await clipboard_paste(page, payload)
        await expect(page.locator('.canvas-group')).to_have_count(2)
        await expect(page.locator('.react-flow__node')).to_have_count(5)
        await page.keyboard.press("Control+z")
        await expect(page.locator('.canvas-group')).to_have_count(1)
        await title.click()
        await page.keyboard.press("Delete")
        await expect(page.locator('.canvas-group')).to_have_count(0)
        await expect(page.locator('.react-flow__node')).to_have_count(3)
        await page.keyboard.press("Control+z")
        await expect(page.locator('.canvas-group')).to_have_count(1)
        await saved(page)
        await page.reload(wait_until="networkidle")
        await expect(page.locator('.canvas-group')).to_have_count(1)
        await expect(page.get_by_role("button", name="选择分组 图像处理", exact=True)).to_be_in_viewport()
        await page.locator('.react-flow__node[data-id="region"] .canvas-node-head strong').click()
        await page.keyboard.press("Control+b")
        await expect(page.locator('.react-flow__node[data-id="region"] .canvas-node-bypassed')).to_have_count(0)

        # Inner editor owns selection, gestures, clipboard and history while open.
        await page.locator('.react-flow__node[data-id="region"] .canvas-node-head strong').dblclick()
        dialog = page.get_by_role("dialog", name="逐图区域编辑器")
        await expect(dialog).to_be_visible()
        ia = dialog.locator('.react-flow__node[data-id="ia"]')
        ib = dialog.locator('.react-flow__node[data-id="ib"]')
        await ia.locator('.canvas-node-head strong').click()
        await ib.locator('.canvas-node-head strong').click(modifiers=["Shift"])
        await expect(dialog.locator('.react-flow__node.selected')).to_have_count(2)
        await page.keyboard.press("Control+m")
        await expect(dialog.locator('.canvas-node-disabled')).to_have_count(2)
        await expect(a.locator('.canvas-node-disabled')).to_have_count(0)
        await page.keyboard.press("Control+z")
        await expect(dialog.locator('.canvas-node-disabled')).to_have_count(0)
        await ia.locator('.canvas-node-head strong').click()
        await page.keyboard.press("Control+a")
        await page.keyboard.press("Control+g")
        await expect(dialog.locator('.canvas-group')).to_have_count(1)
        await saved(page)
        before_inner = copy.deepcopy(next(n for n in workflow["graph"]["nodes"] if n["id"] == "region")["iteration"]["graph"])
        inner_title = dialog.get_by_role("button", name="选择分组 分组", exact=True)
        await drag(page, inner_title, 25, 35)
        await saved(page)
        after_inner = next(n for n in workflow["graph"]["nodes"] if n["id"] == "region")["iteration"]["graph"]
        assert after_inner["nodes"][0]["position"] == before_inner["nodes"][0]["position"], "fixed root must not move with group"
        assert after_inner["nodes"][1]["position"] != before_inner["nodes"][1]["position"]
        await page.keyboard.press("Control+z")
        await saved(page)
        restored = next(n for n in workflow["graph"]["nodes"] if n["id"] == "region")["iteration"]["graph"]
        assert restored["groups"] == before_inner["groups"]
        await inner_title.click()
        await page.keyboard.press("Control+m")
        await expect(dialog.locator('.canvas-node-disabled')).to_have_count(2)
        await expect(dialog.locator('.react-flow__node[data-id="root"] .canvas-node-disabled')).to_have_count(0)
        await page.keyboard.press("Control+m")
        payload = await clipboard_copy(page)
        assert all(n["type"] != "input.iteration-item" for n in json.loads(payload)["nodes"])
        await clipboard_paste(page, payload)
        await expect(dialog.locator('.canvas-group')).to_have_count(2)
        await page.keyboard.press("Control+z")
        await expect(dialog.locator('.canvas-group')).to_have_count(1)
        await inner_title.click()
        await page.keyboard.press("Delete")
        await expect(dialog.locator('.canvas-group')).to_have_count(0)
        await expect(dialog.locator('.react-flow__node')).to_have_count(3)
        await page.keyboard.press("Control+z")
        await expect(dialog.locator('.canvas-group')).to_have_count(1)
        await dialog.get_by_role("button", name="返回外层画布", exact=True).click()
        await saved(page)
        async with page.expect_download() as pending:
            await page.get_by_role("button", name="导出工作流", exact=True).click()
        exported = json.loads(Path(await (await pending.value).path()).read_text(encoding="utf-8"))
        assert exported["graph"]["groups"]
        assert next(n for n in exported["graph"]["nodes"] if n["id"] == "region")["iteration"]["graph"]["groups"]
        await page.get_by_label("导入工作流文件").set_input_files({"name": "groups.fluxpost-workflow.json", "mimeType": "application/json", "buffer": json.dumps(exported).encode()})
        await expect(page.locator('.canvas-workflow-select')).to_have_value("groups-import")
        await expect(page.locator('.canvas-group')).to_have_count(1)

    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "horizontal document overflow"
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-groups-{theme}-{width}.png", full_page=True)
    assert not errors, errors
    assert not violations, violations
    print(json.dumps({"theme": theme, "width": width, "result": "passed"}), flush=True)
    await page.close()


async def main():
    parsed = urlparse(BASE_URL)
    if parsed.hostname not in ["127.0.0.1", "localhost", "::1"] or parsed.port in [None, 3001]:
        raise RuntimeError("Use an isolated loopback smoke server, never the operator candidate")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ["professional", "editorial", "creator"]:
                for width in [1440, 390]:
                    await check(browser, theme, width)
        except Exception:
            Path("test-artifacts").mkdir(exist_ok=True)
            for context in browser.contexts:
                for page in context.pages:
                    await page.screenshot(path="test-artifacts/canvas-groups-failure.png", full_page=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
