"""Isolated content-pool library UI check: intercept every API and media request, never use 3001."""
import json
import os
import re
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get("FLUXPOST_BROWSER_BASE_URL", "http://127.0.0.1:45678")
parsed_base = urlparse(BASE_URL)
assert parsed_base.hostname in ("127.0.0.1", "localhost") and parsed_base.port != 3001
CHROME = os.environ.get("FLUXPOST_BROWSER_EXECUTABLE")
NOW = "2026-11-02T00:00:00.000Z"

ROOT = {"id": "lib-root", "ownerUserId": "owner-1", "ownerDisplayName": "Owner", "name": "车型库", "relativePath": "车型库", "itemCount": 2, "canEdit": True, "createdAt": NOW, "updatedAt": NOW}
CHILD = {"id": "lib-child", "ownerUserId": "owner-1", "ownerDisplayName": "Owner", "name": "SUV", "parentId": "lib-root", "relativePath": "车型库/SUV", "itemCount": 2, "canEdit": True, "createdAt": NOW, "updatedAt": NOW}
MEMBERSHIPS = [
    {"collectionId": "lib-root", "ownerUserId": "owner-1", "itemId": "item-1"},
    {"collectionId": "lib-child", "ownerUserId": "owner-1", "itemId": "item-2"},
    {"collectionId": "lib-root", "ownerUserId": "owner-1", "itemId": "item-3"},
    {"collectionId": "lib-child", "ownerUserId": "owner-1", "itemId": "item-3"},
]
TAGS = [
    {"key": "参考", "label": "参考", "color": "mint", "count": 3},
    {"key": "夜景", "label": "夜景", "color": "rose", "count": 1},
]


def make_item(item_id, title, tags):
    return {
        "id": item_id, "ownerUserId": "owner-1", "ownerDisplayName": "Owner", "platform": "xiaohongshu",
        "sourceId": item_id, "mediaType": "image", "sourceUrl": f"https://example.test/{item_id}",
        "authorName": "作者", "title": title, "contentText": f"{title} 正文", "images": [], "mediaUrls": [],
        "downloadedImages": [], "videoFrames": [], "customTags": tags, "poolStatus": "new", "hotScore": 50,
        "crawledAt": NOW, "firstSeenAt": NOW, "lastSeenAt": NOW, "usedCount": 0,
        "metrics": {"views": 100, "likes": 10}, "raw": {},
    }


def make_project():
    items = [
        make_item("item-1", "参考内容一", ["参考"]),
        make_item("item-2", "参考内容二", ["参考"]),
        make_item("item-3", "夜景内容三", ["参考", "夜景"]),
        make_item("item-4", "默认内容四", []),
    ]
    return {
        "id": "project-1", "ownerUserId": "owner-1", "ownerDisplayName": "Owner", "query": "测试项目",
        "normalizedQuery": "测试项目--owner-owner-1", "createdAt": NOW, "updatedAt": NOW, "lastCrawledAt": NOW,
        "totalItems": len(items), "newItems": len(items), "analyzedItems": 0, "rewrittenItems": 0,
        "approvedItems": 0, "publishedItems": 0, "platforms": {"xiaohongshu": len(items)}, "items": items,
    }


