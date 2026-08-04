import importlib.util
import json
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


def scroll_position(stage):
    return stage.evaluate("element => ({ left: element.scrollLeft, top: element.scrollTop })")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        previous.install_mock_api(page)

        page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
        preview_button = page.locator('[data-id="images"] .canvas-node-image-grid button').first
        preview_button.wait_for(timeout=60_000)
        preview_button.click()

        stage = page.locator(".canvas-image-viewer-stage")
        stage.wait_for()
        box = stage.bounding_box()
        assert box, "Preview stage geometry is missing"
        center = {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}

        page.mouse.move(center["x"], center["y"])
        page.mouse.down(button="left")
        page.mouse.move(center["x"] - 80, center["y"] - 60)
        page.mouse.up(button="left")
        assert scroll_position(stage) == {"left": 0, "top": 0}
        assert "is-pannable" not in (stage.get_attribute("class") or "")

        zoom_buttons = page.locator(".canvas-image-viewer > footer button")
        for _ in range(4):
            zoom_buttons.nth(1).click()
        page.locator(".canvas-image-viewer > footer output").filter(has_text="200%").wait_for()
        assert "is-pannable" in (stage.get_attribute("class") or "")
        stage.evaluate("element => { element.scrollLeft = 100; element.scrollTop = 100; }")

        page.mouse.move(center["x"], center["y"])
        page.mouse.down(button="left")
        page.wait_for_function("() => document.querySelector('.canvas-image-viewer-stage').classList.contains('is-panning')")
        page.mouse.move(center["x"] - 70, center["y"] - 50, steps=4)
        inside_drag = scroll_position(stage)
        assert inside_drag["left"] > 100 and inside_drag["top"] > 100, inside_drag

        page.mouse.move(box["x"] - 20, box["y"] - 20, steps=6)
        captured_drag = scroll_position(stage)
        assert captured_drag["left"] > inside_drag["left"] and captured_drag["top"] > inside_drag["top"], {
            "inside": inside_drag,
            "captured": captured_drag,
        }
        page.mouse.up(button="left")
        page.mouse.move(center["x"], center["y"])
        released = scroll_position(stage)
        assert released == captured_drag, {"captured": captured_drag, "released": released}
        assert "is-panning" not in (stage.get_attribute("class") or "")

        before_wheel = scroll_position(stage)
        page.mouse.wheel(0, 120)
        page.locator(".canvas-image-viewer > footer output").filter(has_text="175%").wait_for()
        page.wait_for_timeout(200)
        assert scroll_position(stage) == before_wheel

        before_middle = scroll_position(stage)
        page.mouse.down(button="middle")
        page.mouse.move(center["x"] + 160, center["y"] + 160, steps=8)
        page.wait_for_timeout(200)
        page.mouse.up(button="middle")
        assert scroll_position(stage) == before_middle

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
        print(json.dumps({"insideDrag": inside_drag, "capturedDrag": captured_drag, "released": released}, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
