"""Aggregate-only failures remain retryable even when every child succeeded."""
import asyncio
import copy
import json
import os
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect
from batch_create_browser_check import WORKFLOW, NOW, new_schedule, summary_result

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("127.0.0.1", "localhost") and urlparse(BASE).port != 3001


async def check(browser, width, theme, bulk):
    context = await browser.new_context(viewport={"width": width, "height": 960})
    await context.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    page = await context.new_page()
    errors, actions = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    task = new_schedule("aggregate-task")
    task.update(status="partial", totalMainTasks=10, totalChildTasks=20)
    for index in range(10):
        task["mainTasks"].append({"id": f"main-{index}", "status": "partial" if index == 3 else "completed",
            "parameterValues": {}, "mainRunId": f"aggregate-{index}", "generatedPostId": f"draft-{index}",
            "aggregateRetryable": index == 3, "aggregateFailedNodeLabel": "文字图生成" if index == 3 else None,
            "error": "HTTP 400 invalid_prompt" if index == 3 else None,
            "resultArtifacts": [], "createdAt": NOW, "updatedAt": NOW,
            "childTasks": [{"id": f"child-{index}-{child}", "runId": f"run-{index}-{child}", "status": "completed", "parameterValues": {}, "resultArtifacts": [], "retryable": False, "createdAt": NOW, "updatedAt": NOW} for child in range(2)]})
    original_children = copy.deepcopy(task["mainTasks"][3]["childTasks"])

    async def handler(route):
        path = urlparse(route.request.url).path
        payload = {}
        if path == "/api/accounts/session":
            payload = {"account": {"id": "owner", "role": "operator"}}
        elif path == "/api/canvas/workflows":
            payload = {"workflows": [WORKFLOW]}
        elif path == "/api/canvas/schedules":
            payload = summary_result([task], {}, route.request.url)
        elif path == "/api/canvas/schedules/aggregate-task":
            if route.request.method == "PATCH":
                body = route.request.post_data_json
                actions.append(body)
                assert body["action"] == ("retry-all" if bulk else "retry-main")
                if not bulk:
                    assert body["mainTaskId"] == "main-3" and "childTaskId" not in body
                task["mainTasks"][3].update(status="queued", aggregateRetryPending=True, aggregateRetryable=False)
                task["status"] = "running"
                assert task["mainTasks"][3]["mainRunId"] == "aggregate-3"
                assert task["mainTasks"][3]["generatedPostId"] == "draft-3"
                assert task["mainTasks"][3]["childTasks"] == original_children
            payload = {"schedule": task}
        elif path.endswith("/iterations"):
            raise AssertionError("Aggregate retry must not query child iteration details")
        else:
            payload = {"favorite": None}
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

    await page.route("**/api/**", handler)
    await page.goto(f"{BASE}/batch-create?scheduleId=aggregate-task")
    await page.wait_for_load_state("networkidle")
    results = page.locator(".batch-results")
    group = results.locator(".batch-result-group").nth(3)
    await expect(group.get_by_text("组完成后处理 · 文字图生成", exact=True)).to_be_visible()
    await expect(results.get_by_role("button", name="重试失败项", exact=True)).to_be_visible()
    assert await results.get_by_role("button", name="重试此结果", exact=True).count() == 0
    if bulk:
        await results.get_by_role("button", name="重试失败项", exact=True).click()
    else:
        advanced = page.locator(".batch-advanced")
        await advanced.locator("summary").first.click()
        await expect(advanced.get_by_role("button", name="重试本组失败处理", exact=True)).to_be_visible()
        await advanced.locator("summary").first.click()
        await group.get_by_role("button", name="重试本组失败处理", exact=True).click()
    await expect(group.get_by_text("等待补跑失败节点", exact=True)).to_be_visible()
    assert len(actions) == 1
    assert not errors, errors
    assert not await group.evaluate("el => el.scrollWidth > el.clientWidth + 2")
    await context.close()
    print(f"{theme}/{width}/{'bulk' if bulk else 'scoped'}: aggregate-only failure button, stage attribution, preserved draft/children and single request passed")


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        for theme in ("professional", "editorial", "creator"):
            for width in (1440, 390):
                for bulk in (False, True):
                    await check(browser, width, theme, bulk)
        await browser.close()


asyncio.run(main())
