import asyncio
import copy
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
NOW = "2026-09-09T00:00:00.000Z"
IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH9sAAAAASUVORK5CYII="


def make_node(node_id, node_type, config, position, **extra):
    return {"id": node_id, "type": node_type, "version": 1, "config": config,
            "position": position, "executionMode": "enabled", **extra}


async def check_editor_interactions(page, width, saved_workflow):
    outer = page.locator('.react-flow__node[data-id="region"]')
    await outer.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    await page.get_by_role("button", name="编辑逐图区域", exact=True).click()
    dialog = page.get_by_role("dialog", name="逐图区域编辑器")
    await dialog.get_by_label("区域文字输出").select_option("")
    await dialog.get_by_label("区域图片输出").select_option('["root","images"]')
    await dialog.get_by_role("button", name="返回外层画布", exact=True).click()
    if width > 820:
        source = outer.locator('.react-flow__handle.source[data-handleid="images"]')
        target = page.locator('.react-flow__node[data-id="image-sink"] .react-flow__handle.target[data-handleid="images"]')
        await source.scroll_into_view_if_needed()
        source_box = await source.bounding_box()
        target_box = await target.bounding_box()
        await page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
        await page.mouse.down()
        await page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + target_box["height"] / 2, steps=15)
        await page.mouse.up()
        await expect(page.locator('.react-flow__edge')).to_have_count(1)
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
        assert any(edge["source"] == "region" and edge["sourcePort"] == "images" and edge["target"] == "image-sink"
                   for edge in saved_workflow()["graph"]["edges"]), "Changed image output must support pointer connections before reload"
    await outer.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    await page.get_by_role("button", name="编辑逐图区域", exact=True).click()
    for key in ["Delete", "Backspace"]:
        await dialog.get_by_label("编辑内层节点").select_option("root")
        await dialog.locator('.react-flow__node[data-id="root"]').focus()
        await page.keyboard.press(key)
        await expect(dialog).to_be_visible()
        await expect(outer).to_have_count(1)
        await expect(dialog.locator('.react-flow__node[data-id="root"]')).to_have_count(1)
    await dialog.get_by_label("编辑内层节点").select_option("vision")
    await dialog.locator('.react-flow__node[data-id="vision"]').focus()
    await page.keyboard.press("Delete")
    await expect(dialog).to_be_visible()
    await expect(dialog.locator('.react-flow__node[data-id="vision"]')).to_have_count(0)
    await expect(dialog.locator('.react-flow__edge')).to_have_count(0)
    await dialog.get_by_label("内层节点库").select_option("input.text")
    await dialog.get_by_role("button", name="添加内层节点", exact=True).click()
    name = dialog.get_by_label("内层节点名称")
    await name.fill("保留文字")
    await name.press("Backspace")
    await expect(name).to_have_value("保留文")
    await name.press("Delete")
    await expect(name).to_have_value("保留文")
    text_id = await dialog.get_by_label("编辑内层节点").input_value()
    await dialog.locator(f'.react-flow__node[data-id="{text_id}"]').focus()
    await page.keyboard.press("Backspace")
    await expect(dialog).to_be_visible()
    await expect(dialog.locator('.react-flow__node')).to_have_count(1)
    await dialog.get_by_role("button", name="返回外层画布", exact=True).click()
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    saved_region = next(node for node in saved_workflow()["graph"]["nodes"] if node["id"] == "region")
    assert [node["id"] for node in saved_region["iteration"]["graph"]["nodes"]] == ["root"]
    assert saved_region["iteration"]["graph"]["edges"] == []
    if width > 820:
        assert len(saved_workflow()["graph"]["edges"]) == 1, "Inner deletion must preserve the region's outer connection"
    await page.reload(wait_until="networkidle")
    await expect(page.locator('.react-flow__node[data-id="region"]')).to_have_count(1)
    await expect(page.locator('.react-flow__edge')).to_have_count(1 if width > 820 else 0)
    if width > 820:
        sink = page.locator('.react-flow__node[data-id="image-sink"]')
        await sink.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
        await sink.focus()
        await page.keyboard.press("Delete")
        await expect(sink).to_have_count(0)
        await expect(page.locator('.react-flow__node[data-id="region"]')).to_have_count(1)
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")


