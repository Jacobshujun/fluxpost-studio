import asyncio
import copy
import json
import os
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect
from review_performance_browser_check import PNG, post, summary

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("127.0.0.1", "localhost") and urlparse(BASE).port != 3001
ARTIFACTS = Path("test-artifacts/review-usability")


def boxes_overlap(a, b):
    return not (
        a["x"] + a["width"] <= b["x"]
        or b["x"] + b["width"] <= a["x"]
        or a["y"] + a["height"] <= b["y"]
        or b["y"] + b["height"] <= a["y"]
    )


async def fixture(browser, width, height, theme, image_count=4, video_count=0):
    page = await browser.new_page(viewport={"width": width, "height": height})
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    posts = {f"p-{i}": post(i) for i in range(80)}
    images = ["/generated/same.png", "/generated/same.png", "/generated/third.png", "/generated/fourth.png"]
    prompts = ["first", "second", "third", "fourth"]
    images += [f"/generated/extra-{i}.png" for i in range(4, image_count)]
    prompts += [f"prompt {i}" for i in range(4, image_count)]
    posts["p-0"].update(imageUrls=images[:image_count], imagePrompts=prompts[:image_count])
    if video_count:
        posts["p-0"]["videoUrls"] = [f"/generated/video-{i}.mp4" for i in range(video_count)]
    cards = [dict(id=f"card-{i}", index=i, role="cover" if i == 0 else "content", prompt=f"card prompt {i}", imageUrl=f"/generated/card-{i}.png" if i != 1 else None, candidateUrls=[f"/generated/card-{i}.png", f"/generated/candidate-{i}.png"], status="completed" if i != 1 else "failed", qa=dict(status="passed", attempts=1, issues=[])) for i in range(3)]
    posts["p-1"].update(xhsSeries=dict(schemaVersion=1, cards=cards), imageUrls=[c["imageUrl"] for c in cards if c["imageUrl"]])
    queries, errors, saves = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def handler(route):
        request = route.request
        parsed = urlparse(request.url)
        path, query = parsed.path, parse_qs(parsed.query)
        if path.endswith("/thumbnail") or path.startswith("/generated/"):
            await route.fulfill(status=200, content_type="image/png", body=PNG)
        elif path == "/api/review/posts/metadata":
            await route.fulfill(json=dict(summary=dict(total=80, ready=80, approved=0, published=0), authors=["Tester"], platforms=["xiaohongshu"], vehicles=["G7", "G7i", "G9"]))
        elif path == "/api/review/posts":
            filters = json.loads(query["filters"][0])
            queries.append(filters)
            search = filters["search"]["value"]
            rows = [summary(p) for p in posts.values() if search.lower() in (p["title"] + p["body"]).lower()]
            start = int(query.get("cursor", ["0"])[0])
            await route.fulfill(json=dict(posts=rows[start:start+50], nextCursor=str(start+50) if start+50 < len(rows) else None))
        elif path.startswith("/api/review/posts/"):
            await route.fulfill(json={"post": posts[path.rsplit("/", 1)[1]]})
        elif path == "/api/review" and request.method == "POST":
            body = request.post_data_json
            saves.append(copy.deepcopy(body))
            saved = {**posts[body["postId"]], **body.get("manualPatch", {})}
            posts[saved["id"]] = copy.deepcopy(saved)
            await route.fulfill(json=dict(post=saved, item=summary(saved)))
        elif path == "/api/review/images":
            await asyncio.sleep(.4)
            await route.fulfill(json=dict(imageUrl="/generated/replaced.png", bytes=100, mimeType="image/png"))
        elif path == "/api/original/cards/regenerate":
            body = request.post_data_json
            saved = copy.deepcopy(posts[body["postId"]])
            for card in saved["xhsSeries"]["cards"]:
                if card["id"] == body["cardId"]:
                    card.update(imageUrl="/generated/regenerated.png", status="completed")
            saved["imageUrls"] = [c["imageUrl"] for c in saved["xhsSeries"]["cards"] if c["imageUrl"]]
            posts[saved["id"]] = saved
            await route.fulfill(json=dict(post=saved, item=summary(saved)))
        else:
            assert request.method == "GET", f"Unexpected mutation: {path}"
            await route.fulfill(json={})

    await page.route("**/api/**", handler)
    await page.route("**/generated/**", handler)
    await page.goto(f"{BASE}/review", wait_until="networkidle")
    await expect(page.locator(".review-list-card")).to_have_count(50)
    await expect(page.locator(".review-editor-fields input").first).to_have_value("Post 0")
    return page, posts, queries, errors, saves


