from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:3001"


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page_errors: list[str] = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    review_response = page.goto(f"{BASE_URL}/review", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    review_text = page.locator("body").inner_text().strip()

    config_response = page.goto(f"{BASE_URL}/config", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    config_text = page.locator("body").inner_text().strip()

    repair_status = page.evaluate(
        """async () => {
          const response = await fetch('/api/config/media-repair', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'scan', limit: 1 }),
          });
          return response.status;
        }"""
    )

    result = {
        "reviewStatus": review_response.status if review_response else None,
        "configStatus": config_response.status if config_response else None,
        "reviewRendered": bool(review_text),
        "configRendered": bool(config_text),
        "repairUnauthenticatedStatus": repair_status,
        "pageErrors": page_errors,
    }
    print(result)

    assert result["reviewStatus"] == 200
    assert result["configStatus"] == 200
    assert result["reviewRendered"]
    assert result["configRendered"]
    assert result["repairUnauthenticatedStatus"] in (401, 403)
    assert not page_errors
    browser.close()
