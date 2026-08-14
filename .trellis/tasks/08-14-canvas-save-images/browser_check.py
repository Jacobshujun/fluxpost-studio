import base64
import json
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


NOW = "2026-08-14T00:00:00.000Z"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")


def graph():
    nodes = [
        {"id": "source", "type": "input.images", "version": 1, "position": {"x": 20, "y": 30}, "config": {"urls": ["/generated/input.png"]}},
        {"id": "save-current", "type": "utility.save-images", "version": 1, "position": {"x": 320, "y": 20}, "config": {"filenamePrefix": "car"}},
        {"id": "save-single", "type": "utility.save-images", "version": 1, "position": {"x": 620, "y": 20}, "config": {"filenamePrefix": "single"}},
        {"id": "save-history", "type": "utility.save-images", "version": 1, "position": {"x": 920, "y": 20}, "config": {"filenamePrefix": "车型图"}},
    ]
    edges = [
        {"id": f"edge-{target}", "source": "source", "sourcePort": "images", "target": target, "targetPort": "images"}
        for target in ["save-current", "save-single", "save-history"]
    ]
    return {"viewport": {"x": 90, "y": 210, "zoom": 0.88}, "nodes": nodes, "edges": edges}


def workflow():
    return {
        "id": "workflow-save-images",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "保存图片浏览器验收",
        "revision": 2,
        "graph": graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def run_record():
    return {
        "id": "run-current",
        "workflowId": "workflow-save-images",
        "workflowRevision": 2,
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


def node_run(node_id, run_id, count=0, status="completed", error=None):
    value = {
        "id": f"node-run-{node_id}-{run_id}",
        "runId": run_id,
        "nodeId": node_id,
        "nodeType": "utility.save-images",
        "attempt": 1,
        "status": status,
        "inputs": {},
        "outputs": {
            "downloads": {
                "kind": "images",
                "items": [{"url": f"/generated/{node_id}-{index}.png"} for index in range(count)],
            }
        } if count else {},
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
        "completedAt": NOW,
    }
    if error:
        value["error"] = error
    return value


def install_mock_api(page, requests):
    current_run = run_record()
    current_node_runs = [
        node_run("save-current", "run-current", count=3),
        node_run("save-single", "run-current", count=1),
        node_run("save-history", "run-current", status="failed", error="当前运行失败"),
    ]
    historical = node_run("save-history", "run-history", count=2, status="reused")
    state = {"workflow": workflow()}

    def handler(route):
        request = route.request
        parsed = urlparse(request.url)
        path = parsed.path

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": [state["workflow"]]})
            return
        if path == "/api/canvas/workflows/workflow-save-images":
            if request.method == "PATCH":
                body = request.post_data_json
                state["workflow"] = {**state["workflow"], "graph": body.get("graph", state["workflow"]["graph"])}
            fulfill({"workflow": state["workflow"]})
            return
        if path == "/api/canvas/runs":
            fulfill({
                "runs": [current_run],
                "latestSuccessfulNodeRuns": [{
                    "runId": "run-history",
                    "workflowRevision": 1,
                    "runCreatedAt": NOW,
                    "nodeVersion": 1,
                    "nodeConfig": {"filenamePrefix": "车型图"},
                    "nodeRun": historical,
                }],
            })
            return
        if path == "/api/canvas/runs/run-current":
            fulfill({"run": current_run, "nodeRuns": current_node_runs})
            return
        if path.endswith("/downloads/images"):
            query = parse_qs(parsed.query)
            node_run_id = query.get("nodeRunId", [""])[0]
            index = int(query.get("index", ["-1"])[0])
            requests.append((node_run_id, index))
            if "save-current" in node_run_id and index == 1:
                fulfill({"error": "simulated image failure"}, status=500)
                return
            if "save-current" in node_run_id:
                filename = f"car_{index + 1:04d}.png"
            elif "save-single" in node_run_id:
                filename = "single_0001.png"
            else:
                filename = f"车型图_{index + 1:04d}.png"
            encoded = filename.encode("utf-8").hex()
            percent_encoded = "".join(f"%{encoded[offset:offset + 2].upper()}" for offset in range(0, len(encoded), 2))
            route.fulfill(
                status=200,
                headers={
                    "Content-Type": "image/png",
                    "Content-Length": str(len(PNG)),
                    "Content-Disposition": f"attachment; filename=\"FluxPost_{index + 1:04d}.png\"; filename*=UTF-8''{percent_encoded}",
                    "X-Content-Type-Options": "nosniff",
                },
                body=PNG,
            )
            return
        fulfill({})

    page.route("**/api/**", handler)


def assert_no_overflow(page, label):
    sizes = page.evaluate("() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })")
    assert sizes["scroll"] <= sizes["width"], f"{label} horizontal overflow: {sizes}"
    return sizes


def assert_no_unexpected_page_errors(errors, label):
    known = [error for error in errors if "Minified React error #418" in error and "args[]=HTML" in error]
    unexpected = [error for error in errors if error not in known]
    assert not unexpected, f"{label} page errors: {unexpected}"
    return known


def verify_desktop(browser, artifact_dir):
    context = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 960})
    page = context.new_page()
    errors = []
    requests = []
    download_events = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def capture_download(download):
        download_events.append(download)

    page.on("download", capture_download)
    install_mock_api(page, requests)
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.locator("[data-testid=canvas-stage] .react-flow__pane").wait_for()
    assert page.get_by_text("保存图片", exact=True).count() >= 4

    current_node = page.locator('.react-flow__node[data-id="save-current"]')
    single_node = page.locator('.react-flow__node[data-id="save-single"]')
    history_node = page.locator('.react-flow__node[data-id="save-history"]')
    for node in [current_node, single_node, history_node]:
        node.wait_for()
        node_box = node.bounding_box()
        result_box = node.locator(".canvas-node-result").bounding_box()
        assert node_box and result_box
        assert result_box["x"] >= node_box["x"] - 1
        assert result_box["x"] + result_box["width"] <= node_box["x"] + node_box["width"] + 1

    current_button = current_node.get_by_role("button", name="下载全部")
    current_button.evaluate("button => { button.click(); button.click(); }")
    current_node.get_by_role("status").wait_for()
    assert current_node.get_by_role("status").inner_text() == "下载成功 2 张，下载失败 1 张"
    assert requests[:3] == [("node-run-save-current-run-current", 0), ("node-run-save-current-run-current", 1), ("node-run-save-current-run-current", 2)]
    assert len([entry for entry in requests if "save-current" in entry[0]]) == 3, "double click must not start a second batch"

    single_node.get_by_role("button", name="下载全部").click()
    single_node.get_by_role("status").wait_for()
    assert single_node.get_by_role("status").inner_text() == "下载成功 1 张，下载失败 0 张"

    assert "最近成功结果" in history_node.inner_text()
    history_node.get_by_role("button", name="下载全部").click()
    history_node.get_by_role("status").wait_for()
    assert history_node.get_by_role("status").inner_text() == "下载成功 2 张，下载失败 0 张"
    page.wait_for_function("() => true")
    downloads = [download.suggested_filename for download in download_events]
    assert downloads == ["car_0001.png", "car_0003.png", "single_0001.png", "车型图_0001.png", "车型图_0002.png"]
    for download in download_events:
        download.save_as(artifact_dir / download.suggested_filename)
    for filename in downloads:
        assert (artifact_dir / filename).is_file(), f"missing browser download: {filename}"

    overflow = assert_no_overflow(page, "desktop")
    page.screenshot(path=str(artifact_dir / "canvas-save-images-desktop.png"), full_page=True)
    known_errors = assert_no_unexpected_page_errors(errors, "desktop")
    context.close()
    return {"overflow": overflow, "requests": requests, "downloads": downloads, "knownPageErrors": known_errors}