async def layout(browser, width, height, theme):
    page, _, _, errors, _ = await fixture(browser, width, height, theme)
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, height, theme)
    gallery = page.locator(".review-gallery")
    tracks = await gallery.evaluate("el => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length")
    image_ratios = await page.locator(".review-gallery-tile:not(.review-video-tile) .review-gallery-preview").evaluate_all("els => els.map(e => getComputedStyle(e).aspectRatio)")
    assert image_ratios and all(ratio.replace(" ", "") == "3/4" for ratio in image_ratios), (width, height, theme, image_ratios)
    primary_ratio = await page.locator(".review-order-item-primary .review-gallery-preview").first.evaluate("e => getComputedStyle(e).aspectRatio")
    assert primary_ratio.replace(" ", "") == "3/4", (width, height, theme, primary_ratio)
    if width >= 960:
        assert tracks >= 2, (width, height, theme, tracks)
        primary_item = await page.locator(".review-order-item-primary").first.bounding_box()
        next_item = await page.locator(".review-order-item").nth(1).bounding_box()
        assert abs(primary_item["width"] - next_item["width"]) <= 1, (width, height, theme, primary_item, next_item)
        index_box = await page.locator(".review-gallery-index").first.bounding_box()
        tools_box = await page.locator(".review-gallery-tools").first.bounding_box()
        assert not boxes_overlap(index_box, tools_box), (width, height, theme, index_box, tools_box)
    prompt_height = await page.locator(".review-image-prompt").first.evaluate("e => e.getBoundingClientRect().height")
    assert prompt_height <= 56, (width, height, theme, prompt_height)
    if (width, height) in [(1280, 720), (1440, 900), (1512, 982), (1920, 900), (1440, 1000), (1280, 1024), (1600, 1000), (1920, 1080)]:
        required = 2 if (width, height) == (1280, 720) else 4
        visible = await gallery.evaluate("""el => {
          const viewport = el.getBoundingClientRect();
          return Array.from(el.querySelectorAll('.review-gallery-tile')).filter(tile => {
            const rect = tile.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom + 1;
          }).length;
        }""")
        assert visible >= required, (width, height, theme, visible)
    if width >= 960 and height >= 650:
        card = await page.locator(".review-list-card").first.bounding_box()
        assert card["y"] >= 0 and card["y"] + card["height"] <= height, card
        pane = page.locator(".review-list")
        await pane.hover()
        await page.mouse.wheel(0, 700)
        await page.wait_for_timeout(150)
        assert await pane.evaluate("e => e.scrollTop > 0"), (width, height)
        assert await page.evaluate("scrollY") == 0
    else:
        assert await page.evaluate("document.documentElement.scrollHeight > innerHeight")
    await page.locator(".review-ai-box summary").click()
    await page.locator(".review-ai-content textarea").fill("Fixture only; never submit AI")
    await page.get_by_role("button", name="保存修改", exact=True).scroll_into_view_if_needed()
    await expect(page.get_by_role("button", name="保存修改", exact=True)).to_be_in_viewport()
    await page.get_by_role("button", name="筛选条件", exact=True).click()
    await expect(page.locator(".review-filter-dialog")).to_be_visible()
    assert await page.locator(".review-filter-dialog").evaluate("e => e.scrollWidth <= e.clientWidth")
    await page.keyboard.press("Escape")
    await expect(page.get_by_role("button", name="筛选条件", exact=True)).to_be_focused()
    if width < 1600:
        await page.locator(".review-batch-trigger").click()
        await expect(page.get_by_role("button", name="关闭批量操作")).to_be_visible()
        await page.get_by_role("button", name="关闭批量操作").click()
    if (width, height) in [(1280, 720), (1440, 900), (390, 844), (1920, 1080)]:
        await page.screenshot(path=str(ARTIFACTS / f"{theme}-{width}-{height}.png"))
    assert not errors, errors
    await page.close()


