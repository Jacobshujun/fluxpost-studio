import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const { chromium } = await loadPlaywright();
const baseUrl = process.env.FLUXPOST_BROWSER_BASE_URL || "http://127.0.0.1:45679";
const now = "2026-08-27T10:00:00.000Z";
const requests = [];

const sourceItems = [
  sourceItem("source-1", "雨夜智驾体验", ["实测试驾", "经验干货"], ["重点参考", "小鹏 MONA"]),
  sourceItem("source-2", "城市空间体验", ["经验干货"], ["待改写"]),
];
const project = contentProject(sourceItems);
const selectionItems = sourceItems.map((item) => selectionItem(item));
const workflow = canvasWorkflow(selectionItems[0]);
let schedule = canvasSchedule(workflow, selectionItems[0]);

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 960, label: "desktop" }, { width: 390, height: 844, label: "mobile" }]) {
    await verifyContent(browser, viewport);
    await verifyCanvas(browser, viewport);
  }
  assert.ok(requests.some((entry) => entry.path === "/api/content-pool/tags" && entry.method === "POST"), "batch tag mutation should reach the tag API");
  assert.ok(requests.some((entry) => entry.path === "/api/content/items" && entry.method === "PATCH" && entry.body?.patch?.customTags?.includes("活动素材")), "single edit should persist custom tags");
  assert.ok(requests.some((entry) => entry.path === "/api/content-pool/selection" && entry.query.getAll("customTag").includes("重点参考")), "Canvas should pass customTag filters");
  console.log("Content-pool tag browser check passed at 1440x960 and 390x844.");
} finally {
  await browser.close();
}

async function verifyContent(browserInstance, viewport) {
  const page = await browserInstance.newPage({ viewport });
  const errors = collectErrors(page);
  await installMocks(page);
  await page.goto(`${baseUrl}/content`, { waitUntil: "networkidle" });
  const cards = page.locator(".content-desk-source-card");
  await cards.first().waitFor();
  assert.equal(await cards.count(), 2, `${viewport.label}: content desk should show both fixture items`);

  const search = page.getByLabel("搜索内容池");
  await search.fill("小鹏 mona");
  await cards.getByText("雨夜智驾体验", { exact: true }).waitFor();
  assert.equal(await cards.count(), 1, `${viewport.label}: ordinary search should match custom tags`);
  await search.fill("");

  const tagDetails = page.locator(".content-pool-tag-filters");
  if (!(await tagDetails.getAttribute("open"))) await tagDetails.locator("summary").click();
  await tagDetails.getByText("内容分类 · 同时满足", { exact: true }).waitFor();
  await tagDetails.getByRole("button", { name: "实测试驾", exact: true }).click();
  assert.equal(await cards.count(), 1, `${viewport.label}: fixed content category should filter independently`);
  await page.getByRole("button", { name: "清除筛选" }).click();

  if (!(await tagDetails.getAttribute("open"))) await tagDetails.locator("summary").click();
  const filterPicker = tagDetails.getByLabel("搜索并选择自定义标签");
  await filterPicker.click();
  await tagDetails.getByRole("option", { name: /重点参考/ }).click();
  assert.equal(await cards.count(), 1, `${viewport.label}: custom tag picker should apply AND filters`);
  await page.getByRole("button", { name: "清除筛选" }).click();

  await cards.nth(0).getByLabel("选择内容池样本").click();
  await cards.nth(1).getByLabel("选择内容池样本").click();
  await page.getByRole("button", { name: "管理标签" }).click();
  const batchPanel = page.locator(".content-pool-batch-tags");
  await batchPanel.waitFor();
  await batchPanel.getByLabel("输入或选择要添加的标签").fill("批量跟进");
  await batchPanel.getByLabel("输入或选择要添加的标签").press("Enter");
  await page.getByText(/标签操作完成：已更新 1 条/).waitFor();
  await batchPanel.getByLabel("标签更新失败明细").getByText("source-2", { exact: true }).waitFor();
  await batchPanel.getByText("自定义标签数量超过 20 个", { exact: true }).waitFor();

  const editorPicker = page.getByLabel("输入或选择运营标签");
  await editorPicker.fill("活动素材");
  await editorPicker.press("Enter");
  await page.getByRole("button", { name: "保存样本" }).click();
  await page.getByText("样本已保存。", { exact: true }).waitFor();

  await assertNoDocumentOverflow(page, viewport.label, "/content");
  await page.screenshot({ path: `.tmp-content-pool-tags-content-${viewport.label}.png`, fullPage: true });
  assert.deepEqual(errors, [], `${viewport.label}: /content browser errors`);
  await page.close();
}

