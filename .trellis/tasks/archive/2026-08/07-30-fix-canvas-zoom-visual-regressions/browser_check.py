import base64
import io
import json

from PIL import Image as PillowImage
from playwright.sync_api import sync_playwright


NOW = "2026-07-30T00:00:00.000Z"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")


def canvas_graph():
    return {
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": [
            {"id": "images", "type": "input.images", "version": 1, "position": {"x": 80, "y": 70}, "config": {"urls": ["http://canvas-regression.test/source.png"]}},
            {"id": "preview", "type": "utility.image-preview", "version": 1, "position": {"x": 390, "y": 70}, "config": {}},
            {"id": "text", "type": "input.text", "version": 1, "position": {"x": 80, "y": 410}, "config": {"text": "source"}},
            {"id": "model", "type": "model.gpt-text", "version": 1, "position": {"x": 390, "y": 410}, "config": {"instruction": "rewrite"}},
        ],
        "edges": [
            {"id": "image-edge", "source": "images", "sourcePort": "images", "target": "preview", "targetPort": "images"},
            {"id": "text-edge", "source": "text", "sourcePort": "text", "target": "model", "targetPort": "prompt"},
        ],
    }


def workflow():
    return {
        "id": "canvas-visual-regression",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "Canvas visual regression",
        "revision": 1,
        "graph": canvas_graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def install_mock_api(page, image_requests):
    current_workflow = workflow()

    def handler(route):
        request = route.request
        if request.url.startswith("http://canvas-regression.test/"):
            image_requests.append(request.url)
            route.fulfill(status=200, content_type="image/png", body=PNG)
            return
        path = request.url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")
        if path == "/api/canvas/workflows":
            payload = {"workflows": [current_workflow]}
        elif path == "/api/canvas/workflows/canvas-visual-regression":
            payload = {"workflow": current_workflow}
        elif path == "/api/canvas/runs":
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        else:
            payload = {}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

    page.route("**/api/**", handler)
    page.route("http://canvas-regression.test/**", handler)


def assert_nonblank_stage(page):
    stage_png = page.locator(".canvas-stage").screenshot()
    image = PillowImage.open(io.BytesIO(stage_png)).convert("RGB").resize((64, 64))
    colors = image.getcolors(maxcolors=64 * 64)
    assert colors and len(colors) > 8, "Canvas screenshot is blank or visually empty"
    return len(colors)


def viewport_sample(page):
    return page.evaluate(
        """
        () => {
          const viewport = document.querySelector('.react-flow__viewport');
          const matrix = new DOMMatrix(getComputedStyle(viewport).transform);
          return { x: matrix.e, y: matrix.f, zoom: matrix.a };
        }
        """
    )


def wait_for_move_end(page):
    page.wait_for_function("() => !document.querySelector('.canvas-stage').classList.contains('canvas-stage-viewport-moving')")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        errors = []
        image_requests = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        install_mock_api(page, image_requests)

        page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
        page.locator('[data-id="images"] img').wait_for(timeout=60_000)
        page.wait_for_function("() => document.querySelectorAll('.react-flow__edge').length === 2")
        page.wait_for_timeout(250)

        edge_before = page.evaluate(
            """
            () => {
              const edge = document.querySelector('[data-testid="rf__edge-text-edge"]');
              const base = edge.querySelector('.canvas-flow-edge-base');
              const glow = edge.querySelector('.canvas-flow-edge-glow');
              const highlight = edge.querySelector('.canvas-flow-edge-highlight');
              return {
                pathCount: edge.querySelectorAll('path[class*="canvas-flow-edge-"]').length,
                stroke: getComputedStyle(base).stroke,
                glowDisplay: getComputedStyle(glow).display,
                highlightDisplay: getComputedStyle(highlight).display,
              };
            }
            """
        )
        assert edge_before["pathCount"] == 3, edge_before
        assert edge_before["glowDisplay"] == "block" and edge_before["highlightDisplay"] == "block", edge_before

        page.locator('[data-testid="rf__edge-text-edge"]').click(force=True)
        edge_selected = page.evaluate(
            """
            () => {
              const edge = document.querySelector('[data-testid="rf__edge-text-edge"]');
              return {
                selected: edge.classList.contains('selected'),
                stroke: getComputedStyle(edge.querySelector('.canvas-flow-edge-base')).stroke,
              };
            }
            """
        )
        assert edge_selected["selected"], edge_selected
        assert edge_selected["stroke"] == edge_before["stroke"], (edge_before, edge_selected)

        before = page.evaluate(
            """
            () => {
              const viewport = document.querySelector('.react-flow__viewport');
              const node = document.querySelector('[data-id="images"]');
              const image = node.querySelector('img');
              const handle = node.querySelector('.react-flow__handle');
              window.__canvasRegression = { image, samples: [] };
              new MutationObserver(() => {
                const matrix = new DOMMatrix(getComputedStyle(viewport).transform);
                window.__canvasRegression.samples.push({ time: performance.now(), zoom: matrix.a });
              }).observe(viewport, { attributes: true, attributeFilter: ['style'] });
              return {
                nodeWidth: node.offsetWidth,
                nodeHeight: node.offsetHeight,
                handleLeft: handle.offsetLeft,
                handleTop: handle.offsetTop,
                visibility: getComputedStyle(node.querySelector('.canvas-node-image-grid')).visibility,
              };
            }
            """
        )
        requests_before_zoom = len(image_requests)
        assert before["visibility"] == "visible", before

        stage = page.locator(".canvas-stage")
        box = stage.bounding_box()
        assert box, "Canvas stage geometry is missing"
        pointer = {"x": box["x"] + box["width"] * 0.58, "y": box["y"] + box["height"] * 0.46}
        local_pointer = {"x": pointer["x"] - box["x"], "y": pointer["y"] - box["y"]}
        viewport_before = viewport_sample(page)
        flow_anchor_before = {
            "x": (local_pointer["x"] - viewport_before["x"]) / viewport_before["zoom"],
            "y": (local_pointer["y"] - viewport_before["y"]) / viewport_before["zoom"],
        }
        page.mouse.move(pointer["x"], pointer["y"])
        page.mouse.wheel(0, -90)
        page.wait_for_function("() => document.querySelector('.canvas-stage').classList.contains('canvas-stage-viewport-moving')")
        during = page.evaluate(
            """
            () => {
              const edge = document.querySelector('[data-testid="rf__edge-text-edge"]');
              const node = document.querySelector('[data-id="images"]');
              return {
                imageVisibility: getComputedStyle(node.querySelector('.canvas-node-image-grid')).visibility,
                imageDisplay: getComputedStyle(node.querySelector('img')).display,
                glowDisplay: getComputedStyle(edge.querySelector('.canvas-flow-edge-glow')).display,
              };
            }
            """
        )
        assert during["imageVisibility"] == "visible" and during["imageDisplay"] != "none", during
        assert during["glowDisplay"] == "none", during
        wait_for_move_end(page)
        page.wait_for_timeout(80)

        viewport_after = viewport_sample(page)
        flow_anchor_after = {
            "x": (local_pointer["x"] - viewport_after["x"]) / viewport_after["zoom"],
            "y": (local_pointer["y"] - viewport_after["y"]) / viewport_after["zoom"],
        }
        wheel_result = page.evaluate(
            """
            () => {
              const sample = window.__canvasRegression;
              const node = document.querySelector('[data-id="images"]');
              const handle = node.querySelector('.react-flow__handle');
              const samples = sample.samples;
              return {
                mutationSamples: samples.length,
                duration: samples.length > 1 ? samples.at(-1).time - samples[0].time : 0,
                sameMediaIdentity: sample.image === node.querySelector('img'),
                visibility: getComputedStyle(node.querySelector('.canvas-node-image-grid')).visibility,
                nodeWidth: node.offsetWidth,
                nodeHeight: node.offsetHeight,
                handleLeft: handle.offsetLeft,
                handleTop: handle.offsetTop,
              };
            }
            """
        )
        assert wheel_result["mutationSamples"] >= 1, wheel_result
        assert wheel_result["sameMediaIdentity"] and wheel_result["visibility"] == "visible", wheel_result
        assert len(image_requests) == requests_before_zoom, image_requests
        assert abs(flow_anchor_after["x"] - flow_anchor_before["x"]) < 0.75, (flow_anchor_before, flow_anchor_after)
        assert abs(flow_anchor_after["y"] - flow_anchor_before["y"]) < 0.75, (flow_anchor_before, flow_anchor_after)
        for key in ["nodeWidth", "nodeHeight", "handleLeft", "handleTop"]:
            assert wheel_result[key] == before[key], (key, before, wheel_result)

        page.evaluate(
            """
            () => {
              window.__continuousWheel = [];
              document.querySelector('.canvas-stage').addEventListener('wheel', (event) => {
                window.__continuousWheel.push({ deltaY: event.deltaY, deltaMode: event.deltaMode, time: performance.now() });
              }, { capture: true });
            }
            """
        )
        continuous_start = viewport_sample(page)
        for _ in range(20):
            page.mouse.wheel(0, -12)
        wait_for_move_end(page)
        continuous_end = viewport_sample(page)
        continuous_events = page.evaluate("window.__continuousWheel")
        continuous_exponent = sum(-event["deltaY"] * (0.05 if event["deltaMode"] == 1 else 1 if event["deltaMode"] else 0.002) for event in continuous_events)
        expected_continuous_zoom = min(2, continuous_start["zoom"] * 2 ** continuous_exponent)
        assert abs(continuous_end["zoom"] - expected_continuous_zoom) < 0.02, {
            "start": continuous_start,
            "end": continuous_end,
            "expectedZoom": expected_continuous_zoom,
            "events": continuous_events,
        }

        page.evaluate("window.__canvasRegression.samples = []")
        control_before = viewport_sample(page)
        page.locator(".react-flow__controls-zoomout").click()
        page.wait_for_timeout(100)
        control_after = viewport_sample(page)
        control_result = page.evaluate(
            """
            () => {
              const samples = window.__canvasRegression.samples;
              return {
                mutationSamples: samples.length,
                duration: samples.length > 1 ? samples.at(-1).time - samples[0].time : 0,
              };
            }
            """
        )
        assert control_result["mutationSamples"] >= 1, control_result
        assert control_after["zoom"] < control_before["zoom"], (control_before, control_after)

        page.emulate_media(reduced_motion="reduce")
        reduced_edge = page.evaluate(
            """
            () => {
              const edge = document.querySelector('[data-testid="rf__edge-text-edge"]');
              return [
                getComputedStyle(edge.querySelector('.canvas-flow-edge-glow')).display,
                getComputedStyle(edge.querySelector('.canvas-flow-edge-highlight')).display,
              ];
            }
            """
        )
        assert reduced_edge == ["none", "none"], reduced_edge
        assert page.locator(".react-flow__minimap").count() == 1
        assert page.locator(".react-flow__controls").count() == 1
        color_count = assert_nonblank_stage(page)
        assert not errors, errors

        print(json.dumps({
            "edgeStroke": edge_before["stroke"],
            "selectedStroke": edge_selected["stroke"],
            "wheelMutations": wheel_result["mutationSamples"],
            "controlMutations": control_result["mutationSamples"],
            "controlZoom": {"before": control_before["zoom"], "after": control_after["zoom"]},
            "sameMediaIdentity": wheel_result["sameMediaIdentity"],
            "mediaRequests": len(image_requests),
            "continuousZoom": {"actual": continuous_end["zoom"], "expected": expected_continuous_zoom, "events": len(continuous_events)},
            "anchorDelta": {"x": flow_anchor_after["x"] - flow_anchor_before["x"], "y": flow_anchor_after["y"] - flow_anchor_before["y"]},
            "stageColorCount": color_count,
        }, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