def run_case(browser, width, height):
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    collections = [dict(ROOT), dict(CHILD)]
    memberships = [dict(item) for item in MEMBERSHIPS]
    tags = [dict(item) for item in TAGS]
    calls = []
    unknown = []
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("dialog", lambda dialog: (errors.append(f"Unexpected browser dialog: {dialog.message}"), dialog.dismiss()))

    def snapshot():
        counts = {}
        for membership in memberships:
            counts[membership["collectionId"]] = counts.get(membership["collectionId"], 0) + 1
        return {
            "projects": [make_project()],
            "activeProject": make_project(),
            "collections": [{**collection, "itemCount": counts.get(collection["id"], 0)} for collection in collections],
            "memberships": memberships,
            "tags": tags,
        }

    def handle_collection_batch(body):
        calls.append(body)
        item_ids = set(body.get("itemIds", []))
        action = body.get("action")
        if action == "add_to_collections":
            for item_id in item_ids:
                for collection_id in body.get("collectionIds", []):
                    if not any(m["collectionId"] == collection_id and m["itemId"] == item_id for m in memberships):
                        memberships.append({"collectionId": collection_id, "ownerUserId": "owner-1", "itemId": item_id})
        elif action == "move_to_collection":
            source = body.get("sourceCollectionId")
            target = body.get("targetCollectionId")
            memberships[:] = [m for m in memberships if not (m["itemId"] in item_ids and m["collectionId"] == source)]
            for item_id in item_ids:
                if not any(m["collectionId"] == target and m["itemId"] == item_id for m in memberships):
                    memberships.append({"collectionId": target, "ownerUserId": "owner-1", "itemId": item_id})
        elif action == "remove_from_collection":
            collection_id = body.get("collectionId")
            memberships[:] = [m for m in memberships if not (m["itemId"] in item_ids and m["collectionId"] == collection_id)]
        elif action == "move_to_default":
            memberships[:] = [m for m in memberships if m["itemId"] not in item_ids]
        return {"action": action, "memberships": [m for m in memberships if m["itemId"] in item_ids], "unchangedItemIds": [], "failures": []}

    def handler(route):
        request = route.request
        path = urlparse(request.url).path
        method = request.method
        params = parse_qs(urlparse(request.url).query)
        if path == "/api/content-pool":
            route.fulfill(json=snapshot())
        elif path == "/api/content-pool/tags" and method == "GET":
            route.fulfill(json={"tags": tags})
        elif path == "/api/content-pool/collections" and method == "GET":
            route.fulfill(json={"collections": snapshot()["collections"]})
        elif path == "/api/content-pool/collections" and method == "POST":
            body = request.post_data_json
            calls.append(body)
            collection = {"id": f"lib-{len(collections) + 1}", "ownerUserId": "owner-1", "ownerDisplayName": "Owner", "name": body["name"], "relativePath": body["name"], "itemCount": 0, "canEdit": True, "createdAt": NOW, "updatedAt": NOW}
            if body.get("parentId"):
                parent = next((item for item in collections if item["id"] == body["parentId"]), None)
                collection["parentId"] = body["parentId"]
                collection["relativePath"] = f"{parent['relativePath']}/{body['name']}" if parent else body["name"]
            collections.append(collection)
            route.fulfill(json={"collection": collection})
        elif path == "/api/content-pool/collections/batch":
            route.fulfill(json=handle_collection_batch(request.post_data_json))
        elif re.fullmatch(r"/api/content-pool/collections/[^/]+", path):
            collection_id = path.rsplit("/", 1)[-1]
            if method == "PATCH":
                body = request.post_data_json
                calls.append(body)
                collection = next((item for item in collections if item["id"] == collection_id), None)
                if collection:
                    collection["name"] = body.get("name", collection["name"])
                    collection["relativePath"] = collection["name"]
                route.fulfill(json={"collection": collection})
            else:
                collections[:] = [item for item in collections if item["id"] != collection_id]
                memberships[:] = [item for item in memberships if item["collectionId"] != collection_id]
                route.fulfill(json={"deleted": True, "collectionId": collection_id})
        elif path == "/api/content-pool/tags/manage":
            body = request.post_data_json
            calls.append(body)
            if body["action"] == "set_color":
                for tag in tags:
                    if tag["label"] == body["label"]:
                        tag["color"] = body["color"]
            elif body["action"] in ("rename", "merge"):
                for tag in tags:
                    if tag["label"] == body["from"]:
                        tag["label"] = body["to"]
                        tag["key"] = body["to"]
            elif body["action"] == "delete":
                tags[:] = [tag for tag in tags if tag["label"] != body["label"]]
            route.fulfill(json={"ok": True})
        elif path == "/api/content-pool/tags":
            route.fulfill(json={"items": [], "failures": []})
        elif path == "/api/config":
            route.fulfill(json={"tikhubConfigured": False, "openaiConfigured": False})
        elif path == "/api/workspace/settings":
            route.fulfill(json={"settings": {"simpleRunMediaSettings": {"generateImages": False, "useComfyUiKlein": False, "directOriginalReference": False, "includeSourceVideo": False, "enableVideoTranscription": False}, "platformCrawlSettings": {}, "updatedAt": NOW}})
        elif path == "/api/activity":
            route.fulfill(json={"entries": []})
        elif path == "/api/simple/runs":
            route.fulfill(json={"runs": []})
        else:
            unknown.append(path)
            route.fulfill(json={})
    page.route("**/api/**", handler)

    page.goto(f"{BASE_URL}/content", wait_until="networkidle")
    sidebar = page.locator('aside[aria-label="内容库导航"]')
    expect(sidebar).to_be_visible()
    expect(page.get_by_role("heading", name="采集与内容池")).to_be_visible()
    expect(sidebar.get_by_role("button", name=re.compile(r"^车型库"))).to_be_visible()
    expect(page.locator(".content-desk-source-card")).to_have_count(4)

    sidebar.get_by_role("button", name=re.compile(r"^默认库")).click()
    expect(page.locator(".content-desk-source-card")).to_have_count(1)
    expect(page.locator(".content-desk-source-card").filter(has_text="默认内容四")).to_have_count(1)

    sidebar.get_by_role("button", name=re.compile(r"^车型库")).click()
    expect(page.locator(".content-desk-source-card")).to_have_count(3)
    expect(page.get_by_label("包含子集")).to_be_checked()
    page.get_by_label("包含子集").uncheck()
    expect(page.locator(".content-desk-source-card")).to_have_count(2)

    page.get_by_role("button", name="新建内容库", exact=True).click()
    dialog = page.locator('dialog[aria-label="新建内容库"]')
    expect(dialog).to_be_visible()
    dialog.locator("input").fill("测试库")
    dialog.get_by_role("button", name="保存", exact=True).click()
    expect(sidebar.get_by_role("button", name=re.compile(r"^测试库"))).to_be_visible()

    sidebar.get_by_role("button", name=re.compile(r"^默认库")).click()
    expect(page.locator(".content-desk-source-card")).to_have_count(1)
    page.get_by_label("选择内容池样本").first.check()
    page.get_by_role("button", name="加入库/子集", exact=True).click()
    picker = page.locator('dialog[aria-label="加入内容库"]')
    expect(picker).to_be_visible()
    picker.locator("label").filter(has_text="测试库").locator("input").check()
    picker.get_by_role("button", name="加入内容库", exact=True).click()
    expect(page.locator('dialog[aria-label="加入内容库"]')).to_have_count(0)
    sidebar.get_by_role("button", name=re.compile(r"^测试库")).click()
    expect(page.locator(".content-desk-source-card")).to_have_count(1)

    sidebar.get_by_role("button", name="管理").click()
    tag_dialog = page.locator('dialog[aria-label="管理自定义标签"]')
    expect(tag_dialog).to_be_visible()
    tag_dialog.get_by_role("button", name="将“参考”设为rose").click()
    expect(tag_dialog.get_by_role("button", name="将“参考”设为rose")).to_have_class(re.compile("is-active"))
    tag_dialog.get_by_role("button", name="关闭", exact=True).click()

    assert not errors, f"Page errors: {errors}"
    assert not unknown, f"Unmocked API paths: {unknown}"
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Desktop layout must not overflow horizontally."
    assert any(call.get("action") == "add_to_collections" for call in calls), "Membership call was not sent."
    context.close()


