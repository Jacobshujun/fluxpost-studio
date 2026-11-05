"""Offline acceptance: every API/media request is intercepted, never use port 3001."""
import asyncio
import copy
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright, expect
from batch_create_browser_check import BASE, NOW, WORKFLOW, new_schedule, summary_result


async def check(browser, theme, width):
    page = await browser.new_page(viewport={"width": width, "height": 1000})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    errors, actions, dialogs = [], [], []
    page.on("pageerror", lambda error: (errors.append(str(error)), print(f"Browser error: {error}", flush=True)))
    def confirm(dialog):
        dialogs.append(dialog.message)
        asyncio.create_task(dialog.accept())
    page.on("dialog", confirm)
    tasks = {}
    for i in range(53):
        task = new_schedule(f"history-{i}")
        task.update(name=f"历史任务 {i}", status="completed")
        tasks[task["id"]] = task
    original = new_schedule("old")
    original.update(name="跑通的原任务", status="completed", totalMainTasks=1, totalChildTasks=1)
    original["definition"]["parameters"] = [{"id": "input", "name": "创作要求", "scope": "main", "valueType": "text", "expansion": "each", "binding": {"nodeId": "text", "fieldKey": "text"}, "source": {"mode": "manual-list", "values": ["旧内容"], "listSeparator": "delimiter"}}]
    tasks["old"] = original
    legacy = {**new_schedule("legacy"), "name": "旧版常用配置", "schemaVersion": 1, "status": "completed"}
    legacy.pop("definition")
    tasks["legacy"] = legacy
    tasks["unavailable"] = {**new_schedule("unavailable"), "name": "工作流被删除的任务", "workflowId": "deleted", "status": "completed"}
    favorite = lambda alias, note="": {"alias": alias, "note": note, "createdAt": NOW, "updatedAt": NOW}
    favorites = {"old": favorite("G6 日常", "已跑通，替换文案"), "legacy": favorite("旧版收藏"), "unavailable": favorite("失效收藏")}
    state = {"copies": 0, "fail": False}
    slow_started, slow_release, slow_finished = asyncio.Event(), asyncio.Event(), asyncio.Event()

    async def intercept(route):
        request = route.request
        path = urlparse(request.url).path
        if not path.startswith("/api/"):
            if urlparse(request.url).netloc != urlparse(BASE).netloc:
                await route.abort()
            else:
                await route.continue_()
            return
        body = request.post_data_json if request.method in ["PUT", "POST", "PATCH"] else None
        actions.append((request.method, path, copy.deepcopy(body)))
        payload = {}
        if path == "/api/canvas/workflows":
            payload = {"workflows": [WORKFLOW]}
        elif path == "/api/canvas/workflows/workflow":
            payload = {"workflow": WORKFLOW}
        elif path == "/api/canvas/schedules":
            if "view=summary" in request.url:
                if parse_qs(urlparse(request.url).query).get("q") == ["slow request"]:
                    slow_started.set()
                    await slow_release.wait()
                    if request.failure:
                        slow_finished.set()
                        return
                if state["fail"]:
                    await route.fulfill(status=500, json={"error": "模拟列表读取失败"})
                    return
                payload = summary_result(tasks.values(), favorites, request.url)
            else:
                payload = {"schedules": list(tasks.values())}
        elif path.endswith("/favorite"):
            identifier = path.split("/")[-2]
            if request.method == "PUT":
                current = favorites.get(identifier, favorite(tasks[identifier]["name"]))
                favorites[identifier] = {**current, **body, "updatedAt": f"2026-11-04T02:00:{len(actions) % 60:02d}.000Z"}
            elif request.method == "DELETE":
                favorites.pop(identifier, None)
            payload = {"favorite": favorites.get(identifier)}
        elif path.startswith("/api/canvas/schedules/"):
            identifier = path.split("/")[-1]
            task = tasks[identifier]
            if request.method == "PATCH":
                if body["action"] == "duplicate":
                    state["copies"] += 1
                    task = copy.deepcopy(task)
                    task.update(id=f"copy-{state['copies']}", name=f"{task['name']} 副本", status="draft", revision=1, mainTasks=[], totalMainTasks=0, totalChildTasks=0)
                    task.pop("previewRevision", None)
                    tasks[task["id"]] = task
                elif body["action"] == "save":
                    task.update(name=body["name"], definition=body["definition"], revision=task["revision"] + 1)
                else:
                    raise AssertionError(f"Unexpected execution action: {body['action']}")
            elif request.method == "DELETE":
                del tasks[identifier]
                favorites.pop(identifier, None)
                payload = {"ok": True}
                await route.fulfill(status=200, json=payload)
                return
            payload = {"schedule": task}
        elif path == "/api/canvas/runs":
            payload = {"runs": [], "latestSuccessfulNodeRuns": []}
        else:
            assert request.method == "GET", f"Unexpected write: {path}"
        await route.fulfill(status=200, json=payload)
        if slow_started.is_set() and "q=slow+request" in request.url:
            slow_finished.set()

    await page.route("**/*", intercept)
    await page.goto(BASE + "/batch-create", wait_until="networkidle")
    await expect(page.get_by_role("button", name="从收藏复用", exact=True)).to_have_attribute("aria-pressed", "true")
    saved = page.locator("article.batch-saved-task").filter(has_text="G6 日常")
    await expect(saved).to_be_visible()
    await expect(saved).to_contain_text("已跑通，替换文案")
    unavailable = page.locator("article.batch-saved-task").filter(has_text="失效收藏")
    await expect(unavailable.get_by_role("button", name="复制并编辑")).to_be_disabled()
    await unavailable.get_by_role("button", name="取消收藏").click()
    await expect(unavailable).to_have_count(0)
    # A favorite references the latest saved values, not values at favorite time.
    tasks["old"]["definition"]["parameters"][0]["source"]["values"] = ["最新保存的内容"]
    await saved.get_by_role("button", name="复制并编辑").click()
    await expect(page.get_by_role("heading", name="填写内容与素材", exact=True)).to_be_visible()
    await expect(page.get_by_label("多行任务文本", exact=True)).to_have_value("最新保存的内容")
    assert tasks["copy-1"]["definition"] == tasks["old"]["definition"]
    assert tasks["copy-1"]["mainTasks"] == [] and "copy-1" not in favorites
    await page.get_by_label("任务名称").fill("未保存的新副本")
    await page.get_by_role("button", name="任务记录", exact=True).click()
    await page.get_by_label("仅看收藏", exact=True).check()
    saved = page.locator("article.batch-saved-task").filter(has_text="G6 日常")
    await saved.get_by_role("button", name="复制并编辑").click()
    await expect(page.get_by_role("heading", name="填写内容与素材", exact=True)).to_be_visible()
    assert tasks["copy-1"]["name"] == "未保存的新副本", "dirty draft must save before copying"
    assert tasks["old"]["name"] == "跑通的原任务", "copy editing cannot modify source"
    assert not any(body and body.get("action") in ["launch", "preflight"] for _, _, body in actions)

    await page.goto(BASE + "/batch-create", wait_until="networkidle")
    saved = page.locator("article.batch-saved-task").filter(has_text="G6 日常")
    await saved.get_by_role("button", name="编辑收藏").click()
    await saved.get_by_label("收藏名称", exact=True).fill("G6 常用配置")
    await saved.get_by_label("收藏备注", exact=True).fill("每周替换选题")
    await saved.get_by_role("button", name="保存收藏").click()
    await expect(page.locator("article.batch-saved-task").filter(has_text="G6 常用配置")).to_contain_text("每周替换选题")
    await page.reload(wait_until="networkidle")
    await expect(page.get_by_text("G6 常用配置", exact=True)).to_be_visible()
    await page.screenshot(path=f"test-artifacts/batch-favorites-{theme}-{width}.png", full_page=True)
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "favorite layout overflow"

    await page.get_by_role("button", name="任务记录", exact=True).click()
    await page.get_by_role("button", name="下一页任务", exact=True).click()
    await expect(page.locator(".batch-list-count")).to_contain_text("第 2 页")
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "history layout overflow"
    await page.get_by_label("搜索任务", exact=True).fill("slow request")
    await page.get_by_label("搜索任务", exact=True).press("Enter")
    await asyncio.wait_for(slow_started.wait(), 5)
    await page.get_by_label("搜索任务", exact=True).fill("每周替换选题")
    await page.get_by_label("搜索任务", exact=True).press("Enter")
    await expect(page.locator("article.batch-saved-task")).to_have_count(1)
    slow_release.set()
    await asyncio.wait_for(slow_finished.wait(), 5)
    await expect(page.locator("article.batch-saved-task")).to_have_count(1)
    await page.get_by_label("筛选工作流", exact=True).select_option("workflow")
    await expect(page.locator("article.batch-saved-task")).to_have_count(1)
    await page.get_by_label("仅看收藏", exact=True).check()
    await expect(page.locator("article.batch-saved-task")).to_have_count(1)
    await page.locator("article.batch-saved-task").get_by_role("button", name="查看原任务").click()
    detail = page.locator(".batch-record-layout > .batch-main")
    await expect(detail.get_by_role("button", name="取消收藏")).to_be_visible()
    await page.locator("article.batch-saved-task").get_by_role("button", name="取消收藏").click()
    await expect(detail.get_by_role("button", name="收藏任务")).to_be_visible()
    await expect(page.locator("article.batch-saved-task")).to_have_count(0)
    await detail.get_by_role("button", name="收藏任务").click()
    await page.get_by_label("搜索任务", exact=True).fill("跑通的原任务")
    await page.get_by_role("button", name="搜索", exact=True).click()
    await expect(page.locator("article.batch-saved-task")).to_have_count(1)
    await detail.get_by_role("button", name="删除任务").click()
    await expect(page.locator("article.batch-saved-task")).to_have_count(0)
    assert any("也会移除收藏" in text for text in dialogs)
    assert "old" not in tasks and "old" not in favorites
    state["fail"] = True
    await page.get_by_role("button", name="刷新任务列表").click()
    await expect(page.locator(".batch-schedule-list [role=alert]")).to_contain_text("模拟列表读取失败")
    state["fail"] = False
    await page.get_by_role("button", name="重试加载").click()
    await expect(page.get_by_text("没有符合条件的任务", exact=False)).to_be_visible()

    # V1 copies remain V1 and open the original center, which can favorite drafts.
    await page.goto(BASE + "/batch-create", wait_until="networkidle")
    legacy_row = page.locator("article.batch-saved-task").filter(has_text="旧版收藏")
    await legacy_row.get_by_role("button", name="在原调度复制").click()
    await page.wait_for_url("**/canvas?**", wait_until="networkidle")
    dialog = page.get_by_role("dialog", name="Canvas 批量调度")
    await expect(dialog).to_be_visible()
    await expect(dialog.get_by_label("批量任务名称", exact=True)).to_have_value("旧版常用配置 副本")
    assert tasks["copy-3"]["schemaVersion"] == 1
    await dialog.get_by_role("button", name="收藏任务", exact=True).click()
    await expect(dialog.get_by_role("button", name="取消收藏", exact=True)).to_be_visible()
    assert "copy-3" in favorites
    assert not errors, errors
    await page.close()
    print(json.dumps({"theme": theme, "width": width, "requests": len(actions), "favorites": "passed"}), flush=True)


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
                    await page.screenshot(path=f"test-artifacts/batch-favorites-failure-{i}-{j}.png", full_page=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
