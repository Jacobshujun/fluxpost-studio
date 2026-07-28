import json
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


NOW = "2026-07-27T00:00:00.000Z"


def graph():
    nodes = [
        {"id": "source-match", "type": "input.text", "version": 1, "position": {"x": 40, "y": 40}, "config": {"text": "A---B---C"}},
        {"id": "split-match", "type": "utility.text-split", "version": 2, "position": {"x": 330, "y": 40}, "config": {"mode": "delimiter", "delimiter": "---", "delimiterIndex": 2}},
        {"id": "source-fallback", "type": "input.text", "version": 1, "position": {"x": 40, "y": 390}, "config": {"text": "没有配置的分隔符"}},
        {"id": "split-fallback", "type": "utility.text-split", "version": 2, "position": {"x": 330, "y": 390}, "config": {"mode": "delimiter", "delimiter": "---", "delimiterIndex": 2}},
    ]
    return {
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": nodes,
        "edges": [
            {"id": "edge-match", "source": "source-match", "sourcePort": "text", "target": "split-match", "targetPort": "text"},
            {"id": "edge-fallback", "source": "source-fallback", "sourcePort": "text", "target": "split-fallback", "targetPort": "text"},
        ],
    }


def workflow():
    return {
        "id": "workflow-split",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "文本分割测试",
        "revision": 1,
        "graph": graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def run_record():
    return {
        "id": "run-split",
        "workflowId": "workflow-split",
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


def node_run(node_id, outputs):
    return {
        "id": f"node-run-{node_id}",
        "runId": "run-split",
        "nodeId": node_id,
        "nodeType": "utility.text-split",
        "attempt": 1,
        "status": "completed",
        "inputs": {},
        "outputs": outputs,
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
        "completedAt": NOW,
    }


def install_mock_api(page):
    state = {"workflow": workflow()}
    run = run_record()
    node_runs = [
        node_run("split-match", {"head": {"kind": "text", "value": "A---B"}, "tail": {"kind": "text", "value": "C"}}),
        node_run("split-fallback", {"tail": {"kind": "text", "value": "没有配置的分隔符"}}),
    ]

    def handler(route):
        request = route.request
        path = request.url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": [state["workflow"]]})
            return
        if path == "/api/canvas/workflows/workflow-split":
            if request.method == "PATCH":
                body = request.post_data_json
                state["workflow"] = {
                    **state["workflow"],
                    "name": body.get("name", state["workflow"]["name"]),
                    "graph": body.get("graph", state["workflow"]["graph"]),
                    "revision": state["workflow"]["revision"] + 1,
                }
            fulfill({"workflow": state["workflow"]})
            return
        if path == "/api/canvas/runs":
            fulfill({"runs": [run], "latestSuccessfulNodeRuns": []})
            return
        if path == "/api/canvas/runs/run-split":
            fulfill({"run": run, "nodeRuns": node_runs})
            return
        fulfill({})

    page.route("**/api/**", handler)


def assert_no_overflow(page, label):
    sizes = page.evaluate("() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })")
    assert sizes["scroll"] <= sizes["width"], f"{label} horizontal overflow: {sizes}"
    return sizes


def verify_desktop(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.locator("[data-testid=canvas-stage] .react-flow__pane").wait_for()
    assert page.get_by_text("文本分割", exact=True).count() >= 3, "palette and V2 nodes must use the confirmed name"
    assert page.get_by_text("文本拆分", exact=True).count() == 0, "editable V2 UI must not show the old name"

    matched = page.locator('.react-flow__node[data-id="split-match"]')
    fallback = page.locator('.react-flow__node[data-id="split-fallback"]')
    matched.wait_for()
    assert matched.locator(".canvas-text-split-output").count() == 2
    assert "A---B" in matched.locator(".canvas-text-split-output").nth(0).inner_text()
    assert "C" in matched.locator(".canvas-text-split-output").nth(1).inner_text()
    assert "未匹配，已全部作为正文" in fallback.inner_text()
    assert fallback.locator(".canvas-text-split-output").count() == 1
    assert "标题\n为空" in fallback.locator(".canvas-text-split-empty").inner_text()

    matched.get_by_role("button", name="查看完整标题").click()
    dialog = page.get_by_role("dialog", name="完整文本")
    assert dialog.locator("pre").inner_text() == "A---B"
    page.get_by_role("button", name="关闭文本预览").click()
    matched.get_by_role("button", name="查看完整正文").click()
    assert page.get_by_role("dialog", name="完整文本").locator("pre").inner_text() == "C"
    page.get_by_role("button", name="关闭文本预览").click()

    inline_delimiter = matched.get_by_label("文本分割符")
    inline_delimiter.click()
    inline_delimiter.fill("###")
    inspector = page.locator(".canvas-inspector-active")
    inspector_delimiter = inspector.get_by_role("textbox", name="分隔符", exact=True)
    inspector_index = inspector.get_by_role("spinbutton", name="第几个分隔符", exact=True)
    inspector_delimiter.wait_for()
    assert inspector_delimiter.input_value() == "###"
    inspector_index.fill("3")
    assert matched.get_by_label("第几个分隔符").input_value() == "3"

    matched.get_by_label("文本分割方式").select_option("first-line")
    assert matched.get_by_label("文本分割符").count() == 0
    assert inspector.get_by_role("textbox", name="分隔符", exact=True).count() == 0
    assert inspector.get_by_role("spinbutton", name="第几个分隔符", exact=True).count() == 0

    overflow = assert_no_overflow(page, "desktop")
    page.screenshot(path=str(screenshot_dir / "fluxpost-text-split-desktop.png"), full_page=True)
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
    matched = page.locator('.react-flow__node[data-id="split-match"]')
    matched.wait_for()
    node_box = matched.bounding_box()
    controls_box = matched.locator(".canvas-text-split-controls").bounding_box()
    assert node_box and controls_box
    assert controls_box["x"] >= node_box["x"] and controls_box["x"] + controls_box["width"] <= node_box["x"] + node_box["width"] + 1
    overflow = assert_no_overflow(page, "mobile")
    page.screenshot(path=str(screenshot_dir / "fluxpost-text-split-mobile.png"), full_page=True)
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
