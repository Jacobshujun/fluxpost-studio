"""Isolated browser acceptance. All API/media requests are intercepted."""
import asyncio
import copy
import json
import os
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ["127.0.0.1", "localhost"] and urlparse(BASE).port != 3001
NOW = "2026-11-04T04:00:00.000Z"
WORKFLOW = {
    "id": "workflow", "name": "图文创作工作流", "revision": 1, "ownerUserId": "owner",
    "ownerDisplayName": "测试", "isTemplate": False, "createdAt": NOW, "updatedAt": NOW,
    "graph": {"viewport": {"x": 0, "y": 0, "zoom": 1}, "edges": [], "nodes": [
        {"id": "text", "type": "input.text", "version": 1, "label": "创作要求", "position": {"x": 0, "y": 0}, "config": {"text": "默认文案"}},
        {"id": "text2", "type": "input.text", "version": 1, "label": "补充说明", "position": {"x": 350, "y": 0}, "config": {"text": "补充"}},
    ]},
}


def new_schedule(identifier="task"):
    return {"id": identifier, "name": "新建批量任务", "workflowId": "workflow", "workflowRevision": 1,
            "ownerUserId": "owner", "ownerDisplayName": "测试", "revision": 1, "schemaVersion": 2,
            "status": "draft", "batches": [], "mainTasks": [], "totalMainTasks": 0, "totalChildTasks": 0,
            "totalContentTasks": 0, "totalImageTasks": 0, "createdAt": NOW, "updatedAt": NOW,
            "definition": {"parameters": [], "expansion": {"main": "cartesian", "child": "cartesian"},
                           "sharedOutputs": [], "aggregationPolicy": "all",
                           "childResult": {"nodeId": "text", "outputPort": "text", "artifactKind": "text"}}}


def summary_result(tasks, favorites, url, workflows=None):
    params = parse_qs(urlparse(url).query)
    workflows = workflows if workflows is not None else [WORKFLOW]
    items = []
    for task in tasks:
        flow = next((flow for flow in workflows if flow["id"] == task["workflowId"]), None)
        favorite = favorites.get(task["id"])
        q = params.get("q", [""])[0].lower()
        if q and q not in " ".join([task["name"], flow["name"] if flow else "", favorite["alias"] if favorite else "", favorite["note"] if favorite else ""]).lower():
            continue
        if params.get("favorite") == ["true"] and not favorite:
            continue
        if params.get("workflowId") and params["workflowId"][0] != task["workflowId"]:
            continue
        item = {key: task.get(key, 0) for key in ["id", "name", "workflowId", "schemaVersion", "status", "updatedAt", "totalMainTasks", "totalChildTasks", "totalContentTasks", "totalImageTasks"]}
        item.update(favorite=favorite, workflowAvailable=bool(flow), workflowName=flow["name"] if flow else None)
        items.append(item)
    limit, offset = int(params.get("limit", [50])[0]), int(params.get("offset", [0])[0])
    return {"schedules": items[offset:offset + limit], "total": len(items), "limit": limit, "offset": offset}


