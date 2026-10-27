"""Wonder node controls with intercepted APIs; all provider and persistence calls are mocked."""
import asyncio
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ["localhost", "127.0.0.1"] and urlparse(BASE).port != 3001
ENDPOINT = "https://yike.cn-shanghai.aliyuncs.com/"
NOW = "2026-10-26T00:00:00Z"


async def check(browser, width, theme):
    page = await browser.new_page(viewport=dict(width=width, height=960))
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    config = dict(endpoint=ENDPOINT, model="qwen-image-3.0", prompt="", count=1, resolution="1K", aspectRatio="16:9")
    workflow = dict(id="wonder-fixture", name="Wonder fixture", revision=1, ownerUserId="fixture", ownerDisplayName="Fixture",
                    isTemplate=False, createdAt=NOW, updatedAt=NOW, graph=dict(nodes=[dict(
                        id="wonder", type="model.wonder-image", version=1, position=dict(x=40, y=40), config=config)],
                        edges=[], viewport=dict(x=0, y=0, zoom=0.85)))
    errors, violations, saves, credential_writes = [], [], [], []
    configured = False
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def intercept(route):
        nonlocal workflow, configured
        request = route.request
        url = urlparse(request.url)
        if url.netloc != urlparse(BASE).netloc:
            if url.netloc == "public.example":
                await route.fulfill(status=200, content_type="image/png", body=b"fixture")
                return
            violations.append("external request")
            await route.abort()
            return
        if not url.path.startswith("/api/"):
            await route.continue_()
            return
        payload = {}
        if url.path == "/api/accounts/session":
            payload = dict(account=dict(id="fixture", displayName="Fixture", username="fixture", role="admin"), hasAccounts=True)
        elif url.path == "/api/config":
            payload = dict(status={}, advanced=dict(groups=[], updatedAt=NOW))
        elif url.path == "/api/canvas/workflows":
            payload = dict(workflows=[workflow])
        elif url.path == "/api/canvas/workflows/wonder-fixture":
            if request.method == "PATCH":
                saves.append(request.post_data_json)
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
            payload = dict(workflow=workflow)
        elif url.path == "/api/canvas/wonder-credentials":
            if request.method == "PUT":
                credential_writes.append(request.post_data_json)
                configured = True
            elif request.method == "DELETE":
                configured = False
            payload = dict(configured=configured)
        elif url.path == "/api/canvas/runs":
            payload = dict(runs=[], latestNodeAttempts=[], latestSuccessfulNodeRuns=[])
        elif url.path == "/api/canvas/schedules":
            payload = dict(schedules=[])
        elif request.method != "GET":
            violations.append(f"{request.method} {url.path}")
        await route.fulfill(json=payload)

    await page.route("**/*", intercept)
    await page.goto(BASE + "/canvas?workflowId=wonder-fixture", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="wonder"]')
    await expect(node.locator(".canvas-node-head strong")).to_have_text("Wonder Image")
    for port, kind in [("prompt", "target"), ("references", "target"), ("images", "source")]:
        await expect(node.locator(f'.react-flow__handle.{kind}[data-handleid="{port}"]')).to_have_count(1)
    await node.locator(".canvas-node-head strong").click()
    inspector = page.locator(".canvas-inspector")
    await expect(inspector.get_by_text("模型 ID", exact=True)).to_be_visible()
    await inspector.get_by_text("编辑 / 生成提示词", exact=True).locator("..").locator("textarea").fill("保留人物，改成城市夜景")
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    assert workflow["graph"]["nodes"][0]["config"]["prompt"] == "保留人物，改成城市夜景"
    await inspector.get_by_text("分辨率", exact=True).locator("..").locator("select").select_option("2K")
    await inspector.get_by_text("宽高比", exact=True).locator("..").locator("select").select_option("1:1")
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    assert workflow["graph"]["nodes"][0]["config"]["resolution"] == "2K"
    assert workflow["graph"]["nodes"][0]["config"]["aspectRatio"] == "1:1"
    source = dict(id="source", type="input.images", version=1, position=dict(x=-320, y=40), config=dict(urls=["https://public.example/reference.png"]))
    target = dict(id="target", type="utility.image-preview", version=1, position=dict(x=440, y=40), config={})
    # Exercise typed graph edges directly through the same workflow save contract.
    saved_graph = workflow["graph"]
    workflow = {**workflow, "graph": {**saved_graph, "nodes": saved_graph["nodes"] + [source, target], "edges": [
        dict(id="reference", source="source", sourcePort="images", target="wonder", targetPort="references"),
        dict(id="output", source="wonder", sourcePort="images", target="target", targetPort="images"),
    ]}}
    await page.reload(wait_until="networkidle")
    await expect(page.locator(".react-flow__edge")).to_have_count(2)
    await page.locator('.react-flow__node[data-id="wonder"]').locator(".canvas-node-head strong").click()
    key = inspector.get_by_label("Wonder Image API Key", exact=True)
    await expect(key).to_have_value("")
    await key.fill("browser-fixture-secret")
    await inspector.get_by_role("button", name="保存密钥", exact=True).click()
    await expect(inspector.get_by_text("密钥已配置", exact=False)).to_be_visible()
    assert credential_writes[-1]["apiKey"] == "browser-fixture-secret"
    assert credential_writes[-1]["endpoint"] == ENDPOINT
    assert "browser-fixture-secret" not in str(saves)
    await expect(key).to_have_value("")
    await page.reload(wait_until="networkidle")
    await node.locator(".canvas-node-head strong").click()
    await inspector.get_by_role("button", name="查询配置", exact=True).click()
    await expect(inspector.get_by_text("密钥已配置", exact=False)).to_be_visible()
    await inspector.get_by_role("button", name="清除密钥", exact=True).click()
    await expect(inspector.get_by_text("尚未配置密钥", exact=True)).to_be_visible()
    if width > 820:
        await page.locator(".react-flow__pane").click(position=dict(x=500, y=400), button="right")
        await page.get_by_placeholder("搜索节点", exact=True).fill("Wonder")
        await page.locator(".canvas-quick-add-list").get_by_role("option").first.click()
        await expect(page.locator(".react-flow__node")).to_have_count(4)
    else:
        await page.get_by_role("button", name="打开节点库", exact=True).click()
        await expect(page.locator(".canvas-palette strong").get_by_text("Wonder Image", exact=True)).to_be_visible()
        await page.get_by_role("button", name="关闭节点库", exact=True).click()
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    assert not errors, errors
    assert not violations, violations
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-wonder-{theme}-{width}.png", full_page=True)
    await page.close()
    print(f"PASS Wonder: {theme} {width}", flush=True)


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
                    await page.screenshot(path="test-artifacts/canvas-wonder-failure.png", full_page=True)
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
