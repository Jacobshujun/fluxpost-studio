import json
import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


NOW = "2026-08-20T02:00:00.000Z"
BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:3001")
DEFAULT_STYLE = {
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


def preset(preset_id, name, style, built_in=False, revision=1):
    return {
        "id": preset_id,
        "ownerUserId": "builtin" if built_in else "user-1",
        "ownerDisplayName": "系统" if built_in else "Tester",
        "name": name,
        "normalizedName": name.casefold(),
        "revision": revision,
        "style": style,
        "builtIn": built_in,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def graph():
    return {
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": [
            {
                "id": "video-1",
                "type": "input.videos",
                "version": 1,
                "position": {"x": 60, "y": 130},
                "config": {"urls": ["/mock-source.mp4"]},
            },
            {
                "id": "subtitle-1",
                "type": "utility.video-subtitles",
                "version": 1,
                "position": {"x": 390, "y": 100},
                "config": dict(DEFAULT_STYLE),
            },
        ],
        "edges": [
            {
                "id": "edge-video-subtitle",
                "source": "video-1",
                "sourcePort": "videos",
                "target": "subtitle-1",
                "targetPort": "videos",
            }
        ],
    }


def workflow():
    return {
        "id": "workflow-subtitles",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "视频字幕测试",
        "revision": 1,
        "graph": graph(),
        "isTemplate": False,
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def run_record():
    return {
        "id": "run-subtitles",
        "workflowId": "workflow-subtitles",
        "workflowRevision": 1,
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "status": "completed",
        "graphSnapshot": graph(),
        "confirmation": {"confirmedAt": NOW, "nodeIds": ["subtitle-1"], "capabilities": ["text_model"]},
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
        "completedAt": NOW,
    }


def node_run():
    return {
        "id": "node-run-subtitles",
        "runId": "run-subtitles",
        "nodeId": "subtitle-1",
        "nodeType": "utility.video-subtitles",
        "attempt": 1,
        "status": "completed",
        "inputs": {},
        "outputs": {
            "videos": {"kind": "videos", "items": [{"url": "/mock-subtitled.mp4", "mimeType": "video/mp4", "width": 1080, "height": 1920}]},
            "text": {"kind": "text", "value": "第一句字幕\nSecond subtitle"},
        },
        "createdAt": NOW,
        "updatedAt": NOW,
        "startedAt": NOW,
        "completedAt": NOW,
    }


def install_mock_api(page):
    built_ins = [
        preset("builtin-white-outline", "白字黑边", dict(DEFAULT_STYLE), True),
        preset("builtin-bottom-box", "底部黑底", {**DEFAULT_STYLE, "backgroundEnabled": True, "outlineWidthPercent": 0}, True),
        preset("builtin-center-emphasis", "居中强调", {**DEFAULT_STYLE, "verticalPosition": "middle", "fontSizePercent": 7, "textColor": "#FFE66D"}, True),
    ]
    personal = [preset("preset-personal", "我的样式", {**DEFAULT_STYLE, "fontSizePercent": 8, "horizontalAlign": "left"})]
    state = {"workflow": workflow(), "personal": personal, "posts": 0, "patches": 0, "deletes": 0}
    run = run_record()

    def handler(route):
        request = route.request
        path = request.url.split("?", 1)[0].split("/api", 1)[-1]
        path = "/api" + path

        def fulfill(payload, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

        if path == "/api/canvas/workflows":
            fulfill({"workflows": [state["workflow"]]})
            return
        if path == "/api/canvas/workflows/workflow-subtitles":
            if request.method == "PATCH":
                body = request.post_data_json
                state["workflow"] = {
                    **state["workflow"],
                    "graph": body.get("graph", state["workflow"]["graph"]),
                    "revision": state["workflow"]["revision"] + 1,
                }
            fulfill({"workflow": state["workflow"]})
            return
        if path == "/api/canvas/runs":
            fulfill({"runs": [run], "latestSuccessfulNodeRuns": []})
            return
        if path == "/api/canvas/runs/run-subtitles":
            fulfill({"run": run, "nodeRuns": [node_run()]})
            return
        if path == "/api/canvas/subtitle-presets":
            if request.method == "GET":
                fulfill({
                    "presets": built_ins + state["personal"],
                    "fonts": ["Microsoft YaHei", "Arial"],
                    "recommendedFont": "Microsoft YaHei",
                    "currentAccountId": "user-1",
                })
                return
            body = request.post_data_json
            created = preset("preset-created", body["name"], body["style"])
            state["personal"].append(created)
            state["posts"] += 1
            fulfill({"preset": created}, 201)
            return
        if path.startswith("/api/canvas/subtitle-presets/"):
            preset_id = path.rsplit("/", 1)[-1]
            current = next(item for item in state["personal"] if item["id"] == preset_id)
            if request.method == "PATCH":
                body = request.post_data_json
                updated = {**current, "name": body["name"], "normalizedName": body["name"].casefold(), "style": body["style"], "revision": current["revision"] + 1}
                state["personal"] = [updated if item["id"] == preset_id else item for item in state["personal"]]
                state["patches"] += 1
                fulfill({"preset": updated})
                return
            state["personal"] = [item for item in state["personal"] if item["id"] != preset_id]
            state["deletes"] += 1
            fulfill({"ok": True})
            return
        fulfill({})

    page.route("**/api/**", handler)
    page.route("**/mock-*.mp4", lambda route: route.fulfill(status=204, body=""))
    return state


def assert_no_overflow(page, label):
    sizes = page.evaluate("() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })")
    assert sizes["scroll"] <= sizes["width"], f"{label} horizontal overflow: {sizes}"
    return sizes


def wait_for_canvas(page, label):
    try:
        page.locator("[data-testid=canvas-stage] .react-flow__pane").wait_for(timeout=30_000)
    except Exception:
        print(json.dumps({"label": label, "url": page.url, "title": page.title(), "body": page.locator("body").inner_text()[:2000]}, ensure_ascii=False))
        page.screenshot(path=str(Path(tempfile.gettempdir()) / f"fluxpost-video-subtitles-{label}-failure.png"), full_page=True)
        raise


def open_inspector(page):
    node = page.locator('.react-flow__node[data-id="subtitle-1"]')
    node.wait_for()
    node.locator(".canvas-node-head").click(force=True)
    inspector = page.locator(".canvas-inspector-active")
    inspector.wait_for()
    inspector.locator(".canvas-subtitle-preview").wait_for()
    return node, inspector


def verify_desktop(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    console_errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    state = install_mock_api(page)
    page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    wait_for_canvas(page, "desktop")
    node, inspector = open_inspector(page)

    assert "第一句字幕" in node.inner_text()
    preview = inspector.locator(".canvas-subtitle-preview")
    assert "中英混排 FluxPost" in preview.inner_text()
    inspector.get_by_label("加载字幕预设").select_option("builtin-center-emphasis")
    assert inspector.locator(".canvas-subtitle-range", has_text="字号").locator("small").inner_text() == "7%"

    inspector.locator(".canvas-subtitle-segments", has_text="垂直位置").get_by_role("button", name="顶部").click()
    inspector.locator(".canvas-subtitle-segments", has_text="水平对齐").get_by_role("button", name="左", exact=True).click()
    computed = preview.evaluate("element => ({ align: getComputedStyle(element).alignItems, justify: getComputedStyle(element).justifyContent })")
    assert computed == {"align": "flex-start", "justify": "flex-start"}, computed

    inspector.get_by_placeholder("预设名称").fill("新预设")
    inspector.get_by_role("button", name="保存", exact=True).click()
    page.get_by_text("已保存“新预设”", exact=True).wait_for()
    assert state["posts"] == 1

    page.once("dialog", lambda dialog: dialog.accept())
    inspector.get_by_role("button", name="保存", exact=True).click()
    page.get_by_text("已保存“新预设”", exact=True).wait_for()
    page.wait_for_timeout(100)
    assert state["patches"] == 1

    page.once("dialog", lambda dialog: dialog.accept())
    inspector.get_by_role("button", name="删除字幕预设").click()
    page.get_by_text("已删除“新预设”", exact=True).wait_for()
    assert state["deletes"] == 1

    overflow = assert_no_overflow(page, "desktop")
    page.screenshot(path=str(screenshot_dir / "fluxpost-video-subtitles-desktop.png"), full_page=True)
    assert not errors, f"desktop page errors: {errors}"
    assert not console_errors, f"desktop console errors: {console_errors}"
    page.close()
    return overflow


def verify_mobile(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    console_errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    install_mock_api(page)
    page.goto(f"{BASE_URL}/canvas", wait_until="networkidle")
    wait_for_canvas(page, "mobile")
    _, inspector = open_inspector(page)
    page.wait_for_function("() => document.querySelector('.canvas-inspector-active')?.getBoundingClientRect().right <= innerWidth + 0.5")
    box = inspector.bounding_box()
    assert box and box["x"] >= 0 and box["x"] + box["width"] <= 390.5, box
    assert inspector.locator(".canvas-subtitle-preview").bounding_box()["width"] <= box["width"]
    overflow = assert_no_overflow(page, "mobile")
    page.screenshot(path=str(screenshot_dir / "fluxpost-video-subtitles-mobile.png"), full_page=True)
    assert not errors, f"mobile page errors: {errors}"
    assert not console_errors, f"mobile console errors: {console_errors}"
    page.close()
    return overflow


def main():
    screenshot_dir = Path(tempfile.gettempdir())
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        desktop = verify_desktop(browser, screenshot_dir)
        mobile = verify_mobile(browser, screenshot_dir)
        browser.close()
    print(json.dumps({"desktop": desktop, "mobile": mobile, "screenshots": str(screenshot_dir)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
