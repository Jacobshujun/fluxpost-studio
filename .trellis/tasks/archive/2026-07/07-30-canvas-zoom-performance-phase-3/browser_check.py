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
            {
                "id": f"image-{index}",
                "type": "input.images",
                "version": 1,
                "position": {"x": (index % 10) * 280, "y": (index // 10) * 250},
                "config": {
                    "urls": [
                        f"http://canvas-phase3.test/{index}-{image_index}.png"
                        for image_index in range(2)
                    ]
                },
            }
            for index in range(80)
        ],
        "edges": [],
    }


def workflow():
    return {
        "id": "phase3-performance",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "Phase 3 performance",
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
        if request.url.startswith("http://canvas-phase3.test/"):
            image_requests.append(request.url)
            route.fulfill(status=200, content_type="image/png", body=PNG)
            return
        path = request.url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")
        if path == "/api/canvas/workflows":
            payload = {"workflows": [current_workflow]}
        elif path == "/api/canvas/workflows/phase3-performance":
            payload = {"workflow": current_workflow}
        elif path == "/api/canvas/runs":
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        else:
            payload = {}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

    page.route("**/api/**", handler)
    page.route("http://canvas-phase3.test/**", handler)


def viewport_layer_evidence(cdp, layers):
    remote = cdp.send(
        "Runtime.evaluate",
        {
            "expression": "document.querySelector('.react-flow__viewport')",
            "returnByValue": False,
        },
    )["result"]
    backend_node_id = cdp.send(
        "DOM.describeNode", {"objectId": remote["objectId"]}
    )["node"]["backendNodeId"]
    matching_layers = [
        layer for layer in layers if layer.get("backendNodeId") == backend_node_id
    ]
    reasons = [
        cdp.send("LayerTree.compositingReasons", {"layerId": layer["layerId"]})
        for layer in matching_layers
    ]
    return matching_layers, reasons


def assert_nonblank_stage(page):
    stage_png = page.locator(".canvas-stage").screenshot()
    image = PillowImage.open(io.BytesIO(stage_png)).convert("RGB").resize((64, 64))
    colors = image.getcolors(maxcolors=64 * 64)
    assert colors and len(colors) > 8, "Canvas screenshot is blank or visually empty"
    return len(colors)


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        errors = []
        image_requests = []
        layers = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        install_mock_api(page, image_requests)

        cdp = page.context.new_cdp_session(page)
        cdp.send("LayerTree.enable")

        def remember_layers(event):
            layers.clear()
            layers.extend(event.get("layers", []))

        cdp.on("LayerTree.layerTreeDidChange", remember_layers)
        page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
        page.locator(".react-flow__node").first.wait_for(timeout=60_000)
        page.locator(".react-flow__controls-fitview").click()
        page.wait_for_function(
            "() => document.querySelectorAll('.react-flow__node').length === 80"
        )
        page.wait_for_timeout(300)

        before = page.evaluate(
            """
            () => {
              const viewport = document.querySelector('.react-flow__viewport');
              const node = document.querySelector('[data-id="image-44"]');
              const image = node.querySelector('img');
              const handle = node.querySelector('.react-flow__handle');
              window.__phase3 = {
                image,
                wheelEvents: 0,
                viewportMutations: 0,
                frames: [],
                longTasks: [],
              };
              document.querySelector('.react-flow').addEventListener(
                'wheel',
                () => { window.__phase3.wheelEvents += 1; },
                { capture: true },
              );
              new MutationObserver((records) => {
                window.__phase3.viewportMutations += records.length;
              }).observe(viewport, { attributes: true, attributeFilter: ['style'] });
              try {
                new PerformanceObserver((list) => {
                  window.__phase3.longTasks.push(...list.getEntries().map((entry) => entry.duration));
                }).observe({ entryTypes: ['longtask'] });
              } catch {}
              let previous = performance.now();
              function sampleFrame(now) {
                window.__phase3.frames.push(now - previous);
                previous = now;
                if (window.__phase3.frames.length < 180) requestAnimationFrame(sampleFrame);
              }
              requestAnimationFrame(sampleFrame);
              return {
                detail: document.querySelector('.canvas-stage').dataset.canvasViewportDetail,
                nodeWidth: node.offsetWidth,
                nodeHeight: node.offsetHeight,
                handleLeft: handle.offsetLeft,
                handleTop: handle.offsetTop,
                mediaCount: document.querySelectorAll('.react-flow__node img, .react-flow__node video').length,
                willChange: getComputedStyle(viewport).willChange,
              };
            }
            """
        )
        requests_before_zoom = len(image_requests)
        assert before["detail"] == "overview", before
        assert before["willChange"] == "transform", before
        assert requests_before_zoom == 160, requests_before_zoom

        stage = page.locator(".canvas-stage")
        box = stage.bounding_box()
        assert box, "Canvas stage geometry is missing"
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        for _ in range(40):
            page.mouse.wheel(0, -12)
        page.wait_for_function(
            "() => !document.querySelector('.canvas-stage').classList.contains('canvas-stage-viewport-moving')"
        )
        page.wait_for_timeout(300)

        after = page.evaluate(
            """
            () => {
              const sample = window.__phase3;
              const node = document.querySelector('[data-id="image-44"]');
              const handle = node.querySelector('.react-flow__handle');
              const frames = sample.frames.slice().sort((left, right) => left - right);
              const percentile = (value) => frames[Math.min(frames.length - 1, Math.floor(frames.length * value))] || 0;
              return {
                detail: document.querySelector('.canvas-stage').dataset.canvasViewportDetail,
                nodeWidth: node.offsetWidth,
                nodeHeight: node.offsetHeight,
                handleLeft: handle.offsetLeft,
                handleTop: handle.offsetTop,
                sameMediaIdentity: sample.image === node.querySelector('img'),
                wheelEvents: sample.wheelEvents,
                viewportMutations: sample.viewportMutations,
                frameSamples: frames.length,
                frameP95: percentile(0.95),
                frameMax: frames.at(-1) || 0,
                longTasks: sample.longTasks,
                controlsPresent: Boolean(document.querySelector('.react-flow__controls')),
                minimapPresent: Boolean(document.querySelector('.react-flow__minimap')),
              };
            }
            """
        )

        matching_layers, layer_reasons = viewport_layer_evidence(cdp, layers)
        flattened_reasons = [
            reason
            for evidence in layer_reasons
            for reason in evidence.get("compositingReasons", [])
        ]
        assert len(matching_layers) == 1, matching_layers
        assert "Has a will-change: transform compositing hint." in flattened_reasons, flattened_reasons
        assert after["detail"] in {"reduced", "full"}, after
        assert after["wheelEvents"] == 40, after
        assert 0 < after["viewportMutations"] <= after["wheelEvents"], after
        assert after["frameSamples"] >= 20, after
        assert after["frameP95"] < 100, after
        assert after["frameMax"] < 250, after
        assert not [duration for duration in after["longTasks"] if duration >= 200], after
        assert after["sameMediaIdentity"], after
        assert len(image_requests) == requests_before_zoom, image_requests
        for key in ["nodeWidth", "nodeHeight", "handleLeft", "handleTop"]:
            assert after[key] == before[key], (key, before, after)
        assert after["controlsPresent"] and after["minimapPresent"], after
        color_count = assert_nonblank_stage(page)
        assert not errors, errors

        print(
            json.dumps(
                {
                    "renderedNodesBefore": 80,
                    "detailBefore": before["detail"],
                    "detailAfter": after["detail"],
                    "wheelEvents": after["wheelEvents"],
                    "viewportMutations": after["viewportMutations"],
                    "frameP95": after["frameP95"],
                    "frameMax": after["frameMax"],
                    "longTasks": after["longTasks"],
                    "viewportLayers": len(matching_layers),
                    "compositingReasons": flattened_reasons,
                    "sameMediaIdentity": after["sameMediaIdentity"],
                    "mediaRequests": len(image_requests),
                    "stageColorCount": color_count,
                },
                indent=2,
            )
        )
        browser.close()


if __name__ == "__main__":
    main()
