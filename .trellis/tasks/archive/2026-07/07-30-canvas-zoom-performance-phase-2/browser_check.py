import base64
import json

from playwright.sync_api import sync_playwright


NOW = "2026-07-30T00:00:00.000Z"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")


def canvas_graph():
    nodes = []
    for index in range(80):
        nodes.append({
            "id": f"image-{index}",
            "type": "input.images",
            "version": 1,
            "position": {"x": (index % 10) * 280, "y": (index // 10) * 250},
            "config": {"urls": [f"http://canvas-performance.test/{index}-{image_index}.png" for image_index in range(2)]},
        })
    return {"viewport": {"x": 0, "y": 0, "zoom": 1}, "nodes": nodes, "edges": []}


def workflow():
    return {
        "id": "phase2-performance",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "Phase 2 performance",
        "revision": 1,
        "graph": canvas_graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def install_mock_api(page):
    current_workflow = workflow()

    def handler(route):
        request = route.request
        if request.url.startswith("http://canvas-performance.test/"):
            route.fulfill(status=200, content_type="image/png", body=PNG)
            return
        path = request.url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")
        if path == "/api/canvas/workflows":
            payload = {"workflows": [current_workflow]}
        elif path == "/api/canvas/workflows/phase2-performance":
            payload = {"workflow": current_workflow}
        elif path == "/api/canvas/runs":
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        else:
            payload = {}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

    page.route("**/api/**", handler)
    page.route("http://canvas-performance.test/**", handler)


def node_visibility(page, node_id="image-44"):
    return page.locator(f'.react-flow__node[data-id="{node_id}"] .canvas-node-image-grid').evaluate(
        "element => getComputedStyle(element).visibility"
    )


def zoom_until(page, detail, delta):
    stage = page.locator(".canvas-stage")
    box = stage.bounding_box()
    assert box, "canvas stage geometry is missing"
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    for _ in range(30):
        if stage.get_attribute("data-canvas-viewport-detail") == detail:
            page.wait_for_function("() => !document.querySelector('.canvas-stage').classList.contains('canvas-stage-viewport-moving')")
            return
        page.mouse.wheel(0, delta)
        page.wait_for_timeout(45)
    raise AssertionError(f"viewport did not reach {detail}: {stage.get_attribute('data-canvas-viewport-detail')}")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        install_mock_api(page)
        page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
        page.locator(".react-flow__node").first.wait_for(timeout=60_000)
        page.locator(".react-flow__controls-fitview").click()
        page.wait_for_function("() => document.querySelectorAll('.react-flow__node').length === 80")

        stage = page.locator(".canvas-stage")
        assert stage.get_attribute("data-canvas-viewport-detail") == "overview"
        assert node_visibility(page) == "hidden"
        first_node = page.locator('.react-flow__node[data-id="image-44"]')
        geometry_before = first_node.evaluate("element => ({ width: element.offsetWidth, height: element.offsetHeight })")
        first_node.click(force=True)
        page.wait_for_function("() => document.querySelector('[data-id=\"image-44\"] .canvas-node')?.classList.contains('canvas-node-selected')")
        assert node_visibility(page) == "visible", "selected overview nodes must retain detail while stationary"
        geometry_selected = first_node.evaluate("element => ({ width: element.offsetWidth, height: element.offsetHeight })")
        assert geometry_selected == geometry_before, (geometry_before, geometry_selected)

        page.locator('.react-flow__node[data-id="image-45"]').click(force=True)
        page.wait_for_function("() => !document.querySelector('[data-id=\"image-44\"] .canvas-node')?.classList.contains('canvas-node-selected')")
        zoom_until(page, "reduced", -180)
        assert node_visibility(page) == "hidden"
        zoom_until(page, "full", -180)
        assert node_visibility(page) == "visible"

        same_tier_mutations = page.evaluate(
            """
            () => {
              const stage = document.querySelector('.canvas-stage');
              window.__phase2TierMutations = 0;
              new MutationObserver((records) => { window.__phase2TierMutations += records.length; })
                .observe(stage, { attributes: true, attributeFilter: ['data-canvas-viewport-detail'] });
              return stage.dataset.canvasViewportDetail;
            }
            """
        )
        assert same_tier_mutations == "full"
        box = stage.bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.wheel(0, 20)
        page.wait_for_timeout(250)
        assert stage.get_attribute("data-canvas-viewport-detail") == "full"
        assert page.evaluate("window.__phase2TierMutations") == 0, "same-tier moves must not rewrite the detail dataset"

        movement_snapshot = page.evaluate(
            """
            () => {
              const stage = document.querySelector('.canvas-stage');
              const node = document.querySelector('[data-id="image-44"]');
              const rich = node.querySelector('.canvas-node-image-grid');
              const minimap = document.querySelector('.react-flow__minimap');
              const shell = node.querySelector('.canvas-node');
              const before = { width: node.offsetWidth, height: node.offsetHeight };
              stage.classList.add('canvas-stage-viewport-moving');
              const moving = {
                width: node.offsetWidth,
                height: node.offsetHeight,
                richVisibility: getComputedStyle(rich).visibility,
                minimapVisibility: getComputedStyle(minimap).visibility,
                boxShadow: getComputedStyle(shell).boxShadow,
              };
              stage.classList.remove('canvas-stage-viewport-moving');
              return { before, moving, restoredRichVisibility: getComputedStyle(rich).visibility };
            }
            """
        )
        assert movement_snapshot["moving"]["richVisibility"] == "hidden", movement_snapshot
        assert movement_snapshot["moving"]["minimapVisibility"] == "hidden", movement_snapshot
        assert movement_snapshot["moving"]["boxShadow"] == "none", movement_snapshot
        assert movement_snapshot["moving"]["width"] == movement_snapshot["before"]["width"], movement_snapshot
        assert movement_snapshot["moving"]["height"] == movement_snapshot["before"]["height"], movement_snapshot
        assert movement_snapshot["restoredRichVisibility"] == "visible", movement_snapshot
        assert page.locator(".react-flow__minimap-node").count() == 80
        assert not errors, errors

        print(json.dumps({
            "renderedNodes": page.locator(".react-flow__node").count(),
            "minimapNodes": page.locator(".react-flow__minimap-node").count(),
            "detail": stage.get_attribute("data-canvas-viewport-detail"),
            "sameTierMutations": page.evaluate("window.__phase2TierMutations"),
            "movement": movement_snapshot,
        }, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
