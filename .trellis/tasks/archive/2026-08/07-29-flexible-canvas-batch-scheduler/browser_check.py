import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


NOW = "2026-07-29T10:00:00.000Z"
ROOT = Path(__file__).resolve().parents[3]
BASE_URL = os.environ.get("CANVAS_BROWSER_BASE_URL", "http://127.0.0.1:3001").rstrip("/")


def asset(asset_id, name, role="reference"):
    return {
        "id": asset_id,
        "role": role,
        "name": name,
        "publicUrl": f"/{asset_id}.jpg",
        "url": f"/{asset_id}.jpg",
        "mimeType": "image/jpeg",
    }


PERSON = asset("person-1", "人物正面")
SCENE = asset("scene-1", "城市街道")
VEHICLES = [asset(f"vehicle-{index}", name, "vehicle") for index, name in enumerate(["车辆前视", "车辆侧视", "车辆后视", "车辆细节"], 1)]


def canvas_node(node_id, node_type, x, y, config=None):
    return {
        "id": node_id,
        "type": node_type,
        "version": 2 if node_type == "model.gpt-image" else 1,
        "position": {"x": x, "y": y},
        "config": config or {},
    }


def graph():
    nodes = [
        canvas_node("person", "input.images", 20, 20, {"urls": []}),
        canvas_node("scene", "input.images", 20, 220, {"urls": []}),
        canvas_node("vehicle", "input.images", 20, 420, {"urls": []}),
        canvas_node("prompt", "input.text", 320, 20, {"text": "人物在场景中与车辆自然互动"}),
        canvas_node("image", "model.gpt-image", 620, 180, {"prompt": "", "referenceUrls": [], "count": 1, "ratio": "1:1", "quality": "1k"}),
        canvas_node("body", "input.text", 620, 470, {"text": "测试正文"}),
        canvas_node("content", "compose.social-post", 980, 260, {"fallbackTitle": "人物场景图"}),
    ]
    edges = [
        {"id": "e1", "source": "prompt", "sourcePort": "text", "target": "image", "targetPort": "prompt"},
        {"id": "e2", "source": "person", "sourcePort": "images", "target": "image", "targetPort": "references"},
        {"id": "e3", "source": "scene", "sourcePort": "images", "target": "image", "targetPort": "references"},
        {"id": "e4", "source": "vehicle", "sourcePort": "images", "target": "image", "targetPort": "references"},
        {"id": "e5", "source": "image", "sourcePort": "images", "target": "content", "targetPort": "images"},
        {"id": "e6", "source": "body", "sourcePort": "text", "target": "content", "targetPort": "body"},
    ]
    return {"nodes": nodes, "edges": edges, "viewport": {"x": 0, "y": 0, "zoom": 0.85}}


