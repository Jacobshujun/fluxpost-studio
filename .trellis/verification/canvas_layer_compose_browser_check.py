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

async def assert_theme_contrast(dialog):
    checks = await dialog.evaluate("""root => {
        const rgba = value => value.match(/[\\d.]+/g).map(Number);
        const luminance = rgb => rgb.slice(0, 3).map(v => {
            const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        return ['header strong', '.layer-assets h3', '.layer-name', 'input[aria-label="画布宽度"]', 'select', 'button[aria-label="关闭图层编辑器"]', 'footer'].map(selector => {
            const el = root.querySelector(selector), style = getComputedStyle(el);
            let bg = rgba(getComputedStyle(root).backgroundColor);
            const ancestors = []; for (let p = el; p && p !== root; p = p.parentElement) ancestors.unshift(p);
            for (const p of ancestors) {
                const c = rgba(getComputedStyle(p).backgroundColor), a = c[3] ?? 1;
                bg = bg.slice(0, 3).map((v, i) => c[i] * a + v * (1 - a));
            }
            const c = rgba(style.color), a = c[3] ?? 1;
            const fg = c.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
            const l = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
            return {selector, ratio: (l[0] + .05) / (l[1] + .05), background: bg};
        });
    }""")
    assert all(item["ratio"] >= 4.5 for item in checks), checks