async function verifyCanvas(browserInstance, viewport) {
  const page = await browserInstance.newPage({ viewport });
  const errors = collectErrors(page);
  await installMocks(page);
  await page.goto(`${baseUrl}/canvas`, { waitUntil: "networkidle" });
  await page.getByTestId("canvas-stage").locator(".react-flow__pane").waitFor();
  await page.locator('.react-flow__node[data-id="content-pool"] .canvas-node-head').click();
  const inspectorBrowser = page.locator(".canvas-inspector-content .canvas-content-pool-browser");
  await inspectorBrowser.locator("article").first().waitFor();
  await inspectorBrowser.locator("details > summary").click();
  await inspectorBrowser.getByText("内容分类（同时满足）", { exact: true }).waitFor();
  const picker = inspectorBrowser.getByLabel("搜索并选择自定义标签");
  await picker.click();
  await inspectorBrowser.getByRole("option", { name: /重点参考/ }).click();
  await inspectorBrowser.getByText("1 条匹配", { exact: false }).waitFor();

  await page.getByRole("button", { name: "批量调度" }).click();
  const dialog = page.getByRole("dialog", { name: "Canvas 批量调度" });
  await dialog.waitFor();
  const parameter = dialog.locator('.canvas-schedule-parameter:has(input[value="内容池素材"])');
  await parameter.locator("article").first().waitFor();
  const scheduleDetails = parameter.locator(".canvas-content-pool-browser details");
  if (!(await scheduleDetails.getAttribute("open"))) await scheduleDetails.locator("summary").click();
  const schedulePicker = parameter.getByLabel("搜索并选择自定义标签");
  await schedulePicker.click();
  await parameter.getByRole("option", { name: /重点参考/ }).click();
  await parameter.getByText("1 条匹配", { exact: false }).waitFor();

  await assertNoDocumentOverflow(page, viewport.label, "/canvas");
  const panelOverflow = await dialog.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  assert.ok(panelOverflow.scroll <= panelOverflow.client, `${viewport.label}: Canvas schedule dialog overflow ${JSON.stringify(panelOverflow)}`);
  await page.screenshot({ path: `.tmp-content-pool-tags-canvas-${viewport.label}.png`, fullPage: true });
  assert.deepEqual(errors, [], `${viewport.label}: /canvas browser errors`);
  await page.close();
}

async function installMocks(page) {
  await page.route("**/mock/*.jpg", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#176b59"/><path d="M20 170l70-80 55 50 55-70 100 100z" fill="#f2f5f3"/></svg>' }));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const body = request.postData() ? request.postDataJSON() : undefined;
    requests.push({ path, method: request.method(), query: new URLSearchParams(url.search), body });

    if (path === "/api/content-pool") return json(route, { projects: [project], activeProject: project });
    if (path === "/api/content-pool/tags") {
      if (request.method() === "POST") {
        const items = sourceItems.filter((item) => body.ids.includes(item.id) && item.id !== "source-2");
        for (const item of items) {
          if (body.add) item.customTags = uniqueTags([...item.customTags, ...body.add]);
          if (body.remove) item.customTags = item.customTags.filter((tag) => !body.remove.some((value) => tagKey(value) === tagKey(tag)));
        }
        const failures = body.ids.includes("source-2") ? [{ itemId: "source-2", error: "自定义标签数量超过 20 个" }] : [];
        return json(route, { items, failures });
      }
      const query = (url.searchParams.get("q") || "").toLocaleLowerCase();
      const labels = uniqueTags(sourceItems.flatMap((item) => item.customTags)).filter((label) => label.toLocaleLowerCase().includes(query));
      return json(route, { tags: labels.map((label) => ({ label, count: sourceItems.filter((item) => item.customTags.some((tag) => tagKey(tag) === tagKey(label))).length })) });
    }
    if (path === "/api/content/items" && request.method() === "PATCH") {
      const item = sourceItems.find((candidate) => candidate.id === body.id);
      Object.assign(item, body.patch);
      return json(route, { item });
    }
    if (path === "/api/config") return json(route, {});
    if (path === "/api/workspace/settings") return json(route, { settings: workspaceSettings() });
    if (path === "/api/simple/runs") return json(route, { runs: [] });
    if (path === "/api/activity") return json(route, { entries: [] });

    if (path === "/api/canvas/workflows") return json(route, { workflows: [workflow] });
    if (path === `/api/canvas/workflows/${workflow.id}`) return json(route, { workflow });
    if (path === "/api/canvas/runs") return json(route, { runs: [], latestSuccessfulNodeRuns: [] });
    if (path === "/api/canvas/schedules") return json(route, { schedules: [schedule] });
    if (path === `/api/canvas/schedules/${schedule.id}`) {
      if (request.method() === "PATCH" && body.action === "save") schedule = { ...schedule, definition: body.definition, revision: schedule.revision + 1 };
      return json(route, { schedule });
    }
    if (path === "/api/content-pool/selection") {
      const itemId = url.searchParams.get("itemId");
      if (itemId) return json(route, { items: selectionItems.filter((item) => item.id === itemId), projects: [], total: 1 });
      const customTags = url.searchParams.getAll("customTag");
      const matches = selectionItems.filter((item) => customTags.every((tag) => item.customTags.some((value) => tagKey(value) === tagKey(tag))));
      return json(route, { items: matches, projects: [{ id: project.id, name: project.query, totalItems: matches.length }], total: matches.length });
    }
    if (path === "/api/library/assets") return json(route, { assets: [], collections: [], total: 0 });
    if (path === "/api/copy-library") return json(route, { entries: [], tags: [] });
    return json(route, {});
  });
}

