"""Isolated gallery acceptance: intercept every API and all media, never use 3001."""
import base64
import json
import os
import re
import tempfile
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get("FLUXPOST_BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE_URL).hostname in ("127.0.0.1", "localhost") and urlparse(BASE_URL).port != 3001
CHROME = os.environ.get("FLUXPOST_BROWSER_EXECUTABLE")
PIXEL = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")
EMPTY = {"scenes": [], "vehicleModels": [], "vehicleColors": [], "angles": [], "people": "unknown", "customTags": []}
COLLECTIONS = [
    {"id": "campaign", "name": "Campaign", "relativePath": "Campaign", "visibility": "private", "ownerUserId": "owner-1", "ownerDisplayName": "Owner", "canEdit": True},
    {"id": "detail", "name": "Detail", "relativePath": "Campaign/Detail", "parentId": "campaign", "visibility": "private", "ownerUserId": "owner-1", "ownerDisplayName": "Owner", "canEdit": True},
    {"id": "archive", "name": "Archive", "relativePath": "Archive", "visibility": "team", "ownerUserId": "owner-2", "ownerDisplayName": "Team", "canEdit": False},
]

def make_asset(i):
    return {"id": f"asset-{i}", "name": "Front view" if i == 1 else f"Asset {i}", "originalName": f"asset-{i}.jpg", "note": "", "ownerUserId": "owner-2" if i == 7 else "owner-1", "ownerDisplayName": "Team" if i == 7 else "Owner", "visibility": "team", "canEdit": i != 7, "collectionIds": ["detail"] if i % 2 == 0 else [], "width": 1600, "height": 900, "byteSize": 2048, "createdAt": "2026-10-01T00:00:00Z", "updatedAt": "2026-10-01T00:00:00Z", "taggingStatus": "completed", "favorite": False, "aiTags": dict(EMPTY), "manualOverrides": {}, "effectiveTags": dict(EMPTY), "thumbnailUrl": f"/api/library/assets/asset-{i}/thumbnail", "publicUrl": f"/__gallery_original/asset-{i}", "mimeType": "image/jpeg", "extension": ".jpg", "objectKey": f"mock/{i}", "sha256": f"hash-{i}", "cleanupStatus": "ready"}

def run_case(browser, theme, width, height):
    name = f"{theme}-{width}"
    context = browser.new_context(viewport={"width": width, "height": height})
    context.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    page = context.new_page()
    assets = [make_asset(i) for i in range(1, 66)]
    calls, queries, imports, unknown, errors, originals = [], [], [], [], [], []
    held_pages, held_imports = [], []
    flags = {"hold_page": False, "hold_import": False, "fail_patch": False, "fail_delete": False, "fail_import": True, "fail_collection": False, "fail_cursor": False}
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("dialog", lambda dialog: (errors.append(f"Unexpected browser dialog: {dialog.message}"), dialog.dismiss()))

    def filtered(params):
        result = list(assets)
        q = params.get("search", [""])[0].lower()
        if q: result = [a for a in result if q in (a["name"] + a["note"]).lower()]
        if params.get("favorite") == ["true"]: result = [a for a in result if a["favorite"]]
        if params.get("uncategorized") == ["true"]: result = [a for a in result if not a["collectionIds"]]
        if params.get("collectionId"):
            ids = [params["collectionId"][0]]
            if ids == ["campaign"] and params.get("includeDescendants") != ["false"]: ids += ["detail"]
            result = [a for a in result if any(i in a["collectionIds"] for i in ids)]
        if params.get("taggingStatus"): result = [a for a in result if a["taggingStatus"] == params["taggingStatus"][0]]
        for tag in params.get("tag", []): result = [a for a in result if tag in a["effectiveTags"]["customTags"]]
        if params.get("minWidth"): result = [a for a in result if a["width"] >= int(params["minWidth"][0])]
        return result

    def selected(body):
        selection = body["selection"]
        if selection["mode"] == "ids": return [a for a in assets if a["id"] in selection["assetIds"]]
        assert "limit" not in selection["filters"]
        return [a for a in assets if a["id"] not in selection.get("excludedAssetIds", [])]

    def handler(route):
        request = route.request
        path = urlparse(request.url).path
        params = parse_qs(urlparse(request.url).query)
        method = request.method
        if path == "/api/library/navigation":
            route.fulfill(json={"collections": COLLECTIONS, "smartFolders": [], "counts": {"all": len(assets), "uncategorized": sum(not a["collectionIds"] for a in assets), "favorites": sum(a["favorite"] for a in assets)}})
        elif path == "/api/library/colors/jobs": route.fulfill(json={"coverage": {"total": len(assets), "analyzed": 0, "failed": 0, "manageableMissing": len(assets), "manageableFailed": 0}})
        elif path == "/api/library/tags" and method == "GET": route.fulfill(json={"tags": [{"label": "red", "count": 3}]})
        elif path.endswith("/thumbnail"): route.fulfill(content_type="image/gif", body=PIXEL)
        elif path == "/api/library/assets":
            queries.append(params)
            assert params.get("limit") == ["60"]
            assert "role" not in params
            if params.get("cursor") and flags["fail_cursor"]:
                flags["fail_cursor"] = False
                route.fulfill(status=500, json={"error": "Page unavailable"}); return
            result = filtered(params)
            offset = 60 if params.get("cursor") else 0
            response = {"assets": result[offset:offset + 60], "total": len(result), "nextCursor": "next-page" if offset + 60 < len(result) else None}
            if params.get("cursor") and flags["hold_page"]: held_pages.append((route, response))
            else: route.fulfill(json=response)
        elif path == "/api/library/assets/batch":
            body = request.post_data_json; calls.append(body)
            matches = selected(body)
            if body["action"] == "delete":
                assert body["confirm"] is True
                if flags["fail_delete"]:
                    flags["fail_delete"] = False
                    route.fulfill(json={"matched": len(matches), "succeeded": 0, "failed": len(matches), "failures": [{"assetId": a["id"], "error": "Object cleanup failed"} for a in matches]}); return
                assets[:] = [a for a in assets if a not in matches]
                route.fulfill(json={"matched": len(matches), "succeeded": len(matches), "failed": 0, "failures": []})
            elif body["action"] in ("add_to_collections", "move_to_collection", "remove_from_collection"):
                if flags["fail_collection"]:
                    flags["fail_collection"] = False
                    route.fulfill(status=400, json={"error": "Target unavailable"}); return
                for a in matches:
                    if body["action"] == "add_to_collections": a["collectionIds"] = list(set(a["collectionIds"] + body["collectionIds"]))
                    elif body["action"] == "move_to_collection": a["collectionIds"] = [i for i in a["collectionIds"] if i != body["sourceCollectionId"]] + [body["targetCollectionId"]]
                    else: a["collectionIds"] = [i for i in a["collectionIds"] if i != body["collectionId"]]
                route.fulfill(json={"action": body["action"], "assets": matches, "unchangedAssetIds": [], "failures": []})
            else:
                failures = []
                for a in matches:
                    if body["action"] == "set_visibility" and not a["canEdit"]: failures.append({"assetId": a["id"], "error": "Read only"})
                    elif body["action"] == "set_favorite": a["favorite"] = body["favorite"]
                    elif body["action"] == "set_visibility": a["visibility"] = body["visibility"]
                route.fulfill(json={"matched": len(matches), "succeeded": len(matches) - len(failures), "failed": len(failures), "failures": failures})
        elif re.fullmatch(r"/api/library/assets/asset-\d+", path):
            asset = next((a for a in assets if a["id"] == path.rsplit("/", 1)[-1]), None)
            if not asset: route.fulfill(status=404, json={"error": "Library asset not found"}); return
            if method == "PATCH":
                if flags["fail_patch"]:
                    flags["fail_patch"] = False
                    route.fulfill(status=400, json={"error": "Save unavailable"}); return
                assert asset["canEdit"]
                body = request.post_data_json; calls.append({"patch": body})
                asset.update(body)
                if "manualOverrides" in body: asset["effectiveTags"] = {**asset["aiTags"], **body["manualOverrides"]}
            route.fulfill(json={"asset": asset})
        elif path == "/api/library/favorites":
            for a in selected(request.post_data_json): a["favorite"] = method == "POST"
            route.fulfill(json={"matched": 1, "succeeded": 1, "failed": 0, "failures": []})
        elif path == "/api/library/import":
            raw = request.post_data_buffer.decode("utf8", errors="replace")
            filename = re.search(r'filename="([^"]+)"', raw).group(1)
            imports.append((filename, raw))
            if flags["hold_import"]: held_imports.append(route); return
            if filename == "failure.png" and flags["fail_import"]:
                flags["fail_import"] = False; route.fulfill(status=400, json={"error": "Upload unavailable"})
            else: route.fulfill(json={"status": "skipped_duplicate" if filename == "duplicate.png" else "imported"})
        elif path == "/api/library/tags" and method == "POST":
            body = request.post_data_json; calls.append({"tags": body})
            matches = selected(body)
            for a in matches: a["manualOverrides"] = {"customTags": body.get("add", [])}; a["effectiveTags"] = {**a["aiTags"], **a["manualOverrides"]}
            route.fulfill(json={"assets": matches, "failures": []})
        elif path.startswith("/api/library/collections") or path.startswith("/api/library/smart-folders"):
            calls.append({"organizer": request.post_data_json}); route.fulfill(json={"ok": True})
        elif path == "/api/library/tagging": route.fulfill(json={"jobs": []})
        else:
            unknown.append(path); route.fulfill(status=404, json={"error": "Unexpected mocked API"})

    page.route("**/api/**", handler)
    def original(route):
        originals.append(route.request.url)
        route.fulfill(content_type="image/svg+xml", body='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#77918b"/><circle cx="800" cy="450" r="250" fill="#c4ddd4"/></svg>')
    page.route("**/__gallery_original/**", original)
    page.goto(f"{BASE_URL}/library", wait_until="networkidle")
    expect(page.locator("article")).to_have_count(60)
    assert not originals, "Grid must not load originals"
    assert page.locator("article img").first.get_attribute("loading") == "lazy"
    assert page.evaluate("document.documentElement.dataset.theme") == theme
    title_metrics = page.locator("article strong").first.evaluate("n => ({height:n.getBoundingClientRect().height,line:parseFloat(getComputedStyle(n).lineHeight)})")
    assert title_metrics["height"] >= title_metrics["line"], "Card names must not be vertically clipped"

    # One transaction for several advanced filters; history and explicit descendant false.
    page.get_by_role("button", name="高级筛选", exact=True).click()
    dialog = page.get_by_role("dialog", name="高级筛选", exact=True)
    dialog.get_by_label("最小宽度").fill("600")
    dialog.get_by_label("打标状态", exact=True).select_option("completed")
    before = len(queries)
    dialog.get_by_role("button", name="应用筛选").click()
    expect(page.get_by_role("button", name="最小宽度：600")).to_be_visible()
    page.wait_for_function("!document.querySelector('[aria-busy=true]')")
    assert len(queries) == before + 1
    assert queries[-1]["taggingStatus"] == ["completed"]
    page.reload(wait_until="networkidle")
    expect(page.get_by_role("button", name="打标：已完成")).to_be_visible()
    page.get_by_role("button", name="清空筛选", exact=True).click()
    expect(page.get_by_role("button", name="打标：已完成")).to_have_count(0)
    page.go_back(wait_until="networkidle")
    expect(page.get_by_role("button", name="打标：已完成")).to_be_visible()
    page.go_forward(wait_until="networkidle")
    expect(page.get_by_role("button", name="打标：已完成")).to_have_count(0)

    # Checkbox and click have independent behavior. Draft protection includes save failure.
    page.locator("article input[type=checkbox]").first.check()
    expect(page.get_by_text("已选择 1 张", exact=True)).to_be_visible()
    expect(page.locator('dialog[aria-label="图片查看"]')).to_have_count(0)
    opener = page.locator("article").first.get_by_role("button", name="查看 Front view", exact=True)
    opener.click()
    viewer = page.locator('dialog[aria-label="图片查看"]')
    expect(viewer.get_by_role("button", name="实际尺寸")).to_be_enabled()
    page.keyboard.press("Escape")
    expect(viewer).to_have_count(0)
    expect(opener).to_be_focused()
    opener.click()
    expect(viewer.get_by_role("button", name="实际尺寸")).to_be_enabled()
    viewer.get_by_role("button", name="实际尺寸").click()
    expect(viewer.get_by_text("100%", exact=True)).to_be_visible()
    viewer.get_by_role("button", name="放大", exact=True).click()
    expect(viewer.get_by_text("125%", exact=True)).to_be_visible()
    stage = viewer.locator('[class*="imageStage"]')
    stage.hover()
    page.mouse.wheel(0, -120)
    expect(viewer.get_by_text("144%", exact=True)).to_be_visible()
    assert page.evaluate("window.scrollY") == 0
    box = stage.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 80)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] / 2 - 100, box["y"] + 80)
    page.mouse.up()
    assert stage.evaluate("n => n.scrollLeft") > 0
    if width < 640: viewer.get_by_role("button", name="图片详情", exact=True).click()
    viewer.get_by_label("备注", exact=True).fill("Draft preserved")
    viewer.get_by_role("button", name="下一张", exact=True).click()
    guard = page.get_by_role("dialog", name="尚有未保存修改", exact=True)
    flags["fail_patch"] = True
    guard.get_by_role("button", name="保存后继续").click()
    expect(guard.get_by_text("Save unavailable")).to_be_visible()
    guard.get_by_role("button", name="继续编辑").click()
    expect(viewer.get_by_label("备注", exact=True)).to_have_value("Draft preserved")
    viewer.get_by_role("button", name="保存", exact=True).click()
    expect(viewer.get_by_role("button", name="保存", exact=True)).to_be_disabled()
    assert assets[0]["note"] == "Draft preserved"
    viewer.get_by_role("button", name="下一张", exact=True).click()
    expect(viewer.get_by_text("Asset 2", exact=True)).to_be_visible()
    viewer.get_by_role("button", name="复位", exact=True).focus()
    page.keyboard.press("ArrowLeft")
    expect(viewer.get_by_text("Front view", exact=True)).to_be_visible()
    viewer.get_by_role("button", name="复位", exact=True).focus()
    page.keyboard.press("ArrowRight")
    expect(viewer.get_by_text("Asset 2", exact=True)).to_be_visible()
    page.keyboard.press("Escape")
    expect(viewer).to_have_count(0)
    expect(page.get_by_text("已选择 1 张", exact=True)).to_be_visible()
    page.get_by_role("button", name="取消选择").click()

    # Standalone deep link, shared read-only metadata, owner-independent membership.
    page.goto(f"{BASE_URL}/library?asset=asset-65", wait_until="networkidle")
    viewer = page.locator('dialog[aria-label="图片查看"]')
    expect(viewer.get_by_text("Asset 65", exact=True)).to_be_visible()
    expect(page.locator("article")).to_have_count(60)
    expect(viewer.get_by_role("button", name="下一张", exact=True)).to_be_disabled()
    page.keyboard.press("Escape")
    page.goto(f"{BASE_URL}/library?asset=asset-999", wait_until="networkidle")
    viewer = page.locator('dialog[aria-label="图片查看"]')
    expect(viewer.get_by_text("Library asset not found", exact=True)).to_be_visible()
    viewer.get_by_role("button", name="重试详情", exact=True).click()
    expect(viewer.get_by_text("Library asset not found", exact=True)).to_be_visible()
    page.keyboard.press("Escape")
    page.goto(f"{BASE_URL}/library?asset=asset-7", wait_until="networkidle")
    viewer = page.locator('dialog[aria-label="图片查看"]')
    if width < 640: viewer.get_by_role("button", name="图片详情", exact=True).click()
    expect(viewer.get_by_label("名称", exact=True)).to_be_disabled()
    assert viewer.get_by_role("button", name="永久删除", exact=True).count() == 0
    viewer.get_by_label("Campaign", exact=True).click()
    expect(viewer.get_by_label("Campaign", exact=True)).to_be_checked()
    assert calls[-1]["action"] == "add_to_collections"
    page.keyboard.press("Escape")

    # Collection move picker validates target, keeps error and excludes shared read-only folders.
    page.get_by_role("button", name="Campaign", exact=True).click()
    page.get_by_label("包含子图集", exact=True).uncheck()
    page.wait_for_function("!document.querySelector('[aria-busy=true]')")
    assert queries[-1]["includeDescendants"] == ["false"]
    page.get_by_label("包含子图集", exact=True).check()
    expect(page.locator("article")).to_have_count(33)
    page.locator("article input[type=checkbox]").first.check()
    page.get_by_role("button", name="移动到图集", exact=True).click()
    picker = page.get_by_role("dialog", name="移动到图集", exact=True)
    assert picker.get_by_text("Archive", exact=True).count() == 0
    picker.get_by_role("radio").first.check()
    flags["fail_collection"] = True
    picker.get_by_role("button", name="移动到图集", exact=True).click()
    expect(picker.get_by_text("Target unavailable")).to_be_visible()
    picker.get_by_role("button", name="移动到图集", exact=True).click()
    expect(picker).to_have_count(0)
    assert calls[-1]["action"] == "move_to_collection"

    # Cursor-boundary navigation never wraps, stale cursor response cannot contaminate search.
    page.goto(f"{BASE_URL}/library?asset=asset-60", wait_until="networkidle")
    viewer = page.locator('dialog[aria-label="图片查看"]')
    flags["fail_cursor"] = True
    viewer.get_by_role("button", name="下一张", exact=True).click()
    expect(viewer.get_by_role("alert")).to_contain_text("Page unavailable")
    expect(viewer.get_by_text("Asset 60", exact=True)).to_be_visible()
    viewer.get_by_role("button", name="下一张", exact=True).click()
    expect(viewer.get_by_text("Asset 61", exact=True)).to_be_visible()
    expect(page.locator("article")).to_have_count(65)
    page.keyboard.press("Escape")
    page.goto(f"{BASE_URL}/library", wait_until="networkidle")
    flags["hold_page"] = True
    page.get_by_role("button", name="加载更多", exact=True).click()
    page.wait_for_timeout(100)
    assert held_pages
    page.get_by_placeholder("搜索名称、文件名、备注或标签").fill("Front")
    expect(page.locator("article")).to_have_count(1)
    flags["hold_page"] = False
    route, response = held_pages.pop()
    try: route.fulfill(json=response)
    except Exception: pass  # The browser may have already cancelled the old request.
    page.wait_for_timeout(150)
    expect(page.locator("article")).to_have_count(1)
    page.go_back(wait_until="networkidle")
    expect(page.get_by_placeholder("搜索名称、文件名、备注或标签")).to_have_value("")
    expect(page.locator("article")).to_have_count(60)

    # Batch tags commit on Apply; not while composing suggestions.
    page.locator("article input[type=checkbox]").first.check()
    page.get_by_role("button", name="加标签", exact=True).click()
    tag_dialog = page.get_by_role("dialog", name="批量添加标签", exact=True)
    tag_dialog.get_by_placeholder("输入标签并按回车").fill("red")
    tag_dialog.get_by_placeholder("输入标签并按回车").press("Enter")
    tag_dialog.get_by_role("button", name="应用标签", exact=True).click()
    expect(tag_dialog).to_have_count(0)
    assert calls[-1]["tags"]["add"] == ["red"]

    # Query selection, exclusions and partial permission failures retain failed selection.
    page.get_by_role("button", name="选择已加载 60 张", exact=True).click()
    page.get_by_role("button", name="选择全部匹配", exact=True).click()
    page.locator("article input[type=checkbox]").first.uncheck()
    page.locator('[class*="batchBar"]').get_by_role("button", name="收藏", exact=True).click()
    assert calls[-1]["selection"]["mode"] == "query"
    assert calls[-1]["selection"]["excludedAssetIds"] == ["asset-1"]
    expect(page.locator('[class*="batchBar"]')).to_have_count(0)
    page.wait_for_function("!document.querySelector('[aria-busy=true]')")
    page.locator("article input[type=checkbox]").nth(5).check()
    page.locator("article input[type=checkbox]").nth(6).check()
    page.get_by_text("更多", exact=True).click()
    page.get_by_role("button", name="设为个人", exact=True).click()
    expect(page.get_by_text("已选择 1 张", exact=True)).to_be_visible()
    expect(page.get_by_text("Asset 7：Read only", exact=True)).to_be_visible()
    page.get_by_role("button", name="取消选择").click()

    page.locator("article input[type=checkbox]").first.check()
    page.locator('[class*="batchBar"]').get_by_role("button", name="加标签", exact=True).focus()
    page.keyboard.press("Delete")
    batch_confirm = page.get_by_role("dialog", name="永久删除图片", exact=True)
    before = len(calls)
    batch_confirm.get_by_role("button", name="取消", exact=True).click()
    assert len(calls) == before
    page.get_by_role("button", name="取消选择").click()

    # Every delete path confirms; cancelled deletion performs zero writes. Failures keep viewer.
    page.goto(f"{BASE_URL}/library?asset=asset-1", wait_until="networkidle")
    viewer = page.locator('dialog[aria-label="图片查看"]')
    page.keyboard.press("Delete")
    confirm = page.get_by_role("dialog", name="永久删除图片", exact=True)
    before = len(calls)
    confirm.get_by_role("button", name="取消", exact=True).click()
    assert len(calls) == before
    page.keyboard.press("Delete")
    flags["fail_delete"] = True
    confirm.get_by_role("button", name="确认删除", exact=True).click()
    expect(confirm.get_by_text("Object cleanup failed", exact=True)).to_be_visible()
    expect(viewer).to_be_visible()
    confirm.get_by_role("button", name="确认删除", exact=True).click()
    expect(confirm).to_have_count(0)
    expect(viewer).to_have_count(0)

    # 25 receipts, supported snapshots, retry only by operator and cancellation of waiting files.
    files = [{"name": "duplicate.png" if i == 1 else "failure.png" if i == 2 else f"image-{i}.png", "mimeType": "image/png", "buffer": PIXEL} for i in range(25)]
    page.locator('input[type="file"]').set_input_files(files)
    importer = page.get_by_role("dialog", name="导入图片", exact=True)
    importer.get_by_label("目标图集").select_option("campaign")
    importer.get_by_label("共享范围", exact=True).select_option("private")
    importer.get_by_role("button", name="开始导入").click()
    queue = page.get_by_role("region", name="导入队列", exact=True)
    expect(queue.get_by_text("导入队列 25/25", exact=True)).to_be_visible()
    assert len(imports) == 25
    assert all('name="visibility"\r\n\r\nprivate' in raw and '["campaign"]' in raw for _, raw in imports)
    queue.get_by_role("button", name="重试", exact=True).click()
    expect(queue.get_by_role("button", name="重试", exact=True)).to_have_count(0)
    assert len(imports) == 26
    flags["hold_import"] = True
    page.locator('input[type="file"]').set_input_files(files[:3])
    page.get_by_role("dialog", name="导入图片", exact=True).get_by_role("button", name="开始导入").click()
    page.wait_for_timeout(100)
    assert len(held_imports) == 1
    queue.get_by_role("button", name="取消等待项").click()
    flags["hold_import"] = False
    held_imports.pop().fulfill(json={"status": "imported"})
    expect(queue.get_by_text("导入队列 28/28", exact=True)).to_be_visible()
    expect(queue.get_by_text(re.compile("取消 2"))).to_be_visible()
    assert len(imports) == 27
    queue.get_by_role("button", name="清除已结束").click()
    expect(queue).to_have_count(0)
    before = len(imports)
    page.locator('input[type="file"]').set_input_files({"name": "unsupported.txt", "mimeType": "text/plain", "buffer": b"unsupported"})
    page.get_by_role("dialog", name="导入图片", exact=True).get_by_role("button", name="开始导入").click()
    expect(queue.get_by_text("导入队列 1/1", exact=True)).to_be_visible()
    assert queue.get_by_role("button", name="重试", exact=True).count() == 0
    assert len(imports) == before
    queue.get_by_role("button", name="清除已结束").click()

    # Typed smart folder field changes reset operator/value to valid combinations.
    page.get_by_title("新建智能文件夹").click()
    smart = page.get_by_role("dialog", name="新建智能文件夹", exact=True)
    smart.get_by_label("名称", exact=True).fill("Large pictures")
    smart.get_by_label("条件字段").select_option("width")
    assert smart.get_by_label("条件操作符").locator("option").all_text_contents() == ["等于", "大于等于", "小于等于"]
    smart.get_by_label("条件操作符").select_option("gte")
    smart.get_by_label("条件值").fill("1200")
    smart.get_by_role("button", name="保存", exact=True).click()
    assert calls[-1]["organizer"]["conditions"][0]["value"] == 1200
    expect(smart).to_have_count(0)
    page.get_by_title("新建图集").click()
    form = page.get_by_role("dialog", name="新建图集", exact=True)
    form.get_by_label("图集名称").fill("New collection")
    form.get_by_role("button", name="保存", exact=True).click()
    expect(form).to_have_count(0)

    # Screenshots and containment across all themes and both layouts.
    page.screenshot(path=os.path.join(tempfile.gettempdir(), f"fluxpost-gallery-{name}.png"))
    page.goto(f"{BASE_URL}/library?asset=asset-2", wait_until="networkidle")
    page.keyboard.press("Tab")
    assert page.evaluate("!!document.activeElement.closest('dialog[open]')"), "Modal focus must stay in the viewer"
    page.screenshot(path=os.path.join(tempfile.gettempdir(), f"fluxpost-gallery-viewer-{name}.png"))
    metrics = page.evaluate("({view:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth})")
    assert metrics["doc"] <= metrics["view"] + 1 and metrics["body"] <= metrics["view"] + 1, metrics
    assert not errors, errors
    assert not unknown, unknown
    print(f"PASS {name}: filters/history, viewer/drafts, paging, permissions, confirms, imports, smart folders and containment")
    context.close()

with sync_playwright() as playwright:
    options = {"headless": True}
    if CHROME: options["executable_path"] = CHROME
    browser = playwright.chromium.launch(**options)
    try:
        for theme in ["professional", "editorial", "creator"]:
            for width, height in [(1440, 960), (390, 844)]:
                try: run_case(browser, theme, width, height)
                except Exception:
                    failed = browser.contexts[-1].pages[-1]
                    failed.screenshot(path=os.path.join(tempfile.gettempdir(), "fluxpost-gallery-failure.png"))
                    print(failed.locator("dialog").evaluate_all("nodes => nodes.map(n => ({label:n.getAttribute('aria-label'), open:n.open, inputs:[...n.querySelectorAll('input,textarea')].map(x=>({value:x.value,disabled:x.disabled})),text:n.innerText})).map(x=>JSON.stringify(x)).join('\\n')"), flush=True)
                    raise
    finally: browser.close()
