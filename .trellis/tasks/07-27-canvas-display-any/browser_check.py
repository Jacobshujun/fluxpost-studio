import json
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


NOW = "2026-07-27T00:00:00.000Z"
PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
VIDEO = "data:video/mp4;base64,AAAA"


def graph():
    nodes = [
        {"id": "source-text", "type": "input.text", "version": 1, "position": {"x": 20, "y": 20}, "config": {"text": "当前文字"}},
        {"id": "source-images", "type": "input.images", "version": 1, "position": {"x": 20, "y": 350}, "config": {"urls": [PIXEL]}},
        {"id": "source-videos", "type": "input.videos", "version": 1, "position": {"x": 20, "y": 680}, "config": {"urls": [VIDEO]}},
        {"id": "source-post", "type": "compose.social-post", "version": 1, "position": {"x": 260, "y": 20}, "config": {}},
        {"id": "source-job", "type": "publish.feishu", "version": 1, "position": {"x": 260, "y": 350}, "config": {}},
        {"id": "display-text", "type": "utility.display-any", "version": 1, "position": {"x": 520, "y": 20}, "config": {}},
        {"id": "display-images", "type": "utility.display-any", "version": 1, "position": {"x": 780, "y": 20}, "config": {}},
        {"id": "display-videos", "type": "utility.display-any", "version": 1, "position": {"x": 520, "y": 350}, "config": {}},
        {"id": "display-post", "type": "utility.display-any", "version": 1, "position": {"x": 780, "y": 350}, "config": {}},
        {"id": "display-job", "type": "utility.display-any", "version": 1, "position": {"x": 520, "y": 680}, "config": {}},
        {"id": "display-empty", "type": "utility.display-any", "version": 1, "position": {"x": 780, "y": 680}, "config": {}},
    ]
    edges = [
        {"id": "post-body", "source": "source-text", "sourcePort": "text", "target": "source-post", "targetPort": "body"},
        {"id": "job-post", "source": "source-post", "sourcePort": "post", "target": "source-job", "targetPort": "post"},
        {"id": "display-text-edge", "source": "source-text", "sourcePort": "text", "target": "display-text", "targetPort": "value"},
        {"id": "display-images-edge", "source": "source-images", "sourcePort": "images", "target": "display-images", "targetPort": "value"},
        {"id": "display-videos-edge", "source": "source-videos", "sourcePort": "videos", "target": "display-videos", "targetPort": "value"},
        {"id": "display-post-edge", "source": "source-post", "sourcePort": "post", "target": "display-post", "targetPort": "value"},
        {"id": "display-job-edge", "source": "source-job", "sourcePort": "job", "target": "display-job", "targetPort": "value"},
    ]
    return {"viewport": {"x": 0, "y": 0, "zoom": 0.65}, "nodes": nodes, "edges": edges}


