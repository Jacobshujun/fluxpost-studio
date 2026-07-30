import json

from playwright.sync_api import sync_playwright


NOW = "2026-07-30T00:00:00.000Z"


def canvas_graph():
    nodes = [
        {"id": "off-left-source", "type": "input.text", "version": 1, "position": {"x": 0, "y": 0}, "config": {"text": "offscreen"}},
        {"id": "off-left-target", "type": "model.gpt-text", "version": 1, "position": {"x": 280, "y": 0}, "config": {"instruction": "offscreen"}},
        {"id": "idle-source", "type": "input.text", "version": 1, "position": {"x": 2800, "y": 60}, "config": {"text": "idle"}},
        {"id": "idle-target", "type": "model.gpt-text", "version": 1, "position": {"x": 3080, "y": 60}, "config": {"instruction": "idle"}},
        {"id": "active-source", "type": "input.text", "version": 1, "position": {"x": 2800, "y": 420}, "config": {"text": "active"}},
        {"id": "active-target", "type": "model.gpt-text", "version": 1, "position": {"x": 3080, "y": 420}, "config": {"instruction": "active"}},
        {"id": "off-right", "type": "input.text", "version": 1, "position": {"x": 6200, "y": 0}, "config": {"text": "offscreen"}},
    ]
    edges = [
        {"id": "offscreen-edge", "source": "off-left-source", "sourcePort": "text", "target": "off-left-target", "targetPort": "prompt"},
        {"id": "idle-edge", "source": "idle-source", "sourcePort": "text", "target": "idle-target", "targetPort": "prompt"},
        {"id": "active-edge", "source": "active-source", "sourcePort": "text", "target": "active-target", "targetPort": "prompt"},
    ]
    return {"viewport": {"x": 0, "y": 0, "zoom": 1}, "nodes": nodes, "edges": edges}


def workflow():
    return {
        "id": "perf-workflow",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "Zoom performance",
        "revision": 1,
        "graph": canvas_graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def run_record():
    return {
        "id": "perf-run",
        "workflowId": "perf-workflow",
        "workflowRevision": 1,
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "status": "running",
        "graphSnapshot": canvas_graph(),
        "confirmation": {"confirmedAt": NOW, "nodeIds": [], "capabilities": []},
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
    }


def node_run():
    return {
        "id": "active-target-run",
        "runId": "perf-run",
        "nodeId": "active-target",
        "nodeType": "model.gpt-text",
        "nodeVersion": 1,
        "nodeConfig": {"instruction": "active"},
        "attempt": 1,
        "status": "running",
        "inputs": {},
        "outputs": {},
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
    }


def install_mock_api(page):
    state = {"workflow": workflow()}
    run = run_record()

    def handler(route):
        request = route.request
        path = request.url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")

        def fulfill(payload):
            route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": [state["workflow"]]})
            return
        if path == "/api/canvas/workflows/perf-workflow":
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
        if path == "/api/canvas/runs/perf-run":
            fulfill({"run": run, "nodeRuns": [node_run()]})
            return
        fulfill({})

    page.route("**/api/**", handler)


def edge_snapshot(page):
    return page.locator(".react-flow__edge").evaluate_all(
        """
        (edges) => edges.map((edge) => ({
          testId: edge.getAttribute("data-testid") || "",
          pathCount: edge.querySelectorAll("path").length,
          canvasPathCount: edge.querySelectorAll('path[class*="canvas-flow-edge-"]').length,
          beamDisplays: Array.from(edge.querySelectorAll(".canvas-flow-edge-glow, .canvas-flow-edge-highlight"))
            .map((path) => getComputedStyle(path).display),
        }))
        """
    )


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        install_mock_api(page)
        page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
        page.locator(".react-flow").wait_for()
        page.wait_for_function("() => document.querySelectorAll('.react-flow__node').length > 0")

        rendered_node_ids = page.locator(".react-flow__node").evaluate_all(
            "(nodes) => nodes.map((node) => node.getAttribute('data-id'))"
        )
        assert 0 < len(rendered_node_ids) < 7, f"visible culling did not reduce node DOM: {rendered_node_ids}"
        assert "off-left-source" not in rendered_node_ids and "off-right" not in rendered_node_ids, rendered_node_ids

        edges = edge_snapshot(page)
        idle = next(edge for edge in edges if edge["testId"].endswith("idle-edge"))
        active = next(edge for edge in edges if edge["testId"].endswith("active-edge"))
        assert idle["canvasPathCount"] == 1, f"idle edge rendered beam paths: {idle}"
        assert active["canvasPathCount"] == 3, f"running edge did not render beam paths: {active}"
        assert active["beamDisplays"] == ["block", "block"], active

        page.evaluate(
            """
            () => {
              const stage = document.querySelector(".canvas-stage");
              window.__canvasMovement = [];
              new MutationObserver(() => {
                const moving = stage.classList.contains("canvas-stage-viewport-moving");
                const beam = document.querySelector('[data-testid="rf__edge-active-edge"] .canvas-flow-edge-glow');
                window.__canvasMovement.push({ moving, display: beam ? getComputedStyle(beam).display : "missing" });
              }).observe(stage, { attributes: true, attributeFilter: ["class"] });
            }
            """
        )
        stage = page.locator(".canvas-stage").bounding_box()
        assert stage, "canvas stage geometry is missing"
        page.mouse.move(stage["x"] + stage["width"] / 2, stage["y"] + stage["height"] / 2)
        page.mouse.wheel(0, -120)
        page.wait_for_timeout(300)
        movement = page.evaluate("window.__canvasMovement")
        assert any(item["moving"] and item["display"] == "none" for item in movement), movement
        assert not page.locator(".canvas-stage").evaluate(
            "stage => stage.classList.contains('canvas-stage-viewport-moving')"
        ), movement
        active_after = next(edge for edge in edge_snapshot(page) if edge["testId"].endswith("active-edge"))
        assert active_after["beamDisplays"] == ["block", "block"], active_after
        page.emulate_media(reduced_motion="reduce")
        reduced_motion_edge = next(edge for edge in edge_snapshot(page) if edge["testId"].endswith("active-edge"))
        assert reduced_motion_edge["beamDisplays"] == ["none", "none"], reduced_motion_edge
        assert not errors, f"browser page errors: {errors}"

        print(json.dumps({
            "renderedNodeIds": rendered_node_ids,
            "edges": edges,
            "movement": movement,
            "reducedMotionEdge": reduced_motion_edge,
        }, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
