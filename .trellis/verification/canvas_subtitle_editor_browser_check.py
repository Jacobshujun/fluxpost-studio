import json
import os
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:3001")
NOW = "2026-08-21T00:00:00.000Z"
SHA = "a" * 64
SEGMENTS = [
    {"startMs": 200, "endMs": 900, "text": "第一段字幕"},
    {"startMs": 1100, "endMs": 1800, "text": "Second caption"},
]
STYLE = {
    "fontFamily": "Microsoft YaHei", "fontSizePercent": 5, "bold": True,
    "textColor": "#FFFFFF", "outlineColor": "#000000", "outlineWidthPercent": 0.25,
    "backgroundEnabled": True, "backgroundColor": "#000000", "backgroundOpacity": 65,
    "verticalPosition": "bottom", "horizontalAlign": "center", "verticalMarginPercent": 6,
    "maxCharsPerLine": 16,
}


def create_video(directory):
    output = directory / "subtitle-editor.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=2",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
        "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(output),
    ], check=True)
    return output.read_bytes()


def fixtures():
    video = {"url": "/subtitle-editor.mp4", "name": "subtitle-editor.mp4", "mimeType": "video/mp4", "width": 320, "height": 180, "durationSeconds": 2}
    graph = {
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": [
            {"id": "video-1", "type": "input.videos", "version": 1, "position": {"x": 60, "y": 100}, "config": {"urls": [video["url"]]}},
            {"id": "subtitle-1", "type": "utility.video-subtitles", "version": 1, "position": {"x": 380, "y": 100}, "config": STYLE},
        ],
        "edges": [{"id": "edge-1", "source": "video-1", "sourcePort": "videos", "target": "subtitle-1", "targetPort": "videos"}],
    }
    workflow = {"id": "workflow-subtitle-editor", "ownerUserId": "user-1", "ownerDisplayName": "Tester", "name": "字幕校对", "revision": 1, "graph": graph, "isTemplate": False, "createdAt": NOW, "updatedAt": NOW}
    run = {"id": "run-subtitle-editor", "workflowId": workflow["id"], "workflowRevision": 1, "ownerUserId": "user-1", "ownerDisplayName": "Tester", "status": "completed", "graphSnapshot": graph, "confirmation": {"confirmedAt": NOW, "nodeIds": [], "capabilities": []}, "createdAt": NOW, "updatedAt": NOW, "completedAt": NOW}
    node_run = {
        "id": "node-run-subtitle-editor", "runId": run["id"], "nodeId": "subtitle-1", "nodeType": "utility.video-subtitles", "attempt": 1, "status": "completed",
        "inputs": {"videos": [{"kind": "videos", "items": [video]}]},
        "outputs": {"videos": {"kind": "videos", "items": [video]}, "text": {"kind": "text", "value": "第一段字幕\nSecond caption"}},
        "internalMetadata": {"subtitle": {"protocolVersion": 1, "timelineProtocolVersion": 4, "videoSha256": SHA, "durationMs": 2000, "source": video, "segments": SEGMENTS}},
        "createdAt": NOW, "updatedAt": NOW, "completedAt": NOW,
    }
    revision = {
        "id": "revision-subtitle-editor", "ownerUserId": "user-1", "ownerDisplayName": "Tester", "workflowId": workflow["id"], "nodeId": "subtitle-1",
        "videoSha256": SHA, "durationMs": 2000, "timelineProtocolVersion": 4, "revision": 1, "source": video,
        "originalSegments": SEGMENTS, "segments": SEGMENTS, "createdAt": NOW, "updatedAt": NOW,
    }
    return workflow, run, node_run, revision


def install_routes(page, video_bytes):
    workflow, run, node_run, revision = fixtures()

    def handler(route):
        request = route.request
        path = request.url.split("?", 1)[0]
        if path.endswith("/api/canvas/workflows"):
            payload = {"workflows": [workflow]}
        elif path.endswith(f"/api/canvas/runs/{run['id']}"):
            payload = {"run": run, "nodeRuns": [node_run]}
        elif path.endswith("/api/canvas/runs"):
            payload = {"runs": [run], "latestSuccessfulNodeRuns": [{"runId": run["id"], "workflowRevision": 1, "runCreatedAt": NOW, "nodeVersion": 1, "nodeConfig": STYLE, "nodeRun": node_run}]}
        elif path.endswith("/api/canvas/subtitle-presets"):
            payload = {"presets": [], "fonts": ["Microsoft YaHei"], "recommendedFont": "Microsoft YaHei", "currentAccountId": "user-1"}
        elif path.endswith("/api/canvas/subtitle-revisions"):
            payload = {"revision": revision}
        elif path.endswith("/waveform"):
            peaks = [[-0.35 if index % 3 else -0.8, 0.4 if index % 2 else 0.75] for index in range(100)]
            payload = {"durationMs": 2000, "pointsPerSecond": 50, "peaks": peaks}
        elif "/api/canvas/subtitle-revisions/" in path and request.method == "PATCH":
            body = request.post_data_json
            payload = {"revision": {**revision, "revision": revision["revision"] + 1, "segments": body["segments"], "updatedAt": NOW}}
        else:
            payload = {"schedules": []}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

    page.route("**/api/**", handler)
    page.route("**/subtitle-editor.mp4", lambda route: route.fulfill(status=200, content_type="video/mp4", body=video_bytes))


