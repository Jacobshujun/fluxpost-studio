"""Mocked Feishu capture entry: three themes, desktop/mobile, no external calls."""
import copy
import json
import os
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect
from content_pool_libraries_browser_check import ROOT, CHILD, MEMBERSHIPS, TAGS, NOW, make_project, make_item, project_summary, desk_response, summary_response

BASE_URL = os.environ.get("FLUXPOST_BROWSER_BASE_URL", "http://127.0.0.1:45678")
target = urlparse(BASE_URL)
assert target.hostname in ("127.0.0.1", "localhost") and target.port != 3001


def check(browser, theme, width):
    context = browser.new_context(viewport={"width": width, "height": 960})
    context.add_init_script(f"localStorage.setItem('fluxpost-theme', {json.dumps(theme)})")
    page = context.new_page()
    errors, requests, pending, unknown = [], [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    project = make_project()
    memberships = copy.deepcopy(MEMBERSHIPS)
    state = {"hold": True, "failure": False, "empty": False, "imported": False}

    def response():
        if not state["empty"] and not state["imported"]:
            item = make_item("feishu-good", "飞书导入样本", [])
            item["platform"] = "feishu"
            project["items"].append(item)
            project["totalItems"] += 1
            memberships.append({"collectionId": ROOT["id"], "ownerUserId": "owner-1", "itemId": item["id"]})
            state["imported"] = True
        return {
            "query": project["query"], "items": [] if state["empty"] else [project["items"][-1]],
            "project": project_summary(project),
            "summary": {"total": 3, "valid": 2, "imported": 0 if state["empty"] else 1, "filteredUnsafe": 1,
                        "failed": 2 if state["empty"] else 1, "duplicates": 0, "unsupported": 0,
                        "taggedContent": 0, "taggedVisual": 0, "localImages": 0, "videoFrames": 0},
            "results": [{"url": "AI00001", "platform": "feishu", "status": "failed" if state["empty"] else "imported", "title": "编号结果"},
                        {"url": "MISSING", "platform": "feishu", "status": "failed", "error": "编号不存在"},
                        {"url": "FILTERED", "platform": "feishu", "status": "filtered", "error": "内容被过滤"}],
        }

    def handler(route):
        request = route.request
        url = urlparse(request.url)
        path, params = url.path, parse_qs(url.query)
        if path == "/api/crawl/feishu":
            requests.append(request.post_data_json)
            if state["hold"]:
                pending.append(route)
            elif state["failure"]:
                route.fulfill(status=400, json={"error": "飞书读取失败测试"})
            else:
                route.fulfill(json=response())
            return
        if path == "/api/content-pool/desk":
            payload = desk_response(params, project, memberships)
        elif path == "/api/content-pool/desk/summary":
            payload = summary_response(params, project, memberships, [ROOT, CHILD], TAGS)
        elif path == "/api/content-pool/tags":
            payload = {"tags": TAGS}
        elif path == "/api/config":
            payload = {"tikhubConfigured": False, "openaiConfigured": False, "feishuContentImportConfigured": True}
        elif path == "/api/workspace/settings":
            payload = {"settings": {"platformCrawlSettings": {}, "simpleRunMediaSettings": {}, "updatedAt": NOW}}
        elif path == "/api/activity":
            payload = {"entries": []}
        elif path == "/api/simple/runs":
            assert request.method == "GET", "Feishu imports must not generate content"
            payload = {"runs": []}
        elif path.startswith("/api/crawl"):
            raise AssertionError(f"Unexpected crawl dispatch: {path}")
        else:
            unknown.append(path)
            payload = {}
        route.fulfill(json=payload)

    page.route("**/api/**", handler)
    page.goto(f"{BASE_URL}/content?mode=links&query=测试项目", wait_until="networkidle")
    capture = page.locator(".content-desk-capture")
    expect(capture).to_be_visible()
    link_draft = "https://www.xiaohongshu.com/explore/draft"
    capture.get_by_label("链接列表", exact=True).fill(link_draft)
    capture.get_by_role("button", name="飞书编号", exact=True).click()
    expect(capture.get_by_role("button", name="飞书编号", exact=True)).to_have_attribute("aria-pressed", "true")
    expect(page).to_have_url(re.compile(r"[?&]mode=feishu(?:&|$)"))
    for name in ["关键词", "链接", "飞书编号"]:
        button = capture.get_by_role("button", name=name, exact=True)
        bounds = button.evaluate("element => ({scroll: element.scrollWidth, width: element.clientWidth, font: getComputedStyle(element).fontSize, padding: getComputedStyle(element).padding, gap: getComputedStyle(element).gap})")
        assert bounds["scroll"] <= bounds["width"], f"Capture tab overflow: {name} {bounds}"
    expect(capture.get_by_text("平台", exact=True)).to_have_count(0)
    import_button = capture.get_by_role("button", name="导入飞书编号", exact=True)
    import_button.click()
    expect(page.get_by_text("请输入至少一个飞书编号，每行一个。", exact=True)).to_be_visible()
    assert not requests
    numbers = capture.get_by_label("飞书编号（每行一个，最多 200 个）", exact=True)
    numbers.fill("AI00001\nMISSING\nFILTERED")
    expect(capture.get_by_label("跳过自动打标", exact=True)).to_be_checked()
    capture.get_by_label("启用视频音频转文字", exact=True).check()
    capture.get_by_label("视频高光帧原图引用", exact=True).uncheck()
    capture.get_by_text("采集到", exact=True).locator("..").locator("select").select_option(ROOT["id"])
    import_button.click()
    expect(import_button).to_be_disabled()
    expect(capture.get_by_role("button", name="链接", exact=True)).to_be_disabled()
    assert len(pending) == 1
    assert requests[-1] == {"query": "测试项目", "taskNumbers": ["AI00001", "MISSING", "FILTERED"],
                            "collectionId": ROOT["id"], "skipTagging": True,
                            "enableVideoTranscription": True, "videoFrameOriginalReference": False}
    pending.pop().fulfill(json=response())
    state["hold"] = False
    expect(import_button).to_be_enabled()
    expect(page.get_by_text("飞书编号导入完成：成功 1 条，失败 1 条，过滤 1 条。", exact=True)).to_be_visible()
    expect(page.locator(".content-desk-source-card").filter(has_text="飞书导入样本")).to_have_count(1)
    expect(capture.get_by_text("编号不存在", exact=True)).to_be_visible()
    capture.get_by_role("button", name="链接", exact=True).click()
    expect(capture.get_by_label("链接列表", exact=True)).to_have_value(link_draft)
    expect(capture.get_by_label("跳过自动打标", exact=True)).not_to_be_checked()
    capture.get_by_role("button", name="飞书编号", exact=True).click()
    expect(numbers).to_have_value("AI00001\nMISSING\nFILTERED")
    state["empty"] = True
    import_button.click()
    expect(page.get_by_text("飞书编号导入完成：成功 0 条，失败 2 条，过滤 1 条。", exact=True)).to_be_visible()
    expect(capture.locator(".task-progress-error")).to_be_visible()
    state["failure"] = True
    import_button.click()
    expect(page.get_by_text("飞书读取失败测试", exact=True).first).to_be_visible()
    expect(import_button).to_be_enabled()
    page.reload(wait_until="networkidle")
    expect(capture.get_by_role("button", name="飞书编号", exact=True)).to_have_attribute("aria-pressed", "true")
    assert not errors, errors
    assert not unknown, unknown
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    Path("test-artifacts").mkdir(exist_ok=True)
    page.screenshot(path=f"test-artifacts/content-pool-feishu-{theme}-{width}.png", full_page=True)
    print(json.dumps({"theme": theme, "width": width, "imports": len(requests), "result": "passed"}), flush=True)
    context.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    try:
        for theme in ["professional", "editorial", "creator"]:
            for width in [1440, 390]:
                check(browser, theme, width)
    except Exception:
        Path("test-artifacts").mkdir(exist_ok=True)
        for context in browser.contexts:
            for page in context.pages:
                page.screenshot(path="test-artifacts/content-pool-feishu-failure.png", full_page=True)
        raise
    finally:
        browser.close()
