"""Isolated review preference checks. All APIs/media are intercepted."""
import asyncio
import copy
import json
import os
from urllib.parse import parse_qs, urlencode, urlparse
from playwright.async_api import async_playwright, expect
from review_performance_browser_check import PNG, post, summary

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("127.0.0.1", "localhost") and urlparse(BASE).port != 3001
KEY = "fluxpost:review-filters:v1:"
EMPTY = dict(version=1, search=dict(field="all", value=""), match="all", groups=[])
SAVED = dict(version=1, search=dict(field="title", value="Post"), match="any", groups=[
    dict(match="all", children=[dict(field="status", op="in", value=["draft"]), dict(field="updatedAt", op="preset", value="today")]),
    dict(match="all", children=[dict(field="vehicle", op="in", value=["G7"])])])


async def setup(browser, width=1440, theme="professional", stored=None, storage_state=None, blocked=""):
    context = await browser.new_context(viewport=dict(width=width, height=900), storage_state=storage_state)
    page = await context.new_page()
    control = dict(account="A", queries=[], review_requests=[], errors=[], hold=False, session_started=asyncio.Event(), session_release=asyncio.Event(), session_error=False)
    page.on("pageerror", lambda error: control["errors"].append(str(error)))
    seed = {KEY + account: json.dumps(value) if not isinstance(value, str) else value for account, value in (stored or {}).items()}
    # Seed once per context, so reload cannot silently repair failed persistence.
    await context.add_init_script("""(seed => {
      if (!sessionStorage.getItem('memory-fixture-seeded')) {
        Object.entries(seed).forEach(([key, value]) => localStorage.setItem(key, value));
        sessionStorage.setItem('memory-fixture-seeded', 'yes');
      }
    })(%s)""" % json.dumps(seed))
    await context.add_init_script("localStorage.setItem('fluxpost-theme', %s)" % json.dumps(theme))
    if blocked:
        await context.add_init_script("""(() => {
          const method = %s;
          const original = Storage.prototype[method];
          Storage.prototype[method] = function(key, ...args) {
            if (key.startsWith('fluxpost:review-filters:')) throw new DOMException('Blocked', 'SecurityError');
            return original.call(this, key, ...args);
          };
        })()""" % json.dumps(blocked))
    posts = {f"p-{i}": post(i) for i in range(55)}

    async def handler(route):
        request = route.request
        parsed = urlparse(request.url)
        path, query = parsed.path, parse_qs(parsed.query)
        assert request.method == "GET", f"Unexpected mutation {path}"
        if path.startswith("/api/review/posts"):
            control["review_requests"].append(path)
        if path == "/api/accounts/session":
            control["session_started"].set()
            if control["hold"]:
                await control["session_release"].wait()
            await route.fulfill(status=503 if control["session_error"] else 200, json=dict(account=dict(id=control["account"])))
        elif path == "/api/review/posts/metadata":
            await route.fulfill(json=dict(summary=dict(total=55, ready=55, approved=0, published=0), authors=["Tester"], platforms=["xiaohongshu"], vehicles=["G7"]))
        elif path == "/api/review/posts":
            filters = json.loads(query["filters"][0])
            control["queries"].append(copy.deepcopy(filters))
            value = filters["search"]["value"]
            rows = [summary(p) for p in posts.values() if value.lower() in p["title"].lower()]
            start = int(query.get("cursor", ["0"])[0])
            await route.fulfill(json=dict(posts=rows[start:start+50], nextCursor=str(start+50) if start+50 < len(rows) else None))
        elif path.startswith("/api/review/posts/") and not path.endswith("/thumbnail"):
            await route.fulfill(json=dict(post=posts[path.rsplit("/", 1)[1]]))
        elif path.endswith("/thumbnail") or path.startswith("/generated/"):
            await route.fulfill(content_type="image/png", body=PNG)
        else:
            await route.fulfill(json={})

    await context.route("**/api/**", handler)
    await context.route("**/generated/**", handler)
    return context, page, control


async def visit(page, query=""):
    await page.goto(f"{BASE}/review{query}", wait_until="networkidle")
    await expect(page.get_by_role("button", name="筛选条件", exact=True)).to_be_enabled()


async def stored(page, account="A"):
    return await page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY + account)


