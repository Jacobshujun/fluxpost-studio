"""Isolated generated library/Canvas checks; every API and media request intercepted."""
import asyncio
import base64
import copy
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1") and urlparse(BASE).port != 3001
NOW = "2026-10-26T08:00:00.000Z"
PIXEL = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")


async def check(browser, width, theme):
    page = await browser.new_page(viewport=dict(width=width, height=960 if width > 600 else 844))
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    errors, violations, queries = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    profile = dict(scenes=[], vehicleModels=["Model A"], vehicleColors=[], angles=[], people="unknown", customTags=[])
    assets = [dict(id=f"asset-{i}", name=f"Image {i}", originalName=f"car-{i}.png", ownerUserId="fixture", ownerDisplayName="Fixture",
                   visibility="private", canEdit=True, publicUrl=f"/fixture/{i}.png", thumbnailUrl=f"/fixture/{i}.png", width=100, height=100,
                   byteSize=100, createdAt=NOW, updatedAt=NOW, sha256=str(i), collectionIds=[], note="", aiTags=profile, effectiveTags=profile,
                   manualOverrides={}, taggingStatus="idle", generated=dict(entry="canvas", taskId="run-fixture", generatedAt=NOW, timeBasis="saved"),
                   generatedSources=[dict(entry="canvas", taskId="run-fixture", sourceId="node-fixture", sourceKind="canvas-node")]) for i in range(65)]
    graph = dict(nodes=[dict(id="library", type="input.library-images", version=1, position=dict(x=50, y=60), config=dict(assetIds=[], assetNames=[], urls=[]))], edges=[], viewport=dict(x=0, y=0, zoom=.85))
    workflow = dict(id="generated", name="Generated", ownerUserId="fixture", ownerDisplayName="Fixture", revision=1, isTemplate=False, createdAt=NOW, updatedAt=NOW, graph=graph)
    filt = dict(mode="manual", assetIds=["asset-0"], search="", tags=[])
    common = dict(ownerUserId="fixture", ownerDisplayName="Fixture", workflowId="generated", workflowRevision=1, status="draft", revision=1, totalContentTasks=0, totalImageTasks=0, createdAt=NOW, updatedAt=NOW)
    schedules = {
        "v1": dict(**common, id="v1", name="Version One", schemaVersion=1, batches=[dict(id="batch", name="Batch", strategy="input-1", sceneFilter=copy.deepcopy(filt), sceneCount=1, vehicleFilter=copy.deepcopy(filt), vehicleCountMin=1, vehicleCountMax=1, contentTasks=[], status="draft", createdAt=NOW, updatedAt=NOW)]),
        "v2": dict(**common, id="v2", name="Version Two", schemaVersion=2, batches=[], mainTasks=[], definition=dict(parameters=[dict(id="p", name="图片参数", scope="main", valueType="image", expansion="each", source=dict(mode="library-filter", filter=copy.deepcopy(filt)), binding=dict(nodeId="library", fieldKey="assetIds"))], expansion=dict(main="cartesian", child="cartesian"), childResult=dict(nodeId="library", outputPort="images", artifactKind="images"), aggregationPolicy="all-success")),
    }
    smart = dict(id="smart", name="Generated Smart", visibility="private", ownerUserId="fixture", canEdit=True, match="all", conditions=[dict(id="one", field="generated", operator="is", value=True)])

    async def intercept(route):
        nonlocal workflow
        req = route.request
        url = urlparse(req.url)
        path, params = url.path, parse_qs(url.query)
        if url.netloc != urlparse(BASE).netloc:
            violations.append(req.url); await route.abort(); return
        if path == "/fixture/3.png" or path.endswith("/asset-3/thumbnail"):
            await route.fulfill(status=404, body="Missing fixture image"); return
        if path.startswith("/fixture/") or path.endswith("/thumbnail"):
            await route.fulfill(content_type="image/gif", body=PIXEL); return
        if not path.startswith("/api/"):
            await route.continue_(); return
        data = {}
        if path == "/api/accounts/session": data = dict(account=dict(id="fixture", username="fixture", displayName="Fixture", role="admin"), hasAccounts=True)
        elif path == "/api/config": data = dict(status={})
        elif path == "/api/library/navigation": data = dict(collections=[], smartFolders=[smart], counts=dict(all=65, generated=65, favorites=0, uncategorized=65))
        elif path == "/api/library/tags": data = dict(tags=[])
        elif path == "/api/library/colors/jobs": data = dict(coverage=dict(total=65, analyzed=0, failed=0, manageableMissing=65, manageableFailed=0))
        elif path == "/api/library/generated":
            if req.method == "POST" and req.post_data_json["action"] == "vehicle": data = dict(updated=1, failures=[])
            else: data = dict(counts=dict(indexed=65, failed=1), scan=dict(status="completed", uncertain=3, duplicates=2), failures=[dict(id="broken", error="图片失效")])
        elif path == "/api/library/assets":
            queries.append(params)
            if params.get("filename") == ["query-failure"]:
                await route.fulfill(status=500, json=dict(error="Fixture query failed")); return
            result = [a for a in assets if not params.get("filename") or params["filename"][0] in a["originalName"]]
            offset, limit = int(params.get("cursor", ["0"])[0]), int(params.get("limit", ["60"])[0])
            data = dict(assets=result[offset:offset + limit], total=len(result), nextCursor=str(offset + limit) if offset + limit < len(result) else None)
        elif path.startswith("/api/library/assets/"):
            asset = next(a for a in assets if a["id"] == path.split("/")[-1])
            if req.method == "PATCH":
                asset.update(req.post_data_json)
                asset["effectiveTags"] = {**asset["effectiveTags"], **asset["manualOverrides"]}
            data = dict(asset=asset)
        elif path == "/api/canvas/workflows": data = dict(workflows=[workflow])
        elif path == "/api/canvas/workflows/generated":
            if req.method == "PATCH": workflow = {**workflow, **req.post_data_json, "revision": workflow["revision"] + 1}
            data = dict(workflow=workflow)
        elif path == "/api/canvas/runs": data = dict(runs=[], latestNodeAttempts=[], latestSuccessfulNodeRuns=[])
        elif path == "/api/canvas/schedules": data = dict(schedules=list(schedules.values()))
        elif path.startswith("/api/canvas/schedules/"):
            sid = path.split("/")[-1]
            if req.method == "PATCH": schedules[sid].update(req.post_data_json)
            data = dict(schedule=schedules[sid])
        elif req.method != "GET": violations.append(f"{req.method} {path}")
        await route.fulfill(json=data)

    await page.route("**/*", intercept)
    await page.goto(BASE + "/library?view=generated", wait_until="networkidle")
    await expect(page.locator("article")).to_have_count(60)
    await expect(page.locator("article").get_by_text("缩略图读取失败", exact=True)).to_have_count(1)
    await expect(page.get_by_label("生成图片收录状态")).to_contain_text("无法确认 3")
    await expect(page.get_by_label("生成图片收录状态")).to_contain_text("图片失效")
    await page.get_by_label("原始文件名", exact=True).fill("car-1")
    await page.get_by_label("车型筛选", exact=True).fill("Model A")
    await expect(page.locator("article")).to_have_count(11)
    assert queries[-1]["filename"] == ["car-1"] and queries[-1]["vehicleModel"] == ["Model A"]
    await page.get_by_label("未标注车型", exact=True).check()
    await page.wait_for_timeout(200)
    assert queries[-1]["unlabelledVehicle"] == ["true"]
    await page.get_by_label("未标注车型", exact=True).uncheck()
    await page.get_by_role("button", name="查看 Image 1", exact=True).click()
    viewer = page.get_by_role("dialog", name="图片查看", exact=True)
    await expect(viewer.get_by_label("生成来源")).to_contain_text("car-1.png")
    await expect(viewer.get_by_label("生成来源")).to_contain_text("run-fixture")
    if width < 600:
        # Metadata remains available through the existing mobile details toggle.
        await viewer.get_by_role("button", name="图片详情", exact=True).click()
    await viewer.get_by_label("图片车型", exact=True).fill("Manual Browser")
    await viewer.get_by_role("button", name="保存", exact=True).click()
    await expect(viewer.get_by_label("图片车型", exact=True)).to_have_value("Manual Browser")
    await viewer.get_by_role("button", name="从图库移除", exact=True).click()
    removal = page.get_by_role("dialog", name="从图库移除图片", exact=True)
    await expect(removal).to_contain_text("保留原图与历史任务")
    await removal.get_by_role("button", name="取消", exact=True).click()
    await page.keyboard.press("Escape")
    await page.get_by_label("原始文件名", exact=True).fill("query-failure")
    await expect(page.get_by_text("Fixture query failed", exact=True)).to_be_visible()
    await page.get_by_label("原始文件名", exact=True).fill("")
    await expect(page.locator("article")).to_have_count(60)
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/generated-library-{theme}-{width}.png", full_page=True)

    await page.goto(BASE + "/canvas?workflowId=generated", wait_until="networkidle")
    await page.locator('.react-flow__node[data-id="library"] .canvas-node-head strong').click()
    inspector = page.locator(".canvas-inspector")
    await inspector.get_by_label("图片来源", exact=True).select_option("generated")
    await inspector.get_by_label("原始文件名", exact=True).fill("car-")
    await inspector.get_by_label("车型筛选", exact=True).fill("Model A")
    await expect(inspector.locator('.canvas-picker-results input[type=checkbox]')).to_have_count(24)
    await inspector.locator('.canvas-picker-results input[type=checkbox]').first.check()
    await page.wait_for_timeout(1300)
    frozen = copy.deepcopy(workflow["graph"]["nodes"][0]["config"])
    await inspector.get_by_label("图集或智能文件夹", exact=True).select_option("smart:smart")
    await page.wait_for_timeout(500)
    assert queries[-1]["smartFolderId"] == ["smart"]
    assets[0]["publicUrl"] = "/fixture/changed.png"
    await inspector.get_by_label("原始文件名", exact=True).fill("car-1")
    await page.wait_for_timeout(600)
    assert workflow["graph"]["nodes"][0]["config"]["urls"] == frozen["urls"], "Query changes must not refresh the frozen snapshot"
    await inspector.get_by_title("刷新所选素材").click()
    await page.wait_for_timeout(1300)
    assert workflow["graph"]["nodes"][0]["config"]["urls"] == ["/fixture/changed.png"]
    await page.get_by_role("button", name="关闭属性", exact=True).click()
    await page.get_by_role("button", name="批量调度", exact=True).click()
    center = page.get_by_role("dialog", name="Canvas 批量调度", exact=True)
    for sid, name in [("v1", "Version One"), ("v2", "Version Two")]:
        await center.locator(".canvas-schedule-list").get_by_role("button").filter(has_text=name).click()
        picker = center.locator(".canvas-schedule-assets").first
        await picker.get_by_label("图片来源", exact=True).select_option("canvas")
        await picker.get_by_label("原始文件名", exact=True).fill("car-")
        await picker.get_by_label("车型筛选", exact=True).fill("Model A")
        await expect(picker.locator(".canvas-schedule-asset-grid article")).to_have_count(24)
        await page.wait_for_timeout(1300)
        saved = schedules[sid]["batches"][0]["sceneFilter"] if sid == "v1" else schedules[sid]["definition"]["parameters"][0]["source"]["filter"]
        assert saved["generated"] and saved["generationEntry"] == "canvas" and saved["filename"] == "car-" and saved["vehicleModels"] == ["Model A"]
        assert saved["assetIds"] == ["asset-0"]
    assert not errors, errors
    assert not violations, violations
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    await page.screenshot(path=f"test-artifacts/generated-canvas-{theme}-{width}.png", full_page=True)
    await page.close()
    print(f"Generated library/Canvas {theme} {width}: passed", flush=True)


async def main():
    async with async_playwright() as p:
        options = dict(headless=True)
        if os.environ.get("FLUXPOST_BROWSER_EXECUTABLE"): options["executable_path"] = os.environ["FLUXPOST_BROWSER_EXECUTABLE"]
        browser = await p.chromium.launch(**options)
        try:
            for theme in ["professional", "editorial", "creator"]:
                for width in [1440, 390]: await check(browser, width, theme)
        finally: await browser.close()

asyncio.run(main())
