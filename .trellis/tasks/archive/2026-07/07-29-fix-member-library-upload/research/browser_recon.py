import json

from playwright.sync_api import sync_playwright


PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360f8cff00000040101005c0cc5d10000000049454e44ae426082"
)


def main() -> None:
    import_requests = []
    console_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.add_init_script(
            "Object.defineProperty(crypto, 'randomUUID', { configurable: true, value() { throw new Error('randomUUID unavailable'); } });"
        )

        def handle_assets(route) -> None:
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({"assets": [], "collections": [], "total": 0}),
            )

        def handle_import(route, request) -> None:
            import_requests.append({"method": request.method, "contentType": request.headers.get("content-type", "")})
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "status": "imported",
                        "asset": {
                            "id": "library-operator-test",
                            "ownerUserId": "whitelist:xiawanzhen",
                            "canEdit": True,
                        },
                    }
                ),
            )

        page.route("**/api/library/assets?**", handle_assets)
        page.route(
            "**/api/library/tags?**",
            lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"suggestions": []})),
        )
        page.route("**/api/library/import", handle_import)
        page.goto("http://127.0.0.1:3001/library?role=reference", wait_until="networkidle")

        page.get_by_role("button", name="导入第一批图片").click()
        with page.expect_file_chooser() as chooser_info:
            page.get_by_role("button", name="选择图片").click()
        chooser_info.value.set_files(
            {"name": "operator-upload.png", "mimeType": "image/png", "buffer": PNG_BYTES}
        )
        page.get_by_text("成功 1", exact=True).wait_for(timeout=5000)

        result = {
            "importDialogVisible": page.get_by_role("heading", name="导入到参考图库").is_visible(),
            "importRequests": import_requests,
            "fileRecordVisible": page.get_by_text("operator-upload.png", exact=True).is_visible(),
            "successVisible": page.get_by_text("成功 1", exact=True).is_visible(),
            "consoleErrors": console_errors,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
