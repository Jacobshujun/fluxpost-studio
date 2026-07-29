import assert from "node:assert/strict";
import { statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const baseUrl = process.env.FLUXPOST_BROWSER_BASE_URL || "http://127.0.0.1:3012";
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1WQ0gAAAABJRU5ErkJggg==";

const copyEntries = [
  copyEntry("copy-alpha", "Alpha 文案", "张三", "2026-01-02T00:00:00.000Z"),
  copyEntry("copy-beta", "Beta 文案", "李四", "2026-01-01T00:00:00.000Z"),
  copyEntry("copy-gamma", "Gamma 文案", "王五", "2026-01-03T00:00:00.000Z"),
];
const imageAssets = [
  imageAsset("asset-alpha", "Alpha 图片", "张三", "2026-01-02T00:00:00.000Z"),
  imageAsset("asset-beta", "Beta 图片", "李四", "2026-01-01T00:00:00.000Z"),
  imageAsset("asset-gamma", "Gamma 图片", "王五", "2026-01-03T00:00:00.000Z"),
  imageAsset("asset-delta", "Delta 图片", "赵六", "2026-01-04T00:00:00.000Z"),
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await checkDesktop(browser);
    await checkMobile(browser);
  } finally {
    await browser.close();
  }
  for (const name of [
    ".tmp-shared-copy-desktop.png",
    ".tmp-shared-library-desktop.png",
    ".tmp-shared-copy-mobile.png",
    ".tmp-shared-library-mobile.png",
  ]) assert.ok(statSync(path.join(root, name)).size > 10_000, `${name} is unexpectedly small.`);
  console.log("Shared libraries desktop/mobile sorting, persistence, marquee, batch, and layout checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function checkDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => window.localStorage.setItem("fluxpost-theme", "creator"));
  const page = await context.newPage();
  const errors = captureErrors(page);
  await installMocks(page);

  await page.goto(`${baseUrl}/copy-library`, { waitUntil: "networkidle" });
  await assertNativeOptionTheme(page, "文案排序");
  await assertCopySortAndPersistence(page);
  await page.getByRole("button", { name: "新建文案" }).click();
  const teamButton = page.getByRole("group", { name: "文案可见性" }).getByRole("button", { name: "团队共享" });
  assert.match(await teamButton.getAttribute("class"), /segmentActive/);
  await marqueeSelectRows(page, "[data-marquee-id]", 0, 1);
  assert.equal(await page.locator('[data-marquee-id] input[type="checkbox"]:checked').count(), 2);
  await page.getByRole("button", { name: "设为共享" }).click();
  await page.getByRole("status").filter({ hasText: "已更新 2/2 篇文案" }).waitFor();
  await page.getByRole("button", { name: "批量删除" }).click();
  await page.getByRole("alertdialog").getByText("确认删除 2 篇文案？").waitFor();
  await page.getByRole("alertdialog").getByRole("button", { name: "取消" }).click();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(root, ".tmp-shared-copy-desktop.png"), fullPage: true });

  await page.goto(`${baseUrl}/library?role=reference`, { waitUntil: "networkidle" });
  await assertNativeOptionTheme(page, "图片排序");
  await assertImageSortAndPersistence(page);
  await marqueeSelectCards(page);
  assert.equal(await page.locator('[data-marquee-id] input[type="checkbox"]:checked').count(), 2);
  await page.getByRole("checkbox", { name: "全选当前筛选结果" }).check();
  assert.equal(await page.locator('[data-marquee-id] input[type="checkbox"]:checked').count(), imageAssets.length);
  const vehicleAssetsResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === "/api/library/assets" && url.searchParams.get("role") === "vehicle";
  });
  await page.getByRole("tab", { name: "车型图库" }).click();
  await vehicleAssetsResponse;
  await page.waitForURL("**/library?role=vehicle");
  await page.waitForFunction(() => !document.querySelector('input[aria-label="全选当前筛选结果"]')?.disabled);
  await page.keyboard.press("Control+A");
  assert.equal(await page.locator('[data-marquee-id] input[type="checkbox"]:checked').count(), imageAssets.length);
  await assertNoHorizontalOverflow(page);
  assert.equal(await page.getByRole("dialog", { name: "导入到参考图库" }).count(), 0);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(root, ".tmp-shared-library-desktop.png"), fullPage: true });

  assert.deepEqual(errors, []);
  await context.close();
}

async function checkMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = captureErrors(page);
  await installMocks(page);

  await page.goto(`${baseUrl}/copy-library`, { waitUntil: "networkidle" });
  await page.locator('[data-marquee-id] input[type="checkbox"]').first().check();
  await page.getByText("已选择 1 篇").first().waitFor();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(root, ".tmp-shared-copy-mobile.png"), fullPage: true });
  await page.locator("[data-marquee-id]").first().locator("button").click();
  await page.getByRole("button", { name: "返回文案列表" }).click();
  await page.locator('[data-marquee-id] input[type="checkbox"]').first().waitFor({ state: "visible" });

  await page.goto(`${baseUrl}/library?role=reference`, { waitUntil: "networkidle" });
  await page.locator('[data-marquee-id] input[type="checkbox"]').first().check();
  await page.getByText("已选择 1 张").first().waitFor();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(root, ".tmp-shared-library-mobile.png"), fullPage: true });

  assert.deepEqual(errors, []);
  await context.close();
}

