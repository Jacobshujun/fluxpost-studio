"""Universal mode controls and save/error behavior; no real workflows or providers."""
import asyncio
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
NOW = "2026-10-30T00:00:00Z"


def node(key, kind, x=60, config=None, **extra):
    return {"id": key, "type": kind, "version": 1, "label": key, "position": {"x": x, "y": 80},
            "config": config or {}, "executionMode": "enabled", **extra}


async def check(browser, width, theme):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    region = node("region", "utility.image-iterate", config={"concurrency": 4, "failurePolicy": "all"}, iteration={
        "graph": {"nodes": [node("root", "input.iteration-item"), node("vision", "model.gpt-vision", 420,
                    {"preset": "describe", "instruction": "Describe", "maxImages": 8})],
                  "edges": [{"id": "inner", "source": "root", "sourcePort": "images", "target": "vision", "targetPort": "images"}],
                  "viewport": {"x": 0, "y": 0, "zoom": 1}},
        "outputs": {"text": {"nodeId": "vision", "outputPort": "text"}},
    })
    fixtures = [node("source", "input.text", config={"text": "Fixture text"}),
                node("concat", "utility.text-concatenate", config={"delimiter": ",", "clean_whitespace": False}),
                node("sink", "utility.save-images", config={"filenamePrefix": "Fixture"}), region]
    workflows = {item["id"]: {"id": item["id"], "name": item["id"], "revision": 1, "ownerUserId": "fixture",
                             "isTemplate": False, "createdAt": NOW, "updatedAt": NOW,
                             "graph": {"nodes": [item], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 0.8}}}
                 for item in fixtures}
    errors, violations, plans = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def intercept(route):
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE).netloc:
            violations.append(request.url)
            await route.abort()
            return
        if not parsed.path.startswith("/api/"):
            await route.continue_()
            return
        payload, status = {}, 200
        if parsed.path == "/api/canvas/workflows":
            payload = {"workflows": list(workflows.values())}
        elif parsed.path.startswith("/api/canvas/workflows/"):
            key = parsed.path.rsplit("/", 1)[-1]
            if request.method == "PATCH":
                workflows[key] = {**workflows[key], **request.post_data_json, "revision": workflows[key]["revision"] + 1}
            payload = {"workflow": workflows[key]}
        elif parsed.path == "/api/canvas/runs":
            if request.method == "POST":
                body = request.post_data_json
                if body.get("action") != "plan":
                    violations.append("Unexpected enqueue")
                plans.append(body)
                status, payload = 400, {"error": "source cannot bypass output text: no compatible upstream input."}
            else:
                payload = {"runs": [], "latestNodeAttempts": [], "latestSuccessfulNodeRuns": []}
        elif parsed.path == "/api/canvas/schedules":
            payload = {"schedules": []}
        elif request.method != "GET":
            violations.append(f"{request.method} {parsed.path}")
        await route.fulfill(json=payload, status=status)

    await page.route("**/*", intercept)

    async def saved():
        await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")

    for key in ["source", "concat", "sink"]:
        await page.goto(BASE + "/canvas?workflowId=" + key, wait_until="networkidle")
        outer = page.locator(f'.react-flow__node[data-id="{key}"]')
        summary = outer.locator(".canvas-node-mode-menu summary")
        await summary.click()
        skip = outer.get_by_role("menuitemradio", name="跳过", exact=True)
        await expect(skip).to_be_enabled()
        await skip.click()
        await summary.click()
        await expect(outer.locator(".canvas-node-bypassed")).to_have_count(1)
        await saved()
        assert workflows[key]["graph"]["nodes"][0]["executionMode"] == "bypass"
        await page.reload(wait_until="networkidle")
        await expect(outer.locator(".canvas-node-bypassed")).to_have_count(1)
        await outer.locator(".canvas-node-head strong").click()
        state = page.locator(".canvas-inspector label").filter(has_text=re.compile(r"^节点状态")).locator("select")
        await expect(state.locator('option[value="bypass"]')).to_be_enabled()
        if key == "source":
            await page.get_by_role("button", name="仅运行此节点", exact=True).click()
            await expect(page.locator(".canvas-message")).to_contain_text("source cannot bypass output text")
            assert plans[-1]["action"] == "plan"
        await state.select_option("disabled")
        await expect(outer.locator(".canvas-node-disabled")).to_have_count(1)
        await saved()
        assert workflows[key]["graph"]["nodes"][0]["executionMode"] == "disabled"
        if width > 820:
            await page.locator(".canvas-brand").click()
            await page.keyboard.press("Control+z")
            await expect(outer.locator(".canvas-node-bypassed")).to_have_count(1)
            await page.keyboard.press("Control+y")
            await expect(outer.locator(".canvas-node-disabled")).to_have_count(1)
            await outer.locator(".canvas-node-head strong").click()
            await page.keyboard.press("Control+b")
            await expect(outer.locator(".canvas-node-bypassed")).to_have_count(1)
            await page.keyboard.press("Control+b")
            await expect(outer.locator(".canvas-node-bypassed")).to_have_count(0)
            await page.keyboard.press("Control+m")
            await expect(outer.locator(".canvas-node-disabled")).to_have_count(1)
            await saved()

    await page.goto(BASE + "/canvas?workflowId=region", wait_until="networkidle")
    await page.locator('.react-flow__node[data-id="region"] .canvas-node-head strong').click()
    await page.get_by_role("button", name="编辑逐图区域", exact=True).click()
    dialog = page.get_by_role("dialog", name="逐图区域编辑器")
    await dialog.get_by_label("编辑内层节点").select_option("root")
    root = dialog.locator('.react-flow__node[data-id="root"]')
    await expect(root.locator(".canvas-node-mode-menu")).to_have_count(1)
    assert await root.locator('.canvas-node-mode-menu button[role="menuitemradio"]').evaluate_all("buttons => buttons.length === 3 && buttons.every(button => !button.disabled)")
    inner_state = dialog.get_by_label("内层节点状态", exact=True)
    await inner_state.select_option("disabled")
    await expect(root.locator(".canvas-node-disabled")).to_have_count(1)
    await inner_state.select_option("bypass")
    await expect(root.locator(".canvas-node-bypassed")).to_have_count(1)
    if width > 820:
        await dialog.locator("header strong").click()
        await page.keyboard.press("Control+z")
        await expect(root.locator(".canvas-node-disabled")).to_have_count(1)
        await page.keyboard.press("Control+y")
        await expect(root.locator(".canvas-node-bypassed")).to_have_count(1)
    await page.screenshot(path=f"test-artifacts/canvas-universal-modes-{theme}-{width}.png")
    await dialog.get_by_role("button", name="返回外层画布", exact=True).click()
    await saved()
    assert workflows["region"]["graph"]["nodes"][0]["iteration"]["graph"]["nodes"][0]["executionMode"] == "bypass"
    await page.reload(wait_until="networkidle")
    await page.locator('.react-flow__node[data-id="region"] .canvas-node-head strong').click()
    await page.get_by_role("button", name="编辑逐图区域", exact=True).click()
    await dialog.get_by_label("编辑内层节点").select_option("root")
    await expect(inner_state).to_have_value("bypass")
    assert not errors, errors
    assert not violations, violations
    print(f"PASS universal modes: {theme} {width}", flush=True)
    await page.close()


async def main():
    parsed = urlparse(BASE)
    if parsed.hostname not in ["127.0.0.1", "localhost", "::1"] or parsed.port in [None, 3001]:
        raise RuntimeError("Use an isolated worker-disabled loopback server, never port 3001")
    Path("test-artifacts").mkdir(exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ["professional", "editorial", "creator"]:
                for width in [1440, 390]:
                    await check(browser, width, theme)
        finally:
            await browser.close()


asyncio.run(main())
