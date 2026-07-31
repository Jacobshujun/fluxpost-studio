import json
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


NOW = "2026-07-30T10:00:00.000Z"
ASSETS = [
    {
        "id": f"asset-{index:02d}",
        "name": f"测试图片 {index:02d}",
        "publicUrl": f"/mock/asset-{index:02d}.svg",
        "width": 640,
        "height": 480,
    }
    for index in range(1, 58)
]


def canvas_node(node_id, x):
    return {
        "id": node_id,
        "type": "input.images",
        "version": 1,
        "position": {"x": x, "y": 80},
        "config": {"urls": []},
    }


GRAPH = {
    "nodes": [
        canvas_node("multi-images", 40),
        canvas_node("single-image", 340),
        canvas_node("condition-image", 640),
        {
            "id": "image-output",
            "type": "model.gpt-image",
            "version": 2,
            "position": {"x": 940, "y": 80},
            "config": {"prompt": "测试", "referenceUrls": [], "count": 1, "ratio": "1:1", "quality": "1k"},
        },
    ],
    "edges": [],
    "viewport": {"x": 0, "y": 0, "zoom": 0.8},
}


def image_parameter(parameter_id, name, node_id, value_type, expansion, mode):
    return {
        "id": parameter_id,
        "name": name,
        "scope": "child",
        "valueType": value_type,
        "source": {
            "mode": "library-filter",
            "role": "reference",
            "filter": {"mode": mode, "assetIds": [], "search": "", "tags": []},
        },
        "expansion": expansion,
        "randomCount": 2 if expansion == "random" else None,
        "binding": {"nodeId": node_id, "fieldKey": "urls"},
    }


WORKFLOW = {
    "id": "workflow-image-source",
    "ownerUserId": "user-1",
    "ownerDisplayName": "Tester",
    "name": "图片来源检查",
    "revision": 3,
    "graph": GRAPH,
    "isTemplate": False,
    "createdAt": NOW,
    "updatedAt": NOW,
}

SCHEDULE = {
    "id": "schedule-image-source",
    "schemaVersion": 2,
    "ownerUserId": "user-1",
    "ownerDisplayName": "Tester",
    "name": "图片来源检查",
    "revision": 1,
    "workflowId": WORKFLOW["id"],
    "workflowRevision": WORKFLOW["revision"],
    "status": "draft",
    "batches": [],
    "definition": {
        "parameters": [
            image_parameter("multi", "多图素材", "multi-images", "image-group", "fixed", "manual"),
            image_parameter("single", "单图素材", "single-image", "image", "fixed", "manual"),
            image_parameter("condition", "条件素材", "condition-image", "image", "random", "random"),
        ],
        "expansion": {"main": "cartesian", "child": "cartesian"},
        "childResult": {"nodeId": "image-output", "outputPort": "images", "artifactKind": "images"},
        "aggregationPolicy": "at-least-one",
    },
    "mainTasks": [],
    "totalMainTasks": 0,
    "totalChildTasks": 0,
    "totalContentTasks": 0,
    "totalImageTasks": 0,
    "createdAt": NOW,
    "updatedAt": NOW,
}


def install_mock_api(page):
    state = {
        "workflow": dict(WORKFLOW),
        "schedule": json.loads(json.dumps(SCHEDULE)),
        "held_library_routes": {},
    }

    def handler(route):
        request = route.request
        parsed = urlparse(request.url)
        path = parsed.path

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": [state["workflow"]]})
        elif path == f"/api/canvas/workflows/{WORKFLOW['id']}":
            fulfill({"workflow": state["workflow"]})
        elif path == "/api/canvas/runs":
            fulfill({"runs": [], "latestSuccessfulNodeRuns": []})
        elif path == "/api/canvas/schedules":
            fulfill({"schedules": [state["schedule"]]})
        elif path == f"/api/canvas/schedules/{SCHEDULE['id']}":
            if request.method == "PATCH":
                body = request.post_data_json
                if body.get("action") == "save":
                    state["schedule"] = {
                        **state["schedule"],
                        "name": body.get("name", state["schedule"]["name"]),
                        "definition": body.get("definition", state["schedule"]["definition"]),
                        "revision": state["schedule"]["revision"] + 1,
                    }
            fulfill({"schedule": state["schedule"]})
        elif path == "/api/library/assets":
            query = parse_qs(parsed.query)
            cursor = query.get("cursor", [""])[0]
            search = query.get("search", [""])[0]
            if cursor and search in {"过期分页", "过期全选"}:
                state["held_library_routes"][search] = route
                return
            if search == "新筛选":
                fulfill({"assets": ASSETS[:10], "collections": [], "total": 10, "nextCursor": None})
                return
            items = ASSETS[45:] if cursor == "page-2" else ASSETS[:45]
            fulfill({"assets": items, "collections": [], "total": len(ASSETS), "nextCursor": None if cursor else "page-2"})
        else:
            fulfill({})

    page.route("**/api/**", handler)
    page.route("**/mock/*.svg", lambda route: route.fulfill(
        content_type="image/svg+xml",
        body='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#d9e4df"/><path d="M20 95 62 48l28 31 19-18 31 34" fill="none" stroke="#31584b" stroke-width="8"/></svg>',
    ))
    return state


def fulfill_second_asset_page(route):
    route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({"assets": ASSETS[45:], "collections": [], "total": len(ASSETS), "nextCursor": None}, ensure_ascii=False),
    )


def open_scheduler(page):
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.get_by_test_id("canvas-stage").locator(".react-flow__pane").wait_for()
    page.get_by_role("button", name="批量调度").click()
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    dialog.wait_for()
    return dialog