async def basic(browser, width, theme):
    context, page, control = await setup(browser, width, theme, stored={"A": SAVED})
    await visit(page)
    search = page.get_by_role("textbox", name="搜索稿件", exact=True)
    await expect(search).to_have_value("Post")
    await expect(page.get_by_text("已恢复上次筛选", exact=True)).to_be_visible()
    assert all(q["search"] == SAVED["search"] and q["groups"] == SAVED["groups"] for q in control["queries"])
    assert "asOf" not in await stored(page)
    before = await stored(page)
    await page.get_by_role("button", name="筛选条件", exact=True).click()
    await page.get_by_role("button", name="添加时间条件", exact=True).click()
    await page.get_by_role("button", name="取消", exact=True).click()
    assert await stored(page) == before
    await page.get_by_role("button", name="筛选条件", exact=True).click()
    await page.get_by_role("button", name="添加时间条件", exact=True).click()
    await page.get_by_role("button", name="应用筛选", exact=True).click()
    await expect(page.locator(".review-filter-dialog")).not_to_be_visible()
    assert len((await stored(page))["groups"]) == 3
    await page.go_back(wait_until="networkidle")
    assert len((await stored(page))["groups"]) == 2
    await page.go_forward(wait_until="networkidle")
    assert len((await stored(page))["groups"]) == 3
    await search.fill("Post 2")
    await expect(page.locator(".review-list-card")).to_have_count(11)
    await page.reload(wait_until="networkidle")
    await search.fill("Post 3")
    await expect(page.locator(".review-list-card")).to_have_count(11)
    assert (await stored(page))["search"]["value"] == "Post 3", "normal postId after reload must still save"
    await visit(page)
    await expect(search).to_have_value("Post 3")
    await page.get_by_role("button", name="清除筛选", exact=True).first.click()
    await expect(search).to_have_value("")
    assert await stored(page) == EMPTY
    await visit(page)
    await expect(page.locator(".review-filter-summary")).to_contain_text("全部状态 · 全部时间")
    assert control["queries"][-1]["groups"] == []
    await search.fill("no-match")
    await expect(page.get_by_text("当前筛选下暂无稿件", exact=True)).to_be_visible()
    await page.locator(".review-list").get_by_role("button", name="清除筛选", exact=True).click()
    await expect(page.locator(".review-list-card")).to_have_count(50)
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert not control["errors"], control["errors"]
    await context.close()


async def edges(browser):
    context, page, control = await setup(browser, stored={"A": SAVED, "B": EMPTY})
    control["hold"] = True
    await page.goto(f"{BASE}/review", wait_until="domcontentloaded")
    await control["session_started"].wait()
    assert not control["review_requests"], "list, detail and metadata must wait for account and restored filters"
    control["session_release"].set()
    await page.wait_for_load_state("networkidle")
    assert control["queries"] and control["queries"][0]["search"] == SAVED["search"]
    clock = control["queries"][-1]["asOf"]
    await page.get_by_role("button", name="下一页", exact=True).click()
    await expect(page.locator(".review-list-card")).to_have_count(5)
    assert control["queries"][-1]["asOf"] == clock
    await page.clock.set_fixed_time(1900000000000)
    await page.get_by_role("button", name="刷新", exact=True).click()
    await expect(page.locator(".review-list-card")).to_have_count(50)
    assert control["queries"][-1]["asOf"] != clock
    for query in ["?postId=p-1", "?sourceBatchId=batch", "?postId=p-1&" + urlencode(dict(filters=json.dumps(EMPTY)))]:
        await visit(page, query)
        await page.get_by_role("textbox", name="搜索稿件", exact=True).fill("Post 1")
        await expect(page.locator(".review-list-card")).to_have_count(11)
        assert await stored(page) == SAVED, "dedicated links must not overwrite memory"
    await visit(page, "?" + urlencode(dict(filters=json.dumps(EMPTY))))
    assert control["queries"][-1]["groups"] == []
    assert await stored(page) == EMPTY
    await visit(page, "?status=published&q=Post+4")
    assert control["queries"][-1]["groups"][0]["children"][0]["value"] == ["published"]
    before = await stored(page)
    count = len(control["queries"])
    await visit(page, "?filters=invalid")
    await expect(page.locator(".review-filter-summary [role=alert]")).to_be_visible()
    assert len(control["queries"]) == count
    assert await stored(page) == before
    control["account"] = "B"
    await visit(page)
    assert control["queries"][-1]["groups"] == []
    assert await stored(page) == before
    snapshot = await context.storage_state()
    assert not control["errors"], control["errors"]
    await context.close()
    fresh, page, control = await setup(browser, storage_state=snapshot)
    await visit(page)
    assert (await stored(page))["search"]["value"] == "Post 4", "localStorage survives a new browser context"
    await fresh.close()

    for seed, blocked, message in [({"A": "{"}, "", "已损坏"), ({"A": SAVED}, "getItem", "当前浏览器无法记住筛选"), ({}, "setItem", "当前浏览器无法记住筛选")]:
        context, page, control = await setup(browser, stored=seed, blocked=blocked)
        await visit(page)
        await expect(page.locator(".review-filter-summary [role=status]")).to_contain_text(message)
        await page.get_by_role("textbox", name="搜索稿件", exact=True).fill("Post 2")
        await expect(page.locator(".review-list-card")).to_have_count(11)
        assert not control["errors"], control["errors"]
        await context.close()

    context, page, control = await setup(browser)
    control["session_error"] = True
    await visit(page)
    await expect(page.locator(".review-filter-summary [role=status]")).to_contain_text("无法识别当前账号")
    await expect(page.locator(".review-list-card")).to_have_count(50)
    assert await stored(page) is None
    await context.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        for theme in ["professional", "editorial", "creator"]:
            for width in [1440, 390]:
                await basic(browser, width, theme)
                print(f"Filter memory: {theme} {width} passed", flush=True)
        await edges(browser)
        await browser.close()
        print("Review memory isolation, precedence, deep links, storage failures and query gating passed.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
