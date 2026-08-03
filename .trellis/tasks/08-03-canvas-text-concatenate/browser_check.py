import json
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


NOW = "2026-08-03T00:00:00.000Z"


def graph():
    return {
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": [
            {"id": "text-a", "type": "input.text", "version": 1, "position": {"x": 30, "y": 20}, "config": {"text": " Alpha "}},
            {"id": "text-b", "type": "input.text", "version": 1, "position": {"x": 30, "y": 250}, "config": {"text": " Beta "}},
            {"id": "text-d", "type": "input.text", "version": 1, "position": {"x": 30, "y": 480}, "config": {"text": " Delta "}},
            {
                "id": "concatenate",
                "type": "utility.text-concatenate",
                "version": 1,
                "position": {"x": 360, "y": 180},
                "config": {"delimiter": "\\n", "clean_whitespace": True},
            },
        ],
        "edges": [
            {"id": "edge-a", "source": "text-a", "sourcePort": "text", "target": "concatenate", "targetPort": "text_a"},
            {"id": "edge-b", "source": "text-b", "sourcePort": "text", "target": "concatenate", "targetPort": "text_b"},
            {"id": "edge-d", "source": "text-d", "sourcePort": "text", "target": "concatenate", "targetPort": "text_d"},
        ],
    }


def workflow():
    return {
        "id": "workflow-concatenate",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "文本拼接浏览器测试",
        "revision": 1,
        "graph": graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def run_record():
    return {
        "id": "run-concatenate",
        "workflowId": "workflow-concatenate",
        "workflowRevision": 1,
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "status": "completed",
        "graphSnapshot": graph(),
        "confirmation": {"confirmedAt": NOW, "nodeIds": [], "capabilities": []},
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
        "completedAt": NOW,
    }


def node_run():
    return {
        "id": "node-run-concatenate",
        "runId": "run-concatenate",
        "nodeId": "concatenate",
        "nodeType": "utility.text-concatenate",
        "attempt": 1,
        "status": "completed",
        "inputs": {},
        "outputs": {"text": {"kind": "text", "value": "Alpha\nBeta\nDelta"}},
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
        "completedAt": NOW,
    }


def install_mock_api(page):
    state = {"workflow": workflow(), "patches": []}
    run = run_record()

    def handler(route):
        request = route.request
        path = request.url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": [state["workflow"]]})
            return
        if path == "/api/canvas/workflows/workflow-concatenate":
            if request.method == "PATCH":
                body = request.post_data_json
                state["patches"].append(body)
                state["workflow"] = {
                    **state["workflow"],
                    "graph": body.get("graph", state["workflow"]["graph"]),
                    "revision": state["workflow"]["revision"] + 1,
                    "updatedAt": NOW,
                }
            fulfill({"workflow": state["workflow"]})
            return
        if path == "/api/canvas/runs":
            fulfill({"runs": [run], "latestSuccessfulNodeRuns": []})
            return
        if path == "/api/canvas/runs/run-concatenate":
            fulfill({"run": run, "nodeRuns": [node_run()]})
            return
        fulfill({})

    page.route("**/api/**", handler)
    return state


def assert_no_overflow(page, label):
    sizes = page.evaluate("() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })")
    assert sizes["scroll"] <= sizes["width"], f"{label} horizontal overflow: {sizes}"
    return sizes


def verify_desktop(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    state = install_mock_api(page)
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.locator("[data-testid=canvas-stage] .react-flow__pane").wait_for()

    assert page.get_by_text("文本拼接", exact=True).count() >= 2, "palette and node must show the localized label"
    node = page.locator('.react-flow__node[data-id="concatenate"]')
    node.wait_for()
    for label in ["文本 A", "文本 B", "文本 C", "文本 D", "文字"]:
        assert node.get_by_text(label, exact=True).count() == 1, f"missing port label {label}"

    inline_delimiter = node.get_by_label("文本拼接分隔符")
    inline_cleanup = node.get_by_label("清理文本首尾空白")
    assert inline_delimiter.input_value() == "\\n"
    assert inline_cleanup.is_checked()

    node.click(position={"x": 110, "y": 20})
    inspector = page.locator(".canvas-inspector-active")
    inspector_delimiter = inspector.get_by_role("textbox", name="分隔符", exact=True)
    inspector_cleanup = inspector.get_by_role("checkbox", name="清理首尾空白", exact=True)
    inspector_delimiter.wait_for()
    assert inspector_delimiter.input_value() == "\\n"
    assert inspector_cleanup.is_checked()

    inline_delimiter.fill(" | ")
    assert inspector_delimiter.input_value() == " | "
    inline_cleanup.uncheck()
    assert not inspector_cleanup.is_checked()

    result = node.locator(".canvas-node-result")
    assert "Alpha\nBeta\nDelta" in result.inner_text()
    result.get_by_role("button", name="查看完整文本").click()
    dialog = page.get_by_role("dialog", name="完整文本")
    assert dialog.locator("pre").inner_text() == "Alpha\nBeta\nDelta"
    page.get_by_role("button", name="关闭文本预览").click()

    page.get_by_role("button", name="保存").click()
    page.wait_for_timeout(100)
    assert state["patches"], "save must persist the edited graph"
    saved_node = next(item for item in state["patches"][-1]["graph"]["nodes"] if item["id"] == "concatenate")
    assert saved_node["config"] == {"delimiter": " | ", "clean_whitespace": False}

    node_box = node.bounding_box()
    controls_box = node.locator(".canvas-text-concatenate-controls").bounding_box()
    assert node_box and controls_box
    assert controls_box["x"] >= node_box["x"] and controls_box["x"] + controls_box["width"] <= node_box["x"] + node_box["width"] + 1
    overflow = assert_no_overflow(page, "desktop")
    page.screenshot(path=str(screenshot_dir / "fluxpost-text-concatenate-desktop.png"), full_page=True)
    assert not errors, f"desktop page errors: {errors}"
    page.close()
    return overflow


def verify_mobile(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.locator("[data-testid=canvas-stage] .react-flow__pane").wait_for()
    node = page.locator('.react-flow__node[data-id="concatenate"]')
    node.wait_for()
    node_box = node.bounding_box()
    controls_box = node.locator(".canvas-text-concatenate-controls").bounding_box()
    assert node_box and controls_box
    assert controls_box["x"] >= node_box["x"] and controls_box["x"] + controls_box["width"] <= node_box["x"] + node_box["width"] + 1
    assert node.get_by_label("文本拼接分隔符").is_visible()
    assert node.get_by_label("清理文本首尾空白").is_visible()
    overflow = assert_no_overflow(page, "mobile")
    page.screenshot(path=str(screenshot_dir / "fluxpost-text-concatenate-mobile.png"), full_page=True)
    assert not errors, f"mobile page errors: {errors}"
    page.close()
    return overflow


def main():
    screenshot_dir = Path(tempfile.gettempdir())
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        desktop = verify_desktop(browser, screenshot_dir)
        mobile = verify_mobile(browser, screenshot_dir)
        browser.close()
    print(json.dumps({"desktop": desktop, "mobile": mobile, "screenshots": str(screenshot_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
