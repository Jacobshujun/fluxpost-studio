import { chromium } from "playwright";

const baseUrl = process.env.FLUXPOST_BROWSER_BASE_URL || "http://127.0.0.1:3001";
const browserExecutable = process.env.FLUXPOST_BROWSER_EXECUTABLE;
const pixel = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const emptyTags = { scenes: [], vehicleModels: [], vehicleColors: [], angles: [], people: "unknown", customTags: [] };

function makeAsset(id, name, collectionIds, canEdit = true) {
  return {
    id,
    ownerUserId: canEdit ? "owner-1" : "owner-2",
    ownerDisplayName: canEdit ? "Owner One" : "Owner Two",
    name,
    originalName: `${name}.jpg`,
    objectKey: `library/${id}.jpg`,
    publicUrl: pixel,
    mimeType: "image/jpeg",
    extension: ".jpg",
    byteSize: 1024,
    sha256: id.padEnd(64, "0"),
    roles: ["reference", "vehicle"],
    roleAddedAt: { reference: "2026-08-26T00:00:00.000Z", vehicle: "2026-08-26T00:00:00.000Z" },
    collectionIds,
    visibility: "team",
    aiTags: emptyTags,
    manualOverrides: {},
    effectiveTags: emptyTags,
    taggingStatus: "completed",
    cleanupStatus: "ready",
    canEdit,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

const browser = await chromium.launch({
  headless: true,
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
});
try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 960 }, { name: "mobile", width: 390, height: 844 }]) {
    const calls = [];
    const makeInitialAssets = () => [
      makeAsset("asset-1", "Front view", ["campaign", "archive"]),
      makeAsset("asset-2", "Rear view", ["archive"]),
      makeAsset("readonly", "Shared view", ["detail", "archive"], false),
    ];
    let assets = makeInitialAssets();
    let collections = [
      { id: "campaign", ownerUserId: "owner-1", ownerDisplayName: "Owner One", role: "reference", name: "Campaign", relativePath: "Campaign", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" },
      { id: "detail", ownerUserId: "owner-1", ownerDisplayName: "Owner One", role: "reference", name: "Detail", parentId: "campaign", relativePath: "Campaign/Detail", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" },
      { id: "archive", ownerUserId: "owner-1", ownerDisplayName: "Owner One", role: "reference", name: "Archive", relativePath: "Archive", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" },
    ];
    let releaseAdd;
    const addGate = new Promise((resolve) => { releaseAdd = resolve; });
    let holdFirstAdd = true;
    const page = await browser.newPage({ viewport });
    page.on("dialog", (dialog) => dialog.accept());
    page.on("console", (message) => { if (message.type() === "error") throw new Error(`${viewport.name} console error: ${message.text()}`); });
    await page.route("**/api/library/tags?**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tags: [] }),
    }));
    await page.route("**/api/library/assets?**", async (route) => {
      const url = new URL(route.request().url());
      const role = url.searchParams.get("role") === "vehicle" ? "vehicle" : "reference";
      const collectionId = url.searchParams.get("collectionId");
      const visible = collectionId ? assets.filter((asset) => asset.collectionIds.includes(collectionId)) : assets;
      const offset = Number.parseInt(url.searchParams.get("cursor") || "0", 10);
      const pageAssets = visible.slice(offset, offset + 60);
      const nextCursor = offset + pageAssets.length < visible.length ? String(offset + pageAssets.length) : undefined;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ assets: pageAssets, collections: collections.map((collection) => ({ ...collection, role })), total: visible.length, nextCursor }),
      });
    });
    await page.route("**/api/library/assets/batch", async (route) => {
      const body = route.request().postDataJSON();
      calls.push(body);
      if (body.action === "add_to_collections" && body.assetIds.length === 3 && holdFirstAdd) {
        holdFirstAdd = false;
        await addGate;
      }
      let targetIds = [];
      let collection;
      if (body.action === "add_to_collections") targetIds = body.collectionIds;
      if (body.action === "remove_from_collection") targetIds = [body.collectionId];
      if (body.action === "create_collection_and_add") {
        const parent = collections.find((item) => item.id === body.parentId);
        const relativePath = parent ? `${parent.relativePath}/${body.name.trim()}` : body.name.trim();
        collection = collections.find((item) => item.relativePath === relativePath);
        if (!collection) {
          collection = { id: `created-${collections.length}`, ownerUserId: "owner-1", ownerDisplayName: "Owner One", role: body.role, name: body.name.trim(), parentId: body.parentId, relativePath, createdAt: "2026-08-26T01:00:00.000Z", updatedAt: "2026-08-26T01:00:00.000Z" };
          collections.push(collection);
        }
        targetIds = [collection.id];
      }
      const changed = [];
      const unchangedAssetIds = [];
      const failures = [];
      assets = assets.map((asset) => {
        if (!body.assetIds.includes(asset.id)) return asset;
        if (!asset.canEdit) {
          failures.push({ assetId: asset.id, error: "Library asset is read-only." });
          return asset;
        }
        const nextIds = body.action === "remove_from_collection"
          ? asset.collectionIds.filter((id) => id !== targetIds[0])
          : [...new Set([...asset.collectionIds, ...targetIds])];
        if (JSON.stringify(nextIds) === JSON.stringify(asset.collectionIds)) {
          unchangedAssetIds.push(asset.id);
          return asset;
        }
        const next = { ...asset, collectionIds: nextIds, updatedAt: "2026-08-26T01:00:00.000Z" };
        changed.push(next);
        return next;
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ action: body.action, collection, assets: changed, unchangedAssetIds, failures }) });
    });

    assets = Array.from({ length: 65 }, (_, index) => makeAsset(`bulk-${index + 1}`, `Bulk ${index + 1}`, ["archive"]));
    await page.goto(`${baseUrl}/library?role=reference`, { waitUntil: "networkidle" });
    await page.getByLabel("全选当前筛选结果").click();
    await page.getByText("已选择 65 张").waitFor();
    await page.getByRole("button", { name: "管理集合" }).click();
    await page.getByLabel("集合 Campaign", { exact: true }).check();
    await page.getByRole("button", { name: "加入所选集合" }).click();
    await page.getByText("集合操作完成：已更新 65，原本已归类 0，只读跳过 0，失败 0").waitFor();
    await page.getByText("已选择 65 张").waitFor();
    if (await page.locator("article").count() !== 65) throw new Error(`${viewport.name}: collection refresh collapsed the loaded 65-asset result to one page.`);
    const largeAddCall = calls.find((call) => call.action === "add_to_collections" && call.assetIds.length === 65);
    if (largeAddCall?.collectionIds[0] !== "campaign") throw new Error(`${viewport.name}: the paginated select-all collection payload was incomplete.`);

    assets = makeInitialAssets();
    await page.goto(`${baseUrl}/library?role=reference`, { waitUntil: "networkidle" });
    await page.getByLabel("全选当前筛选结果").check();
    await page.getByRole("button", { name: "管理集合" }).click();
    await page.getByRole("region", { name: "批量管理集合" }).waitFor();
    const archive = page.getByLabel("集合 Archive");
    if (!(await archive.isDisabled())) throw new Error(`${viewport.name}: a fully populated collection remained selectable.`);
    await page.getByPlaceholder("搜索集合名称或路径").fill("Campaign/Detail");
    await page.getByText("Campaign/Detail", { exact: true }).waitFor();
    await page.getByPlaceholder("搜索集合名称或路径").fill("");
    await page.getByLabel("集合 Campaign", { exact: true }).check();
    const addButton = page.getByRole("button", { name: "加入所选集合" });
    await addButton.click();
    const pendingButtons = page.getByRole("button", { name: "处理中..." });
    if (await pendingButtons.count() !== 2 || !(await pendingButtons.nth(0).isDisabled()) || !(await pendingButtons.nth(1).isDisabled())) {
      throw new Error(`${viewport.name}: duplicate collection submission was not disabled while pending.`);
    }
    releaseAdd();
    await page.getByText("集合操作完成：已更新 1，原本已归类 1，只读跳过 1，失败 0").waitFor();
    const addCall = calls.find((call) => call.action === "add_to_collections" && call.assetIds.length === 3);
    if (JSON.stringify(addCall?.collectionIds) !== JSON.stringify(["campaign"]) || addCall?.assetIds.length !== 3) throw new Error(`${viewport.name}: multi-select add payload is incorrect.`);

    await page.getByLabel("新集合名称").fill("August");
    await page.getByRole("button", { name: "新建并加入" }).click();
    await page.getByText("集合操作完成：已更新 2，原本已归类 0，只读跳过 1，失败 0").waitFor();
    const createCall = calls.find((call) => call.action === "create_collection_and_add");
    if (createCall?.parentId !== undefined || createCall?.name !== "August") throw new Error(`${viewport.name}: top-level create-and-add payload is incorrect.`);

    await page.getByRole("button", { name: "Campaign", exact: true }).click();
    await page.getByText("已选择 2 张").waitFor();
    await page.getByRole("button", { name: "移出当前集合" }).click();
    await page.getByText("集合操作完成：已更新 2，原本已移出 0，只读跳过 0，失败 0").waitFor();
    const removeCall = calls.find((call) => call.action === "remove_from_collection");
    if (removeCall?.collectionId !== "campaign" || removeCall?.assetIds.length !== 2) throw new Error(`${viewport.name}: current-collection removal payload is incorrect.`);
    if (await page.getByRole("button", { name: "管理集合" }).count()) throw new Error(`${viewport.name}: selection was not reconciled after current-collection removal.`);

    await page.getByRole("tab", { name: "车型图库" }).click();
    await page.locator("article input[type='checkbox']").first().check();
    await page.getByRole("button", { name: "管理集合" }).click();
    await page.getByText("车型图库", { exact: true }).last().waitFor();

    const metrics = await page.evaluate(() => {
      const controls = [...document.querySelectorAll("button, input")].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        clipped: controls.filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).map((element) => element.getAttribute("aria-label") || element.textContent?.trim()).filter(Boolean),
      };
    });
    if (metrics.documentWidth > metrics.viewportWidth + 1) throw new Error(`${viewport.name}: horizontal overflow ${JSON.stringify(metrics)}`);
    if (metrics.clipped.length) throw new Error(`${viewport.name}: clipped collection controls ${metrics.clipped.join(", ")}`);
    await page.close();
  }
  console.log("Library batch collection browser check passed at 1440x960 and 390x844 without live services.");
} finally {
  await browser.close();
}
