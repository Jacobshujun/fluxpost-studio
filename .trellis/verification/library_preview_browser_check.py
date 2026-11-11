"""Stable gallery transitions with held API/media, no runtime writes or external calls."""
import asyncio
import base64
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1") and urlparse(BASE).port != 3001
ART = Path("test-artifacts/library-preview")
PIXEL = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")


def make_asset(index):
    tags = dict(scenes=[], vehicleModels=[], vehicleColors=[], angles=[], people="unknown", customTags=[])
    return dict(id=f"asset-{index}", name="Front view" if index == 1 else f"Asset {index}",
                originalName=f"{index}.svg", ownerUserId="owner-1", ownerDisplayName="Fixture",
                visibility="team", canEdit=True, note="", collectionIds=[], width=1600, height=900,
                byteSize=2048, createdAt="2026-11-09T00:00:00Z", updatedAt="2026-11-09T00:00:00Z",
                taggingStatus="completed", favorite=False, aiTags=tags, effectiveTags=tags, manualOverrides={},
                thumbnailUrl=f"/api/library/assets/asset-{index}/thumbnail",
                publicUrl=f"/__gallery_original/asset-{index}")


async def check(browser, theme, width):
    page = await browser.new_page(viewport=dict(width=width, height=960 if width > 600 else 844))
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    assets = [make_asset(i) for i in range(1, 5)]
    assets[1].update(width=800, height=1600)
    page_size = 4
    detail_gate, image_gate = {}, {}
    image_started = {a["id"]: asyncio.Event() for a in assets}
    requested, failures, errors, saves = [], set(), [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def route_handler(route):
        req = route.request
        url = urlparse(req.url)
        path = url.path
        if url.netloc != urlparse(BASE).netloc:
            errors.append("External request: " + url.netloc)
            await route.abort()
            return
        if path.endswith("/thumbnail"):
            await route.fulfill(content_type="image/gif", body=PIXEL)
            return
        if path.startswith("/__gallery_original/"):
            ident = path.split("/")[-1]
            requested.append("image:" + ident)
            image_started[ident].set()
            if ident in image_gate:
                await image_gate[ident].wait()
            if ("image", ident) in failures:
                await route.fulfill(status=404, body="Missing image")
                return
            asset = next(a for a in assets if a["id"] == ident)
            w, h = asset["width"], asset["height"]
            svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><rect width="100%" height="100%" fill="#628a9b"/><rect x="8" y="8" width="{w-16}" height="{h-16}" fill="none" stroke="#f3ba50" stroke-width="16"/></svg>'
            await route.fulfill(content_type="image/svg+xml", body=svg)
            return
        if not path.startswith("/api/"):
            await route.continue_()
            return
        data = {}
        if path == "/api/accounts/session":
            data = dict(account=dict(id="owner-1", username="fixture", displayName="Fixture", role="admin"), hasAccounts=True)
        elif path == "/api/config":
            data = dict(status={})
        elif path == "/api/library/navigation":
            data = dict(collections=[], smartFolders=[], counts=dict(all=len(assets), favorites=0, uncategorized=len(assets)))
        elif path == "/api/library/assets":
            cursor = parse_qs(url.query).get("cursor", [None])[0]
            if cursor and ("page", "next") in failures:
                await route.fulfill(status=500, json=dict(error="Page unavailable"))
                return
            remaining = [a for a in assets if not cursor or int(a["id"].split("-")[-1]) > int(cursor)]
            batch = remaining[:page_size]
            data = dict(assets=batch, total=len(assets), nextCursor=batch[-1]["id"].split("-")[-1] if len(remaining) > page_size else None)
        elif path == "/api/library/assets/batch":
            body = req.post_data_json
            assert req.method == "POST" and body["action"] == "delete" and body["confirm"] is True
            assert body["selection"]["mode"] == "ids"
            ids = body["selection"]["assetIds"]
            requested.append("delete:" + ",".join(ids))
            if ("delete", ids[0]) in failures:
                data = dict(matched=1, succeeded=0, failed=1, failures=[dict(assetId=ids[0], error="Delete unavailable")])
            else:
                assets[:] = [a for a in assets if a["id"] not in ids]
                data = dict(matched=len(ids), succeeded=len(ids), failed=0, failures=[])
        elif path == "/api/library/tags":
            data = dict(tags=[])
        elif path == "/api/library/colors/jobs":
            data = dict(coverage=dict(total=4, analyzed=0, failed=0, manageableMissing=4, manageableFailed=0))
        elif path.startswith("/api/library/assets/"):
            ident = path.split("/")[-1]
            requested.append("detail:" + ident)
            asset = next(a for a in assets if a["id"] == ident)
            if req.method == "PATCH":
                saves.append((ident, req.post_data_json))
                if ("save", ident) in failures:
                    await route.fulfill(status=500, json=dict(error="Save unavailable"))
                    return
                asset.update(req.post_data_json)
            else:
                assert req.method == "GET"
                if ident in detail_gate:
                    await detail_gate[ident].wait()
                if ("detail", ident) in failures:
                    await route.fulfill(status=500, json=dict(error="Detail unavailable"))
                    return
            data = dict(asset=asset)
        else:
            assert req.method == "GET", (req.method, path)
        await route.fulfill(json=data)

    await page.route("**/*", route_handler)
    await page.goto(BASE + "/library", wait_until="networkidle")
    assert not any(r.startswith("image:") for r in requested), "Grid must use thumbnails only"
    await page.locator("article").first.get_by_role("button", name="查看 Front view", exact=True).click()
    viewer = page.get_by_role("dialog", name="图片查看", exact=True)
    heading = viewer.locator('[class*="viewerHeading"] strong')
    original = viewer.locator('[class*="imageSurface"] > img')
    await expect(heading).to_have_text("Front view")
    await expect(viewer.get_by_role("button", name="实际尺寸", exact=True)).to_be_enabled()
    await page.wait_for_function("document.querySelector('[class*=imageSurface] > img')?.naturalWidth > 0")
    if width < 640:
        await viewer.get_by_role("button", name="图片详情", exact=True).click()

    await page.evaluate("""() => {
      const dialog = document.querySelector('dialog[open]');
      window.previewProbe = {dialog, rect:dialog.getBoundingClientRect().toJSON(), calls:[], frames:[], running:true};
      for (const method of ['close','showModal']) {
        const previous = HTMLDialogElement.prototype[method];
        HTMLDialogElement.prototype[method] = function(...args) {
          if (this === dialog) window.previewProbe.calls.push(method);
          return previous.apply(this,args);
        };
      }
      function frame() {
        const p = window.previewProbe;
        const live = document.querySelector('dialog[aria-label="图片查看"]');
        const img = live?.querySelector('[class*=imageSurface] > img');
        const r = live?.getBoundingClientRect();
        p.frames.push({same:live===dialog, open:!!live?.open, width:r?.width, height:r?.height,
          ready:!!(img?.complete && img.naturalWidth), imageWidth:img?.getBoundingClientRect().width});
        if(p.running) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }""")

    detail_gate["asset-2"] = asyncio.Event()
    image_gate["asset-2"] = asyncio.Event()
    await viewer.get_by_role("button", name="下一张", exact=True).click()
    await expect(viewer.get_by_role("status")).to_have_text("正在切换图片…")
    await expect(heading).to_have_text("Front view")
    await expect(original).to_have_attribute("src", assets[0]["publicUrl"])
    await expect(viewer.get_by_label("备注", exact=True)).to_be_disabled()
    detail_gate["asset-2"].set()
    # Let the detail response reach the browser, keeping the target original blocked.
    await asyncio.wait_for(image_started["asset-2"].wait(), timeout=10)
    await expect(original).to_have_attribute("src", assets[0]["publicUrl"])
    await page.screenshot(path=str(ART / f"{theme}-{width}-pending.png"))
    image_gate["asset-2"].set()
    await expect(heading).to_have_text("Asset 2")
    await expect(viewer.get_by_role("status")).to_have_count(0)
    await expect(viewer.get_by_label("备注", exact=True)).to_be_visible()
    await page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    probe = await page.evaluate("""() => {const p=window.previewProbe;p.running=false;return {rect:p.rect,calls:p.calls,frames:p.frames}}""")
    assert not probe["calls"], probe
    assert probe["frames"] and all(f["same"] and f["open"] and f["ready"] and f["imageWidth"] > 20 and f["width"] == probe["rect"]["width"] and f["height"] == probe["rect"]["height"] for f in probe["frames"]), probe
    await page.screenshot(path=str(ART / f"{theme}-{width}-loaded.png"))

    # Detail failure, retry, original failure and explicit recovery preserve the displayed asset.
    failures.add(("detail", "asset-3"))
    await viewer.get_by_role("button", name="下一张", exact=True).click()
    await expect(viewer.get_by_role("alert")).to_contain_text("Detail unavailable")
    await expect(heading).to_have_text("Asset 2")
    failures.remove(("detail", "asset-3"))
    failures.add(("image", "asset-3"))
    await viewer.get_by_role("button", name="重试加载").click()
    await expect(viewer.get_by_role("alert")).to_contain_text("原图加载失败")
    await expect(heading).to_have_text("Asset 2")
    failures.remove(("image", "asset-3"))
    await viewer.get_by_role("button", name="重试加载").click()
    await expect(heading).to_have_text("Asset 3")

    # Return to a cached original, then exercise dirty-edit save failure/cancel/discard.
    await viewer.get_by_role("button", name="上一张", exact=True).click()
    await expect(heading).to_have_text("Asset 2")
    await viewer.get_by_label("备注", exact=True).fill("Keep my draft")
    await viewer.get_by_role("button", name="下一张", exact=True).click()
    guard = page.get_by_role("dialog", name="尚有未保存修改", exact=True)
    failures.add(("save", "asset-2"))
    await guard.get_by_role("button", name="保存后继续").click()
    await expect(guard.get_by_role("alert")).to_contain_text("Save unavailable")
    await guard.get_by_role("button", name="继续编辑").click()
    await expect(viewer.get_by_label("备注", exact=True)).to_have_value("Keep my draft")
    await viewer.get_by_role("button", name="下一张", exact=True).click()
    await guard.get_by_role("button", name="放弃修改").click()
    await expect(heading).to_have_text("Asset 3")
    await expect(viewer.get_by_label("备注", exact=True)).to_have_value("")
    await viewer.get_by_label("备注", exact=True).fill("Saved on asset 3")
    await viewer.get_by_role("button", name="上一张", exact=True).click()
    await guard.get_by_role("button", name="保存后继续").click()
    await expect(heading).to_have_text("Asset 2")
    assert saves[-1] == ("asset-3", dict(name="Asset 3", note="Saved on asset 3", visibility="team", manualOverrides={}))

    # Native history supersedes a held detail response; stale work cannot swap the image.
    detail_gate["asset-4"] = asyncio.Event()
    await viewer.get_by_role("button", name="查看 Asset 4", exact=True).click()
    await expect(viewer.get_by_role("status")).to_be_visible()
    await page.go_back()
    await expect(viewer.get_by_role("status")).to_have_count(0)
    detail_gate["asset-4"].set()
    await page.wait_for_load_state("networkidle")
    await expect(heading).to_have_text("Asset 2")
    assert "image:asset-4" not in requested

    # Cancelling during original decode also discards the prepared resource.
    image_gate["asset-4"] = asyncio.Event()
    await viewer.get_by_role("button", name="查看 Asset 4", exact=True).click()
    await asyncio.wait_for(image_started["asset-4"].wait(), timeout=10)
    await viewer.get_by_role("button", name="取消切换").click()
    image_gate["asset-4"].set()
    await page.wait_for_load_state("networkidle")
    await expect(heading).to_have_text("Asset 2")
    await expect(viewer.get_by_role("status")).to_have_count(0)

    # Keyboard focus stays inside the shell after image-specific editor replacement.
    await viewer.get_by_role("button", name="复位", exact=True).focus()
    await page.keyboard.press("ArrowLeft")
    await expect(heading).to_have_text("Front view")
    assert await viewer.evaluate("d => d.contains(document.activeElement)")
    await page.keyboard.press("ArrowRight")
    await expect(heading).to_have_text("Asset 2")
    if width < 640:
        await viewer.get_by_role("button", name="图片详情", exact=True).click()
    await viewer.get_by_role("button", name="实际尺寸", exact=True).click()
    await expect(original).to_have_css("width", "800px")
    await viewer.get_by_role("button", name="复位", exact=True).click()
    image_box = await original.bounding_box()
    stage_box = await viewer.locator('[class*="imageStage"]').bounding_box()
    assert image_box["width"] <= stage_box["width"] and image_box["height"] <= stage_box["height"]
    assert await page.evaluate("previewProbe.calls.length") == 0
    await page.keyboard.press("Escape")
    await expect(viewer).to_have_count(0)

    # Initial failure/retry uses the same full-size shell as a successful open.
    failures.add(("detail", "asset-1"))
    await page.locator("article").first.get_by_role("button", name="查看 Front view", exact=True).click()
    await expect(viewer.get_by_role("alert")).to_contain_text("Detail unavailable")
    await viewer.evaluate("d => {window.initialDialog=d;window.initialRect=d.getBoundingClientRect().toJSON()}")
    failures.remove(("detail", "asset-1"))
    await viewer.get_by_role("button", name="重试加载").click()
    await expect(heading).to_have_text("Front view")
    assert await viewer.evaluate("d => d===initialDialog && d.getBoundingClientRect().width===initialRect.width && d.getBoundingClientRect().height===initialRect.height")
    detail_gate["asset-2"] = asyncio.Event()
    await viewer.get_by_role("button", name="下一张", exact=True).click()
    await expect(viewer.get_by_role("status")).to_be_visible()
    await page.keyboard.press("Escape")
    detail_gate["asset-2"].set()
    await page.wait_for_load_state("networkidle")
    await expect(viewer).to_have_count(0)

    # Button/key deletion retains the same native dialog, including cursor pages.
    for paged in (False, True):
        assets[:] = [make_asset(i) for i in range(1, 5)]
        page_size = 2 if paged else 4
        detail_gate.clear()
        image_gate.clear()
        failures.clear()
        await page.goto(BASE + "/library?asset=asset-2", wait_until="networkidle")
        await expect(heading).to_have_text("Asset 2")
        await viewer.evaluate("d => window.deleteDialog = d")
        if width < 640:
            await viewer.get_by_role("button", name="图片详情", exact=True).click()
        confirm = page.get_by_role("dialog", name="永久删除图片", exact=True)
        delete_count = lambda: sum(r.startswith("delete:") for r in requested)
        before = delete_count()
        if paged:
            failures.add(("page", "next"))
            await viewer.get_by_role("button", name="永久删除", exact=True).click()
            await expect(viewer.get_by_role("alert")).to_contain_text("Page unavailable")
            await expect(confirm).to_have_count(0)
            assert delete_count() == before
            failures.clear()
        await viewer.get_by_role("button", name="永久删除", exact=True).click()
        await expect(confirm).to_be_visible()
        await confirm.get_by_role("button", name="取消", exact=True).click()
        assert delete_count() == before
        await expect(heading).to_have_text("Asset 2")
        await viewer.locator('[class*="viewerHeading"] strong').click()
        await page.keyboard.press("Delete")
        failures.add(("delete", "asset-2"))
        await confirm.get_by_role("button", name="确认删除", exact=True).click()
        await expect(confirm.get_by_role("alert")).to_have_text("Delete unavailable")
        await expect(heading).to_have_text("Asset 2")
        assert await viewer.evaluate("d => d === deleteDialog && d.open")
        failures.clear()
        detail_gate["asset-3"] = asyncio.Event()
        await confirm.get_by_role("button", name="确认删除", exact=True).click()
        await expect(confirm).to_have_count(0)
        await expect(viewer.get_by_role("status")).to_be_visible()
        assert await viewer.evaluate("d => d === deleteDialog && d.open")
        detail_gate["asset-3"].set()
        await expect(heading).to_have_text("Asset 3")
        await expect(original).to_have_attribute("alt", "Asset 3")
        assert "asset=asset-3" in page.url
        # Repeated keyboard deletion advances, then falls back to the previous.
        for expected in ("Asset 4", "Front view"):
            await page.keyboard.press("Delete")
            await confirm.get_by_role("button", name="确认删除", exact=True).click()
            await expect(confirm).to_have_count(0)
            await expect(heading).to_have_text(expected)
            assert await viewer.evaluate("d => d === deleteDialog && d.open")
        await page.keyboard.press("Delete")
        await confirm.get_by_role("button", name="确认删除", exact=True).click()
        await expect(confirm).to_have_count(0)
        await expect(viewer).to_have_count(0)
        await expect(page.locator("article")).to_have_count(0)
        assert "asset=" not in page.url
        assert not assets
    assert not errors, errors
    await page.close()
    print(f"Gallery preview passed: {theme} {width}; {len(probe['frames'])} continuous frames", flush=True)


async def main():
    ART.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for theme in ("professional", "editorial", "creator"):
            for width in (1440, 390):
                await check(browser, theme, width)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