async def interactions(browser):
    page, posts, queries, errors, saves = await fixture(browser, 1440, 800, "professional")
    prompts = page.locator(".review-image-prompt")
    await expect(prompts.first).to_have_value("first")
    # Idle prompt is compact and expands on focus without new state.
    await prompts.first.focus()
    await page.wait_for_function("document.querySelector('.review-image-prompt').getBoundingClientRect().height > 100")
    await page.locator(".review-editor-fields input").first.focus()
    await page.wait_for_function("document.querySelector('.review-image-prompt').getBoundingClientRect().height <= 56")
    # Drag, up, down and delete share one overlay group on the image.
    tool_labels = await page.locator(".review-gallery-tools").first.locator("button").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    assert tool_labels == ["拖动配图 1", "上移配图", "下移配图", "删除配图"], tool_labels
    # Native handle drag is insertion across the multi-column grid, including duplicate URLs.
    handle_box = await page.get_by_role("button", name="拖动配图 1", exact=True).bounding_box()
    target_box = await page.locator(".review-order-item").nth(2).bounding_box()
    await page.mouse.move(handle_box["x"] + 10, handle_box["y"] + 10)
    await page.mouse.down()
    await page.mouse.move(handle_box["x"] + 30, handle_box["y"] + 30, steps=10)
    await page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + target_box["height"] / 2, steps=10)
    await page.mouse.up()
    await expect(prompts.first).to_have_value("second")
    await expect(prompts.nth(2)).to_have_value("first")
    await page.get_by_role("button", name="保存修改", exact=True).click()
    await expect(page.get_by_role("button", name="保存修改", exact=True)).to_be_enabled()
    assert saves[-1]["manualPatch"]["imagePrompts"] == ["second", "third", "first", "fourth"]
    await page.reload(wait_until="networkidle")
    await expect(prompts.first).to_have_value("second")
    await page.locator('.review-gallery input[type="file"]').first.set_input_files({"name": "fixture.png", "mimeType": "image/png", "buffer": PNG})
    await expect(page.get_by_role("button", name="拖动配图 1", exact=True)).to_be_disabled()
    await expect(page.get_by_role("button", name="拖动配图 1", exact=True)).to_be_enabled()
    await expect(prompts.first).to_have_value("second")
    # Replacing one URL must carry the unchanged, index-aligned prompt array.
    await page.get_by_role("button", name="保存修改", exact=True).click()
    await expect(page.get_by_role("button", name="保存修改", exact=True)).to_be_enabled()
    assert saves[-1]["manualPatch"]["imagePrompts"] == ["second", "third", "first", "fourth"], saves[-1]
    assert saves[-1]["manualPatch"]["imageUrls"][0] == "/generated/replaced.png", saves[-1]
    await page.get_by_role("button", name="上移配图", exact=True).nth(2).click()
    await expect(prompts.nth(1)).to_have_value("first")
    # A canceled drag cannot mutate the draft.
    before = await prompts.evaluate_all("rows => rows.map(e=>e.value)")
    handle = page.get_by_role("button", name="拖动配图 1", exact=True)
    second_up = page.get_by_role("button", name="上移配图", exact=True).nth(1)
    first_down = page.get_by_role("button", name="下移配图", exact=True).nth(0)
    first_delete = page.get_by_role("button", name="删除配图", exact=True).nth(0)
    first_regenerate = page.get_by_role("button", name="重新生成第 1 张配图", exact=True)
    await expect(second_up).to_be_enabled()
    await expect(first_down).to_be_enabled()
    await expect(first_delete).to_be_enabled()
    await expect(first_regenerate).to_be_enabled()
    await handle.dispatch_event("dragstart", {"dataTransfer": await page.evaluate_handle("new DataTransfer()")})
    fieldset = page.locator(".review-gallery fieldset").first
    assert not await fieldset.evaluate("e => e.disabled"), "drag source fieldset must stay enabled during drag"
    assert await handle.get_attribute("draggable") == "true"
    await expect(handle).to_be_enabled()
    await expect(second_up).to_be_disabled()
    await expect(first_down).to_be_disabled()
    await expect(first_delete).to_be_disabled()
    await expect(first_regenerate).to_be_disabled()
    await page.keyboard.press("Escape")
    await handle.dispatch_event("dragend")
    assert await prompts.evaluate_all("rows => rows.map(e=>e.value)") == before
    # Apply/cancel/history preserves unsaved body/order and freezes cursor bounds.
    body = page.locator(".review-body-editor")
    await body.fill("UNSAVED")
    await page.get_by_role("button", name="下一页", exact=True).click()
    await expect(page.locator(".review-list-card").first).to_contain_text("Post 50")
    assert queries[-1]["asOf"] == queries[-2]["asOf"]
    await page.get_by_role("button", name="筛选条件", exact=True).click()
    await page.get_by_role("button", name="添加时间条件", exact=True).click()
    await page.get_by_role("button", name="取消", exact=True).click()
    assert "filters=" not in page.url
    await page.get_by_role("button", name="清除筛选", exact=True).click()
    await expect(page.locator(".review-list-card").first).to_contain_text("Post 0")
    assert queries[-1]["groups"] == []
    await expect(body).to_have_value("UNSAVED")
    assert await prompts.evaluate_all("rows => rows.map(e=>e.value)") == before
    await page.go_back()
    await expect(page.locator(".review-filter-summary")).to_contain_text("草稿")
    await expect(body).to_have_value("UNSAVED")
    await page.go_forward()
    await expect(page.locator(".review-filter-summary")).to_contain_text("全部状态")
    await page.reload(wait_until="networkidle")
    assert queries[-1]["groups"] == []
    await page.get_by_role("button", name="筛选条件", exact=True).click()
    await page.get_by_role("button", name="添加时间条件", exact=True).click()
    await page.get_by_label("运算符", exact=True).select_option("between")
    await page.get_by_label("条件值", exact=True).fill("2024-03-01")
    await page.get_by_label("结束日期", exact=True).fill("2024-02-29")
    await page.get_by_role("button", name="应用筛选", exact=True).click()
    await expect(page.locator(".review-filter-dialog [role=alert]")).to_be_visible()
    await expect(page.locator(".review-filter-dialog")).to_be_visible()
    await page.get_by_label("结束日期", exact=True).fill("2024-03-02")
    await page.get_by_role("button", name="添加子组", exact=True).click()
    await page.get_by_label("条件字段", exact=True).nth(1).select_option("vehicle")
    await page.get_by_label("G7", exact=True).check()
    await page.get_by_role("button", name="应用筛选", exact=True).click()
    await expect(page.locator(".review-filter-dialog")).not_to_be_visible()
    await page.wait_for_timeout(350)
    assert queries[-1]["groups"][0]["children"][1]["children"][0]["value"] == ["G7"]
    await page.get_by_role("button", name="清除筛选", exact=True).click()
    # Missing cards move freely; regeneration preserves unsaved local order.
    await page.locator(".review-list-card").nth(1).locator("button").click()
    await expect(page.locator(".review-order-item")).to_have_count(3)
    # Series media is card-owned; an arbitrary appended image would be invisible and later dropped.
    await expect(page.get_by_role("button", name="新增配图")).to_have_count(0)
    await page.locator(".review-image-prompt").first.fill("")
    await expect(page.locator(".review-image-prompt").first).to_have_value("")
    await page.locator(".review-image-prompt").first.fill("card prompt 0")
    await page.get_by_role("button", name="上移配图", exact=True).nth(1).click()
    await expect(page.locator(".review-order-item").first).to_contain_text("待补图")
    await page.locator(".review-series-missing").get_by_role("button", name="重新生成", exact=True).click()
    await expect(page.locator(".review-order-item").first.locator(".review-gallery-preview img")).to_have_attribute("src", __import__("re").compile("regenerated"))
    await page.get_by_role("button", name="保存修改", exact=True).click()
    await expect(page.get_by_role("button", name="保存修改", exact=True)).to_be_enabled()
    assert [c["id"] for c in posts["p-1"]["xhsSeries"]["cards"]] == ["card-1", "card-0", "card-2"]
    assert posts["p-1"]["xhsSeries"]["cards"][1]["role"] == "cover"
    await page.locator(".review-order-item").first.get_by_role("button", name="选择候选图 2", exact=True).click()
    await page.get_by_role("button", name="下移配图", exact=True).first.click()
    await page.get_by_role("button", name="保存修改", exact=True).click()
    await expect(page.get_by_role("button", name="保存修改", exact=True)).to_be_enabled()
    assert posts["p-1"]["xhsSeries"]["cards"][1]["imageUrl"] == "/generated/candidate-1.png"
    # Reduced motion takes effect for the prompt transition.
    await page.emulate_media(reduced_motion="reduce")
    duration = await page.locator(".review-image-prompt").first.evaluate("e => getComputedStyle(e).transitionDuration")
    assert float(duration.rstrip("s")) <= 0.001, duration
    assert not errors, errors
    await page.close()


