import asyncio
import os
from urllib.parse import urlparse, parse_qs

from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")


async def check(browser, width, has_root):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    submissions, asset_requests, errors = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    account = {"id": "fixture", "username": "fixture", "displayName": "fixture", "role": "admin", "status": "active"}
    settings = {
        "textInstruction": "Fixture instruction", "imageWashPrompt": "Fixture image",
        "imageStrategyPrompts": {"carExterior": "car", "textImage": "text", "peopleWithCar": "people"},
        "imageSize": "1024x1024", "imageRatio": "1:1", "imageResolution": "1k", "imageQuality": "medium",
        "platformCrawlSettings": {}, "updatedAt": "2026-10-27T00:00:00.000Z",
        "simpleRunMediaSettings": {"generateImages": True, "useComfyUiKlein": False, "directOriginalReference": False,
                                   "includeSourceVideo": False, "enableVideoTranscription": False},
    }
    assets = [{"id": f"asset-{i}", "name": f"Fixture Image {i}", "publicUrl": f"https://fixture.invalid/{i}.png", "collectionIds": ["root"]} for i in range(3)]

    async def handle(route):
        request = route.request
        parsed = urlparse(request.url)
        payload = {}
        if parsed.path == "/api/accounts/session":
            payload = {"account": account, "bootstrapRequired": False}
        elif parsed.path == "/api/accounts":
            payload = {"accounts": [account]}
        elif parsed.path == "/api/config":
            payload = {"tikhubConfigured": True, "openaiConfigured": True, "openaiTextEndpoint": "responses"}
        elif parsed.path == "/api/workspace/settings":
            payload = {"settings": settings}
        elif parsed.path == "/api/library/navigation":
            payload = {"collections": [{"id": "root", "name": "车型库"}] if has_root else [], "smartFolders": [], "counts": {"all": 24197}}
        elif parsed.path == "/api/library/assets":
            asset_requests.append(parse_qs(parsed.query))
            payload = {"assets": assets, "total": 3}
        elif parsed.path == "/api/simple/runs":
            if request.method == "POST":
                submissions.append(request.post_data_json)
                await route.fulfill(status=400, json={"error": "Fixture captured; no task started"})
                return
            payload = {"runs": []}
        else:
            assert request.method == "GET", f"Unexpected write: {parsed.path}"
        await route.fulfill(status=200, json=payload)

    await page.route("**/api/**", handle)
    await page.route("https://fixture.invalid/**", lambda route: route.abort())
    await page.goto(BASE_URL, wait_until="networkidle")
    if not has_root:
        await expect(page.get_by_text("未找到车型库，未加载图库素材。普通任务不受影响；如需选择车型参考图，请先创建车型库。", exact=True)).to_be_visible()
        assert not asset_requests
    else:
        assert asset_requests and all(q.get("collectionId") == ["root"] for q in asset_requests)
    await expect(page.get_by_text("已选图库素材 0 个", exact=True)).to_be_visible()
    await page.get_by_label("关键词 / 内容池项目", exact=True).fill("Fixture keyword")
    start = page.get_by_role("button", name="开始生产待审查内容", exact=True)
    await start.click()
    await expect(page.get_by_text("Fixture captured; no task started", exact=True)).to_be_visible()
    assert len(submissions) == 1 and not submissions[-1].get("materialAssetIds")
    if has_root:
        await page.get_by_role("button", name="爆款仿写", exact=True).click()
        await page.locator(".simple-link-panel input.field").fill("https://www.xiaohongshu.com/explore/fixture")
        await page.get_by_role("checkbox", name="使用车型图库图片进行图片模仿", exact=True).check()
        await page.get_by_role("button", name="Fixture Image 1", exact=True).click()
        await expect(page.get_by_text("已选图库素材 1 个", exact=True)).to_be_visible()
        await start.click()
        await expect(page.get_by_text("Fixture captured; no task started", exact=True)).to_be_visible()
        assert len(submissions) == 2
        assert submissions[-1]["viralMaterialAssetIds"] == ["asset-1"]
        assert not submissions[-1].get("materialAssetIds")
    assert not errors, errors
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    await page.close()
    print(f"Material selection browser passed: width={width}, root={has_root}")


async def main():
    parsed = urlparse(BASE_URL)
    assert parsed.hostname in ["127.0.0.1", "localhost"] and parsed.port != 3001
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width in [1440, 390]:
                for has_root in [False, True]:
                    await check(browser, width, has_root)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
