import json
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


NOW = "2026-07-27T08:00:00.000Z"


def graph():
    return {
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": [{"id": "text-1", "type": "input.text", "version": 1, "position": {"x": 100, "y": 100}, "config": {"text": "Canvas task center"}}],
        "edges": [],
    }


def workflow(workflow_id, name):
    return {
        "id": workflow_id,
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": name,
        "revision": 3,
        "graph": graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def run(run_id, workflow_id, status, created_at, revision=3):
    value = {
        "id": run_id,
        "workflowId": workflow_id,
        "workflowRevision": revision,
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "status": status,
        "graphSnapshot": graph(),
        "runMode": "with-upstream",
        "confirmation": {"confirmedAt": created_at, "nodeIds": [], "capabilities": []},
        "createdAt": created_at,
        "updatedAt": created_at,
        "startedAt": created_at,
    }
    if status not in {"queued", "running"}:
        value["completedAt"] = created_at
    if status == "failed":
        value["error"] = "Mock provider failure"
    return value


WORKFLOWS = [workflow("workflow-main", "Main campaign"), workflow("workflow-second", "Second campaign")]
RUNS = [
    run("run-second-failed", "workflow-second", "failed", "2026-07-27T08:30:00.000Z", 2),
    run("run-main-active", "workflow-main", "running", "2026-07-27T08:20:00.000Z"),
    run("run-main-history", "workflow-main", "completed", "2026-07-27T08:10:00.000Z", 2),
]


def node_runs(run_id):
    target = next(item for item in RUNS if item["id"] == run_id)
    status = "running" if target["status"] == "running" else "failed" if target["status"] == "failed" else "completed"
    value = {
        "id": f"node-{run_id}",
        "runId": run_id,
        "nodeId": "text-1",
        "nodeType": "input.text",
        "attempt": 1,
        "status": status,
        "inputs": {},
        "outputs": {"text": {"kind": "text", "value": "Canvas task center"}} if status == "completed" else {},
        "createdAt": target["createdAt"],
        "updatedAt": target["updatedAt"],
        "startedAt": target["createdAt"],
    }
    if status == "failed":
        value["error"] = "Mock provider failure"
        value["completedAt"] = target["createdAt"]
    return [value]


def install_mock_api(page):
    state = {"workflow": WORKFLOWS[0]}

    def handler(route):
        request = route.request
        url = request.url
        path = url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": WORKFLOWS})
            return
        if path == "/api/canvas/workflows/workflow-main":
            if request.method == "PATCH":
                body = request.post_data_json
                state["workflow"] = {**state["workflow"], "graph": body.get("graph", state["workflow"]["graph"]), "revision": state["workflow"]["revision"] + 1}
            fulfill({"workflow": state["workflow"]})
            return
        if path == "/api/canvas/runs":
            scoped = [item for item in RUNS if item["workflowId"] == "workflow-main"] if "workflowId=" in url else RUNS
            fulfill({"runs": scoped, "latestSuccessfulNodeRuns": []})
            return
        if path.startswith("/api/canvas/runs/"):
            run_id = path.rsplit("/", 1)[-1]
            target = next(item for item in RUNS if item["id"] == run_id)
            fulfill({"run": target, "nodeRuns": node_runs(run_id)})
            return
        fulfill({})

    page.route("**/api/**", handler)


def assert_no_overflow(page, label):
    sizes = page.evaluate("() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })")
    assert sizes["scroll"] <= sizes["width"], f"{label} horizontal overflow: {sizes}"


def verify_desktop(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    stage = page.get_by_test_id("canvas-stage")
    stage.locator(".react-flow__pane").wait_for()
    palette = page.locator(".canvas-palette")
    assert palette.is_visible()
    width_before = stage.bounding_box()["width"]
    page.get_by_role("button", name="隐藏节点库").first.click()
    assert not palette.is_visible()
    width_after = stage.bounding_box()["width"]
    assert width_after - width_before >= 220, (width_before, width_after)
    page.get_by_role("button", name="显示节点库").click()
    assert palette.is_visible()

    page.get_by_role("button", name="任务中心").click()
    dialog = page.get_by_role("dialog", name="Canvas 任务中心")
    dialog.wait_for()
    dialog.locator(".canvas-task-row").first.wait_for()
    assert dialog.locator(".canvas-task-list h3", has_text="进行中").count() == 1
    assert dialog.locator(".canvas-task-list h3", has_text="历史任务").count() == 1
    dialog.get_by_placeholder("搜索画布、任务 ID 或版本").fill("Second")
    assert dialog.locator(".canvas-task-row").count() == 1
    assert "Second campaign" in dialog.locator(".canvas-task-row").inner_text()
    dialog.locator(".canvas-task-row").click()
    detail_id = dialog.locator(".canvas-task-detail-head small")
    detail_id.wait_for()
    page.wait_for_function("() => document.querySelector('.canvas-task-detail-head small')?.textContent === 'run-second-failed'")
    dialog.get_by_placeholder("搜索画布、任务 ID 或版本").fill("")
    dialog.get_by_role("button", name="历史", exact=True).click()
    page.wait_for_function("() => document.querySelectorAll('.canvas-task-row').length === 2")
    assert_no_overflow(page, "desktop")
    screenshot = screenshot_dir / "fluxpost-canvas-task-center-desktop.png"
    page.screenshot(path=str(screenshot), full_page=True)
    assert not errors, errors
    page.close()
    return {"before": width_before, "after": width_after, "screenshot": str(screenshot)}


def verify_mobile(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.get_by_test_id("canvas-stage").locator(".react-flow__pane").wait_for()
    page.get_by_role("button", name="打开节点库").click()
    assert page.locator(".canvas-palette-open").is_visible()
    page.get_by_role("button", name="关闭节点库").click()
    page.get_by_role("button", name="任务中心").click()
    dialog = page.get_by_role("dialog", name="Canvas 任务中心")
    dialog.wait_for()
    dialog.get_by_placeholder("搜索画布、任务 ID 或版本").fill("run-main")
    page.wait_for_function("() => document.querySelectorAll('.canvas-task-row').length === 2")
    assert_no_overflow(page, "mobile")
    panel_box = dialog.locator(".canvas-task-center-panel").bounding_box()
    assert panel_box and panel_box["x"] >= 0 and panel_box["width"] <= 390
    screenshot = screenshot_dir / "fluxpost-canvas-task-center-mobile.png"
    page.screenshot(path=str(screenshot), full_page=True)
    assert not errors, errors
    page.close()
    return {"panel": panel_box, "screenshot": str(screenshot)}


def main():
    screenshot_dir = Path(tempfile.gettempdir())
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        desktop = verify_desktop(browser, screenshot_dir)
        mobile = verify_mobile(browser, screenshot_dir)
        browser.close()
    print(json.dumps({"desktop": desktop, "mobile": mobile}, ensure_ascii=False))


if __name__ == "__main__":
    main()
