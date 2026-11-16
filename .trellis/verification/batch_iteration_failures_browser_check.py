"""50-group batch recovery UI; APIs/media intercepted, no provider calls."""
import asyncio
import copy
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright, expect
from batch_create_browser_check import WORKFLOW, NOW, new_schedule, summary_result

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("127.0.0.1", "localhost") and urlparse(BASE).port != 3001


async def check(browser, width, theme):
    context = await browser.new_context(viewport={"width": width, "height": 960})
    await context.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    page = await context.new_page()
    errors, queries, actions = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    task = new_schedule("iteration-task")
    task.update(status="partial", totalMainTasks=50, totalChildTasks=50)
    region = {"nodeId": "inner-pages", "label": "内页处理", "policy": "all", "total": 3,
              "completed": 2, "failed": 1, "pending": 0, "failures": [{"index": 2, "error": "HTTP 503 上游负载已饱和"}]}
    for index in range(50):
        failed = index == 36
        child = {"id": f"child-{index}", "runId": f"run-{index}", "status": "failed" if failed else "completed",
                 "parameterValues": {}, "resultArtifacts": [], "createdAt": NOW, "updatedAt": NOW,
                 "iterationSummary": [copy.deepcopy(region)] if failed else [], "retryable": failed}
        task["mainTasks"].append({"id": f"main-{index}", "status": child["status"], "parameterValues": {},
                                   "childTasks": [child], "resultArtifacts": [], "createdAt": NOW, "updatedAt": NOW})
    # Another old failed row has no new summaries and must still expose lazy diagnostics.
    task["mainTasks"][48]["childTasks"][0].update(status="failed", iterationSummary=None)
    task["mainTasks"][10].update(status="failed", sharedStatus="failed", sharedRunId="shared-run", sharedArtifacts=[], sharedIterationSummary=[copy.deepcopy(region)])
    task["mainTasks"][10]["childTasks"][0].update(status="pending", runId=None)
    original_success = copy.deepcopy(task["mainTasks"][0])

    async def route_handler(route):
        request = route.request
        url = urlparse(request.url)
        path = url.path
        payload, code = {}, 200
        if path == "/api/accounts/session":
            payload = {"account": {"id": "owner", "role": "operator"}}
        elif path == "/api/canvas/workflows":
            payload = {"workflows": [WORKFLOW]}
        elif path == "/api/canvas/schedules":
            payload = summary_result([task], {}, request.url)
        elif path.endswith("/iterations"):
            params = parse_qs(url.query)
            queries.append(params)
            if params["phase"] == ["shared"]:
                assert params["mainTaskId"] == ["main-10"] and "childTaskId" not in params
            else:
                assert params["mainTaskId"] == ["main-36"] and params["childTaskId"] == ["child-36"]
            payload = {"details": {"runId": "run-36", "runStatus": "partial", "regions": [{**region, "items": [
                {"index": 1, "status": "completed", "sourceUrl": "/fixture-1.png"},
                {"index": 2, "status": "partial", "sourceUrl": "/fixture-2.png", "failedNodeLabel": "GPT 内页生图", "error": "HTTP 503 上游负载已饱和"},
                {"index": 3, "status": "completed", "sourceUrl": "/fixture-3.png"},
            ]}]}}
        elif path == "/api/canvas/schedules/iteration-task":
            if request.method == "PATCH":
                body = request.post_data_json
                actions.append(body)
                assert body["iterationNodeId"] == "inner-pages"
                if body["action"] == "retry-shared":
                    assert body["mainTaskId"] == "main-10" and "childTaskId" not in body
                    task["mainTasks"][10].update(status="running", sharedStatus="queued")
                else:
                    assert body["action"] == "retry" and body["mainTaskId"] == "main-36" and body["childTaskId"] == "child-36"
                    task["mainTasks"][36]["childTasks"][0].update(status="pending", retryPending=True)
                    task["mainTasks"][36]["status"] = "running"
                task["status"] = "running"
                assert task["mainTasks"][0] == original_success
            payload = {"schedule": task}
        elif path.startswith("/api/"):
            payload = {"favorite": None, "config": {}}
        else:
            await route.fulfill(status=200, content_type="image/svg+xml", body='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>')
            return
        await route.fulfill(status=code, content_type="application/json", body=json.dumps(payload))

    await page.route("**/api/**", route_handler)
    await page.route("**/fixture-*.png", route_handler)
    await page.goto(f"{BASE}/batch-create?scheduleId=iteration-task")
    await page.wait_for_load_state("networkidle")
    results = page.locator(".batch-results")
    await expect(results.get_by_text("第 37 组 · 结果 1 · 1 张图片失败", exact=True)).to_be_visible()
    assert not queries, "50 rows must not fetch detail requests eagerly"
    diagnostic = results.get_by_role("region", name="第 37 组 · 结果 1逐图执行")
    await diagnostic.get_by_role("button", name="展开逐图详情", exact=True).click()
    await expect(diagnostic.get_by_text("失败节点：GPT 内页生图", exact=True)).to_be_visible()
    await expect(diagnostic.get_by_text("第 2 张 · 部分失败", exact=True)).to_be_visible()
    await expect(diagnostic.get_by_text("全部成功：失败图片补齐后，本结果才能继续。", exact=True)).to_be_visible()
    assert len(queries) == 1
    overflow = await diagnostic.evaluate("el => el.scrollWidth > el.clientWidth + 2")
    assert not overflow, "Diagnostics must fit narrow screens"
    artifact_dir = Path("test-artifacts/batch-iteration-failures")
    artifact_dir.mkdir(parents=True, exist_ok=True)
    await diagnostic.screenshot(path=str(artifact_dir / f"{theme}-{width}-details.png"))
    advanced = page.locator(".batch-advanced")
    await advanced.locator("summary").first.click()
    tree_diagnostic = advanced.get_by_role("region", name="任务组 37 · 结果项 1逐图执行")
    await tree_diagnostic.get_by_role("button", name="展开逐图详情", exact=True).click()
    await expect(tree_diagnostic.get_by_text("失败节点：GPT 内页生图", exact=True)).to_be_visible()
    assert not await tree_diagnostic.evaluate("el => el.scrollWidth > el.clientWidth + 2")
    await tree_diagnostic.screenshot(path=str(artifact_dir / f"{theme}-{width}-tree.png"))
    await advanced.locator("summary").first.click()
    await diagnostic.get_by_role("button", name="仅重试此区域失败图片（1）", exact=True).click()
    await expect(results.locator(".batch-result-group").nth(36).get_by_role("heading", name="结果 1 · 待调度", exact=True)).to_be_visible()
    assert len(actions) == 1 and len(queries) == 2
    shared_diagnostic = results.get_by_role("region", name="第 11 组 · 共享处理逐图执行")
    await shared_diagnostic.get_by_role("button", name="展开逐图详情", exact=True).click()
    await expect(shared_diagnostic.get_by_text("失败节点：GPT 内页生图", exact=True)).to_be_visible()
    await shared_diagnostic.get_by_role("button", name="仅重试此区域失败图片（1）", exact=True).click()
    assert len(actions) == 2 and len(queries) == 3
    assert not errors, errors
    await page.screenshot(path=str(artifact_dir / f"{theme}-{width}.png"))
    await context.close()
    print(f"{theme}/{width}: 50-group attribution, lazy image/node error details, bounded layout and one region retry passed")


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        for theme in ("professional", "editorial", "creator"):
            for width in (1440, 390):
                await check(browser, width, theme)
        await browser.close()


asyncio.run(main())
