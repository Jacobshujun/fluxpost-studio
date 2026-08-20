import json
import os
import time
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("FLUXPOST_BROWSER_BASE_URL", "http://127.0.0.1:3001")
NOW = "2026-08-20T10:00:00.000Z"
ASSETS = [
    {
        "id": f"asset-{index:02d}",
        "name": f"测试图片 {index:02d}",
        "publicUrl": f"https://original.test/asset-{index:02d}.jpg",
        "width": 640,
        "height": 480,
    }
    for index in range(1, 41)
]


def image_node(node_id, x):
    return {"id": node_id, "type": "input.images", "version": 1, "position": {"x": x, "y": 80}, "config": {"urls": []}}


GRAPH = {
    "nodes": [
        image_node("multi-images", 40),
        image_node("single-image", 340),
        {
            "id": "image-output", "type": "model.gpt-image", "version": 2,
            "position": {"x": 640, "y": 80},
            "config": {"prompt": "测试", "referenceUrls": [], "count": 1, "ratio": "1:1", "quality": "1k"},
        },
    ],
    "edges": [],
    "viewport": {"x": 0, "y": 0, "zoom": 0.8},
}


def image_parameter(parameter_id, name, node_id, value_type):
    return {
        "id": parameter_id,
        "name": name,
        "scope": "child",
        "valueType": value_type,
        "source": {"mode": "library-filter", "role": "reference", "filter": {"mode": "manual", "assetIds": [], "search": "", "tags": []}},
        "expansion": "fixed",
        "binding": {"nodeId": node_id, "fieldKey": "urls"},
    }


WORKFLOW = {
    "id": "workflow-image-performance", "ownerUserId": "user-1", "ownerDisplayName": "Tester",
    "name": "图片检索性能", "revision": 3, "graph": GRAPH, "isTemplate": False, "createdAt": NOW, "updatedAt": NOW,
}
SCHEDULE = {
    "id": "schedule-image-performance", "schemaVersion": 2, "ownerUserId": "user-1", "ownerDisplayName": "Tester",
    "name": "图片检索性能", "revision": 1, "workflowId": WORKFLOW["id"], "workflowRevision": WORKFLOW["revision"],
    "status": "draft", "batches": [],
    "definition": {
        "parameters": [
            image_parameter("multi", "多图素材", "multi-images", "image-group"),
            image_parameter("single", "单图素材", "single-image", "image"),
        ],
        "expansion": {"main": "cartesian", "child": "cartesian"},
        "childResult": {"nodeId": "image-output", "outputPort": "images", "artifactKind": "images"},
        "aggregationPolicy": "at-least-one",
    },
    "mainTasks": [], "totalMainTasks": 0, "totalChildTasks": 0, "totalContentTasks": 0, "totalImageTasks": 0,
    "createdAt": NOW, "updatedAt": NOW,
}


def install_mock_api(page):
    state = {
        "schedule": json.loads(json.dumps(SCHEDULE)),
        "library_queries": [],
        "save_requests": 0,
        "held_search": None,
        "page_two_calls": 0,
    }

    def fulfill(route, payload, status=200, content_type="application/json"):
        body = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        route.fulfill(status=status, content_type=content_type, body=body)

    def handler(route):
        request = route.request
        parsed = urlparse(request.url)
        path = parsed.path
        if path == "/api/canvas/workflows":
            fulfill(route, {"workflows": [WORKFLOW]})
        elif path == f"/api/canvas/workflows/{WORKFLOW['id']}":
            fulfill(route, {"workflow": WORKFLOW})
        elif path == "/api/canvas/runs":
            fulfill(route, {"runs": [], "latestSuccessfulNodeRuns": []})
        elif path == "/api/canvas/schedules":
            fulfill(route, {"schedules": [state["schedule"]]})
        elif path == f"/api/canvas/schedules/{SCHEDULE['id']}":
            if request.method == "PATCH":
                body = request.post_data_json
                if body.get("action") == "save":
                    state["save_requests"] += 1
                    state["schedule"] = {**state["schedule"], "definition": body["definition"], "revision": state["schedule"]["revision"] + 1}
            fulfill(route, {"schedule": state["schedule"]})
        elif path == "/api/library/assets":
            query = parse_qs(parsed.query)
            search = query.get("search", [""])[0]
            cursor = query.get("cursor", [""])[0]
            limit = query.get("limit", [""])[0]
            state["library_queries"].append({"search": search, "cursor": cursor, "limit": limit})
            if search == "最终关键字" and not cursor:
                state["held_search"] = route
                return
            if cursor:
                state["page_two_calls"] += 1
                fulfill(route, {"assets": ASSETS[24:], "collections": [], "total": len(ASSETS), "nextCursor": None})
            else:
                fulfill(route, {"assets": ASSETS[:24], "collections": [], "total": len(ASSETS), "nextCursor": "page-2"})
        elif path.endswith("/thumbnail"):
            fulfill(route, '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="144"><rect width="240" height="144" fill="#9ab9ad"/></svg>', content_type="image/svg+xml")
        else:
            fulfill(route, {})

    page.route("**/api/**", handler)
    page.route("https://original.test/**", lambda route: fulfill(route, '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#31584b"/></svg>', content_type="image/svg+xml"))
    return state


