import base64
import json
import os
import re
import tempfile
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("FLUXPOST_BROWSER_BASE_URL", "http://127.0.0.1:3001")
CHROME = os.environ.get("FLUXPOST_BROWSER_EXECUTABLE")
PREVIEW_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
THUMBNAIL_PIXEL = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")
EMPTY_TAGS = {
    "imageTypes": [], "scenes": [], "vehicleModels": [], "vehicleColors": [],
    "angles": [], "people": "unknown", "customTags": [],
}


def make_asset(index):
    asset_id = f"asset-{index}"
    collection_ids = [] if index % 5 == 0 else (["campaign", "detail"] if index % 2 == 0 else ["archive"])
    custom_tags = ["red"] if index % 3 == 0 else []
    return {
        "id": asset_id,
        "ownerUserId": "owner-2" if index % 7 == 0 else "owner-1",
        "ownerDisplayName": "Team Member" if index % 7 == 0 else "Owner One",
        "name": "Front view" if index == 1 else f"Asset {index}",
        "originalName": f"asset-{index}.jpg",
        "note": "Launch detail" if index == 1 else "",
        "objectKey": f"library/{asset_id}.jpg",
        "publicUrl": PREVIEW_PIXEL,
        "thumbnailUrl": f"/api/library/assets/{asset_id}/thumbnail",
        "mimeType": "image/jpeg",
        "extension": ".jpg",
        "byteSize": 1024 + index,
        "width": 1600,
        "height": 1200,
        "sha256": asset_id.ljust(64, "0"),
        "collectionIds": collection_ids,
        "visibility": "team" if index % 7 == 0 else "private",
        "aiTags": EMPTY_TAGS,
        "manualOverrides": {"customTags": custom_tags},
        "effectiveTags": {**EMPTY_TAGS, "customTags": custom_tags},
        "taggingStatus": "idle" if index % 4 == 0 else "completed",
        "cleanupStatus": "ready",
        "canEdit": index % 7 != 0,
        "favorite": index <= 2,
        "createdAt": f"2026-08-{28 - (index % 20):02d}T00:00:00.000Z",
        "updatedAt": "2026-08-28T00:00:00.000Z",
    }


COLLECTIONS = [
    {"id": "campaign", "ownerUserId": "owner-1", "ownerDisplayName": "Owner One", "visibility": "private", "kind": "folder", "name": "Campaign", "relativePath": "Campaign", "createdAt": "2026-08-28T00:00:00.000Z", "updatedAt": "2026-08-28T00:00:00.000Z", "canEdit": True},
    {"id": "detail", "ownerUserId": "owner-1", "ownerDisplayName": "Owner One", "visibility": "private", "kind": "folder", "name": "Detail", "parentId": "campaign", "relativePath": "Campaign/Detail", "createdAt": "2026-08-28T00:00:00.000Z", "updatedAt": "2026-08-28T00:00:00.000Z", "canEdit": True},
    {"id": "archive", "ownerUserId": "owner-2", "ownerDisplayName": "Team Member", "visibility": "team", "kind": "folder", "name": "Archive", "relativePath": "Archive", "createdAt": "2026-08-28T00:00:00.000Z", "updatedAt": "2026-08-28T00:00:00.000Z", "canEdit": False},
]
SMART_FOLDERS = [
    {"id": "smart-favorites", "ownerUserId": "owner-1", "ownerDisplayName": "Owner One", "name": "Favorites with tags", "visibility": "private", "match": "all", "conditions": [{"id": "favorite", "field": "favorite", "operator": "is", "value": True}], "createdAt": "2026-08-28T00:00:00.000Z", "updatedAt": "2026-08-28T00:00:00.000Z", "canEdit": True},
]


def query_params(url):
    return parse_qs(urlparse(url).query, keep_blank_values=True)


def filter_assets(url, assets):
    params = query_params(url)
    result = assets
    collection_id = params.get("collectionId", [None])[0]
    if collection_id:
        include_descendants = params.get("includeDescendants", ["true"])[0] != "false"
        accepted = ["campaign", "detail"] if collection_id == "campaign" and include_descendants else [collection_id]
        result = [asset for asset in result if any(item in accepted for item in asset["collectionIds"])]
    if params.get("smartFolderId"):
        result = [asset for asset in result if asset["favorite"]]
    if params.get("uncategorized", ["false"])[0] == "true":
        result = [asset for asset in result if not asset["collectionIds"]]
    if params.get("favorite", ["false"])[0] == "true":
        result = [asset for asset in result if asset["favorite"]]
    search = params.get("search", [""])[0].lower()
    if search:
        result = [asset for asset in result if search in f'{asset["name"]} {asset["originalName"]} {asset["note"]}'.lower()]
    for tag in params.get("tag", []):
        result = [asset for asset in result if tag in asset["effectiveTags"]["customTags"]]
    return result


