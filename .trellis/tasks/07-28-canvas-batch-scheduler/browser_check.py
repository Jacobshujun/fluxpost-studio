import json
import tempfile
import time
from copy import deepcopy
from pathlib import Path

from playwright.sync_api import sync_playwright


NOW = "2026-07-28T08:00:00.000Z"
PIXEL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="


def graph():
    return {
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": [{"id": "text-1", "type": "input.text", "version": 1, "position": {"x": 100, "y": 100}, "config": {"text": "Scheduler browser check"}}],
        "edges": [],
    }


WORKFLOW = {
    "id": "workflow-scheduler",
    "ownerUserId": "user-1",
    "ownerDisplayName": "Tester",
    "name": "车型图文工作流",
    "revision": 5,
    "graph": graph(),
    "isTemplate": False,
    "createdAt": NOW,
    "updatedAt": NOW,
}


def asset(asset_id, role, name, index):
    return {
        "id": asset_id,
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "role": role,
        "name": name,
        "publicUrl": PIXEL,
        "storageKey": f"mock/{asset_id}.jpg",
        "mimeType": "image/jpeg",
        "size": 1024,
        "width": 1600,
        "height": 1200,
        "collectionId": f"collection-{role}",
        "tags": ["SUV", "棚拍"] if role == "vehicle" else ["城市", "夜景"],
        "createdAt": NOW,
        "updatedAt": NOW,
        "sortOrder": index,
    }


REFERENCE_ASSETS = [asset(f"reference-{index}", "reference", f"城市夜景场景 {index}", index) for index in range(1, 7)]
VEHICLE_ASSETS = [asset(f"vehicle-{index}", "vehicle", f"SUV 车型素材 {index}", index) for index in range(1, 9)]


def empty_filter(mode="manual"):
    return {"mode": mode, "assetIds": [], "search": "", "tags": []}


def batch(batch_id="batch-draft"):
    return {
        "id": batch_id,
        "name": "城市夜景 SUV",
        "strategy": "scene-modification",
        "sceneFilter": empty_filter(),
        "sceneCount": 2,
        "vehicleFilter": empty_filter("random"),
        "vehicleCountMin": 2,
        "vehicleCountMax": 4,
        "status": "draft",
        "contentTasks": [],
        "createdAt": NOW,
        "updatedAt": NOW,
    }


def draft_schedule():
    return {
        "id": "schedule-draft",
        "ownerUserId": "user-1",
        "ownerDisplayName": "Tester",
        "name": "7 月城市夜景批量任务",
        "revision": 1,
        "workflowId": WORKFLOW["id"],
        "workflowRevision": WORKFLOW["revision"],
        "status": "draft",
        "batches": [batch()],
        "totalContentTasks": 0,
        "totalImageTasks": 0,
        "createdAt": NOW,
        "updatedAt": "2026-07-28T08:30:00.000Z",
    }


def runtime_schedule():
    scene = {"id": "reference-1", "url": PIXEL, "name": "城市夜景场景 1"}
    vehicles = [{"id": f"vehicle-{index}", "url": PIXEL, "name": f"SUV 车型素材 {index}"} for index in range(1, 4)]
    image_tasks = [{
        "id": f"image-{index}",
        "vehicle": vehicle,
        "status": "failed" if index == 3 else "completed",
        "runId": f"run-image-{index}",
        "imageUrls": [] if index == 3 else [PIXEL],
        "error": "Mock provider failure" if index == 3 else None,
        "createdAt": NOW,
        "updatedAt": NOW,
    } for index, vehicle in enumerate(vehicles, 1)]
    content = {
        "id": "content-runtime",
        "scene": scene,
        "vehicles": vehicles,
        "imageTasks": image_tasks,
        "status": "partial",
        "finalRunId": "run-final",
        "generatedPostId": "post-review-1",
        "candidateImageUrls": [PIXEL, PIXEL],
        "pendingCandidateSync": True,
        "error": None,
        "createdAt": NOW,
        "updatedAt": NOW,
    }
    runtime_batch = {**batch("batch-runtime"), "name": "已启动批次", "status": "partial", "contentTasks": [content]}
    return {
        **draft_schedule(),
        "id": "schedule-runtime",
        "name": "运行结果与候选图",
        "revision": 7,
        "status": "partial",
        "batches": [runtime_batch],
        "totalContentTasks": 1,
        "totalImageTasks": 3,
        "previewRevision": "preview-runtime",
        "launchedAt": NOW,
        "completedAt": NOW,
        "updatedAt": "2026-07-28T08:20:00.000Z",
    }