async def series_layout(browser):
    for width, height, required in [(1920, 1080, 3), (1280, 1024, 2)]:
        page, _, _, errors, _ = await fixture(browser, width, height, "professional")
        await page.locator(".review-list-card").nth(1).locator("button").click()
        await expect(page.locator(".review-order-item")).to_have_count(3)
        gallery = page.locator(".review-gallery")
        # Series cards keep a uniform grid; a primary span would hide the rest.
        span = await page.locator(".review-order-item").first.evaluate("el => getComputedStyle(el).gridColumnStart")
        assert span == "auto", (width, height, span)
        visible = await gallery.evaluate("""el => {
          const viewport = el.getBoundingClientRect();
          return Array.from(el.querySelectorAll('.review-gallery-tile')).filter(tile => {
            const rect = tile.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom + 1;
          }).length;
        }""")
        assert visible >= required, (width, height, visible)
        missing = page.locator(".review-series-missing")
        await expect(missing).to_have_count(1)
        labels = await missing.locator(".review-gallery-tools button").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
        assert labels == ["拖动配图 2", "上移配图", "下移配图"], (width, height, labels)
        tools_box = await missing.locator(".review-gallery-tools").bounding_box()
        title_box = await missing.locator("strong").bounding_box()
        assert title_box["y"] >= tools_box["y"] + tools_box["height"], (width, height, tools_box, title_box)
        await expect(missing.get_by_role("button", name="重新生成", exact=True)).to_be_visible()
        assert not errors, errors
        await page.close()
        print(json.dumps(dict(width=width, height=height, result="series layout passed")), flush=True)