async def check(browser, width, video_bytes, theme):
    page = await browser.new_page(viewport=dict(width=width, height=960))
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    config = dict(protocolVersion=1, width=1080, height=1920, background="#ffffff", durationMode="longest", durationSeconds=10, audioLayerId=None, layers=[layer()])
    workflow = dict(id="layers", name="图层合成测试", revision=1, ownerUserId="owner", ownerDisplayName="Fixture", isTemplate=False, createdAt=NOW, updatedAt=NOW,
        graph=dict(viewport=dict(x=0, y=0, zoom=1), nodes=[
            dict(id="compose", type="utility.layer-compose", version=1, config=dict(composition=config), position=dict(x=40, y=40)),
            dict(id="image", type="utility.image-transform", version=1, config={}, position=dict(x=-300, y=40)),
            dict(id="video", type="input.videos", version=1, config=dict(urls=["/generated/layer-fixture.mp4"]), position=dict(x=-300, y=280)),
        ], edges=[dict(id="e1", source="image", sourcePort="images", target="compose", targetPort="images"), dict(id="e2", source="video", sourcePort="videos", target="compose", targetPort="videos")]))
    saves = []
    output_url = "/generated/layer-fixture.png"
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
            attempt = dict(workflowRevision=workflow["revision"], runId="fixture-run", runStatus="completed", nodeRun=dict(id="fixture-image", runId="fixture-run", nodeId="image", nodeType="utility.image-transform", attempt=1, status="completed", inputs={}, outputs=dict(images=dict(kind="images", items=[dict(url=output_url)])), createdAt=NOW, updatedAt=NOW))
            payload = dict(runs=[], latestNodeAttempts=[], latestSuccessfulNodeRuns=[attempt])
        elif endpoint == "/api/canvas/schedules": payload = dict(schedules=[])
        elif endpoint == "/api/canvas/layer-compose/inspect":
            body = request.post_data_json
            assert body["url"] in ["/generated/layer-fixture.png", "/generated/layer-fixture-next.png", "/generated/layer-fixture.mp4"]
            payload = dict(width=200, height=100, hasAudio=body["kind"] == "video", durationSeconds=2 if body["kind"] == "video" else None)
        else:
            assert request.method == "GET", endpoint
            payload = {}
        await route.fulfill(status=200, json=payload)
    await page.route("**/api/**", handler)
    await page.route("**/generated/layer-fixture*.png", lambda route: route.fulfill(status=200, body=png(), content_type="image/png"))
    await page.route("**/generated/layer-fixture.mp4", lambda route: route.fulfill(status=200, body=video_bytes, content_type="video/mp4"))
    await page.goto(f"{BASE_URL}/canvas?workflowId=layers", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="compose"]')
    await expect(node).to_be_visible()
    await page.locator(".react-flow__controls-fitview").click()
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    dialog = page.get_by_role("dialog", name="图层合成编辑器")
    await expect(dialog).to_be_visible()
    await assert_theme_contrast(dialog)
    # Portals must follow changes while already open, not only at first mount.
    for active_theme in ["professional", "editorial", "creator", theme]:
        await page.evaluate("theme => { localStorage.setItem('fluxpost-theme', theme); document.documentElement.dataset.theme = theme; window.dispatchEvent(new Event('fluxpost-theme-change')); }", active_theme)
        await assert_theme_contrast(dialog)
    assert await dialog.locator(".layer-board").evaluate("el => getComputedStyle(el).backgroundColor") == "rgb(255, 255, 255)"
    await page.screenshot(path=f"test-artifacts/canvas-layer-compose-theme-{theme}-{width}.png", full_page=True)
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
    await page.screenshot(path=f"test-artifacts/canvas-layer-compose-{theme}-{width}.png", full_page=True)
    await dialog.get_by_role("button", name="应用", exact=True).click()
    await expect(dialog).to_have_count(0)
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    saved = workflow["graph"]["nodes"][0]["config"]["composition"]
    assert saved["width"] == 400 and len(saved["layers"]) == 3
    assert saved["layers"][1]["crop"]["width"] == .5
    assert saved["layers"][2]["endBehavior"] == "loop"
    assert saved["layers"][1]["source"]["binding"] == dict(nodeId="image", port="images")
    assert saved["layers"][2]["source"]["binding"] == dict(nodeId="video", port="videos")
    assert workflow["graph"]["nodes"][0]["position"] == dict(x=40, y=40)
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    await expect(dialog.get_by_label("画布宽度", exact=True)).to_be_enabled()
    await dialog.get_by_label("画布宽度", exact=True).fill("800")
    await dialog.get_by_role("button", name="取消", exact=True).click()
    # Simulate a new successful upstream render without changing the layer config.
    output_url = "/generated/layer-fixture-next.png"
    await page.reload(wait_until="networkidle")
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    await expect(dialog.get_by_label("画布宽度", exact=True)).to_have_value("400")
    await expect(dialog.get_by_label("画布宽度", exact=True)).to_be_enabled()
    await expect(dialog.locator('.layer-board img[alt="前景"]')).to_have_attribute("src", output_url)
    await expect(dialog.get_by_role("button", name="应用", exact=True)).to_be_enabled()
    assert workflow["graph"]["nodes"][0]["config"]["composition"] == saved
    # Explicit replacement upgrades an old URL-only layer and preserves its crop.
    await dialog.get_by_role("button", name="取消", exact=True).click()
    del workflow["graph"]["nodes"][0]["config"]["composition"]["layers"][1]["source"]["binding"]
    await page.reload(wait_until="networkidle")
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    await expect(dialog.get_by_role("button", name="应用", exact=True)).to_be_disabled()
    await dialog.get_by_role("button", name="前景", exact=True).click()
    await dialog.locator(".layer-asset").first.get_by_role("button", name="替换", exact=True).click()
    await expect(dialog.get_by_role("button", name="应用", exact=True)).to_be_enabled()
    await dialog.get_by_role("button", name="应用", exact=True).click()
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    rebound = workflow["graph"]["nodes"][0]["config"]["composition"]["layers"][1]
    assert rebound["source"]["binding"] == dict(nodeId="image", port="images")
    assert rebound["crop"]["width"] == .5
    await page.keyboard.press("Escape")
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    assert not errors, errors
    assert saves
    await page.close()
    print(json.dumps(dict(width=width, theme=theme, saves=len(saves), result="passed")), flush=True)

