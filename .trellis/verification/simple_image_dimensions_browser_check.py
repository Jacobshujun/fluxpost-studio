import asyncio
import copy
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
NOW = "2026-09-09T00:00:00.000Z"


async def check(browser, width):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    errors = []
    submissions = []
    save_started = asyncio.Event()
    release_save = asyncio.Event()
    page.on("pageerror", lambda error: errors.append(str(error)))
    settings = {
        "textInstruction": "测试文字指令", "imageWashPrompt": "测试图片指令",
        "imageStrategyPrompts": {"carExterior": "测试车辆", "textImage": "测试图文", "peopleWithCar": "测试人物"},
        "distributionCheckPrompt": "测试审查", "imageSize": "1200x1600", "imageQuality": "medium",
        "platformCrawlSettings": {}, "updatedAt": NOW,
        "simpleRunMediaSettings": {"generateImages": True, "useComfyUiKlein": False,
                                   "directOriginalReference": False, "includeSourceVideo": False,
                                   "enableVideoTranscription": False},
    }
    account = {"id": "fixture", "username": "fixture", "displayName": "测试账号", "role": "admin", "status": "active"}

    async def route_handler(route):
        nonlocal settings
        request = route.request
        path = urlparse(request.url).path
        payload = {}
        if path == "/api/accounts/session":
            payload = {"account": account, "bootstrapRequired": False}
        elif path == "/api/accounts":
            payload = {"accounts": [account]}
        elif path == "/api/config":
            payload = {"tikhubConfigured": True, "openaiConfigured": True, "openaiTextEndpoint": "responses"}
        elif path == "/api/workspace/settings":
            if request.method == "PATCH":
                settings = copy.deepcopy(request.post_data_json)
                save_started.set()
                await release_save.wait()
            payload = {"settings": settings}
        elif path == "/api/library/navigation":
            payload = {"collections": [], "smartFolders": [], "counts": {"all": 0, "uncategorized": 0, "favorites": 0}}
        elif path == "/api/library/assets":
            payload = {"assets": [], "total": 0}
        elif path == "/api/simple/runs":
            if request.method == "POST":
                submissions.append(copy.deepcopy(request.post_data_json))
                await route.fulfill(status=400, json={"error": "测试已捕获提交，未启动任务"})
                return
            payload = {"runs": []}
        else:
            assert request.method == "GET", f"Unexpected mutation: {path}"
        await route.fulfill(status=200, json=payload)

    await page.route("**/api/**", route_handler)
    await page.goto(BASE_URL, wait_until="networkidle")
    ratio = page.get_by_role("combobox", name="图片比例", exact=True)
    resolution = page.get_by_role("combobox", name="图片分辨率", exact=True)
    quality = page.get_by_role("combobox", name="图片质量", exact=True)
    background = page.get_by_role("combobox", name="图片背景", exact=True)
    await expect(ratio).to_be_visible()
    await expect(resolution).to_be_visible()
    await expect(quality).to_be_visible()
    await expect(background).to_be_visible()
    await expect(quality).to_have_value("medium")
    await expect(background).to_have_value("auto")
    for value in ["low", "medium", "high"]:
        await quality.select_option(value)
        await expect(quality).to_have_value(value)
    for value in ["opaque", "auto", "transparent"]:
        await background.select_option(value)
        await expect(background).to_have_value(value)
    await expect(page.get_by_text("原设置为 1200x1600，请重新选择比例和分辨率。")).to_be_visible()
    await expect(ratio).to_have_value("")
    await expect(resolution).to_have_value("")
    await expect(page.locator("datalist#compact-image-size-presets")).to_have_count(0)
    await page.get_by_label("关键词 / 内容池项目", exact=True).fill("测试关键词")
    start = page.get_by_role("button", name="开始生产待审查内容", exact=True)
    await start.click()
    await expect(page.get_by_text("请选择图片比例和分辨率", exact=True)).to_be_visible()
    assert not submissions

    await ratio.select_option("3:4")
    await expect(resolution.locator('option[value="4k"]')).to_have_js_property("disabled", True)
    await resolution.select_option("2k")
    await page.get_by_role("button", name="保存当前策略", exact=True).click()
    await asyncio.wait_for(save_started.wait(), timeout=10)
    for control in [ratio, resolution, quality, background]:
        await expect(control).to_be_disabled()
    release_save.set()
    await expect(page.get_by_text("精简版默认生产策略已保存", exact=True)).to_be_visible()
    assert settings["imageRatio"] == "3:4"
    assert settings["imageResolution"] == "2k"
    assert settings["imageSize"] == "1536x2048"
    assert settings["imageQuality"] == "high"
    assert settings["imageBackground"] == "transparent"
    await page.reload(wait_until="networkidle")
    await expect(ratio).to_have_value("3:4")
    await expect(resolution).to_have_value("2k")
    await expect(quality).to_have_value("high")
    await expect(background).to_have_value("transparent")
    await page.get_by_label("关键词 / 内容池项目", exact=True).fill("测试关键词")
    await start.click()
    await expect(page.get_by_text("测试已捕获提交，未启动任务", exact=True)).to_be_visible()
    assert len(submissions) == 1
    assert submissions[0]["settings"]["imageRatio"] == "3:4"
    assert submissions[0]["settings"]["imageResolution"] == "2k"
    assert submissions[0]["settings"]["imageQuality"] == "high"
    assert submissions[0]["settings"]["imageBackground"] == "transparent"

    await ratio.select_option("16:9")
    await resolution.select_option("4k")
    await expect(ratio.locator('option[value="3:4"]')).to_have_js_property("disabled", True)
    await resolution.select_option("1k")
    await expect(ratio.locator('option[value="3:4"]')).to_have_js_property("disabled", False)
    await ratio.select_option("3:4")
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Horizontal overflow"
    for control in [ratio, resolution, quality, background]:
        bounds = await control.bounding_box()
        assert bounds and bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width + 1
    assert not errors, errors
    Path("test-artifacts").mkdir(exist_ok=True)
    await ratio.scroll_into_view_if_needed()
    await page.screenshot(path=f"test-artifacts/simple-image-dimensions-{width}.png")
    await page.close()
    print(f"Simple image strategy passed at {width}px: dimensions, quality, background, disabled save state, save/reload, launch and layout")


async def main():
    parsed = urlparse(BASE_URL)
    assert parsed.hostname in ["127.0.0.1", "localhost"] and parsed.port != 3001, "Use an isolated loopback smoke server, not the candidate"
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            for width in [1440, 390]:
                await check(browser, width)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
