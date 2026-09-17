import asyncio
import copy
import json
import os
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE_URL).hostname in ["127.0.0.1", "localhost"] and urlparse(BASE_URL).port != 3001
NOW = "2026-09-17T00:00:00.000Z"

def png():
    def chunk(kind, body):
        return struct.pack("!I", len(body)) + kind + body + struct.pack("!I", zlib.crc32(kind + body))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack("!2I5B", 200, 100, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress((b"\0" + b"\xff\x00\x00" * 200) * 100)) + chunk(b"IEND", b"")

def layer():
    return dict(id="background", name="背景", kind="solid", visible=True, locked=False, opacity=1,
                x=0, y=0, width=1080, height=1920, color="#ffffff", fit="contain",
                crop=dict(x=0, y=0, width=1, height=1), endBehavior="hold")

async def check(browser, width, video_bytes):
    page = await browser.new_page(viewport=dict(width=width, height=960))
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    config = dict(protocolVersion=1, width=1080, height=1920, background="#ffffff", durationMode="longest", durationSeconds=10, audioLayerId=None, layers=[layer()])
    workflow = dict(id="layers", name="图层合成测试", revision=1, ownerUserId="owner", ownerDisplayName="Fixture", isTemplate=False, createdAt=NOW, updatedAt=NOW,
        graph=dict(viewport=dict(x=0, y=0, zoom=1), nodes=[
            dict(id="compose", type="utility.layer-compose", version=1, config=dict(composition=config), position=dict(x=40, y=40)),
            dict(id="image", type="input.images", version=1, config=dict(urls=["/generated/layer-fixture.png"]), position=dict(x=-300, y=40)),
            dict(id="video", type="input.videos", version=1, config=dict(urls=["/generated/layer-fixture.mp4"]), position=dict(x=-300, y=280)),
        ], edges=[dict(id="e1", source="image", sourcePort="images", target="compose", targetPort="images"), dict(id="e2", source="video", sourcePort="videos", target="compose", targetPort="videos")]))
    saves = []
    async def handler(route):
        nonlocal workflow
        request = route.request
        endpoint = urlparse(request.url).path
        if endpoint == "/api/canvas/workflows": payload = dict(workflows=[workflow])
        elif endpoint == "/api/canvas/workflows/layers":
            if request.method == "PATCH":
                saves.append(request.post_data_json)
                workflow = {**workflow, **request.post_data_json, "revision": workflow["revision"] + 1}
            payload = dict(workflow=workflow)
        elif endpoint == "/api/canvas/runs":
            assert request.method == "GET", "No real Canvas execution allowed"
            payload = dict(runs=[], latestNodeAttempts=[], latestSuccessfulNodeRuns=[])
        elif endpoint == "/api/canvas/schedules": payload = dict(schedules=[])
        elif endpoint == "/api/canvas/layer-compose/inspect":
            body = request.post_data_json
            assert body["url"] in ["/generated/layer-fixture.png", "/generated/layer-fixture.mp4"]
            payload = dict(width=200, height=100, hasAudio=body["kind"] == "video", durationSeconds=2 if body["kind"] == "video" else None)
        else:
            assert request.method == "GET", endpoint
            payload = {}
        await route.fulfill(status=200, json=payload)
    await page.route("**/api/**", handler)
    await page.route("**/generated/layer-fixture.png", lambda route: route.fulfill(status=200, body=png(), content_type="image/png"))
    await page.route("**/generated/layer-fixture.mp4", lambda route: route.fulfill(status=200, body=video_bytes, content_type="video/mp4"))
    await page.goto(f"{BASE_URL}/canvas?workflowId=layers", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="compose"]')
    await expect(node).to_be_visible()
    await page.locator(".react-flow__controls-fitview").click()
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    dialog = page.get_by_role("dialog", name="图层合成编辑器")
    await expect(dialog).to_be_visible()
    await dialog.get_by_label("画布宽度", exact=True).fill("400")
    await dialog.get_by_label("画布高度", exact=True).fill("600")
    await dialog.get_by_label("添加素材 1", exact=True).click()
    await expect(dialog.get_by_label("图层名称", exact=True)).to_have_value("图片 1")
    await dialog.get_by_label("图层名称", exact=True).fill("前景")
    await dialog.get_by_label("图层宽度", exact=True).fill("200")
    await expect(dialog.get_by_label("图层高度", exact=True)).to_have_value("300")
    await dialog.get_by_role("button", name="居中", exact=True).click()
    await expect(dialog.get_by_label("图层 X", exact=True)).to_have_value("100")
    if width > 820:
        box = await dialog.locator(".layer-object.is-selected").bounding_box()
        await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        await page.mouse.down()
        await page.mouse.move(box["x"] + box["width"] / 2 + 30, box["y"] + box["height"] / 2 + 20, steps=8)
        await page.mouse.up()
        assert float(await dialog.get_by_label("图层 X", exact=True).input_value()) > 100
        await dialog.get_by_label("撤销图层编辑", exact=True).click()
        await expect(dialog.get_by_label("图层 X", exact=True)).to_have_value("100")
        await dialog.get_by_label("重做图层编辑", exact=True).click()
        assert float(await dialog.get_by_label("图层 X", exact=True).input_value()) > 100
    await dialog.get_by_role("button", name="矩形裁剪", exact=True).click()
    await dialog.get_by_label("裁剪宽度 %", exact=True).fill("50")
    await dialog.get_by_role("button", name="完成裁剪", exact=True).click()
    await dialog.get_by_label("复制图层", exact=True).click()
    await expect(dialog.get_by_label("图层名称", exact=True)).to_have_value("前景 副本")
    await dialog.get_by_label("删除图层", exact=True).click()
    await dialog.get_by_role("button", name="前景", exact=True).click()
    await dialog.get_by_label("锁定前景", exact=True).click()
    await expect(dialog.get_by_label("图层 X", exact=True)).to_be_disabled()
    await dialog.get_by_label("解锁前景", exact=True).click()
    await dialog.get_by_label("添加素材 2", exact=True).click()
    await expect(dialog.get_by_label("视频结束后", exact=True)).to_be_visible()
    await dialog.get_by_label("视频结束后", exact=True).select_option("loop")
    await dialog.get_by_label("成品时长模式", exact=True).select_option("custom")
    await dialog.get_by_label("时长秒", exact=True).fill("3")
    await dialog.get_by_label("声音来源", exact=True).select_option("")
    await dialog.get_by_label("播放合成预览", exact=True).click()
    await expect(dialog.get_by_label("暂停合成预览", exact=True)).to_be_visible()
    await page.wait_for_timeout(350)
    assert float(await dialog.get_by_label("合成预览进度", exact=True).input_value()) > 0
    await dialog.get_by_label("暂停合成预览", exact=True).click()
    assert not await dialog.evaluate("el => el.scrollWidth > el.clientWidth + 1")
    Path("test-artifacts").mkdir(exist_ok=True)
    await page.screenshot(path=f"test-artifacts/canvas-layer-compose-{width}.png", full_page=True)
    await dialog.get_by_role("button", name="应用", exact=True).click()
    await expect(dialog).to_have_count(0)
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    saved = workflow["graph"]["nodes"][0]["config"]["composition"]
    assert saved["width"] == 400 and len(saved["layers"]) == 3
    assert saved["layers"][1]["crop"]["width"] == .5
    assert saved["layers"][2]["endBehavior"] == "loop"
    assert workflow["graph"]["nodes"][0]["position"] == dict(x=40, y=40)
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    await expect(dialog.get_by_label("画布宽度", exact=True)).to_be_enabled()
    await dialog.get_by_label("画布宽度", exact=True).fill("800")
    await dialog.get_by_role("button", name="取消", exact=True).click()
    await page.reload(wait_until="networkidle")
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    await expect(dialog.get_by_label("画布宽度", exact=True)).to_have_value("400")
    await expect(dialog.get_by_label("画布宽度", exact=True)).to_be_enabled()
    await page.keyboard.press("Escape")
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    assert not errors, errors
    assert saves
    await page.close()
    print(json.dumps(dict(width=width, saves=len(saves), result="passed")), flush=True)

async def main():
    with tempfile.TemporaryDirectory(prefix="fluxpost-layer-browser-") as temp:
        video = Path(temp) / "video.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=blue:s=200x100:r=30:d=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(video)], check=True)
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(channel="chrome", headless=True)
            try:
                for width in [1440, 390]: await check(browser, width, video.read_bytes())
            except Exception:
                Path("test-artifacts").mkdir(exist_ok=True)
                for context in browser.contexts:
                    for page in context.pages: await page.screenshot(path="test-artifacts/canvas-layer-compose-failure.png", full_page=True)
                raise
            finally: await browser.close()

if __name__ == "__main__": asyncio.run(main())