async def check_loading(browser, width, video_bytes):
    page = await browser.new_page(viewport=dict(width=width, height=960))
    errors, requests, pending = [], [], []
    arrived = [asyncio.Event() for _ in range(3)]
    page.on("pageerror", lambda error: errors.append(str(error)))
    slow_url, bad_url, uploaded_url = [f"/generated/loading-{name}.mp4" for name in ["slow", "bad", "uploaded"]]
    config = dict(protocolVersion=1, width=1080, height=1920, background="#ffffff", durationMode="longest", durationSeconds=10, audioLayerId=None, layers=[layer()])
    workflow = dict(id="loading", name="Loading fixture", revision=1, ownerUserId="owner", ownerDisplayName="Fixture", isTemplate=False, createdAt=NOW, updatedAt=NOW,
        graph=dict(viewport=dict(x=0, y=0, zoom=1), nodes=[
            dict(id="compose", type="utility.layer-compose", version=1, config=dict(composition=config), position=dict(x=40, y=40)),
            dict(id="videos", type="input.videos", version=1, config=dict(urls=[slow_url, bad_url]), position=dict(x=-300, y=40)),
            dict(id="upload", type="input.video-loader", version=1, config=dict(selectedVideoId="uploaded", videos=[dict(id="uploaded", filename="uploaded.mp4", url=uploaded_url, mimeType="video/mp4", bytes=len(video_bytes), width=200, height=100, durationSeconds=2, hasAudio=False, uploadedAt=NOW)]), position=dict(x=-300, y=300))
        ], edges=[dict(id="e1", source="videos", sourcePort="videos", target="compose", targetPort="videos"), dict(id="e2", source="upload", sourcePort="videos", target="compose", targetPort="videos")]))
    async def handler(route):
        nonlocal workflow
        endpoint = urlparse(route.request.url).path
        if endpoint == "/api/canvas/workflows": payload = dict(workflows=[workflow])
        elif endpoint == "/api/canvas/workflows/loading":
            if route.request.method == "PATCH": workflow = {**workflow, **route.request.post_data_json, "revision": workflow["revision"] + 1}
            payload = dict(workflow=workflow)
        elif endpoint == "/api/canvas/runs":
            assert route.request.method == "GET"
            payload = dict(runs=[], latestNodeAttempts=[], latestSuccessfulNodeRuns=[])
        elif endpoint == "/api/canvas/schedules": payload = dict(schedules=[])
        elif endpoint == "/api/canvas/layer-compose/inspect":
            url = route.request.post_data_json["url"]
            requests.append(url)
            assert url != uploaded_url, "complete uploaded metadata must not be inspected"
            if url == slow_url:
                event = asyncio.Event()
                pending.append(event)
                arrived[len(pending) - 1].set()
                await event.wait()
            if url == bad_url and requests.count(bad_url) == 1:
                await route.fulfill(status=400, json=dict(error="Fixture unreadable"))
                return
            payload = dict(width=200, height=100, durationSeconds=2, hasAudio=True)
        else:
            assert route.request.method == "GET", endpoint
            payload = {}
        await route.fulfill(status=200, json=payload)
    await page.route("**/api/**", handler)
    await page.route("**/generated/loading-*.mp4", lambda route: route.fulfill(status=200, body=video_bytes, content_type="video/mp4"))
    await page.goto(f"{BASE_URL}/canvas?workflowId=loading", wait_until="networkidle")
    node = page.locator('.react-flow__node[data-id="compose"]')
    await page.locator(".react-flow__controls-fitview").click()
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    dialog = page.get_by_role("dialog", name="图层合成编辑器")
    await dialog.get_by_label("添加素材 3", exact=True).click()
    await expect(dialog.locator(".layer-board video")).to_have_attribute("preload", "metadata")
    await expect(dialog.get_by_label("声音来源").locator("option").last).to_contain_text("无音轨")
    assert not requests
    await dialog.get_by_role("button", name="应用", exact=True).click()
    await page.wait_for_function("!document.querySelector('.canvas-message .is-dirty')")
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    await expect(dialog.locator(".layer-board video")).to_be_visible()
    assert not requests, "reopening reuses upload snapshot"

    await dialog.get_by_label("添加素材 1", exact=True).click()
    await expect(dialog.locator(".layer-asset").nth(0).get_by_role("status")).to_be_visible()
    await asyncio.wait_for(arrived[0].wait(), timeout=5)
    await dialog.get_by_label("图层名称", exact=True).fill("加载中编辑")
    await dialog.get_by_label("图层 X", exact=True).fill("123")
    await dialog.get_by_label("复制图层", exact=True).click()
    await dialog.get_by_label("删除图层", exact=True).click()
    assert requests.count(slow_url) == 1, "duplicate layer must not duplicate inspection"
    await dialog.get_by_label("添加素材 2", exact=True).click()
    await expect(dialog.get_by_label("重试素材 2", exact=True)).to_be_visible()
    await dialog.get_by_label("重试素材 2", exact=True).click()
    await expect(dialog.get_by_label("重试素材 2", exact=True)).to_have_count(0)
    await expect(dialog.locator(".layer-board video")).to_have_count(2)
    assert requests.count(bad_url) == 2
    await dialog.get_by_role("button", name="加载中编辑", exact=True).click()
    await expect(dialog.get_by_label("图层 X", exact=True)).to_have_value("123")
    pending[0].set()
    await expect(dialog.locator(".layer-board video")).to_have_count(3)
    await expect(dialog.get_by_label("图层 X", exact=True)).to_have_value("123")
    await dialog.get_by_label("撤销图层编辑", exact=True).click()
    await expect(dialog.locator(".layer-list > div")).to_have_count(3)
    await dialog.get_by_label("重做图层编辑", exact=True).click()
    await expect(dialog.locator(".layer-list > div")).to_have_count(4)
    await page.screenshot(path=f"test-artifacts/canvas-layer-loading-{width}.png", full_page=True)
    await dialog.get_by_role("button", name="取消", exact=True).click()

    # Close with work in flight, then open a fresh draft; the old response must not populate it.
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    await dialog.get_by_label("添加素材 1", exact=True).click()
    await expect(dialog.locator(".layer-asset").nth(0).get_by_role("status")).to_be_visible()
    await asyncio.wait_for(arrived[1].wait(), timeout=5)
    await dialog.get_by_role("button", name="取消", exact=True).click()
    await node.get_by_role("button", name="编辑图层", exact=True).click()
    await dialog.get_by_label("添加素材 1", exact=True).click()
    await asyncio.wait_for(arrived[2].wait(), timeout=5)
    pending[1].set()
    await dialog.get_by_label("图层 X", exact=True).fill("321")
    await expect(dialog.locator(".layer-asset").nth(0).get_by_role("status")).to_be_visible()
    pending[2].set()
    await expect(dialog.locator(".layer-board video")).to_have_count(2)
    await expect(dialog.get_by_label("图层 X", exact=True)).to_have_value("321")
    assert not await dialog.evaluate("el => el.scrollWidth > el.clientWidth + 1")
    await dialog.get_by_role("button", name="取消", exact=True).click()
    assert not errors, errors
    await page.close()
    print(json.dumps(dict(width=width, loading="passed", inspections=len(requests))), flush=True)

async def main():
    with tempfile.TemporaryDirectory(prefix="fluxpost-layer-browser-") as temp:
        video = Path(temp) / "video.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=blue:s=200x100:r=30:d=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(video)], check=True)
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(channel="chrome", headless=True)
            try:
                Path("test-artifacts").mkdir(exist_ok=True)
                for theme in ["creator", "professional", "editorial"]:
                    for width in [1440, 390]: await check(browser, width, video.read_bytes(), theme)
                for width in [1440, 390]: await check_loading(browser, width, video.read_bytes())
            except Exception:
                Path("test-artifacts").mkdir(exist_ok=True)
                for context in browser.contexts:
                    for page in context.pages: await page.screenshot(path="test-artifacts/canvas-layer-compose-failure.png", full_page=True)
                raise
            finally: await browser.close()

if __name__ == "__main__": asyncio.run(main())
