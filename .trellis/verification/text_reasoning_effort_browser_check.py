"""Mocked advanced-config reasoning-effort UI checks on an isolated server."""
import asyncio
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
VALUES = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"]
LABELS = ["服务商默认（不指定）", "关闭思考", "最低", "低", "中", "高", "超高", "最高"]


def fixture_snapshot(value="default"):
    return {
        "updatedAt": "2026-10-21T00:00:00.000Z",
        "groups": [{
            "id": "openai-text",
            "title": "文本模型",
            "description": "正文生成、标签、审核和原创联网搜索使用的 OpenAI 兼容文本接口。",
            "fields": [
                {"key": "OPENAI_TEXT_MODEL", "label": "文本模型", "description": "用于内容生成、标签和审核。", "kind": "text", "category": "openai-text", "configured": True, "value": "gpt-5.5"},
                {"key": "OPENAI_TEXT_REASONING_EFFORT", "label": "思考强度", "description": "越高通常越慢、消耗更多 token，且不保证效果更好。支持范围取决于模型和服务商；“服务商默认”不等于关闭思考。", "kind": "select", "category": "openai-text", "configured": True, "value": value, "options": VALUES, "optionLabels": dict(zip(VALUES, LABELS))},
                {"key": "OPENAI_TEXT_ENDPOINT", "label": "文本接口形态", "description": "responses 支持原创联网搜索；chat 使用 chat completions。", "kind": "select", "category": "openai-text", "configured": True, "value": "responses", "options": ["responses", "chat"]},
            ],
        }],
    }


async def check(browser, width, theme):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    state = {"value": "default"}
    errors, violations, patches = [], [], []

    async def intercept(route):
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE_URL).netloc:
            violations.append(request.url)
            await route.abort()
            return
        if not parsed.path.startswith("/api/"):
            await route.continue_()
            return
        if parsed.path == "/api/accounts/session":
            payload = {"hasAccounts": True, "account": {"id": "admin-fixture", "displayName": "Admin", "role": "admin"}}
        elif parsed.path == "/api/content-safety-policy":
            payload = {"policy": {"schemaVersion": 1, "revision": 0, "enabled": False, "local": {"rules": []}, "categories": [], "model": {"enabled": False, "scope": "all_non_filtered", "prompt": "", "reviewThreshold": 40, "filterThreshold": 80}}}
        elif parsed.path == "/api/config" and parsed.query == "advanced=1":
            payload = {"status": {"textModel": "gpt-5.5", "openaiConfigured": True}, "advanced": fixture_snapshot(state["value"])}
        elif parsed.path == "/api/config/image-transport-health":
            payload = {"health": None}
        elif parsed.path == "/api/config" and request.method == "PATCH":
            posts = request.post_data_json.get("values", {})
            patches.append(posts)
            if "OPENAI_TEXT_REASONING_EFFORT" in posts:
                state["value"] = posts["OPENAI_TEXT_REASONING_EFFORT"] or "default"
            payload = {"status": {"textModel": "gpt-5.5", "openaiConfigured": True}, "advanced": fixture_snapshot(state["value"])}
        else:
            violations.append(f"{request.method} {parsed.path}")
            await route.abort()
            return
        await route.fulfill(json=payload)

    await page.route("**/*", intercept)
    await page.goto(f"{BASE_URL}/config?group=openai-text", wait_until="networkidle")
    control = page.get_by_label("思考强度", exact=True)
    await expect(control).to_be_visible()
    await expect(control.locator("option")).to_have_text(LABELS)
    assert await control.input_value() == "default"
    for value in VALUES[1:]:
        await control.select_option(value)
        await page.get_by_role("button", name="保存 1 项", exact=True).click()
        await expect(control).to_have_value(value)
        assert patches[-1] == {"OPENAI_TEXT_REASONING_EFFORT": value}
        await page.reload(wait_until="networkidle")
        control = page.get_by_label("思考强度", exact=True)
        await expect(control).to_have_value(value)
    await control.select_option("default")
    await page.get_by_role("button", name="保存 1 项", exact=True).click()
    await expect(control).to_have_value("default")
    assert patches[-1] == {"OPENAI_TEXT_REASONING_EFFORT": "default"}
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert not errors, errors
    assert not violations, violations
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/config-reasoning-{theme}-{width}.png", full_page=True)
    print(f"PASS reasoning effort: {theme} {width}", flush=True)
    await page.close()


async def main():
    parsed = urlparse(BASE_URL)
    assert parsed.hostname in ["127.0.0.1", "localhost", "::1"] and parsed.port not in [None, 3001]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ["professional", "editorial", "creator"]:
                for width in [1440, 390]:
                    await check(browser, width, theme)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
