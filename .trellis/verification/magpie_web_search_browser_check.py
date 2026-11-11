import asyncio
import os
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1")
assert urlparse(BASE).port != 3001


async def check(browser, width):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    state = {"configured": False}
    patches = []
    violations = []

    def snapshot():
        return {
            "status": {"webSearchAvailable": state["configured"]},
            "advanced": {"groups": [{
                "id": "magpie-search", "title": "联网搜索", "description": "原创联网检索资料。",
                "fields": [
                    {"key": "MAGPIE_GATEWAY_KEY", "label": "Magpie API Key", "description": "保存后生效，页面不会回显。", "kind": "secret", "configured": state["configured"], "category": "magpie-search"},
                    {"key": "MAGPIE_WEB_SEARCH_URL", "label": "Magpie 搜索地址", "description": "本机需要可访问。", "kind": "text", "value": "http://127.0.0.1:54321/mcp", "category": "magpie-search"},
                ],
            }]},
        }

    async def intercept(route):
        request = route.request
        parsed = urlparse(request.url)
        if parsed.netloc != urlparse(BASE).netloc:
            violations.append("external request")
            await route.abort()
            return
        if not parsed.path.startswith("/api/"):
            await route.continue_()
            return
        if parsed.path == "/api/accounts/session":
            payload = {"hasAccounts": True, "account": {"id": "fixture", "displayName": "Admin", "role": "admin"}}
        elif parsed.path == "/api/config":
            if request.method == "PATCH":
                values = request.post_data_json["values"]
                patches.append(values)
                state["configured"] = bool(values.get("MAGPIE_GATEWAY_KEY"))
            payload = snapshot()
        elif parsed.path == "/api/content-safety-policy":
            payload = {"policy": {"schemaVersion": 1, "revision": 0, "enabled": False, "local": {"rules": []}, "categories": [], "model": {"enabled": False, "scope": "all_non_filtered", "prompt": "", "reviewThreshold": 40, "filterThreshold": 80}}}
        elif parsed.path == "/api/config/image-transport-health":
            payload = {"health": None}
        else:
            violations.append(parsed.path)
            await route.abort()
            return
        await route.fulfill(json=payload)

    await page.route("**/*", intercept)
    await page.goto(f"{BASE}/config?group=magpie-search", wait_until="networkidle")
    secret = page.get_by_label("Magpie API Key", exact=True)
    await expect(secret).to_have_attribute("type", "password")
    await expect(secret).to_have_value("")
    await expect(page.get_by_label("Magpie 搜索地址", exact=True)).to_have_value("http://127.0.0.1:54321/mcp")
    await secret.fill("fixture-browser-key")
    await page.get_by_role("button", name="保存 1 项", exact=True).click()
    await expect(page.get_by_text("已配置，值已隐藏", exact=True)).to_be_visible()
    await expect(secret).to_have_value("")
    assert patches == [{"MAGPIE_GATEWAY_KEY": "fixture-browser-key"}]
    await page.reload(wait_until="networkidle")
    await expect(secret).to_have_value("")
    await page.get_by_label("清空该项", exact=True).check()
    await page.get_by_role("button", name="保存 1 项", exact=True).click()
    await expect(page.get_by_label("清空该项", exact=True)).to_be_disabled()
    assert patches[-1] == {"MAGPIE_GATEWAY_KEY": None}
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert not violations, violations
    await page.close()
    print(f"Magpie config: password field, save/reload/clear and layout passed ({width}px)")


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width in (1440, 390):
                await check(browser, width)
        finally:
            await browser.close()


asyncio.run(main())
