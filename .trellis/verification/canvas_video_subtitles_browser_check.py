import json
import os
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:3001")
NOW = "2026-08-20T00:00:00.000Z"
STYLE = {
    "fontFamily": "Microsoft YaHei",
    "fontSizePercent": 5,
    "bold": True,
    "textColor": "#FFFFFF",
    "outlineColor": "#000000",
    "outlineWidthPercent": 0.25,
    "backgroundEnabled": False,
    "backgroundColor": "#000000",
    "backgroundOpacity": 70,
    "verticalPosition": "bottom",
    "horizontalAlign": "center",
    "verticalMarginPercent": 6,
    "maxCharsPerLine": 16,
}


def workflow(video_url="/mock-video.mp4", snapshot_width=1920, snapshot_height=1080):
    video = {
        "id": "sha256:portrait",
        "filename": "portrait.mp4",
        "url": video_url,
        "mimeType": "video/mp4",
        "bytes": 4096,
        "durationSeconds": 1,
        "width": snapshot_width,
        "height": snapshot_height,
        "hasAudio": True,
        "uploadedAt": NOW,
    }
    graph = {
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": [
            {"id": "video-1", "type": "input.video-loader", "version": 1, "position": {"x": 60, "y": 100}, "config": {"videos": [video], "selectedVideoId": video["id"]}},
            {"id": "subtitle-1", "type": "utility.video-subtitles", "version": 1, "position": {"x": 390, "y": 100}, "config": STYLE},
        ],
        "edges": [{"id": "edge-1", "source": "video-1", "sourcePort": "videos", "target": "subtitle-1", "targetPort": "videos"}],
    }
    return {"id": "workflow-subtitle-preview", "ownerUserId": "user-1", "ownerDisplayName": "Tester", "name": "字幕预览", "revision": 1, "graph": graph, "isTemplate": False, "createdAt": NOW, "updatedAt": NOW}


def create_video(directory, name, width, height):
    output = directory / f"{name}.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"color=c=blue:s={width}x{height}:d=1",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
        "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(output),
    ], check=True)
    return output.read_bytes()


def install_routes(page, video_bytes, video_url, snapshot_width, snapshot_height):
    data = workflow(video_url, snapshot_width, snapshot_height)

    def handler(route):
        request = route.request
        path = request.url.split("?", 1)[0]
        if path.endswith("/api/canvas/workflows"):
            payload = {"workflows": [data]}
        elif path.endswith("/api/canvas/runs"):
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        elif path.endswith("/api/canvas/subtitle-presets"):
            payload = {"presets": [], "fonts": ["Microsoft YaHei"], "recommendedFont": "Microsoft YaHei", "currentAccountId": "user-1"}
        else:
            payload = {}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

    page.route("**/api/**", handler)
    if video_bytes is not None:
        page.route(f"**{video_url}", lambda route: route.fulfill(status=200, content_type="video/mp4", body=video_bytes))
    else:
        page.route(f"**{video_url}", lambda route: route.fulfill(status=404, content_type="text/plain", body="missing"))


def verify(browser, video_bytes, viewport, label, video_url, snapshot_width, snapshot_height, expected_width, expected_height):
    page = browser.new_page(viewport=viewport)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_routes(page, video_bytes, video_url, snapshot_width, snapshot_height)
    page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    page.locator('[data-testid="canvas-stage"] .react-flow__pane').wait_for(timeout=30_000)
    page.locator('.react-flow__node[data-id="subtitle-1"] .canvas-node-head').click(force=True)
    inspector = page.locator(".canvas-inspector-active")
    inspector.wait_for()
    preview = inspector.locator(".canvas-subtitle-preview")
    inspector.get_by_text(f"{expected_width}×{expected_height}", exact=True).wait_for(timeout=10_000)
    expected_ratio = expected_width / expected_height
    assert preview.locator("video").get_attribute("src") == video_url
    sizes = page.evaluate("() => ({scroll: document.documentElement.scrollWidth, width: innerWidth})")
    assert sizes["scroll"] <= sizes["width"], f"{label} overflow: {sizes}"
    page.wait_for_function("""() => {
        const inspector = document.querySelector('.canvas-inspector-active');
        if (!inspector) return false;
        const box = inspector.getBoundingClientRect();
        return box.x >= 0 && box.right <= innerWidth + 0.5;
    }""", timeout=10_000)
    box = preview.bounding_box()
    assert box and abs((box["width"] / box["height"]) - expected_ratio) < 0.03, box
    inspector_box = inspector.bounding_box()
    assert inspector_box and inspector_box["x"] >= 0 and inspector_box["x"] + inspector_box["width"] <= viewport["width"] + 0.5, {"inspector": inspector_box, "viewport": viewport, "label": label}
    assert not errors, errors
    page.close()
    return {"preview": box, "viewport": viewport}


def verify_missing_video(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    install_routes(page, None, "/missing-video.mp4", 1280, 720)
    page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    page.locator('.react-flow__node[data-id="subtitle-1"] .canvas-node-head').click(force=True)
    page.locator(".canvas-subtitle-preview-empty").wait_for(timeout=10_000)
    assert page.locator(".canvas-subtitle-preview-empty").inner_text().strip()
    page.close()


def main():
    with tempfile.TemporaryDirectory(prefix="fluxpost-subtitle-browser-") as directory:
        portrait_bytes = create_video(Path(directory), "portrait", 48, 64)
        landscape_bytes = create_video(Path(directory), "landscape", 64, 48)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            desktop = {
                "portrait": verify(browser, portrait_bytes, {"width": 1440, "height": 960}, "desktop portrait", "/portrait.mp4", 1920, 1080, 48, 64),
                "landscape": verify(browser, landscape_bytes, {"width": 1440, "height": 960}, "desktop landscape", "/landscape.mp4", 1080, 1920, 64, 48),
            }
            mobile = {
                "portrait": verify(browser, portrait_bytes, {"width": 390, "height": 844}, "mobile portrait", "/portrait.mp4", 1920, 1080, 48, 64),
                "landscape": verify(browser, landscape_bytes, {"width": 390, "height": 844}, "mobile landscape", "/landscape.mp4", 1080, 1920, 64, 48),
            }
            verify_missing_video(browser)
            browser.close()
    print(json.dumps({"desktop": desktop, "mobile": mobile}, ensure_ascii=False))


if __name__ == "__main__":
    main()
