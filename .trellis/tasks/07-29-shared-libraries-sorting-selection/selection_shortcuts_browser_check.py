import json
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


TASK_DIR = Path(__file__).resolve().parent
ENTRIES = [
    {
        "id": f"copy-{index}",
        "ownerUserId": "owner-1",
        "ownerDisplayName": "测试提交人",
        "title": title,
        "body": f"{title} 的正文内容，用于验证文案库批量选择。",
        "tags": ["测试"],
        "visibility": "team",
        "createdAt": f"2026-07-{10 + index:02d}T08:00:00.000Z",
        "updatedAt": f"2026-07-{10 + index:02d}T09:00:00.000Z",
        "canEdit": True,
    }
    for index, title in enumerate(
        ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu"],
        start=1,
    )
]


def checked_count(page: Page) -> int:
    return page.locator("[data-marquee-id] input[type=checkbox]:checked").count()


def mock_copy_library(page: Page) -> None:
    body = json.dumps({"entries": ENTRIES, "tags": ["测试"]}, ensure_ascii=False)
    page.route(
        "**/api/copy-library*",
        lambda route: route.fulfill(status=200, content_type="application/json", body=body),
    )


def open_page(page: Page) -> None:
    mock_copy_library(page)
    page.goto("http://127.0.0.1:3001/copy-library", wait_until="networkidle")
    page.locator("[data-marquee-id]").nth(4).wait_for()


def assert_no_horizontal_overflow(page: Page) -> None:
    has_overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    assert not has_overflow, "Copy library has horizontal page overflow."


def check_desktop(page: Page) -> None:
    open_page(page)
    rows = page.locator("[data-marquee-id]")
    select_all = page.get_by_text("全选", exact=True).locator("..")

    select_all.click()
    assert checked_count(page) == len(ENTRIES)
    assert f"已选择 {len(ENTRIES)} 篇" in page.locator("body").inner_text()

    page.locator("textarea").focus()
    page.keyboard.press("Control+A")
    page.keyboard.press("Escape")
    assert checked_count(page) == len(ENTRIES), "Editable targets must keep native shortcuts."

    page.get_by_role("heading", name="文案库").click()
    page.keyboard.press("Escape")
    assert checked_count(page) == 0

    rows.nth(0).locator("button").click(modifiers=["Control"])
    rows.nth(2).locator("button").click(modifiers=["Control"])
    assert checked_count(page) == 2

    page.keyboard.press("Escape")
    rows.nth(1).locator("button").click()
    rows.nth(3).locator("button").click(modifiers=["Shift"])
    assert checked_count(page) == 3
    rows.nth(4).locator("button").click(modifiers=["Control", "Shift"])
    assert checked_count(page) == 4

    page.keyboard.press("Delete")
    dialog = page.get_by_role("alertdialog")
    dialog.wait_for()
    assert "确认删除 4 篇文案" in dialog.inner_text()
    page.keyboard.press("Control+A")
    assert checked_count(page) == 4, "Open dialogs must block page selection shortcuts."
    dialog.get_by_role("button", name="取消").click()
    page.get_by_role("heading", name="文案库").click()

    list_pane = rows.first.locator("..")
    assert list_pane.evaluate("element => element.scrollHeight > element.clientHeight")
    header_before = page.locator("header").bounding_box()
    editor_before = page.locator("article").bounding_box()
    list_pane.hover()
    page.mouse.wheel(0, 900)
    page.wait_for_timeout(100)
    assert list_pane.evaluate("element => element.scrollTop") > 0
    assert page.evaluate("window.scrollY") == 0
    header_after = page.locator("header").bounding_box()
    editor_after = page.locator("article").bounding_box()
    assert header_before and header_after and header_before["y"] == header_after["y"]
    assert editor_before and editor_after and editor_before["y"] == editor_after["y"]
    list_pane.evaluate("element => { element.scrollTop = 0; }")

    assert_no_horizontal_overflow(page)
    page.screenshot(path=str(TASK_DIR / "selection-shortcuts-desktop.png"), full_page=True)


def check_mobile(page: Page) -> None:
    open_page(page)
    rows = page.locator("[data-marquee-id]")
    rows.nth(0).locator("input[type=checkbox]").check()
    rows.nth(2).locator("input[type=checkbox]").check()
    assert checked_count(page) == 2

    page.get_by_text("全选", exact=True).locator("..").click()
    assert checked_count(page) == len(ENTRIES)
    cancel_box = page.get_by_role("button", name="取消选择").bounding_box()
    assert cancel_box and cancel_box["x"] + cancel_box["width"] <= 390
    rows.nth(1).locator("button").click()
    page.get_by_role("button", name="返回文案列表").click()
    rows.nth(4).wait_for()

    assert_no_horizontal_overflow(page)
    page.screenshot(path=str(TASK_DIR / "selection-shortcuts-mobile.png"), full_page=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    errors = []

    desktop = browser.new_page(viewport={"width": 1440, "height": 960})
    desktop.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    check_desktop(desktop)

    mobile = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
    mobile.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    check_mobile(mobile)

    browser.close()
    assert not errors, f"Browser console errors: {errors}"
    print("Copy-library desktop and mobile selection shortcut checks passed.")