def verify_mobile(browser, artifact_dir):
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    errors = []
    requests = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page, requests)
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.locator("[data-testid=canvas-stage] .react-flow__pane").wait_for()
    for node_id in ["save-current", "save-single", "save-history"]:
        node = page.locator(f'.react-flow__node[data-id="{node_id}"]')
        node.wait_for()
        node_box = node.bounding_box()
        result_box = node.locator(".canvas-node-result").bounding_box()
        assert node_box and result_box
        assert result_box["x"] >= node_box["x"] - 1
        assert result_box["x"] + result_box["width"] <= node_box["x"] + node_box["width"] + 1
    overflow = assert_no_overflow(page, "mobile")
    page.screenshot(path=str(artifact_dir / "canvas-save-images-mobile.png"), full_page=True)
    known_errors = assert_no_unexpected_page_errors(errors, "mobile")
    context.close()
    return {"overflow": overflow, "knownPageErrors": known_errors}


def main():
    artifact_dir = Path(tempfile.mkdtemp(prefix="fluxpost-save-images-browser-"))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        desktop = verify_desktop(browser, artifact_dir)
        mobile = verify_mobile(browser, artifact_dir)
        browser.close()
    print(json.dumps({"desktop": desktop, "mobile": mobile, "artifacts": str(artifact_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