async def check(browser, theme, width):
    page = await browser.new_page(viewport={"width": width, "height": 1000})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    errors, requests = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    state = {"schedules": {}, "conflict": False, "launches": 0, "previews": 0}
    legacy = {**new_schedule("legacy"), "name": "旧版调度保留", "schemaVersion": 1}
    legacy.pop("definition")
    state["schedules"]["legacy"] = legacy

    async def intercept(route):
        request = route.request
        path = urlparse(request.url).path
        if not path.startswith("/api/"):
            if urlparse(request.url).netloc != urlparse(BASE).netloc:
                await route.abort()
            else:
                await route.continue_()
            return
        body = request.post_data_json if request.method in ["POST", "PATCH"] else None
        requests.append((request.method, path, copy.deepcopy(body)))
        if path == "/api/canvas/workflows":
            payload = {"workflows": [WORKFLOW]}
        elif path == "/api/canvas/workflows/workflow":
            payload = {"workflow": WORKFLOW}
        elif path == "/api/canvas/schedules":
            if request.method == "POST":
                assert body["schemaVersion"] == 2
                state["schedules"]["task"] = new_schedule()
                payload = {"schedule": state["schedules"]["task"]}
            else:
                payload = summary_result(state["schedules"].values(), {}, request.url) if "view=summary" in request.url else {"schedules": list(state["schedules"].values())}
        elif path.endswith("/favorite"):
            payload = {"favorite": None}
        elif path.startswith("/api/canvas/schedules/"):
            identifier = path.split("/")[-1]
            task = state["schedules"][identifier]
            if request.method == "PATCH":
                action = body["action"]
                if action == "save":
                    if state["conflict"]:
                        await route.fulfill(status=409, json={"error": "任务已在其他页面更新，请重新加载后修改。"})
                        return
                    assert body["revision"] == task["revision"]
                    task.update(name=body["name"], definition=body["definition"], status="draft", previewRevision=None)
                elif action == "preflight":
                    state["previews"] += 1
                    assert body["revision"] == task["revision"]
                    values = task["definition"]["parameters"][0]["source"]["values"]
                    task.update(status="ready", previewRevision=f"preview-{task['revision']}", totalMainTasks=len(values), totalChildTasks=len(values),
                                mainTasks=[{"id": f"main-{i}", "status": "pending", "parameterValues": {"text": value}, "resultArtifacts": [],
                                            "childTasks": [{"id": f"child-{i}", "status": "pending", "parameterValues": {}, "resultArtifacts": []}]} for i, value in enumerate(values)])
                elif action == "launch":
                    assert body["previewRevision"] == task["previewRevision"] and body["revision"] == task["revision"]
                    state["launches"] += 1
                    task["status"] = "running"
                    for main in task["mainTasks"]:
                        main["status"] = "running"
                elif action == "pause":
                    task["status"] = "paused"
                elif action == "resume":
                    task["status"] = "running"
                elif action == "cancel":
                    task["status"] = "cancelled"
                elif action == "duplicate":
                    duplicate = copy.deepcopy(task)
                    duplicate.update(id="copy", status="draft", previewRevision=None)
                    state["schedules"]["copy"] = duplicate
                    task = duplicate
                elif action in ["retry-all", "retry", "retry-row", "retry-shared", "accept-candidates"]:
                    task["status"] = "running"
                else:
                    raise AssertionError(action)
                task["revision"] += 1
            elif request.method == "DELETE":
                del state["schedules"][identifier]
                await route.fulfill(status=200, json={"ok": True})
                return
            payload = {"schedule": task}
        elif path == "/api/canvas/runs":
            assert request.method == "GET"
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        else:
            assert request.method == "GET", f"Unexpected write: {path}"
            payload = {}
        await route.fulfill(status=200, json=payload)

    await page.route("**/*", intercept)
    await page.goto(BASE + "/batch-create", wait_until="networkidle")
    await expect(page.get_by_role("heading", name="批量创作", exact=True)).to_be_visible()
    await page.get_by_label("搜索工作流").fill("图文")
    await page.get_by_role("radio").check()
    await page.screenshot(path=f"test-artifacts/batch-{theme}-{width}-choose.png", full_page=True)
    await page.get_by_role("button", name="下一步", exact=True).click()
    await page.get_by_role("button", name="添加内容或素材").click()
    # More than one compatible node must never silently bind the first.
    await expect(page.get_by_label("用在什么位置")).to_have_value("")
    await page.get_by_role("button", name="下一步", exact=True).click()
    await expect(page.locator(".batch-error")).to_contain_text("使用位置")
    await page.get_by_label("用在什么位置").select_option(index=1)
    await page.get_by_label("值来源").select_option("manual-list")
    await page.get_by_label("分隔方式", exact=True).select_option("delimiter")
    text = "第一篇标题\n\n第一篇正文\n---\n第二篇内容"
    await page.get_by_label("多行任务文本", exact=True).fill(text)
    await page.get_by_label("多行任务文本", exact=True).press("End")
    await page.get_by_label("多行任务文本", exact=True).press("Enter")
    await expect(page.get_by_label("多行任务文本", exact=True)).to_have_value(text + "\n")
    await page.get_by_role("button", name="保存草稿", exact=True).click()
    await expect(page.get_by_role("status")).to_contain_text("草稿已保存")
    saved = state["schedules"]["task"]["definition"]
    assert saved["parameters"][0]["source"]["values"] == ["第一篇标题\n\n第一篇正文", "第二篇内容"]
    await page.screenshot(path=f"test-artifacts/batch-{theme}-{width}-inputs.png", full_page=True)
    await page.reload(wait_until="networkidle")
    await expect(page.get_by_label("分隔方式", exact=True)).to_have_value("delimiter")
    assert state["launches"] == 0
    await page.get_by_role("button", name="下一步", exact=True).click()
    await expect(page.get_by_role("heading", name="设置生成方式", exact=True)).to_be_visible()
    await page.get_by_text("高级设置", exact=False).filter(has_text="共享").first.click()
    await page.get_by_label("遇到失败时").select_option("at-least-one")
    await page.get_by_role("button", name="预览生成内容", exact=True).click()
    await expect(page.get_by_role("button", name="开始生成", exact=True)).to_be_enabled()
    assert state["previews"] == 1 and state["launches"] == 0
    await page.screenshot(path=f"test-artifacts/batch-{theme}-{width}-preview.png", full_page=True)
    # Even a name edit invalidates the ready preview; explicit preview is needed again.
    await page.get_by_label("任务名称").fill("运营同事的批量创作")
    await expect(page.get_by_role("button", name="开始生成", exact=True)).to_be_disabled()
    await page.get_by_role("button", name="重新预览", exact=True).click()
    await page.get_by_role("button", name="开始生成", exact=True).click()
    assert state["launches"] == 1
    await expect(page.get_by_role("button", name="暂停生成", exact=True)).to_be_visible()
    await page.get_by_role("button", name="暂停生成", exact=True).click()
    await page.get_by_role("button", name="继续生成", exact=True).click()
    task = state["schedules"]["task"]
    task["status"] = "partial"
    task["mainTasks"][0]["status"] = "completed"
    task["mainTasks"][0]["childTasks"][0].update(status="completed", resultArtifacts=[{"kind": "text", "value": "已生成的正文结果"}])
    task["mainTasks"][1]["status"] = "failed"
    task["mainTasks"][1]["childTasks"][0].update(status="failed", error="模拟服务暂时不可用")
    await page.get_by_role("button", name="刷新", exact=True).click()
    await expect(page.get_by_text("已生成的正文结果", exact=True)).to_be_visible()
    await expect(page.get_by_role("button", name="重试此结果", exact=True)).to_be_visible()
    await page.screenshot(path=f"test-artifacts/batch-{theme}-{width}-results.png", full_page=True)
    await page.get_by_role("button", name="重试此结果", exact=True).click()
    assert any(body and body.get("action") == "retry" for _, _, body in requests)
    await page.get_by_role("button", name="复制为新任务", exact=True).click()
    await page.get_by_label("任务名称").fill("冲突不能覆盖")
    state["conflict"] = True
    await page.get_by_role("button", name="保存草稿", exact=True).click()
    await expect(page.locator(".batch-error")).to_contain_text("其他页面更新")
    assert state["schedules"]["copy"]["name"] != "冲突不能覆盖"
    page.once("dialog", lambda dialog: dialog.dismiss())
    await page.get_by_role("button", name="选择配置", exact=False).first.click()
    await expect(page.get_by_label("任务名称")).to_have_value("冲突不能覆盖")
    page.once("dialog", lambda dialog: dialog.accept())
    await page.get_by_role("button", name="重新加载任务", exact=True).click()
    state["conflict"] = False
    await page.get_by_role("button", name="任务记录", exact=False).click()
    await page.locator("article.batch-saved-task").filter(has_text="旧版调度保留").get_by_role("button", name="查看原任务").click()
    await expect(page.get_by_text("旧版任务保留在原调度模块中", exact=False)).to_be_visible()
    link = page.get_by_role("link", name="在原调度打开", exact=False)
    assert "scheduleId=legacy" in await link.get_attribute("href")
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "page overflow"
    # Old page receives exactly the requested legacy schedule, not the latest V2 task.
    await link.click()
    await expect(page.get_by_role("dialog", name="Canvas 批量调度")).to_be_visible()
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    await expect(dialog.get_by_label("批量任务名称", exact=True)).to_have_value("旧版调度保留")
    assert not errors, errors
    await page.close()
    print(json.dumps({"theme": theme, "width": width, "requests": len(requests), "result": "passed"}), flush=True)


