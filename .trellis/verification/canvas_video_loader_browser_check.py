import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3010"


def snapshot(video_id, filename, mime_type, index):
    extension = ".webm" if mime_type == "video/webm" else ".mp4"
    return {
        "id": video_id,
        "filename": filename,
        "url": f"/generated/canvas-video-uploads/{video_id.split(':')[-1]}{extension}",
        "mimeType": mime_type,
        "bytes": 1024 * (index + 1),
        "durationSeconds": 4 + index,
        "width": 720 if index % 2 == 0 else 1280,
        "height": 1280 if index % 2 == 0 else 720,
        "hasAudio": index % 2 == 0,
        "uploadedAt": f"2026-08-20T00:00:0{index}.000Z",
    }


INITIAL_VIDEOS = [
    snapshot("sha256:first", "first.mp4", "video/mp4", 0),
    snapshot("sha256:second", "second.webm", "video/webm", 1),
]


def workflow():
    return {
        "id": "workflow-video-loader",
        "name": "Video loader browser fixture",
        "revision": 1,
        "ownerUserId": "browser-owner",
        "ownerDisplayName": "Browser owner",
        "createdAt": "2026-08-20T00:00:00.000Z",
        "updatedAt": "2026-08-20T00:00:00.000Z",
        "graph": {
            "nodes": [{
                "id": "video-loader",
                "type": "input.video-loader",
                "version": 1,
                "position": {"x": 80, "y": 80},
                "config": {"videos": INITIAL_VIDEOS, "selectedVideoId": INITIAL_VIDEOS[0]["id"]},
            }],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        },
    }


def install_routes(page):
    upload_attempts = {}

    def route_handler(route):
        request = route.request
        url = request.url
        if "/api/canvas/video-uploads" in url:
            filename = url.split("filename=", 1)[-1].replace("%20", " ")
            upload_attempts[filename] = upload_attempts.get(filename, 0) + 1
            if filename == "retry.mp4" and upload_attempts[filename] == 1:
                route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": "fixture upload failed"}))
                return
            mime_type = "video/webm" if filename.endswith(".webm") else "video/mp4"
            route.fulfill(status=201, content_type="application/json", body=json.dumps({"video": snapshot(f"sha256:{filename}", filename, mime_type, 2)}))
            return
        if url.endswith("/api/canvas/workflows") and request.method == "GET":
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"workflows": [workflow()]}))
            return
        if "/api/canvas/runs" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"runs": [], "latestSuccessfulNodeRuns": []}))
            return
        if "/api/canvas/schedules" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"schedules": []}))
            return
        if "/api/canvas/" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))
            return
        route.continue_()

    page.route("**/api/canvas/**", route_handler)


def open_inspector(page):
    last_error = None
    for _ in range(8):
        try:
            page.goto(f"{BASE_URL}/canvas", wait_until="domcontentloaded", timeout=30_000)
            last_error = None
            break
        except Exception as error:
            last_error = error
            time.sleep(1)
    if last_error:
        raise last_error
    node = page.locator('.react-flow__node[data-id="video-loader"]')
    node.wait_for()
    node.click()
    page.locator(".canvas-video-loader").wait_for()


def desktop_check(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    install_routes(page)
    open_inspector(page)
    queue = page.locator(".canvas-video-loader-queue article")
    assert queue.count() == 2

    queue.nth(1).locator('input[type="radio"]').check()
    assert "second.webm" in page.locator(".canvas-video-loader-summary strong").inner_text()
    queue.nth(1).locator("button").nth(0).click()
    page.locator(".canvas-video-viewer").wait_for()
    page.locator(".canvas-video-viewer > header > button").click()

    queue.nth(1).locator("button").nth(1).click()
    assert page.locator(".canvas-video-loader-queue article strong").first.inner_text() == "second.webm"
    page.locator(".canvas-video-loader-queue article").nth(1).locator("button").nth(3).click()
    assert page.locator(".canvas-video-loader-queue article").count() == 1

    upload = page.locator('.canvas-video-loader input[type="file"]')
    upload.set_input_files({"name": "retry.mp4", "mimeType": "video/mp4", "buffer": b"fixture"})
    page.locator(".canvas-video-upload.is-failed").wait_for()
    assert "fixture upload failed" in page.locator(".canvas-video-upload.is-failed").inner_text()
    page.locator(".canvas-video-upload.is-failed button").first.click()
    page.locator(".canvas-video-upload").wait_for(state="detached")
    page.locator(".canvas-video-loader-queue").get_by_text("retry.mp4", exact=True).wait_for()

    data_transfer = page.evaluate_handle("""() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['fixture'], 'dropped.webm', { type: 'video/webm' }));
      return transfer;
    }""")
    target = page.locator('[data-testid="canvas-stage"]')
    target.dispatch_event("dragover", {"dataTransfer": data_transfer})
    target.dispatch_event("drop", {"dataTransfer": data_transfer})
    page.get_by_text("dropped.webm", exact=True).wait_for()
    page.close()


def mobile_check(browser):
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
    install_routes(page)
    open_inspector(page)
    loader = page.locator(".canvas-video-loader")
    assert loader.locator('input[type="file"]').count() == 1
    overflow = loader.evaluate("element => ({ scroll: element.scrollWidth, client: element.clientWidth })")
    assert overflow["scroll"] <= overflow["client"] + 1, overflow
    inspector_overflow = page.locator(".canvas-inspector").evaluate("element => ({ scroll: element.scrollWidth, client: element.clientWidth })")
    assert inspector_overflow["scroll"] <= inspector_overflow["client"] + 1, inspector_overflow
    page.close()


with sync_playwright() as playwright:
    chromium = playwright.chromium.launch(headless=True)
    desktop_check(chromium)
    mobile_check(chromium)
    chromium.close()

print("Canvas video loader browser checks passed.")
