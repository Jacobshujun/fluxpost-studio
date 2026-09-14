import asyncio
import base64
import copy
import json
import os
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("127.0.0.1", "localhost") and urlparse(BASE).port != 3001
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")

def post(i):
    return dict(id=f"p-{i}", ownerUserId="tester", ownerDisplayName="Tester", sourceItemId=f"s-{i}",
                title=f"Post {i}", body=f"Body {i}", imagePrompt="Image prompt", imageUrls=["/generated/fixture.png"],
                materialPaths=[], aiNotes=[], status="draft", platform="xiaohongshu", updatedAt="2026-09-14T10:00:00.000Z", createdAt="2026-09-14T10:00:00.000Z")

def summary(p):
    return dict(id=p["id"], title=p["title"], excerpt=p["body"], status=p["status"], platform=p["platform"], updatedAt=p["updatedAt"], author="Tester", mediaCount=len(p["imageUrls"]), thumbnailVersion="fixture" if p["imageUrls"] else None)

async def check(browser, width, total):
    page = await browser.new_page(viewport={"width": width, "height": 960})
    posts = {f"p-{i}": post(i) for i in range(total)}
    requests, errors, timings = [], [], []
    hold_save, release_save = asyncio.Event(), asyncio.Event()
    hold_detail, release_detail = asyncio.Event(), asyncio.Event()
    hold_list, release_list = asyncio.Event(), asyncio.Event()
    controls = dict(save=False, fail=False, detail="", query="", thumbnail_fail=False)
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def handler(route):
        req = route.request
        parsed = urlparse(req.url)
        path, query = parsed.path, parse_qs(parsed.query)
        requests.append((req.method, path, req.post_data_json if req.method == "POST" and path != "/api/review/images" else None))
        if path.endswith("/thumbnail") or path.startswith("/generated/"):
            if controls["thumbnail_fail"]:
                await route.fulfill(status=502, json={"error": "Fixture image failed"})
            else:
                await route.fulfill(status=200, content_type="image/png", body=PNG)
            return
        if path == "/api/review/posts/metadata":
            await route.fulfill(json=dict(summary=dict(total=total, ready=total, approved=0, published=0), authors=["Tester"], platforms=["xiaohongshu"]))
        elif path == "/api/review/posts":
            q = query.get("q", [""])[0]
            if controls["query"] == q and q:
                controls["query"] = ""
                hold_list.set()
                await release_list.wait()
            rows = [summary(p) for p in posts.values() if q.lower() in (p["title"]+p["body"]).lower()]
            status = query.get("status", ["ready"])[0]
            if status not in ("ready", "all"):
                rows = [p for p in rows if p["status"] == status]
            start = int(query.get("cursor", ["0"])[0])
            await route.fulfill(json=dict(posts=rows[start:start+50], nextCursor=str(start+50) if len(rows)>start+50 else None))
        elif path.startswith("/api/review/posts/"):
            key = path.rsplit("/", 1)[1]
            if controls["detail"] == key:
                controls["detail"] = ""
                hold_detail.set()
                await release_detail.wait()
            await route.fulfill(json={"post": posts[key]})
        elif path == "/api/review" and req.method == "POST":
            body = req.post_data_json
            assert "post" not in body, "Save must not upload full post"
            saved = {**posts[body["postId"]], **body.get("manualPatch", {})}
            if controls["save"]:
                controls["save"] = False
                hold_save.set()
                await release_save.wait()
            if controls["fail"]:
                controls["fail"] = False
                await route.fulfill(status=500, json={"error": "Fixture save failed"})
            else:
                posts[saved["id"]] = copy.deepcopy(saved)
                await route.fulfill(json={"post": saved, "item": summary(saved)})
        elif path == "/api/publish/feishu" and req.method == "POST":
            assert len(req.post_data_json["postIds"]) >= 2
            await route.fulfill(json={"status": "queued", "message": "Fixture queued"})
        elif path == "/api/publish/feishu/vehicle-options":
            await route.fulfill(json={"options": [], "fieldName": "车型"})
        elif path == "/api/review/images":
            await route.fulfill(json={"imageUrl": "/generated/replaced.png", "bytes": 100, "mimeType": "image/png"})
        else:
            assert req.method == "GET", f"Unexpected mutation: {req.method} {path}"
            await route.fulfill(json={})

    await page.route("**/api/**", handler)
    await page.route("**/generated/**", handler)
    await page.goto(f"{BASE}/review", wait_until="networkidle")
    title = page.locator(".review-editor-fields input")
    body = page.locator(".review-body-editor")
    save = page.get_by_role("button", name="保存修改", exact=True)
    approve = page.get_by_role("button", name="审查通过", exact=True)
    cards = page.locator(".review-list-card")
    try:
        await expect(title).to_have_value("Post 0")
    except AssertionError:
        print(json.dumps({"errors":errors,"requests":requests}),flush=True)
        raise
    await expect(cards).to_have_count(50)
    assert sum(path == "/api/review/posts/p-0" for _, path, _ in requests) == 1
    await body.scroll_into_view_if_needed()
    await page.wait_for_load_state("networkidle")
    before = len(requests)
    # Measure browser handler-to-next-frame time independently from Playwright IPC.
    await page.evaluate("""() => {
      window.reviewInputTimes=[];
      window.reviewClickTimes=[];
      window.reviewMediaMutations=0;
      const observer=new MutationObserver(records=>window.reviewMediaMutations+=records.length);
      observer.observe(document.querySelector('.review-gallery'), {subtree:true,childList:true,attributes:true});
      document.querySelectorAll('.review-action-strip button').forEach(button=>button.addEventListener('click',()=>{
        const start=performance.now();requestAnimationFrame(()=>window.reviewClickTimes.push(performance.now()-start));
      }));
      document.querySelector('.review-body-editor').addEventListener('input', () => {
        const start=performance.now(); requestAnimationFrame(()=>window.reviewInputTimes.push(performance.now()-start));
      });
    }""")
    for i in range(20):
        await body.fill(f"Changed body {i}")
    await page.wait_for_timeout(100)
    unexpected = [path for _, path, _ in requests[before:] if not path.endswith("/thumbnail")]
    assert not unexpected, f"Typing triggered data requests: {unexpected}"
    timings = await page.evaluate("window.reviewInputTimes")
    assert await page.evaluate("window.reviewMediaMutations") == 0, "Typing changed the media region"
    assert sorted(timings)[int(len(timings)*.95)-1] <= 100, timings
    controls["save"] = True
    await save.click()
    await asyncio.wait_for(hold_save.wait(), 5)
    await expect(save).to_be_disabled()
    await body.fill("Typed while saving")
    release_save.set()
    await expect(save).to_be_enabled()
    await expect(body).to_have_value("Typed while saving")
    assert posts["p-0"]["body"] == "Changed body 19"
    await save.click()
    await expect(save).to_be_enabled()
    await expect(body).to_have_value("Typed while saving")
    controls["fail"] = True
    await body.fill("Preserve failed edit")
    await save.click()
    await expect(page.get_by_text("Fixture save failed", exact=True)).to_be_visible()
    await expect(body).to_have_value("Preserve failed edit")
    await approve.click()
    await expect(approve).to_be_enabled()
    await expect(title).to_have_value("Post 0")
    assert "postId=p-0" in page.url
    assert posts["p-0"]["status"] == "approved"
    click_times = await page.evaluate("window.reviewClickTimes")
    assert sorted(click_times)[int(len(click_times)*.95)-1] <= 100, click_times
    # Hold older detail, choose a different post, then release it.
    controls["detail"] = "p-1"
    await cards.nth(1).locator("button").click()
    await asyncio.wait_for(hold_detail.wait(), 5)
    await cards.nth(2).locator("button").click()
    await expect(title).to_have_value("Post 2")
    release_detail.set()
    await page.wait_for_timeout(100)
    await expect(title).to_have_value("Post 2")
    hold_save.clear()
    release_save.clear()
    controls["save"] = True
    await body.fill("Save then switch")
    await save.click()
    await asyncio.wait_for(hold_save.wait(), 5)
    await cards.nth(3).locator("button").click()
    await expect(title).to_have_value("Post 3")
    release_save.set()
    await expect(save).to_be_enabled()
    await expect(title).to_have_value("Post 3")
    await cards.nth(2).locator("button").click()
    await expect(body).to_have_value("Save then switch")
    # Cross-page selection and a publish submission use all IDs, without detail fanout.
    await cards.nth(0).locator("label").click()
    await page.get_by_role("button", name="下一页", exact=True).click()
    await expect(cards.first).to_contain_text("Post 50")
    await cards.nth(0).locator("label").click()
    await page.get_by_role("button", name="批量写入飞书", exact=True).click()
    await expect(page.get_by_text("Fixture queued", exact=True).first).to_be_visible()
    payloads = [payload for method,path,payload in requests if method=="POST" and path=="/api/publish/feishu"]
    assert set(payloads[-1]["postIds"]) == {"p-0","p-50"}
    await page.get_by_role("button", name="上一页", exact=True).click()
    await expect(cards.first).to_contain_text("Post 0")
    await expect(cards.first.locator("input")).to_be_checked()
    # Filter reset and stale list response.
    search = page.locator(".review-search input")
    controls["query"] = "Post 1"
    await search.fill("Post 1")
    await asyncio.wait_for(hold_list.wait(), 5)
    await search.fill("Post 9")
    await expect(cards.first).to_contain_text("Post 9")
    release_list.set()
    await page.wait_for_timeout(100)
    await expect(cards.first).to_contain_text("Post 9")
    await expect(page.locator('.review-publish-panel > div').first).to_contain_text("0 已选")
    await page.reload(wait_until="networkidle")
    await expect(search).to_have_value("Post 9")
    await expect(title).to_have_value("Post 2")
    # Unsaved replacement uses preview URL; saved replacement uses thumbnail route.
    await page.locator('.review-gallery input[type="file"]').first.set_input_files({"name":"test.png", "mimeType":"image/png", "buffer":PNG})
    await expect(page.locator('.review-gallery-preview img').first).to_have_attribute("src", "/generated/replaced.png?v=20260605-image-format-v2")
    await save.click()
    await expect(save).to_be_enabled()
    await expect(page.locator('.review-gallery-preview img').first).to_have_attribute("src", __import__('re').compile("/api/review/posts/p-2/thumbnail"))
    await body.fill("Keep same-post edit")
    await search.fill("")
    await expect(cards.first).to_contain_text("Post 0")
    await cards.nth(2).locator("button").click()
    await expect(body).to_have_value("Keep same-post edit")
    await page.get_by_role("button", name="全选本页", exact=True).click()
    for _ in range(4):
        await page.get_by_role("button", name="下一页", exact=True).click()
        await expect(page.get_by_role("button", name="下一页", exact=True)).to_be_enabled()
        await page.get_by_role("button", name="全选本页", exact=True).click()
    await expect(page.locator('.review-publish-panel > div').first).to_contain_text("200 已选")
    await page.get_by_role("button", name="清空", exact=True).click()
    controls["thumbnail_fail"] = True
    chosen_title = await cards.first.locator("p").first.inner_text()
    await cards.first.locator("button").click()
    await expect(title).to_have_value(chosen_title)
    await page.locator('.review-gallery').scroll_into_view_if_needed()
    await expect(page.locator('.review-gallery').get_by_text("图片加载失败", exact=True)).to_be_visible()
    controls["thumbnail_fail"] = False
    await page.reload(wait_until="networkidle")
    await page.locator('.review-gallery-preview img').first.scroll_into_view_if_needed()
    await expect(page.locator('.review-gallery-preview img').first).to_be_visible()
    assert await page.locator('.review-gallery-preview img').first.evaluate("img=>img.complete && img.naturalWidth > 0")
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Horizontal overflow"
    os.makedirs("test-artifacts/review-performance", exist_ok=True)
    await page.screenshot(path=f"test-artifacts/review-performance/review-{width}.png", full_page=True)
    assert not errors, errors
    assert not any(path=="/api/production/posts" for _,path,_ in requests)
    print(json.dumps({"width":width,"fixturePosts":total,"inputP95Ms":round(sorted(timings)[int(len(timings)*.95)-1],2),"clickP95Ms":round(sorted(click_times)[int(len(click_times)*.95)-1],2),"result":"passed"}),flush=True)
    await page.close()

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome",headless=True)
        try:
            await check(browser,1440,1000)
            await check(browser,390,10000)
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
