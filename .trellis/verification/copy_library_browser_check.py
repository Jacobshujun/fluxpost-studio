import asyncio
import json
import os
import re

from playwright.async_api import async_playwright, expect


BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:3001")
NOW = "2026-09-08T00:00:00.000Z"


def entry(entry_id, title, editable=True):
    return {
        "id": entry_id,
        "title": title,
        "body": f"Body for {title}",
        "tags": [],
        "visibility": "team",
        "canEdit": editable,
        "ownerUserId": "browser-owner",
        "ownerDisplayName": "Browser owner",
        "createdAt": NOW,
        "updatedAt": NOW,
    }


async def check(browser, width, empty=False):
    page = await browser.new_page(viewport={"width": width, "height": 900})
    entries = [] if empty else [entry("first", "Existing copy"), entry("shared", "Shared copy", False)]
    requests = []
    errors = []
    held = asyncio.Event()
    release = asyncio.Event()
    hold_next = False
    page.on("pageerror", lambda error: errors.append(str(error)))

    async def route_handler(route):
        nonlocal hold_next
        request = route.request
        path = request.url.split("?", 1)[0]
        if "/api/copy-library" not in path:
            await route.fulfill(status=200, json={})
            return
        requests.append({"method": request.method, "path": path, "body": request.post_data_json})
        if request.method == "GET":
            if hold_next:
                hold_next = False
                held.set()
                await release.wait()
            payload = {"entries": entries, "tags": []}
        elif request.method == "POST":
            saved = {**entry("created", "Created copy"), **request.post_data_json}
            entries.insert(0, saved)
            payload = {"entry": saved}
        elif request.method == "PATCH":
            saved = next(item for item in entries if path.endswith("/" + item["id"]))
            saved.update(request.post_data_json)
            payload = {"entry": saved}
        else:
            raise AssertionError(f"Unexpected mutation: {request.method} {path}")
        await route.fulfill(status=200, json=payload)

    await page.route("**/api/**", route_handler)
    suffix = "" if empty else "?entryId=shared"
    await page.goto(f"{BASE_URL}/copy-library{suffix}", wait_until="networkidle")
    title = page.locator('input[placeholder="输入图文标题"]')
    body = page.locator('textarea[placeholder="输入完整正文"]')
    new_button = page.get_by_role("button", name="新建文案", exact=True)
    if not empty:
        await expect(title).to_have_value("Shared copy")
        await expect(title).to_be_disabled()
    before = len(requests)
    await new_button.click()
    await title.fill("New draft")
    await body.fill("New body")
    await page.wait_for_timeout(250)
    await page.wait_for_load_state("networkidle")
    await expect(title).to_have_value("New draft")
    assert len(requests) == before, "New must not reload the list"

    await page.get_by_role("button", name="保存", exact=True).click()
    await expect(page.get_by_text("文案已保存", exact=True)).to_be_visible()
    await expect(title).to_have_value("New draft")
    mutations = [request for request in requests if request["method"] != "GET"]
    assert mutations[-1]["method"] == "POST"
    assert mutations[-1]["body"]["title"] == "New draft"
    await title.fill("Edited draft")
    async with page.expect_response(lambda response: response.request.method == "PATCH"):
        await page.get_by_role("button", name="保存", exact=True).click()
    await page.wait_for_load_state("networkidle")
    assert entries[0]["title"] == "Edited draft"
    await expect(page.locator('[data-marquee-id="created"] strong')).to_have_text("Edited draft")

    if width >= 1000:
        if not empty:
            before = len(requests)
            await page.locator('[data-marquee-id="first"] button').click()
            await expect(title).to_have_value("Existing copy")
            await page.locator('[data-marquee-id="created"] button').click()
            await expect(title).to_have_value("Edited draft")
            await page.wait_for_load_state("networkidle")
            assert len(requests) == before, "Selecting an existing entry must not reload the list"
        tag = page.locator('input[placeholder="输入后按回车"]')
        await tag.fill("Uncommitted tag")
        await new_button.click()
        await expect(tag).to_have_value("")
        await title.fill("Keep through refresh")
        hold_next = True
        await page.locator("select").last.select_option("oldest")
        await asyncio.wait_for(held.wait(), timeout=5)
        await new_button.click()
        await title.fill("Keep through slow response")
        release.set()
        await page.wait_for_load_state("networkidle")
        await expect(title).to_have_value("Keep through slow response")
        await expect(page).not_to_have_url(re.compile("entryId="))
        before = len(requests)
        await page.evaluate("""() => {
            history.pushState(null, '', '/copy-library?entryId=created');
            window.dispatchEvent(new PopStateEvent('popstate'));
        }""")
        await expect(title).to_have_value("Edited draft")
        await page.go_back(wait_until="domcontentloaded")
        await expect(title).to_have_value("")
        await page.go_forward(wait_until="domcontentloaded")
        await expect(title).to_have_value("Edited draft")
        assert len(requests) == before, "History selection must not reload the list"
    assert not errors, errors
    await page.close()
    print(json.dumps({"width": width, "empty": empty, "result": "passed"}), flush=True)


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        try:
            await check(browser, 1440)
            await check(browser, 390)
            await check(browser, 1440, empty=True)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
