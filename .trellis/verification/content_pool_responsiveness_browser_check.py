import asyncio
import copy
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright, expect
from batch_create_browser_check import WORKFLOW, new_schedule, summary_result

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1") and urlparse(BASE).port != 3001


async def check(browser, width, theme):
    context = await browser.new_context(viewport={"width": width, "height": 960})
    await context.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    workflow = copy.deepcopy(WORKFLOW)
    workflow["graph"]["nodes"].append({"id": "pool", "type": "input.content-pool", "version": 1,
        "position": {"x": 40, "y": 260}, "config": {}, "label": "素材池"})
    task = new_schedule("pool-task")
    pool_filter = {"query": "", "platforms": [], "statuses": [], "mediaTypes": [], "contentTags": [],
        "customTags": [], "includeDescendants": True, "localMediaComplete": False, "sort": "hot-desc",
        "mode": "manual", "itemIds": []}
    task["definition"]["parameters"] = [{"id": "pool-parameter", "name": "内容素材", "scope": "main",
        "valueType": "content-pool", "expansion": "each", "binding": {"nodeId": "pool", "fieldKey": "sourceItemId"},
        "source": {"mode": "content-pool-filter", "filter": pool_filter}}]
    items = [{"id": f"item-{index}", "projectId": "project", "projectName": "Project", "platform": "xiaohongshu",
        "status": "new", "mediaType": "text", "contentTags": [], "customTags": [], "title": f"Source {index}",
        "body": f"Body {index}", "authorName": "Author", "sourceId": str(index), "sourceUrl": "",
        "imageUrls": [], "videoUrls": [], "hotScore": 100 - index, "localMediaComplete": False} for index in range(60)]
    requests = []
    held_ids = asyncio.Event()
    release_ids = asyncio.Event()
    hold_ids = False

    async def route_handler(route):
        nonlocal workflow
        request = route.request
        url = urlparse(request.url)
        params = parse_qs(url.query)
        path = url.path
        body = request.post_data_json if request.method in ("POST", "PATCH") else None
        payload = {}
        if path == "/api/accounts/session":
            payload = {"account": {"id": "owner", "role": "operator"}}
        elif path == "/api/canvas/workflows":
            payload = {"workflows": [workflow]}
        elif path == "/api/canvas/workflows/workflow":
            if body:
                workflow = {**workflow, **body, "revision": workflow["revision"] + 1}
            payload = {"workflow": workflow}
        elif path == "/api/canvas/runs":
            assert request.method == "GET"
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        elif path == "/api/canvas/schedules":
            assert request.method == "GET"
            payload = summary_result([task], {}, request.url, [workflow])
        elif path == "/api/canvas/schedules/pool-task":
            if body:
                assert body["action"] == "save"
                task.update({key: body[key] for key in ("name", "definition") if key in body})
                task["revision"] += 1
            payload = {"schedule": task}
        elif path == "/api/content-pool/selection":
            requests.append(params)
            matches = [item for item in items if params.get("q", [""])[0] in item["title"]]
            if "ids" in params:
                if hold_ids:
                    held_ids.set()
                    await release_ids.wait()
                payload = {"ids": [item["id"] for item in matches], "total": len(matches)}
            elif "itemId" in params:
                payload = {"items": [item for item in items if item["id"] == params["itemId"][0]], "projects": [], "collections": [], "total": 1}
            else:
                offset = int(params.get("cursor", ["0"])[0])
                payload = {"items": matches[offset:offset + 40], "total": len(matches),
                    "projects": [{"id": "project", "name": "Project", "totalItems": 60}], "collections": [],
                    "nextCursor": str(offset + 40) if offset + 40 < len(matches) else None}
        elif path.startswith("/api/crawl") or path.startswith("/api/generate"):
            raise AssertionError("Performance checks must not invoke providers")
        await route.fulfill(json=payload)

    await page.route("**/api/**", route_handler)
    await page.goto(BASE + "/batch-create?scheduleId=pool-task", wait_until="networkidle")
    await expect(page.get_by_role("button", name="配置筛选与选择", exact=True)).to_be_visible()
    assert not requests, "Collapsed parameters must not query candidates"
    await page.get_by_role("button", name="配置筛选与选择", exact=True).click()
    choices = page.locator(".canvas-content-pool-select")
    await expect(choices).to_have_count(40)
    await choices.first.click()
    await expect(choices.first).to_have_attribute("aria-pressed", "true")
    await choices.first.click()
    await page.wait_for_timeout(350)
    assert len(requests) == 1, "Toggling IDs must not reload candidates"
    await page.get_by_role("button", name="条件匹配", exact=True).click()
    await page.get_by_role("button", name="手工选择", exact=True).click()
    await page.wait_for_timeout(350)
    assert len(requests) == 1, "Changing mode must not reload candidates"
    await page.get_by_role("button", name="加载更多", exact=True).click()
    await expect(choices).to_have_count(60)
    results = page.locator(".canvas-content-pool-results")
    await results.evaluate("element => {element.scrollTop=300; element.dispatchEvent(new Event('scroll'));}")
    scroll = await results.evaluate("element => element.scrollTop")
    await page.get_by_role("button", name="收起筛选与选择", exact=True).click()
    await page.get_by_role("button", name="配置筛选与选择", exact=True).click()
    await expect(choices).to_have_count(60)
    assert len(requests) == 2, "Reopening must reuse all loaded pages"
    assert abs(await results.evaluate("element => element.scrollTop") - scroll) < 2
    hold_ids = True
    await page.get_by_role("button", name="选择全部匹配", exact=True).click()
    await asyncio.wait_for(held_ids.wait(), timeout=5)
    await page.get_by_placeholder("搜索标题、正文、作者或来源 ID").fill("Source 999")
    release_ids.set()
    await expect(choices).to_have_count(0)
    await expect(page.get_by_placeholder("搜索标题、正文、作者或来源 ID")).to_have_value("Source 999")
    await expect(page.locator(".canvas-content-pool-toolbar")).to_contain_text("已选 0")

    await page.goto(BASE + "/canvas?workflowId=workflow", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="pool"]')
    await node.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles:true}))")
    await page.get_by_placeholder("搜索标题、正文、作者或来源 ID").fill("Source 1")
    await expect(choices).to_have_count(11)
    count = len(requests)
    await page.get_by_role("button", name="关闭属性", exact=True).click()
    await node.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles:true}))")
    await expect(page.get_by_placeholder("搜索标题、正文、作者或来源 ID")).to_have_value("Source 1")
    await expect(choices).to_have_count(11)
    assert len(requests) == count, "Reopening a node must restore filters and cached candidates"
    await choices.first.click()
    await expect(page.get_by_role("button", name="更换素材", exact=True)).to_be_visible()
    await expect(page.locator(".canvas-snapshot-meta")).to_contain_text("Source 1")
    count = len(requests)
    await page.get_by_role("button", name="关闭属性", exact=True).click()
    await node.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles:true}))")
    await expect(page.get_by_role("button", name="更换素材", exact=True)).to_be_visible()
    assert len(requests) == count, "Opening an existing snapshot must not fetch candidates"
    await page.wait_for_timeout(1100)
    await page.reload(wait_until="networkidle")
    await node.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles:true}))")
    await expect(page.locator(".canvas-snapshot-meta")).to_contain_text("Source 1")
    await page.get_by_role("button", name="更换素材", exact=True).click()
    await expect(page.get_by_placeholder("搜索标题、正文、作者或来源 ID")).to_have_value("Source 1")
    assert not errors, errors
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/pool-responsiveness-{theme}-{width}.png", full_page=True)
    await context.close()
    print(f"{theme}/{width}: query counts, paging, scroll, stale select-all, node restore and snapshot save passed", flush=True)


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ("professional", "creator", "editorial"):
                for width in (1440, 390):
                    await check(browser, width, theme)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