def workflow():
    return {
        "id": "workflow-flex-v2",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "人物场景批量画布",
        "revision": 4,
        "graph": graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def parameter(parameter_id, name, scope, node_id, values, expansion, sample_count=None):
    result = {
        "id": parameter_id,
        "name": name,
        "scope": scope,
        "valueType": "image",
        "source": {
            "mode": "library-filter",
            "role": "vehicle" if node_id == "vehicle" else "reference",
            "filter": {"mode": "manual", "assetIds": [item["id"] for item in values], "search": "", "tags": []},
        },
        "expansion": expansion,
        "binding": {"nodeId": node_id, "fieldKey": "urls"},
    }
    if sample_count is not None:
        result["sampleCount"] = sample_count
    return result


PARAMETERS = [
    parameter("person-param", "人物", "main", "person", [PERSON], "fixed"),
    parameter("scene-param", "场景", "main", "scene", [SCENE], "fixed"),
    parameter("vehicle-param", "车辆角度", "child", "vehicle", VEHICLES, "random", {"mode": "range", "min": 2, "max": 4}),
]


def schedule():
    children = []
    for index, vehicle in enumerate(VEHICLES[:3], 1):
        children.append({
            "id": f"child-{index}",
            "parameterValues": {"vehicle-param": vehicle},
            "status": "pending",
            "resultArtifacts": [],
            "createdAt": NOW,
            "updatedAt": NOW,
        })
    return {
        "id": "schedule-flex-v2",
        "schemaVersion": 2,
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "人物 + 场景 + 三角度",
        "revision": 2,
        "workflowId": "workflow-flex-v2",
        "workflowRevision": 4,
        "status": "ready",
        "batches": [],
        "definition": {
            "parameters": PARAMETERS,
            "expansion": {"main": "cartesian", "child": "cartesian"},
            "childResult": {"nodeId": "image", "outputPort": "images", "artifactKind": "images"},
            "mainTargetNodeId": "content",
            "aggregationPolicy": "at-least-one",
        },
        "mainTasks": [{
            "id": "main-1",
            "parameterValues": {"person-param": PERSON, "scene-param": SCENE},
            "childTasks": children,
            "status": "pending",
            "resultArtifacts": [],
            "createdAt": NOW,
            "updatedAt": NOW,
        }],
        "totalMainTasks": 1,
        "totalChildTasks": 3,
        "totalContentTasks": 1,
        "totalImageTasks": 3,
        "previewRevision": "preview-v2",
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def install_mock_api(page):
    state = {"workflow": workflow(), "schedule": schedule()}

    def image_handler(route):
        color = "#0f766e" if "person" in route.request.url or "scene" in route.request.url else "#2563eb"
        route.fulfill(
            status=200,
            content_type="image/svg+xml",
            body=f'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="{color}"/><path d="M24 145l48-54 38 35 34-46 72 65z" fill="#f8fafc" opacity=".9"/></svg>',
        )

    page.route("**/*.jpg", image_handler)

    def handler(route):
        request = route.request
        path = request.url.split("?", 1)[0].replace(BASE_URL, "")

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": [state["workflow"]]})
        elif path == "/api/canvas/workflows/workflow-flex-v2":
            if request.method == "PATCH":
                body = request.post_data_json
                state["workflow"] = {**state["workflow"], "graph": body.get("graph", state["workflow"]["graph"]), "revision": state["workflow"]["revision"] + 1}
            fulfill({"workflow": state["workflow"]})
        elif path == "/api/canvas/runs":
            fulfill({"runs": [], "latestSuccessfulNodeRuns": []})
        elif path == "/api/canvas/schedules":
            fulfill({"schedules": [state["schedule"]]})
        elif path == "/api/canvas/schedules/schedule-flex-v2":
            if request.method == "PATCH":
                body = request.post_data_json
                if body.get("action") == "save":
                    state["schedule"] = {**state["schedule"], "name": body.get("name", state["schedule"]["name"]), "definition": body.get("definition", state["schedule"]["definition"]), "revision": state["schedule"]["revision"] + 1}
            fulfill({"schedule": state["schedule"]})
        elif path == "/api/library/assets":
            role = "vehicle" if "role=vehicle" in request.url else "reference"
            items = VEHICLES if role == "vehicle" else [PERSON, SCENE]
            fulfill({"assets": items, "collections": [], "total": len(items)})
        elif path == "/api/copy-library":
            fulfill({"entries": [], "tags": []})
        else:
            fulfill({})

    page.route("**/api/**", handler)


def assert_layout(page, label):
    size = page.evaluate("() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth })")
    assert size["documentWidth"] <= size["viewportWidth"], f"{label} horizontal overflow: {size}"
    panel = page.locator(".canvas-task-center-panel")
    box = panel.bounding_box()
    assert box and box["x"] >= 0 and box["x"] + box["width"] <= size["viewportWidth"] + 1, (label, box, size)


def open_schedule(page):
    page.get_by_role("button", name="批量调度").click()
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    dialog.wait_for()
    dialog.locator(".canvas-schedule-v2-preview").wait_for()
    assert "1 主任务 · 3 子任务" in dialog.locator(".canvas-schedule-v2-preview header").inner_text()
    aggregation = dialog.locator("label", has_text="失败聚合").locator("select")
    assert aggregation.locator("option").all_text_contents() == ["至少一个成功", "必须全部成功"]
    assert dialog.locator(".canvas-schedule-v2-preview article").count() == 1
    assert dialog.locator(".canvas-schedule-v2-preview article > div").nth(1).locator("span").count() == 3
    preview_images = dialog.locator(".canvas-schedule-v2-preview-images img")
    assert preview_images.count() == 5
    assert all(preview_images.nth(index).evaluate("image => image.complete && image.naturalWidth > 0") for index in range(5))
    dialog.locator(".canvas-schedule-v2-preview-images button").first.click()
    viewer = page.locator(".canvas-image-viewer")
    viewer.wait_for()
    assert viewer.locator(".canvas-image-viewer-image").evaluate("image => image.complete && image.naturalWidth > 0")
    page.keyboard.press("Escape")
    viewer.wait_for(state="hidden")
    return dialog


def verify_desktop(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    page.get_by_test_id("canvas-stage").locator(".react-flow__pane").wait_for()

    image_nodes = page.locator('.react-flow__node[data-id="person"], .react-flow__node[data-id="scene"], .react-flow__node[data-id="vehicle"]')
    assert image_nodes.count() == 3, page.locator(".react-flow__node").all_inner_texts()
    page.locator('.react-flow__node[data-id="person"]').click()
    name_input = page.locator(".canvas-inspector-content label", has_text="节点名称").locator("input")
    name_input.fill("人物参考")
    name_input.press("Enter")
    page.locator(".react-flow__node").filter(has_text="人物参考").wait_for()
    page.locator('.react-flow__node[data-id="scene"]').click()
    name_input.fill("场景参考")
    name_input.press("Enter")
    page.locator(".react-flow__node").filter(has_text="场景参考").wait_for()

    dialog = open_schedule(page)
    binding_text = " ".join(dialog.locator(".canvas-schedule-parameter select").all_text_contents())
    assert "人物参考" in binding_text and "场景参考" in binding_text
    assert "person"[-4:] in binding_text and "scene"[-4:] in binding_text
    vehicle_parameter = dialog.locator('.canvas-schedule-parameter:has(input[value="车辆角度"])')
    assert vehicle_parameter.locator("label", has_text="展开").locator("select").input_value() == "random"
    sample_mode = vehicle_parameter.get_by_role("group", name="抽取数量模式")
    assert sample_mode.get_by_role("button", name="随机范围").get_attribute("aria-pressed") == "true"
    sample_min = vehicle_parameter.locator("label", has_text="最少").locator("input")
    sample_max = vehicle_parameter.locator("label", has_text="最多").locator("input")
    assert sample_min.input_value() == "2"
    assert sample_max.input_value() == "4"
    assert "每个主任务随机抽取 2-4 项" in vehicle_parameter.inner_text()
    sample_max.fill("3")
    sample_max.press("Tab")
    page.wait_for_timeout(100)
    assert sample_max.input_value() == "3"
    assert "每个主任务随机抽取 2-3 项" in vehicle_parameter.inner_text()
    preview = dialog.locator(".canvas-schedule-v2-preview")
    preview.evaluate("element => element.scrollIntoView({ block: 'center' })")
    preview_box = preview.bounding_box()
    actions_box = dialog.locator(".canvas-schedule-primary-actions").bounding_box()
    assert preview_box and actions_box and preview_box["y"] + preview_box["height"] <= actions_box["y"] + 1, (preview_box, actions_box)
    assert_layout(page, "desktop")
    preview.screenshot(path=str(ROOT / ".tmp-flexible-scheduler-preview-desktop.png"))
    screenshot = ROOT / ".tmp-flexible-scheduler-desktop.png"
    page.screenshot(path=str(screenshot), full_page=True)
    assert not errors, errors
    page.close()
    return str(screenshot)


def verify_mobile(browser):
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    page.get_by_test_id("canvas-stage").locator(".react-flow__pane").wait_for()
    dialog = open_schedule(page)
    assert dialog.locator(".canvas-schedule-metrics").inner_text().count("3") >= 1
    vehicle_parameter = dialog.locator('.canvas-schedule-parameter:has(input[value="车辆角度"])')
    assert vehicle_parameter.locator("label", has_text="最少").locator("input").input_value() == "2"
    assert vehicle_parameter.locator("label", has_text="最多").locator("input").input_value() == "4"
    assert "每个主任务随机抽取 2-4 项" in vehicle_parameter.inner_text()
    dialog.locator(".canvas-schedule-v2-preview").scroll_into_view_if_needed()
    assert_layout(page, "mobile")
    screenshot = ROOT / ".tmp-flexible-scheduler-mobile.png"
    page.screenshot(path=str(screenshot), full_page=True)
    assert not errors, errors
    page.close()
    return str(screenshot)


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        desktop = verify_desktop(browser)
        mobile = verify_mobile(browser)
        browser.close()
    print(json.dumps({"desktop": desktop, "mobile": mobile}, ensure_ascii=False))


if __name__ == "__main__":
    main()
