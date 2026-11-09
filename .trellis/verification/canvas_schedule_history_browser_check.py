"""Canvas history regression; intercept every API and external request, never port 3001."""
import asyncio
import copy
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright, expect
from batch_create_browser_check import BASE, WORKFLOW, new_schedule, summary_result


async def check(browser, theme, width):
    page = await browser.new_page(viewport={"width": width, "height": 1000})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    errors, requests = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
    tasks = {}
    for i in range(121):
        task = new_schedule(f"old-{i}")
        task.update(name=f"历史调度 {i}", status="completed" if i < 119 else "draft")
        tasks[task["id"]] = task
    tasks["old-118"].update(schemaVersion=1, status="completed")
    state = {"list_fail": False, "detail_fail": False, "copies": 0, "hold": False}
    started, release, finished = asyncio.Event(), asyncio.Event(), asyncio.Event()

    async def intercept(route):
        request = route.request
        path = urlparse(request.url).path
        if not path.startswith("/api/"):
            if urlparse(request.url).netloc != urlparse(BASE).netloc:
                await route.abort()
            else:
                await route.continue_()
            return
        body = request.post_data_json if request.method in ["POST", "PATCH", "PUT"] else None
        requests.append((request.method, request.url, copy.deepcopy(body)))
        payload = {}
        if path == "/api/canvas/workflows":
            payload = {"workflows": [WORKFLOW]}
        elif path == "/api/canvas/workflows/workflow":
            payload = {"workflow": WORKFLOW}
        elif path == "/api/canvas/schedules":
            if request.method == "POST":
                task = new_schedule("created")
                task["name"] = "新建验证任务"
                tasks[task["id"]] = task
                payload = {"schedule": task}
            else:
                params = parse_qs(urlparse(request.url).query)
                assert params.get("view") == ["summary"], "Canvas must not request the truncated full list"
                assert params.get("workflowId") == ["workflow"]
                assert params.get("limit") == ["50"]
                if state["list_fail"]:
                    await route.fulfill(status=500, json={"error": "模拟历史读取失败"})
                    return
                payload = summary_result(tasks.values(), {}, request.url)
        elif path.endswith("/favorite"):
            payload = {"favorite": None}
        elif path.startswith("/api/canvas/schedules/"):
            identifier = path.split("/")[-1]
            if state["detail_fail"] and request.method == "GET":
                await route.fulfill(status=500, json={"error": "模拟详情读取失败"})
                return
            if state["hold"] and identifier == "old-50" and request.method == "GET":
                started.set()
                await release.wait()
                finished.set()
                if request.failure:
                    return
            task = tasks[identifier]
            if request.method == "PATCH":
                if body["action"] == "save":
                    assert body["revision"] == task["revision"]
                    task.update(name=body["name"], definition=body.get("definition"), revision=task["revision"] + 1)
                elif body["action"] == "duplicate":
                    state["copies"] += 1
                    task = copy.deepcopy(task)
                    task.update(id=f"copy-{state['copies']}", name=f"{task['name']} 副本", status="draft", revision=1)
                    tasks[task["id"]] = task
                else:
                    raise AssertionError(f"Unexpected action: {body}")
            elif request.method == "DELETE":
                tasks.pop(identifier)
                await route.fulfill(json={"ok": True})
                return
            payload = {"schedule": task}
        elif path == "/api/canvas/runs":
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        else:
            assert request.method == "GET", f"Unexpected write: {path}"
        await route.fulfill(json=payload)

    await page.route("**/*", intercept)
    base = BASE + "/canvas?workflowId=workflow&panel=schedules"
    await page.goto(base, wait_until="networkidle")
    dialog = page.get_by_role("dialog", name="Canvas 批量调度", exact=True)
    nav = dialog.get_by_role("navigation", name="批量任务列表")
    name = dialog.get_by_label("批量任务名称", exact=True)
    await expect(name).to_have_value("历史调度 0")
    await expect(nav.get_by_role("status")).to_have_text("共 121 项 · 第 1 页")
    assert await nav.locator(":scope > button").count() == 50
    await nav.get_by_role("button", name="下一页", exact=True).click()
    await expect(name).to_have_value("历史调度 50")
    await nav.get_by_role("button", name="下一页", exact=True).click()
    await expect(nav.get_by_role("status")).to_have_text("共 121 项 · 第 3 页")
    await nav.get_by_role("button", name="历史调度 118 ").click()
    await expect(name).to_have_value("历史调度 118")
    await nav.get_by_role("button", name="历史调度 119 ").click()
    await name.fill("离开前保存的草稿")
    await nav.get_by_role("button", name="上一页", exact=True).click()
    await expect(name).to_have_value("历史调度 50")
    assert tasks["old-119"]["name"] == "离开前保存的草稿"
    # Details must load even when the requested task is beyond the first page.
    await page.goto(base + "&scheduleId=old-120", wait_until="networkidle")
    await expect(name).to_have_value("历史调度 120")
    await expect(nav.get_by_role("status")).to_have_text("共 121 项 · 第 1 页")
    await name.fill("直达历史任务")
    await dialog.get_by_role("button", name="刷新调度", exact=True).click()
    await expect(name).to_have_value("直达历史任务")
    assert tasks["old-120"]["name"] == "直达历史任务"
    await dialog.get_by_role("button", name="复制为新任务", exact=True).click()
    await expect(name).to_have_value("直达历史任务 副本")
    await expect(nav.get_by_role("status")).to_have_text("共 122 项 · 第 1 页")
    await dialog.get_by_role("button", name="新建任务", exact=True).click()
    await expect(name).to_have_value("新建验证任务")
    await expect(nav.get_by_role("status")).to_have_text("共 123 项 · 第 1 页")
    await dialog.get_by_role("button", name="删除", exact=True).click()
    await expect(nav.get_by_role("status")).to_have_text("共 122 项 · 第 1 页")
    assert "created" not in tasks
    # Fetch failures are explicit and retain the previously selected detail.
    state["detail_fail"] = True
    await nav.locator(":scope > button").filter(has=page.get_by_text("历史调度 1", exact=True)).click()
    await expect(dialog.get_by_text("模拟详情读取失败", exact=True)).to_be_visible()
    await expect(name).to_have_value("历史调度 0")
    state["detail_fail"] = False
    state["list_fail"] = True
    await dialog.get_by_role("button", name="刷新调度", exact=True).click()
    await expect(dialog.get_by_text("模拟历史读取失败", exact=True)).to_be_visible()
    await expect(dialog.get_by_text("当前还没有批量任务", exact=True)).to_have_count(0)
    state["list_fail"] = False
    await dialog.get_by_role("button", name="刷新调度", exact=True).click()
    await expect(nav.get_by_role("status")).to_have_text("共 122 项 · 第 1 页")
    # A late response from a closed modal cannot replace a newly opened deep link.
    state["hold"] = True
    await nav.get_by_role("button", name="下一页", exact=True).click()
    await asyncio.wait_for(started.wait(), 10)
    await dialog.locator("header").get_by_role("button", name="关闭批量调度", exact=True).click()
    await page.goto(base + "&scheduleId=old-120", wait_until="networkidle")
    await expect(name).to_have_value("直达历史任务")
    release.set()
    await asyncio.wait_for(finished.wait(), 10)
    await expect(name).to_have_value("直达历史任务")
    await expect(nav.get_by_role("status")).to_have_text("共 122 项 · 第 1 页")
    # If the last page is removed elsewhere, refresh returns to the last valid page.
    state["hold"] = False
    await nav.get_by_role("button", name="下一页", exact=True).click()
    await nav.get_by_role("button", name="下一页", exact=True).click()
    await expect(name).to_have_value("历史调度 100")
    tasks = {key: value for key, value in tasks.items() if key.startswith("old-") and int(key[4:]) < 100}
    # Keep the selected task so refresh can preserve its detail; remove it via the modal.
    last = new_schedule("last")
    last["name"] = "最后一页草稿"
    tasks["last"] = last
    await page.goto(base + "&scheduleId=last", wait_until="networkidle")
    await nav.get_by_role("button", name="下一页", exact=True).click()
    await nav.get_by_role("button", name="下一页", exact=True).click()
    await expect(name).to_have_value("最后一页草稿")
    await dialog.get_by_role("button", name="删除", exact=True).click()
    await expect(nav.get_by_role("status")).to_have_text("共 100 项 · 第 2 页")
    await expect(name).to_have_value("历史调度 50")
    await page.screenshot(path=f"test-artifacts/canvas-schedule-history-{theme}-{width}.png")
    assert not errors, errors
    await page.close()
    print(json.dumps({"theme": theme, "width": width, "requests": len(requests), "history": "passed"}), flush=True)


async def main():
    Path("test-artifacts").mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ["professional", "editorial", "creator"]:
                for width in [1440, 390]:
                    await check(browser, theme, width)
        except Exception:
            for i, context in enumerate(browser.contexts):
                for j, page in enumerate(context.pages):
                    await page.screenshot(path=f"test-artifacts/canvas-schedule-history-failure-{i}-{j}.png", full_page=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
