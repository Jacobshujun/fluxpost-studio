import json
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


NOW = "2026-08-04T12:00:00.000Z"


def node(node_id, node_type, x, config):
    return {
        "id": node_id,
        "type": node_type,
        "version": 2 if node_type == "model.gpt-image" else 1,
        "label": {
            "main-image": "主任务美图",
            "vision": "视觉反推",
            "child-image": "子任务参考图",
            "image-result": "图片生成",
        }.get(node_id, node_id),
        "position": {"x": x, "y": 100},
        "config": config,
    }


GRAPH = {
    "nodes": [
        node("main-image", "input.library-images", 40, {"assetIds": [], "assetNames": [], "urls": [], "snapshotAt": ""}),
        node("instruction", "input.text", 40, {"text": "反推图片提示词"}),
        node("vision", "model.gpt-vision", 360, {"preset": "describe", "instruction": "", "maxImages": 8}),
        node("child-image", "input.library-images", 360, {"assetIds": [], "assetNames": [], "urls": [], "snapshotAt": ""}),
        node("image-result", "model.gpt-image", 700, {"count": 1, "ratio": "1:1", "resolution": "1k", "quality": "medium"}),
    ],
    "edges": [
        {"id": "e-main-vision", "source": "main-image", "sourcePort": "images", "target": "vision", "targetPort": "images"},
        {"id": "e-instruction-vision", "source": "instruction", "sourcePort": "text", "target": "vision", "targetPort": "instruction"},
        {"id": "e-vision-result", "source": "vision", "sourcePort": "text", "target": "image-result", "targetPort": "prompt"},
        {"id": "e-child-result", "source": "child-image", "sourcePort": "images", "target": "image-result", "targetPort": "references"},
    ],
    "viewport": {"x": 0, "y": 0, "zoom": 0.8},
}

WORKFLOW = {
    "id": "workflow-shared-browser",
    "ownerUserId": "user-1",
    "ownerDisplayName": "Tester",
    "name": "共享上游检查",
    "revision": 4,
    "graph": GRAPH,
    "isTemplate": False,
    "createdAt": NOW,
    "updatedAt": NOW,
}


def asset(asset_id, url):
    return {"id": asset_id, "url": url, "name": asset_id, "width": 1200, "height": 800}


MAIN_TASK = {
    "id": "main-shared-browser",
    "parameterValues": {"main-reference": asset("main-reference", "/mock/main.svg")},
    "childTasks": [
        {
            "id": f"child-{index}",
            "parameterValues": {"child-reference": asset(f"child-reference-{index}", f"/mock/child-{index}.svg")},
            "status": "pending",
            "resultArtifacts": [],
            "createdAt": NOW,
            "updatedAt": NOW,
        }
        for index in range(1, 4)
    ],
    "status": "pending",
    "resultArtifacts": [],
    "createdAt": NOW,
    "updatedAt": NOW,
}

SCHEDULE = {
    "id": "schedule-shared-browser",
    "schemaVersion": 2,
    "ownerUserId": "user-1",
    "ownerDisplayName": "Tester",
    "name": "共享上游检查",
    "revision": 2,
    "workflowId": WORKFLOW["id"],
    "workflowRevision": WORKFLOW["revision"],
    "status": "ready",
    "batches": [],
    "definition": {
        "parameters": [
            {
                "id": "main-reference",
                "name": "主任务美图",
                "scope": "main",
                "valueType": "image",
                "source": {"mode": "fixed", "values": [asset("main-reference", "/mock/main.svg")]},
                "expansion": "fixed",
                "binding": {"nodeId": "main-image", "fieldKey": "assetIds"},
            },
            {
                "id": "child-reference",
                "name": "子任务参考图",
                "scope": "child",
                "valueType": "image",
                "source": {"mode": "manual-list", "values": [asset(f"child-reference-{index}", f"/mock/child-{index}.svg") for index in range(1, 4)]},
                "expansion": "each",
                "binding": {"nodeId": "child-image", "fieldKey": "assetIds"},
            },
        ],
        "expansion": {"main": "cartesian", "child": "cartesian"},
        "sharedOutputs": [{"nodeId": "vision", "outputPort": "text", "artifactKind": "text"}],
        "childResult": {"nodeId": "image-result", "outputPort": "images", "artifactKind": "images"},
        "aggregationPolicy": "at-least-one",
    },
    "mainTasks": [MAIN_TASK],
    "totalMainTasks": 1,
    "totalChildTasks": 3,
    "totalContentTasks": 1,
    "totalImageTasks": 3,
    "previewRevision": "shared-preview-v1",
    "createdAt": NOW,
    "updatedAt": NOW,
}


