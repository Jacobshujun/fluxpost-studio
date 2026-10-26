"""Intercepted storage settings check; never call live APIs or port 3001."""
import asyncio
import os
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1")
assert urlparse(BASE).port != 3001


async def check(browser, width):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    state = {"RUNTIME_STORAGE_PROVIDER": "tos", "OSS_ENABLED": "false"}
    violations = []

    def snapshot():
        fields = [{"key": "RUNTIME_STORAGE_PROVIDER", "label": "存储服务", "description": "生产切换另行确认。", "kind": "select", "options": ["tos", "oss"], "value": state["RUNTIME_STORAGE_PROVIDER"]},
                  {"key": "OSS_ENABLED", "label": "启用 OSS", "description": "仅当选择 oss 时生效。", "kind": "boolean", "value": state["OSS_ENABLED"]}]
        for key, label in [("OSS_ACCESS_KEY_ID", "OSS Access Key"), ("OSS_ACCESS_KEY_SECRET", "OSS Secret Key")]:
            fields.append({"key": key, "label": label, "description": "不会回显。", "kind": "secret", "configured": True})
        for key, label, value in [("OSS_BUCKET", "OSS Bucket", "xpai-imc"), ("OSS_ENDPOINT", "OSS Endpoint", "https://oss-cn-guangzhou.aliyuncs.com"), ("OSS_REGION", "OSS Region", "oss-cn-guangzhou"), ("OSS_PUBLIC_BASE_URL", "OSS 公共域名", "https://xpai-imc.oss-cn-guangzhou.aliyuncs.com"), ("OSS_OBJECT_PREFIX", "OSS 对象前缀", "fluxpost/flux-lightmoment")]:
            fields.append({"key": key, "label": label, "description": "迁移前确认。", "kind": "text", "value": value})
        for field in fields:
            field["category"] = "tos"
        return {"status": {"tosConfigured": True, "tosEnabled": True}, "advanced": {"groups": [{"id": "tos", "title": "对象存储 TOS / OSS", "description": "新增运行时媒体对象存储。", "fields": fields}]}}

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
                assert values == {"RUNTIME_STORAGE_PROVIDER": "oss"}
                state.update(values)
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
    await page.goto(f"{BASE}/config?group=tos", wait_until="networkidle")
    provider = page.get_by_label("存储服务", exact=True)
    await expect(provider).to_have_value("tos")
    await expect(page.get_by_label("OSS Secret Key", exact=True)).to_have_value("")
    await provider.select_option("oss")
    await page.get_by_role("button", name="保存 1 项", exact=True).click()
    await expect(provider).to_have_value("oss")
    await page.reload(wait_until="networkidle")
    await expect(page.get_by_label("存储服务", exact=True)).to_have_value("oss")
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert not violations, violations
    await page.close()
    print(f"OSS settings: masked credentials, explicit selection, save/reload and layout passed ({width}px)")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        try:
            for width in (1440, 390):
                await check(browser, width)
        finally:
            await browser.close()


asyncio.run(main())
