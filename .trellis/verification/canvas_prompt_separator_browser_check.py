import asyncio
import copy
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
PROMPTS = ["上图：车型A\n  文案：A\n\n下图：车型B\n文字：B --- 细节", "上图：车型C\n\n下图：车型D"]
NOTE = "单独一行 --- 分隔任务；段内换行和空行保留，分隔符不会传入任务。"
NOW = "2026-09-15T00:00:00.000Z"


async def check(browser, width):
    page = await browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    workflow = {"id": "prompt-workflow", "name": "双车提示词测试", "revision": 1,
                "ownerUserId": "browser-owner", "createdAt": NOW, "updatedAt": NOW,
                "graph": {"nodes": [{"id": "prompt", "type": "input.text", "version": 1,
                                     "position": {"x": 80, "y": 80}, "config": {"text": "fixture"}}],
                          "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}}
    schedule = {"id": "prompt-schedule", "name": "双车多段提示词", "workflowId": workflow["id"],
                "workflowRevision": 1, "revision": 1, "schemaVersion": 2, "status": "draft",
                "batches": [], "mainTasks": [], "totalMainTasks": 0, "totalChildTasks": 0,
                "totalContentTasks": 0, "totalImageTasks": 0, "createdAt": NOW, "updatedAt": NOW,
                "definition": {"parameters": [{"id": "prompt-value", "name": "提示词", "scope": "main",
                                               "valueType": "text", "expansion": "each",
                                               "binding": {"nodeId": "prompt", "fieldKey": "text"},
                                               "source": {"mode": "manual-list", "values": ["第一项", "第二项"]}}],
                               "expansion": {"main": "cartesian", "child": "cartesian"},
                               "sharedOutputs": [], "childResult": {"nodeId": "prompt", "outputPort": "text", "artifactKind": "text"},
                               "aggregationPolicy": "all"}}
    expected_values = None

    async def route_handler(route):
        request = route.request
        path = urlparse(request.url).path
        payload = {}
        if path == "/api/canvas/workflows":
            payload = {"workflows": [workflow]}
        elif path == "/api/canvas/workflows/prompt-workflow":
            payload = {"workflow": workflow}
        elif path == "/api/canvas/schedules":
            assert request.method == "GET"
            payload = {"schedules": [schedule]}
        elif path == "/api/canvas/schedules/prompt-schedule":
            if request.method == "PATCH":
                body = request.post_data_json
                if body["action"] == "save":
                    schedule.update({key: copy.deepcopy(body[key]) for key in ["name", "definition", "batches"] if key in body})
                elif body["action"] == "preflight":
                    source = schedule["definition"]["parameters"][0]["source"]
                    assert source["values"] == expected_values
                    values = source["values"]
                    schedule.update({"status": "ready", "previewRevision": "mock-preview",
                                     "totalMainTasks": len(values), "totalChildTasks": len(values),
                                     "mainTasks": [{"id": f"main-{i}", "status": "pending", "parameterValues": {"prompt-value": value},
                                                    "resultArtifacts": [], "createdAt": NOW, "updatedAt": NOW,
                                                    "childTasks": [{"id": f"child-{i}", "status": "pending", "parameterValues": {},
                                                                    "resultArtifacts": [], "createdAt": NOW, "updatedAt": NOW}]} for i, value in enumerate(values)]})
                else:
                    raise AssertionError(f"Unexpected scheduler action: {body['action']}")
                schedule["revision"] += 1
            payload = {"schedule": schedule}
        elif path == "/api/canvas/runs":
            assert request.method == "GET", "must not launch generation"
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        elif request.method != "GET":
            raise AssertionError(f"Unexpected write: {path}")
        await route.fulfill(status=200, json=payload)

    await page.route("**/api/**", route_handler)
    await page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    await page.get_by_role("button", name="批量调度", exact=True).click()
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    editor = dialog.locator(".canvas-schedule-parameter-values")
    separator = editor.get_by_role("combobox", name="分隔方式", exact=True)
    textarea = editor.locator("textarea")
    source_mode = editor.locator(":scope > label select")
    await expect(separator).to_have_value("line")
    await page.set_viewport_size({"width": width, "height": 960})
    raw = "\n---\n".join(PROMPTS) + "\n---\n\n"
    await textarea.fill(raw)
    await separator.select_option("delimiter")
    await expect(textarea).to_have_value(raw)
    await expect(editor.get_by_text(NOTE, exact=True)).to_be_visible()
    await expect(textarea).to_have_accessible_description(NOTE)
    await textarea.press("Control+End")
    await textarea.press("Enter")
    await expect(textarea).to_have_value(raw + "\n")
    expected_values = PROMPTS
    await dialog.get_by_role("button", name="预演展开", exact=True).click()
    await expect(dialog.get_by_text("展开预览 · 2 个任务组 · 2 个结果项", exact=True)).to_be_visible()
    assert schedule["definition"]["parameters"][0]["source"]["listSeparator"] == "delimiter"
    # Reload the persisted fixture, then exercise the scheduler at the target width.
    await page.set_viewport_size({"width": 1440, "height": 960})
    await page.reload(wait_until="networkidle")
    await expect(dialog).to_be_visible()
    await page.set_viewport_size({"width": width, "height": 960})
    await expect(separator).to_have_value("delimiter")
    await expect(textarea).to_have_value("\n---\n".join(PROMPTS))
    await source_mode.select_option("fixed")
    await expect(textarea).to_have_value(PROMPTS[0])
    await textarea.fill(PROMPTS[1])
    expected_values = [PROMPTS[1]]
    await dialog.get_by_role("button", name="预演展开", exact=True).click()
    await expect(dialog.get_by_text("展开预览 · 1 个任务组 · 1 个结果项", exact=True)).to_be_visible()
    await source_mode.select_option("manual-list")
    await expect(separator).to_have_value("delimiter")
    await expect(textarea).to_have_value(PROMPTS[1])
    # Switching separators reparses the actual draft and retains its layout.
    await separator.select_option("line")
    await expect(textarea).to_have_value(PROMPTS[1])
    expected_values = ["上图：车型C", "下图：车型D"]
    await dialog.get_by_role("button", name="预演展开", exact=True).click()
    await expect(dialog.get_by_text("展开预览 · 2 个任务组 · 2 个结果项", exact=True)).to_be_visible()
    await source_mode.select_option("fixed")
    await textarea.fill(PROMPTS[0])
    await source_mode.select_option("manual-list")
    await expect(separator).to_have_value("delimiter")
    await expect(textarea).to_have_value(PROMPTS[0])
    await textarea.fill("\n---\n".join(PROMPTS))
    await editor.get_by_text(NOTE, exact=True).scroll_into_view_if_needed()
    assert not errors, errors
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-prompt-separator-{width}.png", full_page=True)
    await page.close()
    print(f"Canvas prompt separator browser {width}px passed", flush=True)


async def main():
    base = urlparse(BASE_URL)
    assert base.hostname in ["127.0.0.1", "localhost"] and base.port != 3001, "use an isolated smoke server"
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width in [1440, 390]:
                await check(browser, width)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