async def check(browser, width):
    page = await browser.new_page(viewport={"width": width, "height": 960}, accept_downloads=True)
    errors = []
    violations = []
    requests = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    inner = {
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "nodes": [
            make_node("root", "input.iteration-item", {}, {"x": 50, "y": 60}),
            make_node("vision", "model.gpt-vision", {"preset": "describe", "instruction": "Describe", "maxImages": 8}, {"x": 390, "y": 60}),
        ],
        "edges": [{"id": "inner-images", "source": "root", "sourcePort": "images", "target": "vision", "targetPort": "images"}],
    }
    region = make_node("region", "utility.image-iterate", {"concurrency": 4, "failurePolicy": "all"}, {"x": 70, "y": 80},
                       iteration={"graph": inner, "outputs": {"text": {"nodeId": "vision", "outputPort": "text"}}})
    workflow = {
        "id": "iteration-workflow", "name": "逐图浏览器测试", "revision": 1,
        "ownerUserId": "browser-owner", "ownerDisplayName": "Browser owner",
        "isTemplate": False, "createdAt": NOW, "updatedAt": NOW,
        "graph": {"viewport": {"x": 0, "y": 0, "zoom": 1}, "nodes": [region,
            make_node("after", "utility.text-concatenate", {"delimiter": "\n", "clean_whitespace": False}, {"x": 450, "y": 80}),
            make_node("image-sink", "utility.image-preview", {}, {"x": 450, "y": 450})],
            "edges": [{"id": "outer-text", "source": "region", "sourcePort": "text", "target": "after", "targetPort": "text_a"}]},
    }
    metadata = {"schemaVersion": 1, "inputFingerprint": "mock", "revision": 1, "deliveredRevision": 1, "downstreamStale": False,
                "items": [{"id": f"item-{index}", "index": index, "source": {"url": IMAGE}, "runId": f"inner-run-{index}",
                           "status": "failed" if index == 1 else "completed",
                           "error": "模拟图片生成失败" if index == 1 else None,
                           "outputs": {} if index == 1 else {"text": {"kind": "text", "value": f"原图 {index + 1} 的文字"}, "images": {"kind": "images", "items": [{"url": IMAGE}]}}}
                          for index in range(5)]}
    run = {"id": "iteration-run", "workflowId": workflow["id"], "workflowRevision": 1, "ownerUserId": "browser-owner",
           "ownerDisplayName": "Browser owner", "status": "completed", "graphSnapshot": copy.deepcopy(workflow["graph"]),
           "createdAt": NOW, "updatedAt": NOW, "completedAt": NOW, "confirmation": {"nodeIds": [], "capabilities": [], "confirmedAt": NOW}}
    schedule = None
    reject_retry = True

    def node_attempt():
        return {"id": "region-attempt", "runId": run["id"], "nodeId": "region", "nodeType": "utility.image-iterate",
                "attempt": 1, "status": "completed", "inputs": {}, "outputs": {}, "createdAt": NOW, "updatedAt": NOW,
                "internalMetadata": {"iteration": metadata}}

    async def route_handler(route):
        nonlocal workflow, schedule, reject_retry
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE_URL).netloc:
            violations.append(f"External request: {request.url}")
            await route.abort()
            return
        if not parsed.path.startswith("/api/"):
            await route.continue_()
            return
        body = request.post_data_json if request.method in ["POST", "PATCH"] else None
        requests.append((request.method, parsed.path, body))
        payload = {}
        status = 200
        if parsed.path == "/api/canvas/workflows":
            if request.method == "POST":
                assert body["graph"]["nodes"][0]["iteration"]["outputs"]["images"]["nodeId"] == "root"
                workflow = {**workflow, **body, "revision": workflow["revision"] + 1}
                payload = {"workflow": workflow}
            else:
                payload = {"workflows": [workflow]}
        elif parsed.path == "/api/canvas/workflows/iteration-workflow":
            if request.method == "PATCH":
                workflow = {**workflow, **body, "revision": workflow["revision"] + 1}
            payload = {"workflow": workflow}
        elif parsed.path == "/api/canvas/runs":
            assert request.method == "GET", "Must not launch real or mock provider work"
            payload = {"runs": [run], "latestNodeAttempts": [], "latestSuccessfulNodeRuns": []}
        elif parsed.path == "/api/canvas/runs/iteration-run":
            assert request.method == "GET"
            payload = {"run": run, "nodeRuns": [node_attempt()]}
        elif parsed.path == "/api/canvas/runs/iteration-run/iterations/region":
            if request.method == "POST":
                assert set(body) == {"action"}
                if body["action"] == "retry-failed":
                    if reject_retry:
                        reject_retry = False
                        status = 409
                        payload = {"error": "共享结果已锁定，不能修改已消费的快照"}
                    else:
                        successful_before = copy.deepcopy([item for item in metadata["items"] if item["status"] == "completed"])
                        metadata["items"][1].update({"status": "completed", "error": None, "outputs": {"text": {"kind": "text", "value": "原图 2 修复文字"}}})
                        metadata.update({"revision": 2, "downstreamStale": True})
                        assert successful_before == [item for item in metadata["items"] if item["index"] != 1]
                elif body["action"] == "refresh-downstream":
                    metadata.update({"deliveredRevision": 2, "downstreamStale": False})
                else:
                    raise AssertionError(f"Unexpected iteration action: {body}")
            if status == 200:
                payload = {"metadata": metadata, "items": [{"item": item, "nodeRuns": []} for item in reversed(metadata["items"])]}
        elif parsed.path == "/api/canvas/schedules":
            if request.method == "POST":
                schedule = {"id": "schedule", "name": "逐图共享测试", "workflowId": workflow["id"], "workflowRevision": workflow["revision"],
                            "revision": 1, "schemaVersion": 2, "status": "draft", "batches": [], "mainTasks": [],
                            "createdAt": NOW, "updatedAt": NOW, "totalMainTasks": 0, "totalChildTasks": 0,
                            "totalContentTasks": 0, "totalImageTasks": 0,
                            "definition": {"parameters": [], "expansion": {"main": "cartesian", "child": "cartesian"},
                                           "sharedOutputs": [], "childResult": {"nodeId": "after", "outputPort": "text", "artifactKind": "text"}, "aggregationPolicy": "all"}}
                payload = {"schedule": schedule}
            else:
                payload = {"schedules": [schedule] if schedule else []}
        elif parsed.path == "/api/canvas/schedules/schedule":
            if request.method == "PATCH":
                assert body["action"] == "save", "Only in-memory draft saves are permitted"
                schedule.update({key: copy.deepcopy(body[key]) for key in ["name", "definition", "batches"] if key in body})
            payload = {"schedule": schedule}
        elif request.method != "GET":
            violations.append(f"Unexpected write: {request.method} {parsed.path}")
            status = 403
            payload = {"error": "Browser fixture rejected unexpected write"}
        await route.fulfill(status=status, json=payload)

    await page.route("**/*", route_handler)
    await page.goto(f"{BASE_URL}/canvas?workflowId=iteration-workflow&runId=iteration-run", wait_until="networkidle")
    original_workflow = copy.deepcopy(workflow)
    await check_editor_interactions(page, width, lambda: workflow)
    workflow = original_workflow
    await page.reload(wait_until="networkidle")
    if width > 820:
        await page.get_by_role("button", name="显示节点库", exact=True).click()
        palette = page.locator(".canvas-palette")
        await expect(palette.get_by_role("button", name=re.compile("当前迭代项"))).to_have_count(0)
        await palette.get_by_role("button", name=re.compile("逐图迭代")).click()
        await page.get_by_role("button", name="编辑逐图区域", exact=True).click()
        created_dialog = page.get_by_role("dialog", name="逐图区域编辑器")
        await expect(created_dialog.locator(".react-flow__node")).to_have_count(2)
        await expect(created_dialog.get_by_label("区域文字输出")).to_have_value('["iteration-vision","text"]')
        await created_dialog.get_by_role("button", name="返回外层画布", exact=True).click()
        await page.get_by_role("button", name="删除节点", exact=True).click()
        await page.get_by_role("button", name="隐藏节点库", exact=True).click()
    outer = page.locator('.react-flow__node[data-id="region"]')
    await outer.wait_for()
    await outer.evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    await expect(page.get_by_label("并发数")).to_have_value("4")
    await expect(page.get_by_label("成功条件")).to_have_value("all")
    await page.get_by_label("成功条件").select_option("at-least-one")
    await page.get_by_label("并发数").fill("20")
    await page.get_by_role("button", name="编辑逐图区域", exact=True).click()
    dialog = page.get_by_role("dialog", name="逐图区域编辑器")
    await expect(dialog).to_be_visible()
    await page.wait_for_function("document.querySelector('dialog .react-flow__node[data-id=\"root\"]')?.getBoundingClientRect().width > 60", timeout=5000)
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-iteration-overview-{width}.png", full_page=True)
    library = dialog.get_by_label("内层节点库")
    choices = await library.locator("option").evaluate_all("options => options.map(option => option.value)")
    assert {"model.gpt-vision", "model.gpt-text", "model.gpt-image", "utility.text-split"}.issubset(choices)
    assert not {"utility.image-iterate", "input.iteration-item", "input.content-collection", "publish.feishu", "compose.social-post", "model.gpt-image-each", "model.seedance"}.intersection(choices)
    await dialog.get_by_label("编辑内层节点").select_option("root")
    await expect(dialog.get_by_role("button", name="删除内层节点")).to_have_count(0)
    root = dialog.locator('.react-flow__node[data-id="root"]')
    assert "draggable" not in (await root.get_attribute("class")).split()
    await library.select_option("model.gpt-image")
    await dialog.get_by_role("button", name="添加内层节点", exact=True).click()
    await dialog.get_by_label("比例").select_option("3:4")
    await dialog.get_by_label("分辨率").select_option("4k")
    await expect(dialog.get_by_label("分辨率")).to_have_value("4k")
    await expect(dialog.get_by_label("比例")).to_have_value("9:16")
    await dialog.get_by_role("button", name="删除内层节点", exact=True).click()
    await library.select_option("input.text")
    await dialog.get_by_role("button", name="添加内层节点", exact=True).click()
    await dialog.get_by_label("内层节点名称").fill("内层共享提示")
    await dialog.locator(".canvas-inspector-content textarea").fill("逐张识别，不合并其他图片")
    await dialog.get_by_label("区域文字输出").select_option(json.dumps(["vision", "text"], separators=(",", ":")))
    await dialog.get_by_label("区域图片输出").select_option(json.dumps(["root", "images"], separators=(",", ":")))
    await dialog.get_by_text("内层连线（也可拖动端口）", exact=True).click()
    await dialog.get_by_label("连线起点").select_option(json.dumps(["root", "text"], separators=(",", ":")))
    await dialog.get_by_label("连线终点").select_option(json.dumps(["vision", "instruction"], separators=(",", ":")))
    await dialog.get_by_role("button", name="连接内层端口", exact=True).click()
    await expect(dialog.get_by_role("status")).to_have_text("已连接内层节点")
    assert not await dialog.evaluate("element => element.scrollWidth > element.clientWidth + 1")
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-iteration-editor-{width}.png", full_page=True)
    await dialog.get_by_role("button", name="返回外层画布", exact=True).click()
    await expect(dialog).to_have_count(0)
    await expect(page.get_by_label("并发数")).to_have_value("20")
    await expect(page.get_by_label("成功条件")).to_have_value("at-least-one")
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    saved_region = next(node for node in workflow["graph"]["nodes"] if node["id"] == "region")
    assert len(saved_region["iteration"]["graph"]["nodes"]) == 3
    assert len(saved_region["iteration"]["graph"]["edges"]) == 2
    assert saved_region["iteration"]["graph"]["nodes"][-1]["label"] == "内层共享提示"
    await page.reload(wait_until="networkidle")
    await page.locator('.react-flow__node[data-id="region"]').evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    results = page.get_by_role("region", name="逐图运行结果")
    await expect(results.get_by_text("4/5 项成功", exact=True)).to_be_visible()
    await results.get_by_text("原图 2", exact=True).click()
    await expect(results.get_by_text("原始索引 1", exact=True)).to_be_visible()
    await expect(results.get_by_text("模拟图片生成失败", exact=True)).to_be_visible()
    retry = results.get_by_role("button", name="仅重试失败项（1）", exact=True)
    await retry.click()
    await expect(results.get_by_role("alert").filter(has_text="共享结果已锁定")).to_be_visible()
    await retry.click()
    await expect(results.get_by_text("5/5 项成功", exact=True)).to_be_visible()
    await results.get_by_role("button", name="刷新下游", exact=True).click()
    assert not any(body and body.get("action") == "refresh-downstream" for _, _, body in requests)
    await results.get_by_role("button", name="确认刷新下游", exact=True).click()
    await expect(results.get_by_role("button", name="刷新下游", exact=True)).to_have_count(0)
    indices = await results.locator(".canvas-iteration-item > summary strong").all_text_contents()
    assert indices == [f"原图 {index}" for index in range(1, 6)]
    if width > 820:
        await page.get_by_role("button", name="创建节点副本", exact=True).click()
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
        clones = [node for node in workflow["graph"]["nodes"] if node["type"] == "utility.image-iterate"]
        assert len(clones) == 2
        original_inner = clones[0]["iteration"]["graph"]["nodes"]
        cloned_inner = clones[1]["iteration"]["graph"]["nodes"]
        assert [node["type"] for node in original_inner] == [node["type"] for node in cloned_inner]
        assert not {node["id"] for node in original_inner}.intersection(node["id"] for node in cloned_inner)
        assert all(selector["nodeId"] in {node["id"] for node in cloned_inner} for selector in clones[1]["iteration"]["outputs"].values())
        await page.get_by_role("button", name="删除节点", exact=True).click()
        async with page.expect_download() as download_info:
            await page.get_by_role("button", name="导出工作流", exact=True).click()
        download = await download_info.value
        exported = json.loads(Path(await download.path()).read_text(encoding="utf-8"))
        assert exported["graph"]["nodes"][0]["iteration"]["outputs"]["images"]["nodeId"] == "root"
        await page.get_by_label("导入工作流文件").set_input_files({"name": "iteration.fluxpost-workflow.json", "mimeType": "application/json", "buffer": json.dumps(exported).encode("utf-8")})
        await expect(page.get_by_role("status").filter(has_text="已导入工作流")).to_be_visible()
    await page.get_by_role("button", name="批量调度", exact=True).click()
    schedule_dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    await schedule_dialog.get_by_role("button", name="新建任务", exact=True).click()
    shared = schedule_dialog.get_by_role("group", name="主任务共享输出")
    await expect(shared.locator('input[type="checkbox"]')).to_have_count(2)
    await shared.locator('input[type="checkbox"]').first.check()
    await expect(shared.locator('input[type="checkbox"]').nth(1)).to_be_checked()
    await shared.locator('input[type="checkbox"]').last.uncheck()
    await expect(shared.locator('input[type="checkbox"]').first).not_to_be_checked()
    assert not await page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    assert not errors, errors
    assert not violations, violations
    assert sum(body is not None and body.get("action") == "retry-failed" for _, _, body in requests) == 2
    assert sum(body is not None and body.get("action") == "refresh-downstream" for _, _, body in requests) == 1
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-iteration-{width}.png", full_page=True)
    run["batchContext"] = {"schemaVersion": 2, "phase": "shared", "scheduleId": "schedule", "mainTaskId": "main"}
    metadata["items"][1]["status"] = "failed"
    await page.goto(f"{BASE_URL}/canvas?workflowId=iteration-workflow&runId=iteration-run", wait_until="networkidle")
    await page.locator('.react-flow__node[data-id="region"]').evaluate("element => element.dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    await expect(page.get_by_role("button", name="仅重试失败项（1）", exact=True)).to_be_disabled()
    await expect(page.get_by_text("共享结果已完成并锁定，不能重试或刷新下游；请新建批量任务使用修改后的流程。", exact=True)).to_be_visible()
    await page.get_by_role("button", name="编辑逐图区域", exact=True).click()
    dialog = page.get_by_role("dialog", name="逐图区域编辑器")
    await dialog.get_by_label("编辑内层节点").select_option("vision")
    await dialog.get_by_role("button", name="删除内层节点", exact=True).click()
    await expect(dialog.get_by_label("区域文字输出")).to_have_value("")
    await dialog.get_by_role("button", name="返回外层画布", exact=True).click()
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    assert not any(edge["source"] == "region" and edge["sourcePort"] == "text" for edge in workflow["graph"]["edges"]), "Removing an output must not leave an unsaveable outer edge"
    assert "text" not in workflow["graph"]["nodes"][0]["iteration"]["outputs"]
    assert not errors, errors
    assert not violations, violations
    await page.close()
    print(json.dumps({"width": width, "requests": len(requests), "result": "passed"}), flush=True)


async def main():
    parsed = urlparse(BASE_URL)
    if parsed.hostname not in ["127.0.0.1", "localhost", "::1"] or parsed.port in [None, 3001]:
        raise RuntimeError("Use an existing loopback isolated baseline smoke server, never the live candidate")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width in [1440, 390]:
                await check(browser, width)
        except Exception:
            Path("test-artifacts").mkdir(exist_ok=True)
            for context_index, context in enumerate(browser.contexts):
                for page_index, page in enumerate(context.pages):
                    await page.screenshot(path=f"test-artifacts/canvas-iteration-failure-{context_index}-{page_index}.png", full_page=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