function sourceItem(id, title, contentTags, customTags) {
  return { id, ownerUserId: "browser", ownerDisplayName: "Browser", platform: "xiaohongshu", sourceId: `origin-${id}`, mediaType: "image", sourceUrl: `https://example.test/${id}`, authorName: "测试作者", title, contentText: `${title} 的正文`, images: [`/mock/${id}.jpg`], mediaUrls: [], customTags, contentTagging: { tags: contentTags, reasons: [], status: "success" }, visualTagging: { assets: [], status: "skipped" }, metrics: { views: 1000, likes: 100 }, raw: {}, poolStatus: "new", hotScore: id === "source-1" ? 90 : 70, crawledAt: now, publishedAt: now };
}

function contentProject(items) {
  return { id: "project-a", ownerUserId: "browser", ownerDisplayName: "Browser", query: "小鹏内容", normalizedQuery: "小鹏内容--owner-browser", createdAt: now, updatedAt: now, lastCrawledAt: now, totalItems: items.length, newItems: items.length, analyzedItems: items.length, rewrittenItems: 0, approvedItems: 0, publishedItems: 0, platforms: { xiaohongshu: items.length }, items };
}

function selectionItem(item) {
  return { id: item.id, projectId: project.id, projectName: project.query, platform: item.platform, status: item.poolStatus, mediaType: item.mediaType, contentTags: item.contentTagging.tags, customTags: item.customTags, title: item.title, body: item.contentText, authorName: item.authorName, sourceId: item.sourceId, sourceUrl: item.sourceUrl, imageUrls: item.images, videoUrls: [], thumbnailUrl: item.images[0], hotScore: item.hotScore, publishedAt: now, crawledAt: now, localMediaComplete: false };
}

function canvasWorkflow(item) {
  return { id: "workflow-content-pool-tags", ownerUserId: "browser", ownerDisplayName: "Browser", name: "内容池标签画布", revision: 1, graph: { nodes: [{ id: "content-pool", type: "input.content-pool", version: 1, position: { x: 80, y: 120 }, config: snapshotConfig(item) }, { id: "text-target", type: "model.gpt-text", version: 1, position: { x: 420, y: 120 }, config: { instruction: "改写" } }], edges: [{ id: "edge", source: "content-pool", sourcePort: "body", target: "text-target", targetPort: "prompt" }], viewport: { x: 0, y: 0, zoom: 1 } }, isTemplate: false, createdAt: now, updatedAt: now };
}

function canvasSchedule(activeWorkflow, item) {
  return { id: "schedule-content-pool-tags", schemaVersion: 2, ownerUserId: "browser", ownerDisplayName: "Browser", name: "内容池标签批量任务", revision: 1, workflowId: activeWorkflow.id, workflowRevision: activeWorkflow.revision, status: "draft", batches: [], definition: { parameters: [{ id: "parameter", name: "内容池素材", scope: "main", valueType: "content-pool", source: { mode: "content-pool-filter", filter: { mode: "manual", itemIds: [item.id], query: "", platforms: [], statuses: [], mediaTypes: [], contentTags: [], customTags: [], localMediaComplete: false, sort: "hot-desc" } }, expansion: "each", binding: { nodeId: "content-pool", fieldKey: "sourceItemId" } }], expansion: { main: "cartesian", child: "cartesian" }, sharedOutputs: [], childResult: { nodeId: "text-target", outputPort: "text", artifactKind: "text" }, mainTargetNodeId: "text-target", aggregationPolicy: "at-least-one" }, mainTasks: [], totalMainTasks: 0, totalChildTasks: 0, totalContentTasks: 0, totalImageTasks: 0, createdAt: now, updatedAt: now };
}

function snapshotConfig(item) { return { sourceItemId: item.id, snapshotAt: now, snapshotTitle: item.title, snapshotBody: item.body, snapshotSourceUrl: item.sourceUrl, snapshotImageUrls: item.imageUrls, snapshotVideoUrls: item.videoUrls }; }
function workspaceSettings() { return { simpleRunMediaSettings: { generateImages: true, useComfyUiKlein: false, directOriginalReference: false, includeSourceVideo: false, enableVideoTranscription: false }, platformCrawlSettings: {} }; }
function tagKey(value) { return String(value).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
function uniqueTags(values) { return [...new Map(values.map((value) => [tagKey(value), value])).values()]; }
function collectErrors(page) { const errors = []; page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); }); return errors; }
function json(route, body) { return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }); }
async function assertNoDocumentOverflow(page, label, route) { const value = await page.evaluate(() => ({ viewport: window.innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(value.scroll <= value.viewport, `${label} ${route} overflow: ${JSON.stringify(value)}`); }

async function loadPlaywright() {
  try { return await import("playwright"); }
  catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    const driverPath = execFileSync("python", ["-c", "import pathlib, playwright; print(pathlib.Path(playwright.__file__).parent / 'driver' / 'package' / 'index.mjs')"], { encoding: "utf8" }).trim();
    return import(pathToFileURL(driverPath).href);
  }
}
