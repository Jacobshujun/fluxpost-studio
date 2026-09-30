"""Intercepted save-image configuration/results checks; never launches real runs."""
import asyncio
import copy
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
NOW = "2026-09-30T00:00:00Z"


async def check(browser, width, theme):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    workflow = dict(id="local-save", name="本地保存测试", revision=1, ownerUserId="fixture",
                    isTemplate=False, createdAt=NOW, updatedAt=NOW,
                    graph=dict(viewport=dict(x=0, y=0, zoom=0.75), edges=[], nodes=[dict(
                        id="save", type="utility.save-images", version=1, position=dict(x=40, y=40),
                        config=dict(filenamePrefix="小鹏"))]))
    current = dict(id="attempt", runId="run", nodeId="save", nodeType="utility.save-images",
                   attempt=2, status="failed", inputs={}, outputs={}, createdAt=NOW, updatedAt=NOW,
                   error="本地保存成功 1 张，失败 1 张。没有写入权限。", internalMetadata=dict(saveImages=dict(
                       runId="run", nodeId="save", filenamePrefix="小鹏", outputFolder="D:\\当前输出",
                       items=[dict(url="/one.png", status="saved", filePath="D:\\当前输出\\小鹏_0001.png"),
                              dict(url="/two.png", status="failed", error="没有写入权限。") ])))
    historical = copy.deepcopy(current)
    historical.update(id="old-attempt", runId="old-run", status="completed", error=None,
                      outputs=dict(downloads=dict(kind="images", items=[dict(url="/old.png")])))
    historical["internalMetadata"]["saveImages"].update(outputFolder="D:\\旧目录", items=[dict(url="/old.png", status="saved")])
    errors, violations, saves = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def latest(node_run):
        return dict(workflowRevision=1, runId=node_run["runId"], runCreatedAt=NOW,
                    nodeVersion=1, nodeConfig=dict(filenamePrefix="小鹏"), nodeRun=node_run)

    async def intercept(route):
        nonlocal workflow
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
            payload = dict(workflows=[workflow])
        elif parsed.path == "/api/canvas/workflows/local-save":
            if request.method == "PATCH":
                saves.append(request.post_data_json)
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
            payload = dict(workflow=workflow)
        elif parsed.path == "/api/canvas/runs":
            payload = dict(runs=[], latestNodeAttempts=[latest(current)], latestSuccessfulNodeRuns=[latest(historical)])
        elif parsed.path == "/api/canvas/schedules":
            payload = dict(schedules=[])
        elif request.method != "GET":
            violations.append(f"{request.method} {parsed.path}")
        await route.fulfill(json=payload)

    await page.route("**/*", intercept)
    await page.goto(BASE + "/canvas?workflowId=local-save", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="save"]')
    field = node.get_by_label("保存目录", exact=True)
    await expect(field).to_have_value("")
    await field.click()
    await expect(field).to_be_focused()
    await field.fill("D:\\图片 输出\\小鹏P7")
    await expect(field).to_have_value("D:\\图片 输出\\小鹏P7")
    await expect(field).to_be_focused()
    await page.keyboard.press("Backspace")
    await expect(field).to_have_value("D:\\图片 输出\\小鹏P")
    await field.fill("D:\\图片 输出\\小鹏P7")
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    assert workflow["graph"]["nodes"][0]["config"]["outputFolder"] == "D:\\图片 输出\\小鹏P7"
    assert workflow["graph"]["nodes"][0]["position"] == dict(x=40, y=40)
    inspector = page.locator(".canvas-inspector")
    await node.locator(".canvas-node-head strong").click()
    await expect(inspector).to_be_visible()
    await expect(inspector.get_by_label("保存目录", exact=True)).to_have_value("D:\\图片 输出\\小鹏P7")
    await inspector.get_by_label("保存目录", exact=True).fill("output")
    await page.get_by_role("button", name="关闭属性", exact=True).click()
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    await page.reload(wait_until="networkidle")
    await expect(field).to_have_value("output")
    summary = node.locator(".canvas-save-images-summary")
    await expect(summary).to_contain_text("本地保存：1 / 2 张")
    await expect(summary).to_contain_text("D:\\当前输出")
    await expect(summary).not_to_contain_text("旧目录")
    await expect(summary).to_contain_text("没有写入权限")
    await expect(node.locator(".canvas-node-result-history")).to_contain_text("最近成功结果")
    await expect(node.get_by_role("button", name="下载全部", exact=True)).to_be_visible()
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "document overflow"
    assert not errors, errors
    assert not violations, violations
    assert saves
    await page.screenshot(path=f"test-artifacts/canvas-local-save-{theme}-{width}.png", full_page=True)
    await field.click()
    await field.fill("")
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    current.update(status="completed", error=None, outputs=dict(downloads=dict(kind="images", items=[dict(url="/one.png"), dict(url="/two.png")])))
    for item in current["internalMetadata"]["saveImages"]["items"]:
        item.update(status="saved")
        item.pop("error", None)
    await page.reload(wait_until="networkidle")
    await expect(field).to_have_value("")
    await expect(summary).to_contain_text("本地保存：2 / 2 张")
    await expect(node.locator(".canvas-node-result-history")).to_have_count(0)
    await expect(node.get_by_role("button", name="下载全部", exact=True)).to_be_enabled()
    await page.close()
    print(f"PASS local save: {theme} {width}", flush=True)


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