def run_mobile_case(browser):
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def mobile_handler(route):
        path = urlparse(route.request.url).path
        if path == "/api/content-pool":
            route.fulfill(json=snapshot_for_mobile())
        elif path == "/api/workspace/settings":
            route.fulfill(json={"settings": {"simpleRunMediaSettings": {"generateImages": False, "useComfyUiKlein": False, "directOriginalReference": False, "includeSourceVideo": False, "enableVideoTranscription": False}, "platformCrawlSettings": {}, "updatedAt": NOW}})
        elif path == "/api/config":
            route.fulfill(json={"tikhubConfigured": False, "openaiConfigured": False})
        else:
            route.fulfill(json={"entries": [], "runs": [], "tags": []})

    page.route("**/api/**", mobile_handler)
    page.goto(f"{BASE_URL}/content", wait_until="networkidle")
    toggle = page.locator("button.content-desk-library-toggle")
    expect(toggle).to_be_visible()
    toggle.click()
    sidebar = page.locator('aside[aria-label="内容库导航"]')
    expect(sidebar).to_be_visible()
    sidebar.get_by_role("button", name=re.compile(r"^车型库")).click()
    expect(sidebar).to_be_hidden()
    expect(page.locator(".content-desk-source-card")).to_have_count(3)
    assert not errors, f"Mobile page errors: {errors}"
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Mobile layout must not overflow horizontally."
    context.close()


def snapshot_for_mobile():
    project = make_project()
    return {"projects": [project], "activeProject": project, "collections": [dict(ROOT), dict(CHILD)], "memberships": [dict(item) for item in MEMBERSHIPS], "tags": [dict(item) for item in TAGS]}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=CHROME) if CHROME else playwright.chromium.launch()
    run_case(browser, 1440, 900)
    run_mobile_case(browser)
    browser.close()

print("Content-pool library browser check passed.")