def open_editor(page):
    page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="subtitle-1"]')
    node.wait_for(timeout=30_000)
    node.locator(".canvas-subtitle-edit-entry").click()
    dialog = page.locator(".canvas-subtitle-dialog")
    dialog.wait_for(timeout=15_000)
    page.locator(".canvas-subtitle-blocks button").first.wait_for(timeout=15_000)
    return dialog


def assert_waveform_pixels(page):
    pixels = page.locator("canvas[aria-label='音频波形']").evaluate("""canvas => {
      const context = canvas.getContext('2d');
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0) colored++;
      return { colored, width: canvas.width, height: canvas.height };
    }""")
    assert pixels["colored"] > 100, pixels
    assert pixels["width"] > 100 and pixels["height"] > 50, pixels


def desktop_check(browser, video_bytes):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_routes(page, video_bytes)
    dialog = open_editor(page)
    assert dialog.locator("video").get_attribute("src") == "/subtitle-editor.mp4"
    assert_waveform_pixels(page)
    dialog.locator("video").evaluate("""video => {
      video.currentTime = 0.3;
      video.dispatchEvent(new Event('timeupdate'));
    }""")
    page.locator(".canvas-subtitle-blocks button").first.wait_for()
    assert "is-active" in (page.locator(".canvas-subtitle-blocks button").first.get_attribute("class") or "")
    assert "第一段字幕" in page.locator(".canvas-subtitle-live-overlay span").inner_text()
    first = page.locator(".canvas-subtitle-blocks button").first
    before = first.bounding_box()
    first.hover()
    page.mouse.down()
    page.mouse.move(before["x"] + 30, before["y"] + 4)
    page.mouse.up()
    after = first.bounding_box()
    assert after["x"] > before["x"] + 10, {"before": before, "after": after}
    page.locator("textarea[aria-label='字幕文字']").fill("人工修正后的字幕")
    page.locator(".canvas-subtitle-dialog-actions").get_by_text("保存草稿", exact=True).click()
    page.get_by_text("字幕草稿已保存。", exact=True).wait_for()
    overlay = page.locator(".canvas-subtitle-live-overlay span")
    page.locator(".canvas-subtitle-blocks button").first.click()
    assert "人工修正后的字幕" in overlay.inner_text()

    page.locator("textarea[aria-label='字幕文字']").fill("未保存修改")
    page.once("dialog", lambda prompt: prompt.dismiss())
    page.locator('button[aria-label="关闭字幕编辑器"]').click()
    assert dialog.is_visible(), "dismissed dirty-close confirmation must keep the editor open"
    page.once("dialog", lambda prompt: prompt.accept())
    page.locator('button[aria-label="关闭字幕编辑器"]').click()
    dialog.wait_for(state="detached")
    assert not errors, errors
    page.close()


def mobile_check(browser, video_bytes):
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
    install_routes(page, video_bytes)
    dialog = open_editor(page)
    assert_waveform_pixels(page)
    sizes = page.evaluate("() => ({document: document.documentElement.scrollWidth, viewport: innerWidth})")
    assert sizes["document"] <= sizes["viewport"] + 1, sizes
    dialog_box = dialog.bounding_box()
    assert dialog_box and dialog_box["width"] <= 390.5 and dialog_box["height"] <= 844.5, dialog_box
    timeline = page.locator(".canvas-subtitle-timeline-scroll")
    timeline_sizes = timeline.evaluate("element => ({scroll: element.scrollWidth, client: element.clientWidth})")
    assert timeline_sizes["scroll"] >= timeline_sizes["client"], timeline_sizes
    page.close()


def main():
    with tempfile.TemporaryDirectory(prefix="fluxpost-subtitle-editor-browser-") as directory:
        video_bytes = create_video(Path(directory))
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            desktop_check(browser, video_bytes)
            mobile_check(browser, video_bytes)
            browser.close()
    print("Canvas subtitle editor browser checks passed.")


if __name__ == "__main__":
    main()