def install_mock_api(page):
    state = {"schedules": [draft_schedule(), runtime_schedule()], "save_revisions": [], "first_save": True}

    def fulfill(route, payload, status=200):
        route.fulfill(status=status, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

    def handler(route):
        request = route.request
        url = request.url
        path = url.split("?", 1)[0].replace("http://127.0.0.1:3001", "")
        if path == "/api/canvas/workflows":
            fulfill(route, {"workflows": [WORKFLOW]})
            return
        if path == f"/api/canvas/workflows/{WORKFLOW['id']}":
            fulfill(route, {"workflow": WORKFLOW})
            return
        if path == "/api/canvas/runs":
            fulfill(route, {"runs": [], "latestSuccessfulNodeRuns": []})
            return
        if path == "/api/canvas/schedules" and request.method == "GET":
            fulfill(route, {"schedules": state["schedules"]})
            return
        if path.startswith("/api/library/assets"):
            role = "vehicle" if "role=vehicle" in url else "reference"
            assets = VEHICLE_ASSETS if role == "vehicle" else REFERENCE_ASSETS
            fulfill(route, {
                "assets": assets,
                "collections": [{"id": f"collection-{role}", "name": "主素材集合", "role": role}],
                "total": len(assets),
            })
            return
        if path.startswith("/api/canvas/schedules/"):
            schedule_id = path.rsplit("/", 1)[-1]
            schedule = next(item for item in state["schedules"] if item["id"] == schedule_id)
            if request.method == "GET":
                fulfill(route, {"schedule": schedule})
                return
            if request.method == "PATCH":
                body = request.post_data_json
                action = body.get("action", "save")
                if action == "save":
                    state["save_revisions"].append(body["revision"])
                    if state["first_save"]:
                        state["first_save"] = False
                        time.sleep(1.25)
                    if body["revision"] != schedule["revision"]:
                        fulfill(route, {"error": "revision conflict"}, 409)
                        return
                    schedule.update({
                        "name": body["name"],
                        "batches": body["batches"],
                        "revision": schedule["revision"] + 1,
                        "status": "draft",
                    })
                elif action == "preflight":
                    preview = deepcopy(schedule)
                    preview["revision"] += 1
                    preview["status"] = "ready"
                    preview["previewRevision"] = "preview-browser"
                    preview["totalContentTasks"] = 2
                    preview["totalImageTasks"] = 5
                    tasks = []
                    for index, count in enumerate((2, 3), 1):
                        vehicles = [{"id": item["id"], "url": PIXEL, "name": item["name"]} for item in VEHICLE_ASSETS[:count]]
                        tasks.append({
                            "id": f"content-preview-{index}",
                            "scene": {"id": REFERENCE_ASSETS[index - 1]["id"], "url": PIXEL, "name": REFERENCE_ASSETS[index - 1]["name"]},
                            "vehicles": vehicles,
                            "imageTasks": [],
                            "status": "pending",
                            "candidateImageUrls": [],
                            "createdAt": NOW,
                            "updatedAt": NOW,
                        })
                    preview["batches"][0]["status"] = "ready"
                    preview["batches"][0]["contentTasks"] = tasks
                    schedule.clear()
                    schedule.update(preview)
                elif action == "duplicate":
                    duplicate = {**deepcopy(schedule), "id": "schedule-copy", "name": f"{schedule['name']} 副本", "revision": 1, "status": "draft", "previewRevision": None}
                    state["schedules"].insert(0, duplicate)
                    schedule = duplicate
                fulfill(route, {"schedule": schedule})
                return
        fulfill(route, {})

    page.route("**/api/**", handler)
    return state


def assert_layout(page, label):
    metrics = page.evaluate("""() => {
      const panel = document.querySelector('.canvas-schedule-panel');
      const editor = document.querySelector('.canvas-schedule-editor');
      const panelRect = panel?.getBoundingClientRect();
      const visibleControls = [...document.querySelectorAll('.canvas-schedule-panel button, .canvas-schedule-panel input, .canvas-schedule-panel select')]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        });
      return {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        panel: panelRect && { left: panelRect.left, right: panelRect.right, width: panelRect.width },
        editorClientWidth: editor?.clientWidth,
        editorScrollWidth: editor?.scrollWidth,
        controlsOutside: visibleControls.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        }).length,
        primaryAction: (() => {
          const button = [...document.querySelectorAll('.canvas-schedule-primary-actions button')].at(-1);
          const rect = button?.getBoundingClientRect();
          const style = button && getComputedStyle(button);
          return button && rect && style ? { text: button.innerText, width: rect.width, color: style.color, background: style.backgroundColor, fontSize: style.fontSize } : null;
        })(),
      };
    }""")
    assert metrics["documentWidth"] <= metrics["viewportWidth"], f"{label} document overflow: {metrics}"
    assert metrics["panel"] and metrics["panel"]["left"] >= -1 and metrics["panel"]["right"] <= metrics["viewportWidth"] + 1, f"{label} panel bounds: {metrics}"
    assert metrics["controlsOutside"] == 0, f"{label} controls outside viewport: {metrics}"
    if metrics["primaryAction"]:
        assert metrics["primaryAction"]["text"] == "确认并启动", metrics
        assert metrics["primaryAction"]["color"] != metrics["primaryAction"]["background"], f"{label} primary action has no text contrast: {metrics}"
    return metrics


def open_scheduler(page):
    page.goto("http://127.0.0.1:3001/canvas", wait_until="networkidle")
    page.get_by_test_id("canvas-stage").locator(".react-flow__pane").wait_for()
    page.get_by_role("button", name="批量调度").click()
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    dialog.wait_for()
    dialog.get_by_label("批量任务名称").wait_for()
    return dialog


def verify_desktop(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    state = install_mock_api(page)
    dialog = open_scheduler(page)

    name = dialog.get_by_label("批量任务名称")
    name.fill("第一次连续编辑")
    page.wait_for_timeout(980)
    name.fill("第二次连续编辑")
    page.wait_for_function("() => document.querySelector('.canvas-schedule-toolbar')?.textContent?.includes('已保存')", timeout=7000)
    assert state["save_revisions"] == [1, 2], state["save_revisions"]
    assert state["schedules"][0]["name"] == "第二次连续编辑"

    dialog.get_by_role("button", name="预演抽样").click()
    dialog.get_by_text("抽样预览 · 2 篇").wait_for()
    assert dialog.get_by_role("button", name="确认并启动").is_visible()
    assert dialog.get_by_placeholder("关键字").count() == 2
    assert dialog.get_by_placeholder("多个标签，AND").count() == 2
    assert dialog.locator(".canvas-schedule-preview article").count() == 2
    preview_layout = assert_layout(page, "desktop preview")
    preview_path = screenshot_dir / "fluxpost-canvas-scheduler-desktop.png"
    page.screenshot(path=str(preview_path), full_page=True)

    dialog.locator(".canvas-schedule-list > button", has_text="运行结果与候选图").click()
    dialog.locator(".canvas-schedule-runtime details details > summary").click()
    dialog.get_by_text("接受新增候选图").wait_for()
    assert dialog.get_by_role("button", name="重试").count() == 1
    assert dialog.get_by_text("打开评审草稿").is_visible()
    runtime_layout = assert_layout(page, "desktop runtime")
    runtime_path = screenshot_dir / "fluxpost-canvas-scheduler-runtime-desktop.png"
    page.screenshot(path=str(runtime_path), full_page=True)
    assert not errors, errors
    page.close()
    return {"preview": preview_layout, "runtime": runtime_layout, "screenshots": [str(preview_path), str(runtime_path)]}


def verify_mobile(browser, screenshot_dir):
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    install_mock_api(page)
    dialog = open_scheduler(page)
    dialog.get_by_label("批量任务名称").fill("移动端后台保存")
    page.wait_for_timeout(980)
    dialog.locator(".canvas-schedule-list > button", has_text="运行结果与候选图").click()
    page.wait_for_timeout(1400)
    dialog.get_by_role("button", name="复制为新任务").click()
    page.wait_for_function("() => document.querySelector('input[aria-label=\"批量任务名称\"]')?.value === '运行结果与候选图 副本'")
    dialog.get_by_role("button", name="预演抽样").click()
    dialog.get_by_text("抽样预览 · 2 篇").wait_for()
    assert dialog.get_by_placeholder("关键字").count() == 2
    assert dialog.get_by_role("button", name="确认并启动").is_visible()
    layout = assert_layout(page, "mobile preview")
    path = screenshot_dir / "fluxpost-canvas-scheduler-mobile.png"
    page.screenshot(path=str(path), full_page=True)
    assert not errors, errors
    page.close()
    return {"layout": layout, "screenshot": str(path)}


def main():
    screenshot_dir = Path(tempfile.gettempdir())
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        desktop = verify_desktop(browser, screenshot_dir)
        mobile = verify_mobile(browser, screenshot_dir)
        browser.close()
    print(json.dumps({"desktop": desktop, "mobile": mobile}, ensure_ascii=False))


if __name__ == "__main__":
    main()