async def video_layout(browser):
    page, _, _, errors, _ = await fixture(browser, 1440, 900, "professional", video_count=1)
    await expect(page.locator(".review-video-tile")).to_have_count(1)
    preview = page.locator(".review-video-tile .review-gallery-preview")
    ratio = await preview.evaluate("e => getComputedStyle(e).aspectRatio")
    assert ratio.replace(" ", "") == "4/3", ratio
    preview_box = await preview.bounding_box()
    badge_box = await page.locator(".review-video-tile .review-gallery-index").bounding_box()
    tools_box = await page.locator(".review-video-tile .review-gallery-tools").bounding_box()
    assert badge_box["y"] <= preview_box["y"] + preview_box["height"] / 2, (preview_box, badge_box)
    assert not boxes_overlap(badge_box, tools_box), (badge_box, tools_box)
    assert not errors, errors
    await page.close()
    print(json.dumps(dict(width=1440, height=900, result="video layout passed")), flush=True)


async def classic_scrollbar(browser):
    page, _, _, errors, _ = await fixture(browser, 960, 720, "professional")
    # Headless Chrome uses overlay scrollbars, but real Chrome reserves 15px at
    # this width. Simulate that content width deterministically.
    await page.add_style_tag(content=".review-gallery { padding-right: 17px; }")
    gallery = page.locator(".review-gallery")
    tracks = await gallery.evaluate("el => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length")
    assert tracks >= 2, tracks
    index_box = await page.locator(".review-gallery-index").first.bounding_box()
    tools_box = await page.locator(".review-gallery-tools").first.bounding_box()
    assert not boxes_overlap(index_box, tools_box), (index_box, tools_box)
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert not errors, errors
    await page.close()
    print(json.dumps(dict(width=960, height=720, scrollbar=15, result="classic scrollbar passed")), flush=True)


async def edge_autoscroll(browser):
    page, _, _, errors, _ = await fixture(browser, 1440, 700, "professional", image_count=16)
    prompts = page.locator(".review-image-prompt")
    before = await prompts.evaluate_all("rows => rows.map(e => e.value)")
    gallery = page.locator(".review-gallery")
    assert await gallery.evaluate("e => e.scrollTop") == 0
    handle_box = await page.get_by_role("button", name="拖动配图 1", exact=True).bounding_box()
    gallery_box = await gallery.bounding_box()
    await page.mouse.move(handle_box["x"] + 10, handle_box["y"] + 10)
    await page.mouse.down()
    await page.mouse.move(handle_box["x"] + 30, handle_box["y"] + 30, steps=10)
    await page.mouse.move(gallery_box["x"] + 40, gallery_box["y"] + gallery_box["height"] - 10, steps=10)
    await page.wait_for_function("document.querySelector('.review-gallery').scrollTop > 100")
    assert await page.evaluate("scrollY") == 0
    await page.mouse.move(10, 10)
    await page.mouse.up()
    await expect(page.get_by_role("button", name="保存修改", exact=True)).to_be_enabled()
    assert await prompts.evaluate_all("rows => rows.map(e => e.value)") == before
    assert not errors, errors
    await page.close()


async def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ("professional", "editorial", "creator"):
                for width, height in [(1280, 720), (1440, 800), (1440, 900), (1440, 1000), (1512, 982), (1280, 1024), (1600, 1000), (1920, 900), (1920, 1080), (390, 844), (1280, 480), (959, 720), (960, 720), (1599, 800), (1600, 800)]:
                    await layout(browser, width, height, theme)
                    print(json.dumps(dict(theme=theme, width=width, height=height, result="passed")), flush=True)
            await interactions(browser)
            await series_layout(browser)
            await video_layout(browser)
            await classic_scrollbar(browser)
            await edge_autoscroll(browser)
            print("Review drag, edge autoscroll, missing-card regeneration, save/reload, URL history and draft retention passed.", flush=True)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
