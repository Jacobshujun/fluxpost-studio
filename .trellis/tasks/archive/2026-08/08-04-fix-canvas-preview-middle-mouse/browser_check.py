import base64
import json

from playwright.sync_api import sync_playwright


NOW = "2026-08-04T00:00:00.000Z"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)
IMAGE_URL = "http://canvas-preview.test/source.png"


def workflow():
    return {
        "id": "canvas-preview-wheel",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "Canvas preview wheel regression",
        "revision": 1,
        "graph": {
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "nodes": [
                {
                    "id": "images",
                    "type": "input.images",
                    "version": 1,
                    "position": {"x": 120, "y": 100},
                    "config": {"urls": [IMAGE_URL]},
                }
            ],
            "edges": [],
        },
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def install_mock_api(page):
    current_workflow = workflow()

    def handler(route):
        request = route.request
        if request.url.startswith("http://canvas-preview.test/"):
            route.fulfill(status=200, content_type="image/png", body=PNG)
            return

        path = request.url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")
        if path == "/api/canvas/workflows":
            payload = {"workflows": [current_workflow]}
        elif path == "/api/canvas/workflows/canvas-preview-wheel":
            payload = {"workflow": current_workflow}
        elif path == "/api/canvas/runs":
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        else:
            payload = {}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

    page.route("**/api/**", handler)
    page.route("http://canvas-preview.test/**", handler)


def viewport_zoom(page):
    return page.evaluate(
        """
        () => {
          const viewport = document.querySelector('.react-flow__viewport');
          return new DOMMatrix(getComputedStyle(viewport).transform).a;
        }
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
        preview_button = page.locator('[data-id="images"] .canvas-node-image-grid button').first
        preview_button.wait_for(timeout=60_000)
        preview_button.click()

        stage = page.locator(".canvas-image-viewer-stage")
        stage.wait_for()
        zoom_buttons = page.locator(".canvas-image-viewer > footer button")
        for _ in range(4):
            zoom_buttons.nth(1).click()
        page.locator(".canvas-image-viewer > footer output").filter(has_text="200%").wait_for()

        before = stage.evaluate(
            """
            element => {
              element.scrollLeft = 50;
              element.scrollTop = 50;
              return {
                left: element.scrollLeft,
                top: element.scrollTop,
                width: element.scrollWidth,
                height: element.scrollHeight,
              };
            }
            """
        )
        assert before["left"] > 0 and before["top"] > 0, before

        box = stage.bounding_box()
        assert box, "Preview stage geometry is missing"
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.wheel(0, 120)
        page.locator(".canvas-image-viewer > footer output").filter(has_text="175%").wait_for()
        page.wait_for_timeout(200)
        after = stage.evaluate(
            "element => ({ left: element.scrollLeft, top: element.scrollTop, width: element.scrollWidth, height: element.scrollHeight })"
        )
        assert after["left"] == before["left"] and after["top"] == before["top"], {
            "before": before,
            "after": after,
            "zoom": "175%",
        }

        middle_before = stage.evaluate("element => ({ left: element.scrollLeft, top: element.scrollTop })")
        page.mouse.down(button="middle")
        page.mouse.move(box["x"] + box["width"] / 2 + 160, box["y"] + box["height"] / 2 + 160, steps=8)
        page.wait_for_timeout(200)
        page.mouse.up(button="middle")
        middle_after = stage.evaluate("element => ({ left: element.scrollLeft, top: element.scrollTop })")
        assert middle_after == middle_before, {
            "before": middle_before,
            "after": middle_after,
            "zoom": page.locator(".canvas-image-viewer > footer output").text_content(),
        }

        page.locator(".canvas-image-viewer > header button").click()
        page.locator(".canvas-image-viewer").wait_for(state="detached")
        canvas_zoom_before = viewport_zoom(page)
        canvas_stage = page.locator(".canvas-stage")
        canvas_box = canvas_stage.bounding_box()
        assert canvas_box, "Canvas stage geometry is missing"
        page.mouse.move(canvas_box["x"] + canvas_box["width"] * 0.85, canvas_box["y"] + canvas_box["height"] * 0.85)
        page.mouse.wheel(0, 120)
        page.wait_for_function(
            "previous => new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a < previous",
            arg=canvas_zoom_before,
        )
        canvas_zoom_after = viewport_zoom(page)

        assert not errors, errors
        print(
            json.dumps(
                {
                    "previewScrollBefore": before,
                    "previewScrollAfter": after,
                    "previewZoom": "175%",
                    "canvasZoom": {"before": canvas_zoom_before, "after": canvas_zoom_after},
                },
                indent=2,
            )
        )
        browser.close()


if __name__ == "__main__":
    main()