def parameter(dialog, name):
    return dialog.locator(f'.canvas-schedule-parameter:has(input[value="{name}"])')


def assert_no_overflow(page, label):
    sizes = page.evaluate("() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth })")
    assert sizes["documentWidth"] <= sizes["viewportWidth"], f"{label} horizontal overflow: {sizes}"
    panel = page.locator(".canvas-task-center-panel").bounding_box()
    assert panel and panel["x"] >= 0 and panel["x"] + panel["width"] <= sizes["viewportWidth"] + 1, (label, panel, sizes)


def verify_desktop(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script("Object.defineProperty(window, 'IntersectionObserver', { value: undefined, configurable: true })")
    state = install_mock_api(page)
    dialog = open_scheduler(page)
    multi = parameter(dialog, "多图素材")
    tiles = multi.locator(".canvas-schedule-asset-grid > article")
    expect(tiles).to_have_count(45)
    viewport = multi.locator(".canvas-schedule-asset-results")
    dimensions = viewport.evaluate("el => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight })")
    assert dimensions["scrollHeight"] > dimensions["clientHeight"], dimensions

    multi.get_by_role("button", name="加载更多").click()
    expect(tiles).to_have_count(57)

    multi.get_by_placeholder("关键字").fill("过期分页")
    expect(tiles).to_have_count(45)
    multi.get_by_role("button", name="加载更多").click()
    page.wait_for_timeout(50)
    held_page = state["held_library_routes"].pop("过期分页", None)
    assert held_page, "stale load-more request was not held"
    multi.get_by_placeholder("关键字").fill("新筛选")
    expect(tiles).to_have_count(10)
    fulfill_second_asset_page(held_page)
    page.wait_for_timeout(100)
    expect(tiles).to_have_count(10)

    multi.get_by_placeholder("关键字").fill("重新载入")
    expect(tiles).to_have_count(45)
    multi.get_by_role("button", name="全选当前筛选结果").click()
    expect(tiles).to_have_count(57)
    expect(multi.locator(".canvas-schedule-pool-count")).to_contain_text("已选 57 张")
    multi.get_by_role("button", name="清空已选").click()
    expect(multi.locator(".canvas-schedule-pool-count")).to_contain_text("已选 0 张")

    multi.get_by_placeholder("关键字").fill("过期全选")
    expect(tiles).to_have_count(45)
    multi.get_by_role("button", name="全选当前筛选结果").click()
    page.wait_for_timeout(50)
    held_select_all = state["held_library_routes"].pop("过期全选", None)
    assert held_select_all, "stale select-all request was not held"
    multi.get_by_role("button", name="条件匹配", exact=True).click()
    fulfill_second_asset_page(held_select_all)
    page.wait_for_timeout(100)
    expect(multi.get_by_role("button", name="条件匹配", exact=True)).to_have_attribute("aria-pressed", "true")
    multi.get_by_role("button", name="手动选择", exact=True).click()
    expect(multi.locator(".canvas-schedule-pool-count")).to_contain_text("已选 0 张")

    multi.get_by_placeholder("关键字").fill("范围选择")
    expect(tiles).to_have_count(45)
    select_buttons = multi.locator(".canvas-schedule-asset-select")
    select_buttons.nth(0).click()
    select_buttons.nth(3).click(modifiers=["Shift"])
    expect(multi.locator(".canvas-schedule-pool-count")).to_contain_text("已选 4 张")
    select_buttons.nth(5).click(modifiers=["Control"])
    expect(multi.locator(".canvas-schedule-pool-count")).to_contain_text("已选 5 张")

    multi.locator(".canvas-schedule-asset-preview").nth(1).click()
    viewer = page.locator(".canvas-image-viewer")
    expect(viewer).to_be_visible()
    expect(viewer.locator("#canvas-image-viewer-title")).to_have_text("图片 2 / 45")
    page.keyboard.press("ArrowRight")
    expect(viewer.locator("#canvas-image-viewer-title")).to_have_text("图片 3 / 45")
    viewer.get_by_role("button", name="关闭图片预览").click()
    expect(multi.locator(".canvas-schedule-pool-count")).to_contain_text("已选 5 张")

    single = parameter(dialog, "单图素材")
    expect(single.get_by_role("button", name="全选当前筛选结果")).to_have_count(0)
    single_select = single.locator(".canvas-schedule-asset-select")
    single_select.nth(0).click()
    single_select.nth(1).click()
    expect(single.locator(".canvas-schedule-pool-count")).to_contain_text("已选 1 张")

    condition = parameter(dialog, "条件素材")
    expect(condition.locator(".canvas-schedule-asset-select").first).to_be_disabled()
    condition.locator(".canvas-schedule-asset-preview").first.click()
    expect(page.locator(".canvas-image-viewer")).to_be_visible()
    page.locator(".canvas-image-viewer").get_by_role("button", name="关闭图片预览").click()
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
    expect(multi.locator(".canvas-schedule-asset-grid > article")).to_have_count(45)
    assert_no_overflow(page, "mobile")
    toolbar = multi.locator(".canvas-schedule-asset-toolbar").bounding_box()
    assert toolbar and toolbar["x"] >= 0 and toolbar["x"] + toolbar["width"] <= 390, toolbar
    assert not errors, errors
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        verify_desktop(browser)
        verify_mobile(browser)
        browser.close()
    print("Canvas scheduler image source browser checks passed.")


if __name__ == "__main__":
    main()