async def main():
    Path("test-artifacts").mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ["professional", "editorial", "creator"]:
                for width in [1440, 390]:
                    await check(browser, theme, width)
            await roundtrip_all_inputs(browser)
        except Exception:
            for i, context in enumerate(browser.contexts):
                for j, page in enumerate(context.pages):
                    await page.screenshot(path=f"test-artifacts/batch-failure-{i}-{j}.png", full_page=True)
            raise
        finally:
            await browser.close()


async def roundtrip_all_inputs(browser):
    page = await browser.new_page(viewport={"width": 1440, "height": 1000})
    workflow = copy.deepcopy(WORKFLOW)
    types = ["input.images", "input.local-directory", "input.video-loader", "input.source-video",
             "input.content-pool", "input.copy-library", "input.competitor-workbook", "model.qwen-image"]
    workflow["graph"]["nodes"] += [{"id": kind, "type": kind, "version": 1, "position": {"x": 0, "y": 0}, "config": {"snapshotId": "directory-snapshot"} if kind == "input.local-directory" else {}} for kind in types]
    task = new_schedule("roundtrip")
    directory = {"id": "directory-group", "snapshotId": "directory-snapshot", "name": "图片与配乐", "images": [], "audios": [], "videos": [], "valid": True, "errors": []}
    definitions = [
        ("image", "input.images", "urls", {"mode": "library-filter", "filter": {"mode": "manual", "assetIds": ["asset"], "search": "", "tags": ["车型"], "collectionId": "collection", "includeDescendants": False}}),
        ("image-group", "input.images", "urls", {"mode": "library-filter", "filter": {"mode": "manual", "assetIds": ["asset"], "search": "", "tags": []}}),
        ("directory-group", "input.local-directory", "groupId", {"mode": "manual-list", "values": [directory]}),
        ("video", "input.video-loader", "videos", {"mode": "video-loader-queue", "nodeId": "input.video-loader"}),
        ("source-video", "input.source-video", "sourceUrl", {"mode": "source-video-links", "links": ["https://example.invalid/video"], "projectName": "视频项目"}),
        ("content-pool", "input.content-pool", "sourceItemId", {"mode": "content-pool-filter", "filter": {"mode": "manual", "itemIds": ["item"], "query": "", "collectionId": "collection", "customTags": ["试驾"], "platforms": [], "statuses": [], "mediaTypes": [], "contentTags": [], "localMediaComplete": False, "includeDescendants": True, "sort": "hot-desc"}}),
        ("copy", "input.copy-library", "entryId", {"mode": "copy-filter", "filter": {"mode": "manual", "entryIds": ["copy"], "tags": [], "search": ""}}),
        ("text", "text", "text", {"mode": "manual-list", "values": ["多行\n\n正文", "第二篇"], "listSeparator": "delimiter"}),
        ("number", "model.qwen-image", "count", {"mode": "manual-list", "values": [1, 2]}),
        ("boolean", "model.qwen-image", "promptExtend", {"mode": "fixed", "values": [True]}),
        ("enum", "text2", "text", {"mode": "fixed", "values": ["auto"]}),
        ("text", "input.competitor-workbook", "rowTitle", {"mode": "competitor-workbook", "field": "title", "worksheet": "文案汇总", "rowStart": 2, "rowEnd": 12, "snapshot": {"id": "workbook", "rows": []}}),
    ]
    task["definition"]["parameters"] = [{"id": f"parameter-{i}", "name": f"输入{i}-{kind}", "valueType": kind, "scope": "main", "expansion": "each", "binding": {"nodeId": node, "fieldKey": field}, "source": source} for i, (kind, node, field, source) in enumerate(definitions)]
    task["definition"]["parameters"][0].update(expansion="random", sampleCount={"mode": "range", "min": 2, "max": 4})
    task["definition"]["sharedOutputs"] = [{"nodeId": "removed-output", "outputPort": "text", "artifactKind": "text"}]
    task["definition"]["mainTargetNodeId"] = "text2"
    task["definition"]["parameters"][-1]["binding"]["innerNodeId"] = "preserved-inner-node"
    original = copy.deepcopy(task["definition"])
    errors, saves = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def route_handler(route):
        path = urlparse(route.request.url).path
        if not path.startswith("/api/"):
            if urlparse(route.request.url).netloc != urlparse(BASE).netloc:
                await route.abort()
            else:
                await route.continue_()
            return
        payload = {}
        if path == "/api/canvas/workflows":
            payload = {"workflows": [workflow]}
        elif path == "/api/canvas/schedules":
            payload = summary_result([task], {}, route.request.url) if "view=summary" in route.request.url else {"schedules": [task]}
        elif path == "/api/canvas/schedules/roundtrip":
            if route.request.method == "PATCH":
                body = route.request.post_data_json
                assert body["action"] == "save"
                saves.append(copy.deepcopy(body))
                task.update(name=body["name"], definition=body["definition"], revision=task["revision"] + 1)
            payload = {"schedule": task}
        elif path == "/api/library/navigation":
            payload = {"collections": [], "smartFolders": [], "tags": []}
        elif path == "/api/library/assets":
            payload = {"assets": [], "total": 0}
        elif path == "/api/copy-library":
            payload = {"entries": [], "tags": []}
        elif path == "/api/content-pool/selection":
            payload = {"items": [], "projects": [], "collections": [], "total": 0}
        elif path == "/api/canvas/local-directory/snapshot":
            payload = {"snapshot": {"id": "directory-snapshot", "groups": [directory]}}
        await route.fulfill(status=200, json=payload)

    await page.route("**/*", route_handler)
    await page.goto(BASE + "/batch-create?scheduleId=roundtrip", wait_until="networkidle")
    await expect(page.get_by_label("任务名称")).to_be_visible()
    await expect(page.get_by_label("内容名称 12", exact=True)).to_be_visible()
    await page.get_by_role("button", name="选择目录媒体组", exact=True).click()
    await expect(page.get_by_label("图片与配乐 · 0 张图片")).to_be_checked()
    await page.get_by_label("任务名称").fill("重命名不丢配置")
    await page.get_by_role("button", name="保存草稿", exact=True).click()
    await expect(page.get_by_role("status")).to_contain_text("草稿已保存")
    assert saves[0]["definition"] == original, "mounted input editors must not rewrite hidden or complex fields"
    await page.reload(wait_until="networkidle")
    await expect(page.get_by_label("任务名称")).to_have_value("重命名不丢配置")
    assert task["definition"] == original
    assert not errors, errors
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    await page.close()
    print("All eleven input types, workbook snapshot, inner binding, invalid shared output and random range survive browser rename/save/reload.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
