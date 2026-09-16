import asyncio
import copy
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE_URL).hostname in ["127.0.0.1", "localhost"] and urlparse(BASE_URL).port != 3001
NOW = "2026-09-16T00:00:00.000Z"
IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH9sAAAAASUVORK5CYII="


async def check(browser, width):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    errors, queries, saves = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    workflow = dict(id="library-workflow", name="智能文件夹测试", revision=1, ownerUserId="owner",
                    ownerDisplayName="Fixture", isTemplate=False, createdAt=NOW, updatedAt=NOW,
                    graph=dict(viewport=dict(x=0, y=0, zoom=1), nodes=[
                        dict(id="library", type="input.library-images", version=1,
                             position=dict(x=40, y=40), executionMode="enabled",
                             config=dict(assetIds=[], assetNames=[], urls=[])),
                    ], edges=[]))
    schedule = dict(id="schedule", name="智能图集任务", workflowId=workflow["id"], workflowRevision=1,
                    revision=1, schemaVersion=2, status="draft", batches=[], mainTasks=[],
                    totalMainTasks=0, totalChildTasks=0, totalImageTasks=0, completedImageTasks=0,
                    failedImageTasks=0, createdAt=NOW, updatedAt=NOW,
                    definition=dict(parameters=[dict(id="images", name="素材图片", scope="main",
                        valueType="image", expansion="each", binding=dict(nodeId="library", fieldKey="urls"),
                        source=dict(mode="library-filter", filter=dict(mode="random", assetIds=[], search="", tags=[])))],
                        expansion=dict(main="cartesian", child="cartesian"), sharedOutputs=[],
                        childResult=dict(nodeId="library", outputPort="images", artifactKind="images"),
                        aggregationPolicy="all"))

    async def handler(route):
        nonlocal workflow, schedule
        request = route.request
        url = urlparse(request.url)
        payload = {}
        if url.path == "/api/canvas/workflows":
            payload = dict(workflows=[workflow])
        elif url.path == "/api/canvas/workflows/library-workflow":
            if request.method == "PATCH":
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
            payload = dict(workflow=workflow)
        elif url.path == "/api/canvas/runs":
            assert request.method == "GET"
            payload = dict(runs=[], latestSuccessfulNodeRuns=[])
        elif url.path == "/api/canvas/schedules":
            assert request.method == "GET"
            payload = dict(schedules=[schedule])
        elif url.path == "/api/canvas/schedules/schedule":
            if request.method == "PATCH":
                body = request.post_data_json
                assert body["action"] == "save"
                saves.append(copy.deepcopy(body))
                schedule.update({key: copy.deepcopy(body[key]) for key in ["name", "definition", "batches"] if key in body})
                schedule["revision"] += 1
            payload = dict(schedule=schedule)
        elif url.path == "/api/library/navigation":
            payload = dict(collections=[dict(id="ordinary", name="普通图集", relativePath="普通图集")],
                           smartFolders=[dict(id="favorites", name="智能收藏")], counts=dict(all=3, uncategorized=0, favorites=2))
        elif url.path == "/api/library/assets":
            query = parse_qs(url.query)
            queries.append(query)
            smart = query.get("smartFolderId") == ["favorites"]
            second = "cursor" in query
            asset_id = "smart-2" if second else "smart-1" if smart else "ordinary-1"
            payload = dict(assets=[dict(id=asset_id, name=asset_id, publicUrl=IMAGE, width=1, height=1)], total=2 if smart else 1)
            if smart and not second:
                payload["nextCursor"] = "smart-next"
        elif "/thumbnail" in url.path:
            await route.fulfill(status=200, content_type="image/svg+xml", body='<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
            return
        else:
            assert request.method == "GET", f"Unexpected write: {url.path}"
        await route.fulfill(status=200, json=payload)

    await page.route("**/api/**", handler)
    await page.goto(f"{BASE_URL}/canvas?workflowId=library-workflow", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="library"]')
    await node.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    picker = page.locator(".canvas-snapshot-picker")
    await expect(picker).to_be_visible()
    assert not queries, "Opening the node must stay idle"
    scope = picker.get_by_label("图集或智能文件夹")
    await scope.focus()
    await expect(scope.locator('option[value="smart:favorites"]')).to_have_count(1)
    await scope.select_option("smart:favorites")
    await expect(picker.locator(".canvas-picker-results label")).to_have_count(1)
    await picker.locator('.canvas-picker-results input[type="checkbox"]').check()
    await picker.get_by_role("button", name="加载更多", exact=True).click()
    await expect(picker.locator(".canvas-picker-results label")).to_have_count(2)
    assert queries[-1].get("smartFolderId") == ["favorites"] and queries[-1].get("cursor") == ["smart-next"]
    await scope.select_option("collection:ordinary")
    await expect(picker.locator(".canvas-picker-results")).to_contain_text("ordinary-1")
    assert queries[-1].get("collectionId") == ["ordinary"] and "smartFolderId" not in queries[-1]
    await expect(picker.locator(".canvas-picker-selected")).to_contain_text("smart-1")

    await page.get_by_role("button", name="批量调度", exact=True).click()
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    await expect(dialog).to_be_visible()
    schedule_scope = dialog.locator(".canvas-schedule-filter-row select")
    await expect(schedule_scope).to_have_count(1)
    async with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/api/canvas/schedules/schedule")):
        await schedule_scope.select_option("smart:favorites")
    await expect(schedule_scope).to_have_value("smart:favorites")
    assert saves[-1]["definition"]["parameters"][0]["source"]["filter"]["smartFolderId"] == "favorites"
    await page.reload(wait_until="networkidle")
    if not await page.get_by_role("dialog", name="Canvas 批量调度").is_visible():
        await page.get_by_role("button", name="批量调度", exact=True).click()
    schedule_scope = page.locator(".canvas-schedule-filter-row select")
    await expect(schedule_scope).to_have_value("smart:favorites")
    async with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/api/canvas/schedules/schedule")):
        await schedule_scope.select_option("collection:ordinary")
    assert "smartFolderId" not in saves[-1]["definition"]["parameters"][0]["source"]["filter"]
    async with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/api/canvas/schedules/schedule")):
        await schedule_scope.select_option("")
    assert "collectionId" not in saves[-1]["definition"]["parameters"][0]["source"]["filter"]
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert not errors, errors
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-smart-folders-{width}.png", full_page=True)
    await page.close()
    print(json.dumps(dict(width=width, result="passed")), flush=True)


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width in [1440, 390]:
                await check(browser, width)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