def run_viewport(browser, viewport):
    name, width, height = viewport
    assets = [make_asset(index) for index in range(1, 66)]
    asset_queries = []
    batch_calls = []
    patch_calls = []
    smart_folder_calls = []
    browser_errors = []
    page = browser.new_page(viewport={"width": width, "height": height})
    page.on("console", lambda message: browser_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: browser_errors.append(str(error)))

    def navigation_handler(route):
        route.fulfill(status=200, content_type="application/json", body=json.dumps({
            "collections": COLLECTIONS,
            "smartFolders": SMART_FOLDERS,
            "counts": {
                "all": len(assets),
                "uncategorized": len([asset for asset in assets if not asset["collectionIds"]]),
                "favorites": len([asset for asset in assets if asset["favorite"]]),
            },
        }))

    def assets_handler(route):
        params = query_params(route.request.url)
        assert "role" not in params, f"{name}: legacy role query leaked into the unified API"
        asset_queries.append(params)
        visible = filter_assets(route.request.url, assets)
        offset = 60 if params.get("cursor", [None])[0] == "next-page" else 0
        page_assets = visible[offset:offset + 60]
        route.fulfill(status=200, content_type="application/json", body=json.dumps({
            "assets": page_assets,
            "total": len(visible),
            "nextCursor": "next-page" if offset + len(page_assets) < len(visible) else None,
        }))

    def batch_handler(route):
        batch_calls.append(route.request.post_data_json)
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"matched": 65, "succeeded": 65, "failed": 0, "failures": []}))

    def patch_handler(route):
        body = route.request.post_data_json
        patch_calls.append(body)
        asset_id = urlparse(route.request.url).path.rsplit("/", 1)[-1]
        current = next(asset for asset in assets if asset["id"] == asset_id)
        updated = {**current, **body, "updatedAt": "2026-08-28T01:00:00.000Z"}
        assets[assets.index(current)] = updated
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"asset": updated}))

    def smart_folder_handler(route):
        if route.request.method == "POST":
            smart_folder_calls.append(route.request.post_data_json)
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"smartFolder": SMART_FOLDERS[0]}))

    page.route(re.compile(r"/api/library/navigation(?:\?.*)?$"), navigation_handler)
    page.route(re.compile(r"/api/library/tags(?:\?.*)?$"), lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"tags": [{"label": "red", "count": 21}]})))
    page.route(re.compile(r"/api/library/assets/[^/]+/thumbnail(?:\?.*)?$"), lambda route: route.fulfill(status=200, content_type="image/gif", body=THUMBNAIL_PIXEL))
    page.route(re.compile(r"/api/library/assets(?:\?.*)?$"), assets_handler)
    page.route(re.compile(r"/api/library/assets/batch(?:\?.*)?$"), batch_handler)
    page.route(re.compile(r"/api/library/assets/asset-\d+(?:\?.*)?$"), patch_handler)
    page.route(re.compile(r"/api/library/favorites(?:\?.*)?$"), lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"matched": 1, "succeeded": 1, "failed": 0, "failures": []})))
    page.route(re.compile(r"/api/library/smart-folders(?:\?.*)?$"), smart_folder_handler)

    page.goto(f"{BASE_URL}/library", wait_until="networkidle")
    try:
        page.get_by_text("全部图片 · 65 张", exact=True).wait_for(timeout=10_000)
    except Exception:
        debug_path = os.path.join(tempfile.gettempdir(), f"fluxpost-unified-library-{name}-failure.png")
        page.screenshot(path=debug_path, full_page=False)
        print(f"{name} first-screen failure: url={page.url} queries={asset_queries} errors={browser_errors} text={page.locator('body').inner_text()!r} screenshot={debug_path}")
        raise
    assert page.locator("article").count() == 60, f"{name}: first page did not stay bounded to 60 cards"
    assert page.get_by_role("tab").count() == 0, f"{name}: legacy role tabs are still rendered"
    thumbnails = page.locator("article img")
    assert thumbnails.count() == 60 and "/thumbnail" in (thumbnails.first.get_attribute("src") or ""), f"{name}: cards are not using thumbnail endpoints"
    assert thumbnails.first.get_attribute("loading") == "lazy", f"{name}: card thumbnails are not lazy-loaded"

    screenshot = os.path.join(tempfile.gettempdir(), f"fluxpost-unified-library-{name}.png")
    page.screenshot(path=screenshot, full_page=False)

    with page.expect_request(lambda request: query_params(request.url).get("search") == ["Front"]):
        page.get_by_placeholder("搜索名称、文件名、备注或标签").fill("Front")
    page.get_by_text("全部图片 · 1 张", exact=True).wait_for()
    with page.expect_request(lambda request: urlparse(request.url).path == "/api/library/assets" and "search" not in query_params(request.url)):
        page.get_by_placeholder("搜索名称、文件名、备注或标签").fill("")
    page.get_by_text("全部图片 · 65 张", exact=True).wait_for()

    page.locator("article").first.get_by_role("button").nth(1).click()
    page.get_by_text("图片详情", exact=True).wait_for()
    page.get_by_label("备注").fill("Updated note")
    page.get_by_role("button", name="保存").click()
    page.get_by_text("已保存", exact=True).wait_for()
    assert patch_calls[-1].get("note") == "Updated note", f"{name}: note update payload is incorrect"
    page.locator("aside header button").click()

    page.locator("article > button").first.dblclick()
    preview = page.get_by_role("dialog")
    preview.wait_for()
    assert (preview.locator(":scope > img").get_attribute("src") or "").startswith("data:image/gif"), f"{name}: preview did not use the original URL"
    assert "/thumbnail" in (preview.locator("div img").first.get_attribute("src") or ""), f"{name}: preview rail did not use thumbnails"
    preview.locator("header button").click()

    page.get_by_role("button", name="加载更多").click()
    page.wait_for_function("document.querySelectorAll('article').length === 65")
    page.goto(f"{BASE_URL}/library", wait_until="networkidle")
    page.locator("article > button").evaluate_all("buttons => buttons.forEach(button => button.click())")
    page.get_by_text("已选择 60 张", exact=True).wait_for()
    page.get_by_role("button", name="选择全部匹配").click()
    page.get_by_text("已选择全部匹配 65 张", exact=True).wait_for()
    page.get_by_text("已选择全部匹配 65 张", exact=True).locator("..").get_by_role("button", name="收藏", exact=True).click()
    page.get_by_text("已收藏 65 张", exact=True).wait_for()
    selection = batch_calls[-1].get("selection", {})
    assert selection.get("mode") == "query" and "limit" not in selection.get("filters", {}) and "role" not in selection.get("filters", {}), f"{name}: all-matching query snapshot is incorrect"

    if name == "desktop":
        page.get_by_role("button", name="Campaign", exact=True).click()
        with page.expect_request(lambda request: query_params(request.url).get("collectionId") == ["campaign"] and query_params(request.url).get("includeDescendants") == ["false"]):
            page.get_by_label("包含子图集").uncheck()
        with page.expect_request(lambda request: query_params(request.url).get("smartFolderId") == ["smart-favorites"]):
            page.get_by_role("button", name="Favorites with tags", exact=True).click()
        page.get_by_title("新建智能文件夹").click()
        dialog = page.locator("section").filter(has_text="新建智能文件夹")
        dialog.get_by_label("名称").fill("Recent favorites")
        dialog.locator("input").nth(1).fill("red")
        dialog.get_by_role("button", name="保存").click()
        page.get_by_text("新建智能文件夹", exact=True).wait_for(state="hidden")
        assert smart_folder_calls[-1].get("name") == "Recent favorites" and smart_folder_calls[-1]["conditions"][0].get("value") == "red", "desktop: smart-folder payload is incorrect"

    metrics = page.evaluate("() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth })")
    assert metrics["documentWidth"] <= metrics["viewportWidth"] + 1 and metrics["bodyWidth"] <= metrics["viewportWidth"] + 1, f"{name}: horizontal overflow {metrics}"
    assert all("role" not in params for params in asset_queries), f"{name}: legacy role query observed"
    assert not browser_errors, f"{name}: browser errors: {' | '.join(browser_errors)}"
    print(f"{name} screenshot: {screenshot}")
    page.close()


with sync_playwright() as playwright:
    launch_options = {"headless": True}
    if CHROME:
        launch_options["executable_path"] = CHROME
    browser = playwright.chromium.launch(**launch_options)
    try:
        viewports = [("desktop", 1440, 960), ("mobile", 390, 844)]
        target = os.environ.get("FLUXPOST_BROWSER_VIEWPORT")
        selected_viewports = [viewport for viewport in viewports if not target or viewport[0] == target]
        for item in selected_viewports:
            run_viewport(browser, item)
        print(f"Unified library browser check passed for {', '.join(item[0] for item in selected_viewports)} without live services.")
    finally:
        browser.close()
