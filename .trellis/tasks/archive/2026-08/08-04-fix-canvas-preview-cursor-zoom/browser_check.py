import importlib.util
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


PREVIOUS_CHECK = (
    Path(__file__).parents[1]
    / "archive"
    / "2026-08"
    / "08-04-fix-canvas-preview-middle-mouse"
    / "browser_check.py"
)
spec = importlib.util.spec_from_file_location("canvas_preview_middle_mouse_check", PREVIOUS_CHECK)
assert spec and spec.loader
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
BASE_URL = os.environ.get("FLUXPOST_BASE_URL", "http://127.0.0.1:3001")


def install_mock_api(page):
    current_workflow = previous.workflow()

    def handler(route):
        request = route.request
        if request.url.startswith("http://canvas-preview.test/"):
            route.fulfill(status=200, content_type="image/png", body=previous.PNG)
            return

        path = request.url.split("?", 1)[0].removeprefix(BASE_URL)
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


def stage_snapshot(stage, local_x, local_y):
    return stage.evaluate(
        """
        (element, point) => ({
          left: element.scrollLeft,
          top: element.scrollTop,
          width: element.scrollWidth,
          height: element.scrollHeight,
          anchorX: (element.scrollLeft + point.x) / element.scrollWidth,
          anchorY: (element.scrollTop + point.y) / element.scrollHeight,
        })
        """,
        {"x": local_x, "y": local_y},
    )


def assert_anchor(before, after, tolerance=0.002):
    assert abs(before["anchorX"] - after["anchorX"]) <= tolerance, {
        "axis": "x",
        "before": before,
        "after": after,
    }
    assert abs(before["anchorY"] - after["anchorY"]) <= tolerance, {
        "axis": "y",
        "before": before,
        "after": after,
    }


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        install_mock_api(page)

        page.goto(f"{BASE_URL}/canvas", wait_until="domcontentloaded")
        preview_button = page.locator('[data-id="images"] .canvas-node-image-grid button').first
        preview_button.wait_for(timeout=60_000)
        preview_button.click()

        stage = page.locator(".canvas-image-viewer-stage")
        stage.wait_for()
        zoom_buttons = page.locator(".canvas-image-viewer > footer button")
        for _ in range(4):
            zoom_buttons.nth(1).click()
        page.locator(".canvas-image-viewer > footer output").filter(has_text="200%").wait_for()

        box = stage.bounding_box()
        assert box, "Preview stage geometry is missing"
        local_x = box["width"] * 0.72
        local_y = box["height"] * 0.36
        cursor_x = box["x"] + local_x
        cursor_y = box["y"] + local_y
        stage.evaluate(
            """
            element => {
              element.scrollLeft = element.scrollWidth * 0.15;
              element.scrollTop = element.scrollHeight * 0.2;
            }
            """
        )

        page.mouse.move(cursor_x, cursor_y)
        before_zoom_in = stage_snapshot(stage, local_x, local_y)
        page.mouse.wheel(0, -120)
        page.locator(".canvas-image-viewer > footer output").filter(has_text="225%").wait_for()
        after_zoom_in = stage_snapshot(stage, local_x, local_y)
        assert_anchor(before_zoom_in, after_zoom_in)

        page.mouse.wheel(0, 120)
        page.locator(".canvas-image-viewer > footer output").filter(has_text="200%").wait_for()
        after_zoom_out = stage_snapshot(stage, local_x, local_y)
        assert_anchor(after_zoom_in, after_zoom_out)

        stage.evaluate(
            """
            (element, point) => {
              element.dispatchEvent(new WheelEvent("wheel", {
                bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, deltaY: -120,
              }));
              element.dispatchEvent(new WheelEvent("wheel", {
                bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, deltaY: -120,
              }));
            }
            """,
            {"x": cursor_x, "y": cursor_y},
        )
        page.locator(".canvas-image-viewer > footer output").filter(has_text="250%").wait_for()
        after_continuous_zoom = stage_snapshot(stage, local_x, local_y)
        assert_anchor(after_zoom_out, after_continuous_zoom)

        for _ in range(6):
            page.mouse.wheel(0, -120)
        page.locator(".canvas-image-viewer > footer output").filter(has_text="400%").wait_for()
        at_maximum = stage_snapshot(stage, local_x, local_y)
        page.mouse.wheel(0, -120)
        page.wait_for_timeout(100)
        beyond_maximum = stage_snapshot(stage, local_x, local_y)
        assert beyond_maximum == at_maximum, {
            "atMaximum": at_maximum,
            "beyondMaximum": beyond_maximum,
        }

        middle_before = stage.evaluate("element => ({ left: element.scrollLeft, top: element.scrollTop })")
        page.mouse.down(button="middle")
        page.mouse.move(cursor_x + 120, cursor_y + 120, steps=6)
        page.wait_for_timeout(100)
        page.mouse.up(button="middle")
        middle_after = stage.evaluate("element => ({ left: element.scrollLeft, top: element.scrollTop })")
        assert middle_after == middle_before, {"before": middle_before, "after": middle_after}

        page.mouse.move(cursor_x, cursor_y)
        drag_before = stage.evaluate("element => ({ left: element.scrollLeft, top: element.scrollTop })")
        page.mouse.down(button="left")
        page.mouse.move(cursor_x - 50, cursor_y - 40, steps=4)
        page.mouse.up(button="left")
        drag_after = stage.evaluate("element => ({ left: element.scrollLeft, top: element.scrollTop })")
        assert drag_after["left"] > drag_before["left"] and drag_after["top"] > drag_before["top"], {
            "before": drag_before,
            "after": drag_after,
        }

        for _ in range(14):
            page.mouse.wheel(0, 120)
        page.locator(".canvas-image-viewer > footer output").filter(has_text="50%").wait_for()
        at_minimum = stage.evaluate("element => ({ left: element.scrollLeft, top: element.scrollTop })")
        assert at_minimum == {"left": 0, "top": 0}, at_minimum
        page.mouse.wheel(0, 120)
        page.wait_for_timeout(100)
        beyond_minimum = stage.evaluate("element => ({ left: element.scrollLeft, top: element.scrollTop })")
        assert beyond_minimum == at_minimum, {
            "atMinimum": at_minimum,
            "beyondMinimum": beyond_minimum,
        }

        page.locator(".canvas-image-viewer > header button").click()
        page.locator(".canvas-image-viewer").wait_for(state="detached")
        canvas_zoom_before = previous.viewport_zoom(page)
        canvas_box = page.locator(".canvas-stage").bounding_box()
        assert canvas_box, "Canvas stage geometry is missing"
        page.mouse.move(canvas_box["x"] + canvas_box["width"] * 0.85, canvas_box["y"] + canvas_box["height"] * 0.85)
        page.mouse.wheel(0, 120)
        page.wait_for_function(
            "previousZoom => new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a < previousZoom",
            arg=canvas_zoom_before,
        )

        assert not errors, errors
        print(
            json.dumps(
                {
                    "zoomIn": {"before": before_zoom_in, "after": after_zoom_in},
                    "zoomOut": after_zoom_out,
                    "continuousZoom": after_continuous_zoom,
                    "maximum": at_maximum,
                    "minimum": at_minimum,
                    "middle": middle_before,
                    "drag": {"before": drag_before, "after": drag_after},
                },
                indent=2,
            )
        )
        browser.close()


if __name__ == "__main__":
    main()
