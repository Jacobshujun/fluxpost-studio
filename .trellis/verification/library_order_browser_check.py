"""Intercepted Canvas/scheduler sorting, persistence, isolation and race checks."""
import asyncio
import copy
import hashlib
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.async_api import async_playwright, expect

BASE = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:45678")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1") and urlparse(BASE).port != 3001
NOW = "2026-11-06T00:00:00.000Z"
SORTS = ("updated-newest", "updated-oldest", "newest", "oldest", "name-asc", "name-desc", "random")


async def check(browser, width, theme):
    page = await browser.new_page(viewport=dict(width=width, height=960 if width > 600 else 844))
    await page.add_init_script(f"localStorage.setItem('fluxpost-theme', '{theme}')")
    errors, violations, queries, orders, held = [], [], [], [], []
    flags = dict(hold=False, fail=False, hold_page=False)
    page.on("pageerror", lambda e: errors.append(str(e)))
    assets = [dict(id=f"asset-{i:03}", name=f"Image {i:03}.jpg", publicUrl=f"/fixture/{i}.jpg",
                   createdAt=f"2026-10-{1+i%20:02}T00:00:00.000Z", updatedAt=f"2026-11-{1+(62-i)%20:02}T00:00:00.000Z") for i in range(63)]
    by_id = {a["id"]: a for a in assets}

    def ordered(ids, sort, seed=""):
        def key(id):
            a = by_id[id]
            value = hashlib.md5(f"{seed}:{id}".encode()).hexdigest() if sort == "random" else a["updatedAt"] if sort.startswith("updated") else a["name"].lower() if sort.startswith("name") else a["createdAt"]
            return value, id
        return sorted(ids, key=key, reverse=sort in ("newest", "updated-newest", "name-desc"))

    selected = ["asset-048", "asset-001", "asset-028"]
    config_a = dict(assetIds=selected[:], assetNames=[f"Frozen {id}" for id in selected], urls=[f"/frozen/{id}" for id in selected])
    workflow = dict(id="ordering", name="Sorting fixture", ownerUserId="fixture", ownerDisplayName="Fixture", revision=1, isTemplate=False, createdAt=NOW, updatedAt=NOW,
                    graph=dict(nodes=[dict(id="a", type="input.library-images", version=1, label="素材 A", position=dict(x=40, y=40), config=config_a),
                                      dict(id="b", type="input.library-images", version=1, label="素材 B", position=dict(x=440, y=40), config=dict(assetIds=[], assetNames=[], urls=[]))], edges=[], viewport=dict(x=0, y=0, zoom=.7)))
    filt = dict(mode="manual", assetIds=selected[:], search="", tags=[])
    common = dict(ownerUserId="fixture", ownerDisplayName="Fixture", workflowId="ordering", workflowRevision=1, status="draft", revision=1, totalContentTasks=0, totalImageTasks=0, createdAt=NOW, updatedAt=NOW)
    v1 = dict(**common, id="v1", name="Version One", schemaVersion=1, batches=[dict(id="batch", name="Batch", strategy="input-1", sceneFilter=copy.deepcopy(filt), sceneCount=1,
              vehicleFilter=copy.deepcopy(filt), vehicleCountMin=1, vehicleCountMax=1, contentTasks=[], status="draft", createdAt=NOW, updatedAt=NOW)])
    v2 = dict(**common, id="v2", name="Version Two", schemaVersion=2, batches=[], mainTasks=[], definition=dict(parameters=[dict(id=f"p{i}", name=f"图片参数{i}", scope="main", valueType="image", expansion="each",
              source=dict(mode="library-filter", filter=copy.deepcopy(filt)), binding=dict(nodeId=node, fieldKey="assetIds")) for i, node in enumerate(["a", "b"])], expansion=dict(main="cartesian", child="cartesian"), childResult=dict(nodeId="a", outputPort="images", artifactKind="images"), aggregationPolicy="all-success"))
    schedules = {"v1": v1, "v2": v2}

    async def handler(route):
        nonlocal workflow
        req = route.request
        url = urlparse(req.url)
        path, q = url.path, parse_qs(url.query)
        if url.netloc != urlparse(BASE).netloc:
            violations.append(req.url)
            await route.abort()
            return
        if path.startswith(("/fixture/", "/frozen/")) or path.endswith("/thumbnail"):
            await route.fulfill(content_type="image/svg+xml", body='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#4488bb"/></svg>')
            return
        if not path.startswith("/api/"):
            await route.continue_()
            return
        data = {}
        if path == "/api/accounts/session": data = dict(account=dict(id="fixture", username="fixture", displayName="Fixture", role="admin"), hasAccounts=True)
        elif path == "/api/config": data = dict(status={})
        elif path == "/api/canvas/workflows": data = dict(workflows=[workflow])
        elif path == "/api/canvas/workflows/ordering":
            if req.method == "PATCH": workflow = {**workflow, **req.post_data_json, "revision": workflow["revision"] + 1}
            data = dict(workflow=workflow)
        elif path == "/api/canvas/runs": data = dict(runs=[], latestSuccessfulNodeRuns=[])
        elif path == "/api/canvas/schedules": data = dict(schedules=list(schedules.values()))
        elif path in ("/api/canvas/schedules/v1", "/api/canvas/schedules/v2"):
            schedule = schedules[path.rsplit("/", 1)[-1]]
            if req.method == "PATCH":
                body = req.post_data_json
                assert body["action"] == "save"
                schedule.update({k: copy.deepcopy(body[k]) for k in ("name", "definition", "batches") if k in body})
                schedule["revision"] += 1
            data = dict(schedule=schedule)
        elif path == "/api/library/navigation": data = dict(collections=[dict(id="ordinary", name="普通图集")], smartFolders=[dict(id="smart", name="智能图集")], counts=dict(all=63, favorites=0, uncategorized=63))
        elif path == "/api/library/assets/order":
            body = req.post_data_json
            orders.append(copy.deepcopy(body))
            if flags["fail"]:
                await route.fulfill(status=400, json=dict(error="所选素材已删除或无权访问，已保留原选择"))
                return
            data = dict(assetIds=ordered(body["assetIds"], body["sort"], body.get("randomSeed", "")))
            if flags["hold"]:
                held.append((route, data))
                return
        elif path == "/api/library/assets":
            queries.append(q)
            ids = ordered(list(by_id), q.get("sort", ["newest"])[0], q.get("randomSeed", [""])[0])
            offset, limit = int(q.get("cursor", ["0"])[0]), int(q.get("limit", ["24"])[0])
            data = dict(assets=[by_id[id] for id in ids[offset:offset+limit]], total=len(ids))
            if offset+limit < len(ids): data["nextCursor"] = str(offset+limit)
            if flags["hold_page"] and offset:
                held.append((route, data))
                return
        elif req.method != "GET": raise AssertionError(f"Unexpected write {path}")
        await route.fulfill(json=data)

    await page.route("**/*", handler)
    await page.goto(f"{BASE}/canvas?workflowId=ordering", wait_until="networkidle")

    async def open_node(id):
        await page.locator(f'.react-flow__node[data-id="{id}"]').evaluate("e => e.dispatchEvent(new MouseEvent('click', {bubbles:true}))")
        picker = page.locator(".canvas-snapshot-picker")
        await expect(picker).to_be_visible()
        return picker

    async def wait_saved():
        # Autosave is debounced; poll fixture state from the UI's persisted label.
        await page.wait_for_timeout(1100)

    a = await open_node("a")
    await expect(a.get_by_label("素材排序")).to_have_value("updated-newest")
    assert not queries and not orders, "Legacy open must be idle and preserve selected snapshots"
    scope = a.get_by_label("图集或智能文件夹")
    await scope.focus()
    await scope.select_option("collection:ordinary")
    await expect(a.locator(".canvas-picker-results label")).to_have_count(24)
    for sort in SORTS[1:]:
        await a.get_by_label("素材排序").select_option(sort)
        await expect(a.get_by_label("素材排序")).to_have_value(sort)
        await expect(a.locator("fieldset")).not_to_have_attribute("disabled", "")
        assert set(orders[-1]["assetIds"]) == set(selected)
        expected = ordered(selected, sort, orders[-1].get("randomSeed", ""))
        assert await a.locator(".canvas-picker-selected > div > span").all_text_contents() == [f"{i+1}. Frozen {id}" for i, id in enumerate(expected)]
    seed = orders[-1]["randomSeed"]
    await a.get_by_placeholder("标签", exact=True).fill("A-tag")
    await a.get_by_placeholder("搜索图片", exact=True).fill("A-search")
    await wait_saved()
    a_state = copy.deepcopy(workflow["graph"]["nodes"][0]["config"])
    assert a_state["librarySort"] == "random" and a_state["libraryRandomSeed"] == seed
    assert a_state["urls"] == [f"/frozen/{id}" for id in a_state["assetIds"]]
    # Same node's manual move survives list requests and reopening.
    await a.get_by_title("下移", exact=True).first.click()
    await wait_saved()
    manually_ordered = workflow["graph"]["nodes"][0]["config"]["assetIds"][:]
    b = await open_node("b")
    await expect(b.get_by_placeholder("搜索图片", exact=True)).to_have_value("")
    await expect(b.get_by_label("素材排序")).to_have_value("updated-newest")
    await b.get_by_label("图集或智能文件夹").focus()
    await b.get_by_label("图集或智能文件夹").select_option("smart:smart")
    await b.get_by_placeholder("标签", exact=True).fill("B-tag")
    await b.get_by_label("素材排序").select_option("oldest")
    await expect(b.get_by_label("素材排序")).to_have_value("oldest")
    await wait_saved()
    assert workflow["graph"]["nodes"][0]["config"]["assetIds"] == manually_ordered
    await page.reload(wait_until="networkidle")
    a = await open_node("a")
    await expect(a.get_by_placeholder("搜索图片", exact=True)).to_have_value("A-search")
    await expect(a.get_by_placeholder("标签", exact=True)).to_have_value("A-tag")
    await expect(a.get_by_label("图集或智能文件夹")).to_have_value("collection:ordinary")
    await expect(a.get_by_label("素材排序")).to_have_value("random")
    assert workflow["graph"]["nodes"][0]["config"]["assetIds"] == manually_ordered
    await expect(a.locator(".canvas-picker-results label")).to_have_count(24)
    await a.get_by_role("button", name="加载更多", exact=True).click()
    await expect(a.locator(".canvas-picker-results label")).to_have_count(48)
    assert queries[-1]["randomSeed"] == [seed]
    flags["hold_page"] = True
    await a.get_by_role("button", name="加载更多", exact=True).click()
    await expect(a.get_by_role("button", name="正在加载...", exact=True)).to_be_visible()
    await a.get_by_placeholder("搜索图片", exact=True).fill("A-search-new")
    await expect(a.locator(".canvas-picker-results label")).to_have_count(24)
    flags["hold_page"] = False
    assert held, "A stale cursor page must actually be in flight"
    for route, data in held:
        try: await route.fulfill(json=data)
        except Exception: pass
    held.clear()
    await expect(a.locator(".canvas-picker-results label")).to_have_count(24)
    await a.get_by_role("button", name="重新打乱", exact=True).click()
    await expect(a.locator("fieldset")).not_to_have_attribute("disabled", "")
    assert orders[-1]["randomSeed"] != seed
    await wait_saved()
    stable_state = copy.deepcopy(workflow["graph"]["nodes"][0]["config"])
    flags["fail"] = True
    await a.get_by_label("素材排序").select_option("name-desc")
    await expect(a.locator(".canvas-picker-error")).to_contain_text("已保留原选择")
    await expect(a.get_by_label("素材排序")).to_have_value("random")
    flags["fail"] = False
    assert workflow["graph"]["nodes"][0]["config"] == stable_state
    # Hold an ordering response, switch nodes, then release: no cross-node commit.
    flags["hold"] = True
    await a.get_by_label("素材排序").select_option("name-asc")
    await expect(a.locator("fieldset")).to_have_attribute("disabled", "")
    b = await open_node("b")
    flags["hold"] = False
    assert held
    for route, data in held:
        try: await route.fulfill(json=data)
        except Exception: pass  # Aborted by the picker on unmount.
    held.clear()
    await expect(b.get_by_label("素材排序")).to_have_value("oldest")
    await wait_saved()
    assert workflow["graph"]["nodes"][0]["config"] == stable_state
    await page.get_by_role("button", name="关闭属性", exact=True).click()
    await page.get_by_role("button", name="批量调度", exact=True).click()
    center = page.get_by_role("dialog", name="Canvas 批量调度", exact=True)
    for sid, name in (("v1", "Version One"), ("v2", "Version Two")):
        await center.locator(".canvas-schedule-list").get_by_role("button").filter(has_text=name).click()
        picker = center.locator(".canvas-schedule-assets").first
        other = center.locator(".canvas-schedule-assets").nth(1)
        await picker.get_by_label("素材排序").select_option("name-desc")
        await expect(picker.get_by_label("素材排序")).to_have_value("name-desc")
        await expect(other.get_by_label("素材排序")).to_have_value("updated-newest")
        await wait_saved()
        filters = [schedules[sid]["batches"][0][k] for k in ("sceneFilter", "vehicleFilter")] if sid == "v1" else [p["source"]["filter"] for p in schedules[sid]["definition"]["parameters"]]
        assert filters[0]["sort"] == "name-desc" and filters[0]["assetIds"] == sorted(selected, reverse=True)
        assert filters[1]["assetIds"] == selected
        await picker.get_by_role("button", name="全选当前筛选结果", exact=True).click()
        await expect(picker.get_by_role("button", name="已全选", exact=True)).to_be_visible()
        await wait_saved()
        current = schedules[sid]["batches"][0]["sceneFilter"] if sid == "v1" else schedules[sid]["definition"]["parameters"][0]["source"]["filter"]
        assert current["assetIds"] == ordered(list(by_id), "name-desc")
        await picker.get_by_label("素材排序").select_option("random")
        await expect(picker.get_by_label("素材排序")).to_have_value("random")
        await wait_saved()
    await page.reload(wait_until="networkidle")
    if not await page.get_by_role("dialog", name="Canvas 批量调度", exact=True).is_visible():
        await page.get_by_role("button", name="批量调度", exact=True).click()
    center = page.get_by_role("dialog", name="Canvas 批量调度", exact=True)
    await center.locator(".canvas-schedule-list").get_by_role("button").filter(has_text="Version Two").click()
    await expect(center.get_by_label("素材排序").first).to_have_value("random")
    assert not errors, errors
    assert not violations, violations
    assert not await page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    Path("test-artifacts").mkdir(exist_ok=True)
    await center.locator(".canvas-schedule-assets").first.scroll_into_view_if_needed()
    await page.screenshot(path=f"test-artifacts/library-order-{theme}-{width}.png", full_page=True)
    await page.close()
    print(f"Library ordering {theme} {width}: node isolation/restore, seven sorts, frozen selection, random paging, failure/race, V1/V2 isolation and select-all passed", flush=True)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        try:
            for theme in ("professional", "editorial", "creator"):
                for width in (1440, 390): await check(browser, width, theme)
        finally: await browser.close()

if __name__ == "__main__": asyncio.run(main())