def workflow():
    return {
        "id": "workflow-display-any",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "展示任何测试",
        "revision": 2,
        "graph": graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def run_record():
    return {
        "id": "run-display-any",
        "workflowId": "workflow-display-any",
        "workflowRevision": 1,
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "status": "partial",
        "graphSnapshot": graph(),
        "confirmation": {"confirmedAt": NOW, "nodeIds": [], "capabilities": []},
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
        "completedAt": NOW,
    }


def display_run(node_id, artifact=None, status="completed", error=None, run_id="run-display-any"):
    value = {
        "id": f"node-run-{node_id}-{run_id}",
        "runId": run_id,
        "nodeId": node_id,
        "nodeType": "utility.display-any",
        "attempt": 1,
        "status": status,
        "inputs": {},
        "outputs": {"preview": artifact} if artifact else {},
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
        "completedAt": NOW,
    }
    if error:
        value["error"] = error
    return value


def artifacts():
    return {
        "images": {"kind": "images", "items": [{"url": PIXEL, "width": 1, "height": 1}]},
        "videos": {"kind": "videos", "items": [{"url": VIDEO, "name": "样片"}]},
        "post": {"kind": "socialPost", "postId": "post-1", "post": {"title": "待评审标题", "platform": "xiaohongshu", "imageUrls": [PIXEL], "videoUrls": [VIDEO]}},
        "job": {"kind": "publishJobRef", "jobId": "feishu-job-42", "status": "queued"},
        "text": {"kind": "text", "value": "历史完整文本"},
    }


def install_mock_api(page):
    state = {"workflow": workflow()}
    run = run_record()
    values = artifacts()
    node_runs = [
        display_run("display-text", status="failed", error="上游本次失败"),
        display_run("display-images", values["images"]),
        display_run("display-videos", values["videos"]),
        display_run("display-post", values["post"]),
        display_run("display-job", values["job"]),
    ]
    latest_text = display_run("display-text", values["text"], run_id="run-display-any-old")

    def handler(route):
        request = route.request
        path = request.url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": [state["workflow"]]})
            return
        if path == "/api/canvas/workflows/workflow-display-any":
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
            fulfill({
                "runs": [run],
                "latestSuccessfulNodeRuns": [{
                    "runId": "run-display-any-old",
                    "workflowRevision": 1,
                    "runCreatedAt": NOW,
                    "nodeVersion": 1,
                    "nodeConfig": {},
                    "nodeRun": latest_text,
                }],
            })
            return
        if path == "/api/canvas/runs/run-display-any":
            fulfill({"run": run, "nodeRuns": node_runs})
            return
        fulfill({})

    page.route("**/api/**", handler)


def assert_no_overflow(page, label):
    sizes = page.evaluate("() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })")
    assert sizes["scroll"] <= sizes["width"], f"{label} horizontal overflow: {sizes}"
    return sizes


def drag_handle_to_pane(page, handle, offset_x=260, offset_y=120):
    pane = page.locator("[data-testid=canvas-stage] .react-flow__pane")
    handle_box = handle.bounding_box()
    pane_box = pane.bounding_box()
    assert handle_box and pane_box, "missing connection drag geometry"
    start_x = handle_box["x"] + handle_box["width"] / 2
    start_y = handle_box["y"] + handle_box["height"] / 2
    end_x = min(pane_box["x"] + pane_box["width"] - 90, start_x + offset_x)
    end_y = min(pane_box["y"] + pane_box["height"] - 90, start_y + offset_y)
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(end_x, end_y, steps=12)
    page.mouse.up()
    page.locator(".canvas-quick-add").wait_for()


def verify_desktop(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.locator("[data-testid=canvas-stage] .react-flow__pane").wait_for()
    assert page.get_by_text("展示任何", exact=True).count() >= 7, "palette and all display nodes must use the confirmed name"

    text_node = page.locator('.react-flow__node[data-id="display-text"]')
    images_node = page.locator('.react-flow__node[data-id="display-images"]')
    videos_node = page.locator('.react-flow__node[data-id="display-videos"]')
    post_node = page.locator('.react-flow__node[data-id="display-post"]')
    job_node = page.locator('.react-flow__node[data-id="display-job"]')
    text_node.wait_for()
    assert "上游本次失败" in text_node.inner_text()
    assert "最近成功结果" in text_node.inner_text()
    assert "历史版本 r1" in text_node.inner_text()
    assert "历史完整文本" in text_node.inner_text()
    text_node.get_by_role("button", name="查看完整文本").click()
    assert page.get_by_role("dialog", name="完整文本").locator("pre").inner_text() == "历史完整文本"
    page.get_by_role("button", name="关闭文本预览").click()

    assert images_node.locator(".canvas-node-result-gallery img").count() == 1
    images_node.get_by_role("button", name="预览生成图片 1").click()
    page.get_by_role("dialog", name="图片 1").wait_for()
    page.get_by_role("button", name="关闭图片预览").click()
    assert videos_node.locator("video").count() == 1
    assert videos_node.get_by_role("button", name="预览").count() == 1
    assert "待评审标题" in post_node.inner_text() and post_node.get_by_role("link", name="打开评审").count() == 1
    assert "feishu-job-42" in job_node.inner_text() and "queued" in job_node.inner_text()

    job_node.evaluate("element => element.dispatchEvent(new MouseEvent('click', { bubbles: true }))")
    inspector = page.locator(".canvas-inspector-active")
    assert "任意 · 任意 · 必填" in inspector.inner_text()
    assert "输出\n无" in inspector.inner_text()

    overflow = assert_no_overflow(page, "desktop")
    page.screenshot(path=str(screenshot_dir / "fluxpost-display-any-desktop.png"), full_page=True)

    source_handle = page.locator('.react-flow__node[data-id="source-text"] .react-flow__handle.source')
    drag_handle_to_pane(page, source_handle)
    page.locator(".canvas-quick-add input").fill("展示任何")
    assert page.locator(".canvas-quick-add-group button").count() == 1
    page.locator(".canvas-quick-add-group button").click()
    page.wait_for_function("() => document.querySelectorAll('.react-flow__edge').length === 8")
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
    for node_id in ["display-text", "display-images", "display-videos", "display-post", "display-job"]:
        node = page.locator(f'.react-flow__node[data-id="{node_id}"]')
        node.wait_for()
        box = node.bounding_box()
        result_box = node.locator(".canvas-node-result").bounding_box()
        assert box and result_box
        assert result_box["x"] >= box["x"] - 1 and result_box["x"] + result_box["width"] <= box["x"] + box["width"] + 1
    page.keyboard.press("Tab")
    assert page.locator(".canvas-quick-add").count() == 0, "mobile must keep structural quick-add disabled"
    overflow = assert_no_overflow(page, "mobile")
    page.screenshot(path=str(screenshot_dir / "fluxpost-display-any-mobile.png"), full_page=True)
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
