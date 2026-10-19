"""Intercepted gallery, Canvas library node and V1/V2 schedule color interactions."""
import asyncio
import base64
import copy
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1") and urlparse(BASE).port != 3001
NOW = "2026-10-19T00:00:00Z"
PIXEL = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")
RED, BLUE = "#D43C3C", "#3876C7"


async def check(browser, width, theme):
    page = await browser.new_page(viewport=dict(width=width, height=960 if width > 600 else 844))
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    errors, violations, queries, saves, held = [], [], [], [], []
    flags = dict(hold=False)
    profile = dict(scenes=[], vehicleModels=[], vehicleColors=[], angles=[], people="unknown", customTags=[])
    assets = [dict(id=f"asset-{i}", name=f"Image {i}", originalName=f"{i}.png", ownerUserId="fixture", ownerDisplayName="Fixture", visibility="private", canEdit=True,
                   publicUrl=f"/fixture/{i}.png", thumbnailUrl=f"/fixture/{i}.png", width=100, height=100, byteSize=100, createdAt=NOW, updatedAt=NOW,
                   sha256=str(i), collectionIds=[], note="", aiTags=profile, effectiveTags=profile, manualOverrides={}, taggingStatus="idle",
                   palette=dict(status="completed", sha256=str(i), version=1, analyzedAt=NOW, colors=[dict(hex=RED if i % 2 == 0 else BLUE, coverage=1)])) for i in range(70)]
    workflow = dict(id="colors", name="Colors", ownerUserId="fixture", ownerDisplayName="Fixture", revision=1, isTemplate=False, createdAt=NOW, updatedAt=NOW,
                    graph=dict(nodes=[dict(id="library", type="input.library-images", version=1, position=dict(x=50, y=60), config=dict(assetIds=[], assetNames=[], urls=[]))], edges=[], viewport=dict(x=0, y=0, zoom=.85)))
    filt = dict(mode="manual", assetIds=["asset-0"], search="", tags=[])
    common = dict(ownerUserId="fixture", ownerDisplayName="Fixture", workflowId="colors", workflowRevision=1, status="draft", revision=1, totalContentTasks=0, totalImageTasks=0, createdAt=NOW, updatedAt=NOW)
    v1 = dict(**common, id="v1", name="Version One", schemaVersion=1, batches=[dict(id="batch", name="Batch", strategy="input-1", sceneFilter=copy.deepcopy(filt), sceneCount=1,
              vehicleFilter=copy.deepcopy(filt), vehicleCountMin=1, vehicleCountMax=1, contentTasks=[], status="draft", createdAt=NOW, updatedAt=NOW)])
    v2 = dict(**common, id="v2", name="Version Two", schemaVersion=2, batches=[], mainTasks=[], definition=dict(parameters=[dict(id="p", name="图片参数", scope="main", valueType="image", expansion="each",
              source=dict(mode="library-filter", filter=copy.deepcopy(filt)), binding=dict(nodeId="library", fieldKey="assetIds"))], expansion=dict(main="cartesian", child="cartesian"), childResult=dict(nodeId="library", outputPort="images", artifactKind="images"), aggregationPolicy="all-success"))
    schedules = {"v1": v1, "v2": v2}
    state = dict(coverage=dict(total=70, analyzed=68, failed=1, manageableMissing=1, manageableFailed=1))
    page.on("pageerror", lambda e: errors.append(str(e)))

    async def route_handler(route):
        nonlocal workflow, state
        req = route.request
        url = urlparse(req.url)
        path, params = url.path, parse_qs(url.query)
        if url.netloc != urlparse(BASE).netloc:
            violations.append(req.url); await route.abort(); return
        if path.startswith("/fixture/") or path.endswith("/thumbnail"):
            await route.fulfill(content_type="image/gif", body=PIXEL); return
        if not path.startswith("/api/"):
            await route.continue_(); return
        data = {}
        if path == "/api/accounts/session": data = dict(account=dict(id="fixture", username="fixture", displayName="Fixture", role="admin"), hasAccounts=True)
        elif path == "/api/config": data = dict(status={})
        elif path == "/api/library/navigation": data = dict(collections=[], smartFolders=[], counts=dict(all=70, favorites=0, uncategorized=70))
        elif path == "/api/library/tags": data = dict(tags=[])
        elif path == "/api/library/colors/jobs":
            if req.method == "POST":
                assert req.post_data_json["mode"] in ("missing", "failed")
                state = dict(coverage=state["coverage"], job=dict(id="job", status="running", total=2, completed=0, failed=0, failures=[]))
            data = state
        elif path == "/api/library/colors/jobs/job":
            state = dict(coverage=dict(total=70, analyzed=69, failed=1, manageableMissing=0, manageableFailed=1), job=dict(id="job", status="completed", total=2, completed=1, failed=1, failures=[dict(assetId="broken", error="图片损坏")]))
            data = state
        elif path == "/api/library/assets":
            queries.append(params)
            result = [a for a in assets if not params.get("color") or a["palette"]["colors"][0]["hex"] == params["color"][0]]
            offset = int(params.get("cursor", ["0"])[0]); limit = int(params.get("limit", ["60"])[0])
            data = dict(assets=result[offset:offset+limit], nextCursor=str(offset+limit) if offset+limit < len(result) else None)
            if params.get("count") != ["0"]: data["total"] = len(result)
            if flags["hold"] and params.get("color") == [BLUE]: held.append((route, data)); return
        elif path.startswith("/api/library/assets/"):
            data = dict(asset=next(a for a in assets if a["id"] == path.split("/")[-1]))
        elif path == "/api/canvas/workflows": data = dict(workflows=[workflow])
        elif path == "/api/canvas/workflows/colors":
            if req.method == "PATCH": workflow = {**workflow, **req.post_data_json, "revision": workflow["revision"]+1}; saves.append(req.post_data_json)
            data = dict(workflow=workflow)
        elif path == "/api/canvas/runs": data = dict(runs=[], latestNodeAttempts=[], latestSuccessfulNodeRuns=[])
        elif path == "/api/canvas/schedules": data = dict(schedules=list(schedules.values()))
        elif path.startswith("/api/canvas/schedules/"):
            sid = path.split("/")[-1]
            if req.method == "PATCH": schedules[sid].update(req.post_data_json); saves.append(req.post_data_json)
            data = dict(schedule=schedules[sid])
        elif req.method != "GET": violations.append(f"{req.method} {path}")
        await route.fulfill(json=data)

    await page.route("**/*", route_handler)
    await page.goto(BASE+"/library", wait_until="networkidle")
    await expect(page.locator("article")).to_have_count(60)
    await expect(page.get_by_text("颜色筛选尚不完整：已分析 68/70 张", exact=True)).to_be_visible()
    await page.get_by_role("button", name="分析已有图片", exact=True).click()
    await expect(page.get_by_text("分析完成 2/2 · 1 张失败", exact=True)).to_be_visible()
    await page.get_by_text("失败详情", exact=True).click()
    await expect(page.get_by_text("broken：图片损坏", exact=True)).to_be_visible()
    await page.get_by_role("button", name="筛选蓝色", exact=True).click()
    await expect(page.locator("article")).to_have_count(35)
    assert parse_qs(urlparse(page.url).query)["color"] == [BLUE]
    await page.reload(wait_until="networkidle")
    await expect(page.locator("article")).to_have_count(35)
    await page.get_by_role("button", name="清除颜色筛选", exact=True).click()
    await expect(page.locator("article")).to_have_count(60)
    flags["hold"] = True
    await page.get_by_role("button", name="筛选蓝色", exact=True).click()
    await page.wait_for_timeout(100)
    await page.get_by_role("button", name="筛选红色", exact=True).click()
    await expect(page.locator("article")).to_have_count(35)
    flags["hold"] = False
    for route, payload in held:
        try: await route.fulfill(json=payload)
        except Exception: pass  # Browser may abort the superseded request.
    held.clear()
    await expect(page.locator("article").first.get_by_role("button", name="查看 Image 0", exact=True)).to_be_visible()
    await page.get_by_role("button", name="查看 Image 0", exact=True).click()
    viewer = page.get_by_role("dialog", name="图片查看", exact=True)
    await expect(viewer).to_be_visible()
    await viewer.get_by_role("button", name="按主色 #D43C3C 筛选，占比 100.0%", exact=True).click()
    await expect(viewer).to_have_count(0)
    assert "asset" not in parse_qs(urlparse(page.url).query)
    await page.get_by_role("button", name="清除颜色筛选", exact=True).click()
    await page.go_back(wait_until="networkidle")
    await expect(page.locator("article")).to_have_count(35)
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/library-colors-{theme}-{width}.png", full_page=True)

    await page.goto(BASE+"/canvas?workflowId=colors", wait_until="networkidle")
    await page.locator('.react-flow__node[data-id="library"] .canvas-node-head strong').click()
    inspector = page.locator(".canvas-inspector")
    await inspector.get_by_role("button", name="筛选红色", exact=True).click()
    await expect(inspector.locator('.canvas-picker-results input[type=checkbox]')).to_have_count(24)
    await inspector.locator('.canvas-picker-results input[type=checkbox]').first.check()
    await inspector.get_by_role("button", name="筛选蓝色", exact=True).click()
    await expect(inspector.locator('.canvas-picker-results input[type=checkbox]')).to_have_count(24)
    await expect(inspector.locator('.canvas-picker-results label small').first).to_have_text("Image 1")
    await expect(inspector.locator(".canvas-picker-selected > div")).to_have_count(1)
    flags["hold"] = True
    await inspector.get_by_role("button", name="加载更多", exact=True).click()
    await page.wait_for_timeout(100)
    await inspector.get_by_role("button", name="筛选红色", exact=True).click()
    await expect(inspector.locator('.canvas-picker-results label small').first).to_have_text("Image 0")
    flags["hold"] = False
    assert held, "the stale cursor response must actually be pending"
    for route, payload in held:
        try: await route.fulfill(json=payload)
        except Exception: pass
    held.clear()
    await expect(inspector.locator('.canvas-picker-results input[type=checkbox]')).to_have_count(24)
    await inspector.get_by_role("button", name="清除颜色筛选", exact=True).click()
    await expect(inspector.locator('.canvas-picker-results input[type=checkbox]')).to_have_count(0)
    await page.get_by_role("button", name="关闭属性", exact=True).click()
    await page.get_by_role("button", name="批量调度", exact=True).click()
    center = page.get_by_role("dialog", name="Canvas 批量调度", exact=True)
    for sid, name in [("v1", "Version One"), ("v2", "Version Two")]:
        await center.locator(".canvas-schedule-list").get_by_role("button").filter(has_text=name).click()
        picker = center.locator(".canvas-schedule-assets").first
        await expect(picker.get_by_role("button", name="筛选蓝色", exact=True)).to_be_visible()
        await picker.get_by_role("button", name="筛选蓝色", exact=True).click()
        await expect(picker.locator(".canvas-schedule-asset-grid article")).to_have_count(24)
        await expect(picker.get_by_role("button", name="清除颜色筛选", exact=True)).to_be_visible()
        await picker.get_by_role("button", name="加载更多", exact=True).click()
        await expect(picker.locator(".canvas-schedule-asset-grid article")).to_have_count(35)
        await page.wait_for_timeout(1300)
        saved_filter = schedules[sid]["batches"][0]["sceneFilter"] if sid == "v1" else schedules[sid]["definition"]["parameters"][0]["source"]["filter"]
        assert saved_filter["color"] == BLUE, saved_filter
        assert saved_filter["assetIds"] == ["asset-0"], "filter must retain chosen/frozen IDs"
    assert not errors, errors
    assert not violations, violations
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    await page.screenshot(path=f"test-artifacts/canvas-library-colors-{theme}-{width}.png", full_page=True)
    await page.close()
    print(f"Library/Canvas colors {theme} {width}: passed", flush=True)


async def main():
    async with async_playwright() as p:
        options = dict(headless=True)
        if os.environ.get("FLUXPOST_BROWSER_EXECUTABLE"): options["executable_path"] = os.environ["FLUXPOST_BROWSER_EXECUTABLE"]
        browser = await p.chromium.launch(**options)
        try:
            for theme in ("professional", "editorial", "creator"):
                for width in (1440, 390): await check(browser, width, theme)
        finally: await browser.close()

asyncio.run(main())
