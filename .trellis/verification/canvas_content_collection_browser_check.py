import asyncio
import copy
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
NOW = "2026-09-09T00:00:00.000Z"
LINKS = [f"https://www.xiaohongshu.com/explore/browser-{index}" for index in range(20)]


async def check(browser, width):
    page = await browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    requests = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    workflow = {
        "id": "collection-workflow", "name": "采集批量测试", "revision": 1,
        "ownerUserId": "browser-owner", "ownerDisplayName": "Browser owner",
        "isTemplate": False, "createdAt": NOW, "updatedAt": NOW,
        "graph": {"viewport": {"x": 0, "y": 0, "zoom": 1}, "nodes": [
            {"id": "collection", "type": "input.content-collection", "version": 1,
             "position": {"x": 40, "y": 40}, "executionMode": "enabled",
             "config": {"links": "\n".join(LINKS), "sourceLink": "", "projectName": "浏览器采集",
                        "platform": "auto", "automaticTagging": False,
                        "videoFrameOriginalReference": True, "enableVideoTranscription": False}},
            {"id": "vision", "type": "model.gpt-vision", "version": 1,
             "position": {"x": 440, "y": 40}, "executionMode": "enabled",
             "config": {"preset": "describe", "instruction": "Describe", "maxImages": 8}},
        ], "edges": [{"id": "images-edge", "source": "collection", "sourcePort": "images", "target": "vision", "targetPort": "images"}]},
    }
    schedule = None

    async def route_handler(route):
        nonlocal workflow, schedule
        request = route.request
        path = urlparse(request.url).path
        body = request.post_data_json if request.method in ["POST", "PATCH"] else None
        requests.append((request.method, path, body))
        payload = {}
        if path == "/api/canvas/workflows":
            payload = {"workflows": [workflow]}
        elif path == "/api/canvas/workflows/collection-workflow":
            if request.method == "PATCH":
                workflow = {**workflow, **body, "revision": workflow["revision"] + 1, "updatedAt": NOW}
            payload = {"workflow": workflow}
        elif path == "/api/canvas/runs":
            assert request.method == "GET", "editing or preflight must not start runs"
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        elif path == "/api/canvas/schedules":
            if request.method == "POST":
                schedule = {"id": "schedule", "name": "采集自动化", "workflowId": workflow["id"],
                            "workflowRevision": workflow["revision"], "revision": 1, "schemaVersion": 2,
                            "status": "draft", "batches": [], "mainTasks": [], "totalMainTasks": 0,
                            "totalChildTasks": 0, "totalContentTasks": 0, "totalImageTasks": 0,
                            "createdAt": NOW, "updatedAt": NOW,
                            "definition": {"parameters": [], "expansion": {"main": "cartesian", "child": "cartesian"},
                                           "sharedOutputs": [], "childResult": {"nodeId": "vision", "outputPort": "text", "artifactKind": "text"},
                                           "aggregationPolicy": "all"}}
                payload = {"schedule": schedule}
            else:
                payload = {"schedules": [schedule] if schedule else []}
        elif path == "/api/canvas/schedules/schedule":
            if request.method == "PATCH":
                if body["action"] == "save":
                    schedule.update({key: copy.deepcopy(body[key]) for key in ["name", "definition", "batches"] if key in body})
                elif body["action"] == "preflight":
                    parameter = schedule["definition"]["parameters"][0]
                    values = parameter["source"]["values"]
                    assert len(values) == 20
                    assert schedule["definition"]["childResult"]["nodeId"] == "vision"
                    assert len(schedule["definition"]["sharedOutputs"]) == 5
                    schedule.update({"status": "ready", "previewRevision": "mock-preview", "totalMainTasks": 20, "totalChildTasks": 20,
                                     "mainTasks": [{"id": f"main-{index}", "parameterValues": {parameter["id"]: value},
                                                    "status": "pending", "resultArtifacts": [], "createdAt": NOW, "updatedAt": NOW,
                                                    "childTasks": [{"id": f"child-{index}", "parameterValues": {}, "status": "pending",
                                                                    "resultArtifacts": [], "createdAt": NOW, "updatedAt": NOW}]} for index, value in enumerate(values)]})
                else:
                    raise AssertionError(f"Unexpected scheduler action: {body['action']}")
                schedule["revision"] += 1
            payload = {"schedule": schedule}
        elif path.startswith("/api/crawl"):
            raise AssertionError("Browser checks must not invoke collection")
        await route.fulfill(status=200, json=payload)

    await page.route("**/api/**", route_handler)
    await page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="collection"]')
    await node.wait_for()
    await node.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    tagging = page.get_by_label("自动打标", exact=True)
    await expect(tagging).not_to_be_checked()
    await tagging.check()
    await expect(tagging).to_be_checked()
    await tagging.uncheck()
    test_link = page.get_by_label("单条测试链接", exact=True)
    await test_link.select_option(LINKS[1])
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-content-collection-panel-{width}.png", full_page=True)
    await expect(test_link).to_have_value(LINKS[1])
    await page.locator(".canvas-inspector-content textarea").fill("\n".join(LINKS + [LINKS[0]]))
    await expect(test_link).to_have_value("")
    await test_link.select_option(LINKS[1])
    await page.get_by_role("button", name="批量调度", exact=True).click()
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    await expect(dialog).to_be_visible()
    await dialog.get_by_role("button", name="新建任务", exact=True).click()
    await dialog.get_by_role("button", name="内容采集预设", exact=True).click()
    assert await dialog.get_by_role("button", name="内容采集预设", exact=True).evaluate("element => getComputedStyle(element).whiteSpace") == "nowrap"
    await expect(dialog.locator("label").filter(has=page.get_by_text("结果项输出", exact=True)).locator("select")).to_have_value("vision::text")
    await expect(dialog.get_by_role("group", name="主任务共享输出").locator('input[type="checkbox"]')).to_have_count(5)
    await page.set_viewport_size({"width": width, "height": 960})
    scalar_editor = dialog.locator(".canvas-schedule-parameter-values")
    values_input = scalar_editor.locator("textarea")
    await values_input.fill(LINKS[0])
    await values_input.press("End")
    await values_input.press("Enter")
    await expect(values_input).to_have_value(LINKS[0] + "\n")
    await values_input.press("Enter")
    await expect(values_input).to_have_value(LINKS[0] + "\n\n")
    await values_input.press("Space")
    await page.keyboard.insert_text("中文参数")
    await expect(values_input).to_have_value(LINKS[0] + "\n\n 中文参数")
    await values_input.press("Control+Home")
    await values_input.press("Enter")
    await expect(values_input).to_have_value("\n" + LINKS[0] + "\n\n 中文参数")
    await values_input.fill("前半后半")
    await values_input.press("Home")
    await values_input.press("ArrowRight")
    await values_input.press("ArrowRight")
    await values_input.press("Enter")
    await expect(values_input).to_have_value("前半\n后半")
    await page.keyboard.insert_text("中间")
    await expect(values_input).to_have_value("前半\n中间后半")
    source_mode = scalar_editor.locator(":scope > label select")
    await source_mode.select_option("fixed")
    await expect(values_input).to_have_value("前半")
    await source_mode.select_option("manual-list")
    await expect(values_input).to_have_value("前半")
    await values_input.fill("\n\n".join(LINKS) + "\n\n")
    await expect(values_input).to_have_value("\n\n".join(LINKS) + "\n\n")
    await dialog.get_by_role("button", name=re.compile("预演")).click()
    await expect(dialog.get_by_text("展开预览 · 20 个任务组 · 20 个结果项", exact=True)).to_be_visible()
    await expect(dialog.get_by_role("button", name="确认并启动", exact=True)).to_be_visible()
    assert workflow["graph"]["nodes"][0]["config"]["automaticTagging"] is False
    assert workflow["graph"]["nodes"][0]["config"]["sourceLink"] == LINKS[1]
    assert not errors, errors
    overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    assert not overflow, f"horizontal overflow at {width}px"
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-content-collection-{width}.png", full_page=True)
    await page.close()
    print(json.dumps({"width": width, "requests": len(requests), "result": "passed"}), flush=True)


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width in [1440, 390]:
                await check(browser, width)
        except Exception:
            Path("test-artifacts").mkdir(exist_ok=True)
            for index, context in enumerate(browser.contexts):
                for page_index, page in enumerate(context.pages):
                    await page.screenshot(path=f"test-artifacts/canvas-collection-failure-{index}-{page_index}.png", full_page=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
