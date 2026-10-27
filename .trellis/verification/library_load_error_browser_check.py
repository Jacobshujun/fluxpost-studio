"""Gallery load failures must not masquerade as an empty library; mocked only."""
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("FLUXPOST_BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1")
assert urlparse(BASE).port != 3001
FAILED = "\u56fe\u5e93\u52a0\u8f7d\u5931\u8d25"
RETRY = "\u91cd\u65b0\u52a0\u8f7d\u56fe\u5e93"
EMPTY = "\u56fe\u5e93\u5c1a\u65e0\u56fe\u7247"


def check(browser, theme, width):
    context = browser.new_context(viewport={"width": width, "height": 960})
    context.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    page = context.new_page()
    failures = {"assets": True, "navigation": True}
    calls, errors, held = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def api(route):
        path = urlparse(route.request.url).path
        calls.append((route.request.method, path))
        assert route.request.method == "GET", "Retry must not mutate data"
        if path == "/api/library/navigation":
            response = {"collections": [], "smartFolders": [], "counts": {"all": 0, "uncategorized": 0, "favorites": 0}}
            if failures.get("hold_navigation"):
                held.append((route, response))
            elif failures["navigation"]:
                route.fulfill(status=500, json={"error": "Navigation unavailable"})
            else:
                route.fulfill(json=response)
        elif path == "/api/library/assets":
            if failures["assets"]:
                route.fulfill(status=500, json={"error": "Assets unavailable"})
            else:
                route.fulfill(json={"assets": [], "total": 0})
        elif path == "/api/library/colors/jobs":
            route.fulfill(json={"coverage": {"total": 0, "analyzed": 0, "failed": 0, "manageableMissing": 0, "manageableFailed": 0}})
        elif path == "/api/library/tags":
            route.fulfill(json={"tags": []})
        else:
            raise AssertionError(f"Unexpected API: {path}")

    page.route("**/api/**", api)
    for nav_fail, asset_fail in [(True, True), (True, False), (False, True)]:
        failures.update(navigation=nav_fail, assets=asset_fail)
        page.goto(BASE + "/library", wait_until="networkidle")
        expect(page.get_by_text(FAILED, exact=True)).to_be_visible()
        expect(page.get_by_text(EMPTY, exact=True)).to_have_count(0)
        # A failed retry remains a failure, not an empty-library response.
        page.get_by_role("button", name=RETRY, exact=True).click()
        expect(page.get_by_text(FAILED, exact=True)).to_be_visible()
        failures.update(navigation=False, assets=False)
        page.get_by_role("button", name=RETRY, exact=True).click()
        expect(page.get_by_text(EMPTY, exact=True)).to_be_visible()
        expect(page.get_by_text(FAILED, exact=True)).to_have_count(0)

    # An empty list alone cannot establish that the whole library is empty.
    failures["hold_navigation"] = True
    page.goto(BASE + "/library", wait_until="domcontentloaded")
    expect(page.locator('[aria-busy="true"]')).to_be_visible()
    expect(page.get_by_text(EMPTY, exact=True)).to_have_count(0)
    page.wait_for_function("document.readyState === 'complete'")
    assert len(held) == 1
    route, response = held.pop()
    route.fulfill(json=response)
    expect(page.get_by_text(EMPTY, exact=True)).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
    assert not errors, errors
    print(f"PASS load-error {theme}-{width}: independent failures, failed/successful retries, pending navigation, no writes")
    context.close()


with sync_playwright() as p:
    options = {"headless": True}
    if os.environ.get("FLUXPOST_BROWSER_EXECUTABLE"):
        options["executable_path"] = os.environ["FLUXPOST_BROWSER_EXECUTABLE"]
    browser = p.chromium.launch(**options)
    try:
        for theme in ("professional", "editorial", "creator"):
            for width in (1440, 390):
                check(browser, theme, width)
    finally:
        browser.close()
