"""Mocked Gemini node/config UI; all API writes are intercepted, never real runs."""
import asyncio
import copy
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
NOW = "2026-10-19T00:00:00Z"
assert urlparse(BASE).hostname in ["localhost", "127.0.0.1"] and urlparse(BASE).port != 3001


async def check(browser, width, theme):
    page = await browser.new_page(viewport=dict(width=width, height=960))
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    node_config = dict(instruction="请根据输入文字和图片完成任务，使用中文回答。", model="")
    workflow = dict(id="gemini", name="Gemini 测试", revision=1, ownerUserId="fixture", ownerDisplayName="Fixture",
                    isTemplate=False, createdAt=NOW, updatedAt=NOW, graph=dict(
                        nodes=[dict(id="gemini", type="model.gemini", version=1, position=dict(x=40, y=40), config=node_config)],
                        edges=[], viewport=dict(x=0, y=0, zoom=0.85)))
    attempt = dict(id="attempt", runId="run", nodeId="gemini", nodeType="model.gemini", attempt=1,
                   status="completed", inputs={}, outputs=dict(text=dict(kind="text", value="Gemini 离线回答")), createdAt=NOW, updatedAt=NOW)
    latest = dict(workflowRevision=1, runId="run", runCreatedAt=NOW, nodeVersion=1, nodeConfig=copy.deepcopy(node_config), nodeRun=attempt)
    saves, errors, violations = [], [], []
    config_saves = []
    fields = [dict(key=key, label=label, kind=kind, category="gemini", description="", value=value, configured=bool(value)) for key, label, kind, value in [
        ("GEMINI_API_KEY", "Gemini API Key", "secret", None),
        ("GEMINI_BASE_URL", "Gemini Base URL", "text", "https://generativelanguage.googleapis.com/v1beta"),
        ("GEMINI_MODEL", "Gemini 默认模型", "text", ""),
        ("GEMINI_PROXY_ENABLED", "Gemini 使用代理", "boolean", "false"),
        ("GEMINI_PROXY_URL", "Gemini 代理地址", "text", "http://127.0.0.1:10808"),
        ("GEMINI_REQUEST_TIMEOUT_MS", "Gemini 请求超时毫秒", "number", "180000"),
    ]]
    advanced = dict(updatedAt=NOW, groups=[dict(id="gemini", title="Gemini", description="", fields=fields)])
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def intercept(route):
        nonlocal workflow
        request = route.request
        url = urlparse(request.url)
        if url.netloc != urlparse(BASE).netloc:
            violations.append("external request")
            await route.abort()
            return
        if not url.path.startswith("/api/"):
            await route.continue_()
            return
        payload = {}
        if url.path == "/api/accounts/session":
            payload = dict(account=dict(id="fixture", displayName="Fixture", username="fixture", role="admin"), hasAccounts=True)
        elif url.path == "/api/content-safety-policy":
            payload = dict(policy=dict(revision=1, model=dict(reviewThreshold=40, filterThreshold=80)))
        elif url.path == "/api/config":
            if request.method == "PATCH":
                config_saves.append(request.post_data_json)
                for field in fields:
                    if field["key"] in request.post_data_json["values"]:
                        value = request.post_data_json["values"][field["key"]]
                        if field["kind"] == "secret":
                            field["configured"] = True
                        else:
                            field["value"] = str(value).lower() if isinstance(value, bool) else str(value)
            payload = dict(advanced=advanced, status={})
        elif url.path == "/api/canvas/workflows":
            payload = dict(workflows=[workflow])
        elif url.path == "/api/canvas/workflows/gemini":
            if request.method == "PATCH":
                saves.append(request.post_data_json)
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
            payload = dict(workflow=workflow)
        elif url.path == "/api/canvas/runs":
            payload = dict(runs=[], latestNodeAttempts=[latest], latestSuccessfulNodeRuns=[latest])
        elif url.path == "/api/canvas/schedules":
            payload = dict(schedules=[])
        elif request.method != "GET":
            violations.append(f"{request.method} {url.path}")
        await route.fulfill(json=payload)

    await page.route("**/*", intercept)
    await page.goto(BASE + "/canvas?workflowId=gemini", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="gemini"]')
    await expect(node.locator(".canvas-node-head strong")).to_have_text("Gemini")
    await expect(node.get_by_text("Gemini 离线回答", exact=True)).to_be_visible()
    await expect(node.locator('.react-flow__handle.target[data-handleid="prompt"]')).to_have_count(1)
    await expect(node.locator('.react-flow__handle.target[data-handleid="images"]')).to_have_count(1)
    await expect(node.locator('.react-flow__handle.source[data-handleid="text"]')).to_have_count(1)
    await node.locator(".canvas-node-head strong").click()
    inspector = page.locator(".canvas-inspector")
    instruction = inspector.get_by_text("节点指令", exact=True).locator("..").locator("textarea")
    await expect(instruction).to_have_value(node_config["instruction"])
    await instruction.fill("根据图片写中文文案")
    await inspector.get_by_label("模型 ID", exact=True).fill("fixture-pro")
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    assert workflow["graph"]["nodes"][0]["config"] == dict(instruction="根据图片写中文文案", model="fixture-pro")
    await page.reload(wait_until="networkidle")
    await node.locator(".canvas-node-head strong").click()
    await expect(inspector.get_by_label("模型 ID", exact=True)).to_have_value("fixture-pro")
    await inspector.get_by_label("模型 ID", exact=True).fill("")
    await page.get_by_role("button", name="关闭属性", exact=True).click()
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    if width > 820:
        await page.locator(".react-flow__pane").click(position=dict(x=500, y=400), button="right")
        search = page.get_by_placeholder("搜索节点", exact=True)
        await expect(search).to_be_visible()
        await search.fill("Gemini")
        await page.locator(".canvas-quick-add-list").get_by_role("option").first.click()
        await expect(page.locator('.react-flow__node')).to_have_count(2)
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
        assert workflow["graph"]["nodes"][-1]["type"] == "model.gemini"
    else:
        await page.get_by_role("button", name="打开节点库", exact=True).click()
        await expect(page.locator(".canvas-palette strong").get_by_text("Gemini", exact=True)).to_be_visible()
        await page.get_by_role("button", name="关闭节点库", exact=True).click()
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    assert not errors, errors
    assert not violations, violations
    assert saves
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-gemini-{theme}-{width}.png", full_page=True)
    await page.goto(BASE + "/config?group=gemini", wait_until="networkidle")
    await expect(page.locator("#config-GEMINI_API_KEY")).to_have_value("")
    await page.locator("#config-GEMINI_API_KEY").fill("browser-fixture-secret")
    await page.locator("#config-GEMINI_MODEL").fill("fixture-pro")
    await page.locator("#config-GEMINI_PROXY_ENABLED").click()
    await page.get_by_role("button", name="保存 3 项", exact=True).click()
    await expect(page.locator("#config-GEMINI_API_KEY")).to_have_value("")
    assert config_saves[-1]["values"]["GEMINI_MODEL"] == "fixture-pro"
    assert config_saves[-1]["values"]["GEMINI_PROXY_ENABLED"] in [True, "true"]
    await page.reload(wait_until="networkidle")
    await expect(page.locator("#config-GEMINI_MODEL")).to_have_value("fixture-pro")
    await expect(page.locator("#config-GEMINI_PROXY_ENABLED")).to_have_attribute("aria-pressed", "true")
    assert not errors, errors
    assert not violations, violations
    await page.close()
    print(f"PASS Gemini: {theme} {width}", flush=True)


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ["professional", "editorial", "creator"]:
                for width in [1440, 390]:
                    await check(browser, width, theme)
        except Exception:
            Path("test-artifacts").mkdir(exist_ok=True)
            for context in browser.contexts:
                for page in context.pages:
                    await page.screenshot(path="test-artifacts/canvas-gemini-failure.png", full_page=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