async function assertCopySortAndPersistence(page) {
  const sort = page.getByLabel("文案排序");
  await sort.selectOption("owner-asc");
  await assertFirstItem(page, "[data-marquee-id] strong", "Beta 文案");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByLabel("文案排序").inputValue(), "owner-asc");
  await assertFirstItem(page, "[data-marquee-id] strong", "Beta 文案");
}

async function assertImageSortAndPersistence(page) {
  const sort = page.getByLabel("图片排序");
  await sort.selectOption("owner-asc");
  await assertFirstItem(page, "[data-marquee-id] strong", "Beta 图片");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByLabel("图片排序").inputValue(), "owner-asc");
  await assertFirstItem(page, "[data-marquee-id] strong", "Beta 图片");
}

async function marqueeSelectRows(page, selector, firstIndex, secondIndex) {
  const rows = page.locator(selector);
  const listBox = await rows.first().locator("..").boundingBox();
  const first = await rows.nth(firstIndex).boundingBox();
  const second = await rows.nth(secondIndex).boundingBox();
  assert.ok(listBox && first && second);
  await drag(page, listBox.x + 3, first.y + first.height / 2, first.x + first.width - 6, first.y + first.height - 6);
  await page.keyboard.down("Control");
  await drag(page, listBox.x + 3, second.y + second.height / 2, second.x + second.width - 6, second.y + second.height - 6);
  await page.keyboard.up("Control");
}

async function marqueeSelectCards(page) {
  const cards = page.locator("[data-marquee-id]");
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  assert.ok(first && second);
  const gapX = (first.x + first.width + second.x) / 2;
  await drag(page, gapX, first.y + 8, first.x + 8, first.y + first.height - 8);
  const updatedFirst = await cards.nth(0).boundingBox();
  const updatedSecond = await cards.nth(1).boundingBox();
  assert.ok(updatedFirst && updatedSecond);
  const updatedGapX = (updatedFirst.x + updatedFirst.width + updatedSecond.x) / 2;
  await page.keyboard.down("Control");
  await drag(page, updatedGapX, updatedSecond.y + 8, updatedSecond.x + updatedSecond.width - 8, updatedSecond.y + updatedSecond.height - 8);
  await page.keyboard.up("Control");
}

async function drag(page, startX, startY, endX, endY) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();
}

async function assertFirstItem(page, selector, expected) {
  await page.waitForFunction(({ selector, expected }) => document.querySelector(selector)?.textContent?.includes(expected), { selector, expected });
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(overflow.scrollWidth <= overflow.width + 1, `Horizontal overflow: ${JSON.stringify(overflow)}`);
}

async function assertNativeOptionTheme(page, selectLabel) {
  const optionStyle = await page.getByLabel(selectLabel).locator("option").first().evaluate((option) => {
    const style = window.getComputedStyle(option);
    return { backgroundColor: style.backgroundColor, color: style.color };
  });
  assert.notEqual(optionStyle.backgroundColor, "rgba(0, 0, 0, 0)", `${selectLabel} option background must be solid.`);
  assert.notEqual(optionStyle.backgroundColor, optionStyle.color, `${selectLabel} option text must contrast with its background.`);
}

function captureErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`response: ${response.request().method()} ${response.status()} ${response.url()}`);
  });
  return errors;
}

async function installMocks(page) {
  await page.route("**/api/copy-library**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const match = url.pathname.match(/^\/api\/copy-library\/([^/]+)$/);
    if (match && request.method() === "PATCH") {
      const current = copyEntries.find((entry) => entry.id === match[1]);
      const patch = request.postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entry: { ...current, ...patch } }) });
    }
    if (match && request.method() === "DELETE") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ deleted: true, id: match[1] }) });
    const entries = sortRecords(copyEntries, url.searchParams.get("sort") || "newest", { time: "updatedAt", name: "title" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries, tags: ["测试"] }) });
  });
  await page.route("**/api/library/assets**", async (route) => {
    const url = new URL(route.request().url());
    const assets = sortRecords(imageAssets, url.searchParams.get("sort") || "newest", { time: "createdAt", name: "name" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assets, collections: [], total: assets.length }) });
  });
  await page.route("**/api/library/tags**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tags: [] }),
  }));
}

function sortRecords(records, sort, fields) {
  const direction = sort === "newest" || sort === "name-desc" || sort === "owner-desc" ? -1 : 1;
  const key = sort === "newest" || sort === "oldest" ? fields.time : sort.startsWith("name") ? fields.name : "ownerDisplayName";
  return [...records].sort((left, right) => direction * String(left[key]).localeCompare(String(right[key]), "zh-CN", { numeric: true, sensitivity: "base" }) || direction * left.id.localeCompare(right.id));
}

function copyEntry(id, title, ownerDisplayName, updatedAt) {
  return { id, ownerUserId: id, ownerDisplayName, visibility: "team", title, body: `${title} 正文`, tags: ["测试"], createdAt: updatedAt, updatedAt, canEdit: true };
}

function imageAsset(id, name, ownerDisplayName, createdAt) {
  const tags = { scenes: [], vehicleModels: [], vehicleColors: [], angles: [], people: "unknown", customTags: [] };
  return {
    id, ownerUserId: id, ownerDisplayName, name, originalName: `${name}.png`, objectKey: id, publicUrl: pixel,
    mimeType: "image/png", extension: ".png", byteSize: 68, width: 1, height: 1, sha256: id.padEnd(64, "0"),
    roles: ["reference"], collectionIds: [], visibility: "team", aiTags: tags, manualOverrides: {}, effectiveTags: tags,
    taggingStatus: "completed", cleanupStatus: "ready", canEdit: true, createdAt, updatedAt: createdAt,
  };
}