def install_mock_api(page):
    state = {"schedule": json.loads(json.dumps(SCHEDULE)), "retryBody": None}

    def handler(route):
        request = route.request
        path = urlparse(request.url).path

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": [WORKFLOW]})
        elif path == f"/api/canvas/workflows/{WORKFLOW['id']}":
            fulfill({"workflow": WORKFLOW})
        elif path == "/api/canvas/runs":
            fulfill({"runs": [], "latestSuccessfulNodeRuns": []})
        elif path == "/api/canvas/schedules":
            fulfill({"schedules": [state["schedule"]]})
        elif path == f"/api/canvas/schedules/{SCHEDULE['id']}" and request.method == "PATCH":
            body = request.post_data_json
            if body.get("action") == "launch":
                main = state["schedule"]["mainTasks"][0]
                main.update({
                    "status": "failed",
                    "sharedRunId": "canvas-scheduler-v2-shared-main-shared-browser",
                    "sharedStatus": "failed",
                    "sharedArtifacts": [],
                    "sharedError": "模拟共享阶段失败",
                    "error": "模拟共享阶段失败",
                })
                state["schedule"].update({"status": "failed", "revision": 3, "previewRevision": None})
            elif body.get("action") == "retry-shared":
                state["retryBody"] = body
                main = state["schedule"]["mainTasks"][0]
                main.update({
                    "status": "queued",
                    "sharedStatus": "completed",
                    "sharedArtifacts": [{
                        "nodeId": "vision",
                        "outputPort": "text",
                        "artifactKind": "text",
                        "artifact": {"kind": "text", "value": "冻结的视觉反推提示词"},
                    }],
                    "sharedError": None,
                    "error": None,
                })
                state["schedule"].update({"status": "running", "revision": 4})
            fulfill({"schedule": state["schedule"]})
        else:
            fulfill({})

    page.route("**/api/**", handler)
    page.route("**/mock/*.svg", lambda route: route.fulfill(
        content_type="image/svg+xml",
        body='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#dce8e2"/><path d="M20 95 62 48l28 31 19-18 31 34" fill="none" stroke="#31584b" stroke-width="8"/></svg>',
    ))
    return state


def open_scheduler(page):
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.get_by_test_id("canvas-stage").locator(".react-flow__pane").wait_for()
    page.get_by_role("button", name="批量调度").click()
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    dialog.wait_for()
    return dialog


def assert_no_overflow(page, label):
    sizes = page.evaluate("() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth })")
    assert sizes["documentWidth"] <= sizes["viewportWidth"], f"{label} horizontal overflow: {sizes}"


def verify_desktop(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    state = install_mock_api(page)
    dialog = open_scheduler(page)
    shared = dialog.locator('.canvas-schedule-shared-outputs label:has-text("视觉反推")')
    expect(shared).to_have_count(1)
    expect(shared.get_by_role("checkbox")).to_be_checked()
    expect(dialog.get_by_label("主任务共享阶段")).to_contain_text("每个主任务执行一次")
    dialog.get_by_role("button", name="确认并启动").click()
    retry = dialog.get_by_role("button", name="重试共享阶段")
    expect(retry).to_be_visible()
    expect(dialog.get_by_text("模拟共享阶段失败", exact=True).first).to_be_visible()
    retry.click()
    assert state["retryBody"] is not None
    assert state["retryBody"]["mainTaskId"] == "main-shared-browser"
    expect(dialog.get_by_text("冻结的视觉反推提示词", exact=True)).to_be_visible()
    assert_no_overflow(page, "desktop")
    assert not errors, errors
    page.close()


def verify_mobile(browser):
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    dialog = open_scheduler(page)
    expect(dialog.locator('.canvas-schedule-shared-outputs label:has-text("视觉反推")')).to_be_visible()
    assert_no_overflow(page, "mobile")
    assert not errors, errors
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        verify_desktop(browser)
        verify_mobile(browser)
        browser.close()
    print("Canvas shared output browser checks passed.")


if __name__ == "__main__":
    main()