def open_scheduler(page):
    page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    page.get_by_test_id("canvas-stage").locator(".react-flow__pane").wait_for()
    page.get_by_role("button", name="批量调度").click()
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    dialog.wait_for()
    return dialog


def parameter(dialog, name):
    return dialog.locator(f'.canvas-schedule-parameter:has(input[value="{name}"])')


def assert_no_overflow(page, label):
    sizes = page.evaluate("() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth })")
    assert sizes["documentWidth"] <= sizes["viewportWidth"], f"{label} overflow: {sizes}"


def verify_desktop(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    state = install_mock_api(page)
    dialog = open_scheduler(page)
    multi = parameter(dialog, "多图素材")
    tiles = multi.locator(".canvas-schedule-asset-grid > article")
    expect(tiles).to_have_count(24)
    assert state["library_queries"] and all(item["limit"] == "24" for item in state["library_queries"]), state["library_queries"]
    thumbnail_sources = multi.locator(".canvas-schedule-asset-thumbnail img").evaluate_all("els => els.map(el => el.getAttribute('src'))")
    assert all(source.endswith("/thumbnail") for source in thumbnail_sources), thumbnail_sources[:3]
    assert state["page_two_calls"] == 0, "The second page loaded without an explicit command."

    search = multi.get_by_placeholder("关键字")
    initial_query_count = len(state["library_queries"])
    initial_save_count = state["save_requests"]
    search.fill("最")
    search.fill("最终")
    search.fill("最终关键字")
    page.wait_for_timeout(250)
    assert len(state["library_queries"]) == initial_query_count, state["library_queries"]
    assert state["save_requests"] == initial_save_count, state["save_requests"]
    expect(tiles).to_have_count(24)
    page.wait_for_timeout(200)
    assert state["held_search"], "The debounced final search request was not issued."
    expect(tiles).to_have_count(24)
    assert multi.locator(".canvas-schedule-asset-results").get_attribute("aria-busy") == "true"
    state["held_search"].fulfill(status=200, content_type="application/json", body=json.dumps({"assets": ASSETS[:7], "collections": [], "total": 7}, ensure_ascii=False))
    state["held_search"] = None
    expect(tiles).to_have_count(7)
    page.wait_for_timeout(1000)
    assert state["save_requests"] == initial_save_count + 1, state["save_requests"]

    search.fill("")
    search.press("Enter")
    expect(tiles).to_have_count(24)
    toolbar_buttons = multi.locator(".canvas-schedule-asset-toolbar button")
    toolbar_buttons.nth(0).click()
    expect(multi.locator(".canvas-schedule-pool-count")).to_contain_text("40")
    expect(tiles).to_have_count(24)
    assert state["page_two_calls"] == 1, state["library_queries"]
    toolbar_buttons.nth(1).click()
    expect(multi.locator(".canvas-schedule-pool-count")).to_contain_text("0")

    multi.locator(".canvas-schedule-asset-load-more button").click()
    expect(tiles).to_have_count(40)
    assert state["page_two_calls"] == 2, state["library_queries"]
    selection_buttons = multi.locator(".canvas-schedule-asset-select")
    selection_buttons.nth(2).click()
    selection_buttons.nth(5).click(modifiers=["Shift"])
    expect(multi.locator(".canvas-schedule-asset-grid > article.is-selected")).to_have_count(4)
    toolbar_buttons.nth(1).click()

    multi.locator(".canvas-schedule-asset-preview").nth(1).click()
    viewer = page.locator(".canvas-image-viewer")
    expect(viewer).to_be_visible()
    viewer_image = viewer.locator("img").first
    expect(viewer_image).to_have_attribute("src", ASSETS[1]["publicUrl"])
    viewer.get_by_role("button", name="关闭图片预览").click()

    single = parameter(dialog, "单图素材")
    expect(single.get_by_role("button", name="全选当前筛选结果")).to_have_count(0)
    assert_no_overflow(page, "desktop")
    assert not errors, errors
    page.close()


def verify_mobile(browser):
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    dialog = open_scheduler(page)
    multi = parameter(dialog, "多图素材")
    expect(multi.locator(".canvas-schedule-asset-grid > article")).to_have_count(24)
    assert_no_overflow(page, "mobile")
    assert not errors, errors
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        verify_desktop(browser)
        verify_mobile(browser)
        browser.close()
    print("Canvas scheduler image search performance browser checks passed.")


if __name__ == "__main__":
    main()
