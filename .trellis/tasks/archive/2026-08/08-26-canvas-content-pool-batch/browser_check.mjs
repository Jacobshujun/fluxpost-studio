import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const { chromium } = await loadPlaywright();
const baseUrl = process.env.FLUXPOST_BROWSER_BASE_URL || "http://127.0.0.1:3001";
const now = "2026-08-26T10:00:00.000Z";
const selectionRequests = [];

const items = [
  material("source-1", "雨夜智驾体验", "项目 A", "xiaohongshu", ["实测试驾", "经验干货"], 98),
  material("source-2", "城市夜景空间", "项目 A", "douyin", ["美女车图"], 76),
  material("source-3", "长途补能记录", "项目 B", "weibo", ["提车记录"], 61),
];
const projects = [{ id: "project-a", name: "项目 A", totalItems: 2 }, { id: "project-b", name: "项目 B", totalItems: 1 }];

const workflow = {
  id: "workflow-content-pool",
  ownerUserId: "browser-check",
  ownerDisplayName: "Browser Check",
  name: "内容池批量画布",
  revision: 3,
  graph: {
    nodes: [
      { id: "content-pool", type: "input.content-pool", version: 1, position: { x: 80, y: 120 }, config: snapshotConfig(items[0]) },
      { id: "text-target", type: "model.gpt-text", version: 1, position: { x: 420, y: 120 }, config: { instruction: "改写素材" } },
    ],
    edges: [{ id: "edge-1", source: "content-pool", sourcePort: "body", target: "text-target", targetPort: "prompt" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  isTemplate: false,
  createdAt: now,
  updatedAt: now,
};

let schedule = {
  id: "schedule-content-pool",
  schemaVersion: 2,
  ownerUserId: "browser-check",
  ownerDisplayName: "Browser Check",
  name: "内容池素材批量任务",
  revision: 1,
  workflowId: workflow.id,
  workflowRevision: workflow.revision,
  status: "draft",
  batches: [],
  definition: {
    parameters: [{
      id: "content-pool-parameter",
      name: "内容池素材",
      scope: "main",
      valueType: "content-pool",
      source: { mode: "content-pool-filter", filter: { mode: "manual", itemIds: [items[0].id], query: "", platforms: [], statuses: [], mediaTypes: [], contentTags: [], localMediaComplete: false, sort: "hot-desc" } },
      expansion: "each",
      binding: { nodeId: "content-pool", fieldKey: "sourceItemId" },
    }],
    expansion: { main: "cartesian", child: "cartesian" },
    sharedOutputs: [],
    childResult: { nodeId: "text-target", outputPort: "text", artifactKind: "text" },
    mainTargetNodeId: "text-target",
    aggregationPolicy: "at-least-one",
  },
  mainTasks: [],
  totalMainTasks: 0,
  totalChildTasks: 0,
  totalContentTasks: 0,
  totalImageTasks: 0,
  createdAt: now,
  updatedAt: now,
};

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 960, label: "desktop" }, { width: 390, height: 844, label: "mobile" }]) {
    await verifyViewport(browser, viewport);
  }
  assert.ok(selectionRequests.some((url) => new URL(url).searchParams.get("q") === "雨夜"), "search text must reach the selection endpoint");
  console.log("Canvas content-pool browser check passed at 1440x960 and 390x844.");
} finally {
  await browser.close();
}

async function verifyViewport(browserInstance, viewport) {
  const page = await browserInstance.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installMocks(page);
  await page.goto(`${baseUrl}/canvas`, { waitUntil: "networkidle" });
  await page.getByTestId("canvas-stage").locator(".react-flow__pane").waitFor();

  await page.locator('.react-flow__node[data-id="content-pool"] .canvas-node-head').click();
  const inspector = page.locator(".canvas-inspector-content");
  const normalBrowser = inspector.locator(".canvas-content-pool-browser");
  try {
    await normalBrowser.locator(".canvas-content-pool-list article").first().waitFor({ timeout: 8_000 });
  } catch (error) {
    await page.screenshot({ path: `.tmp-canvas-content-pool-${viewport.label}-failure.png`, fullPage: true });
    console.error(`${viewport.label} inspector diagnostics:`, await page.locator(".canvas-inspector").innerText(), selectionRequests);
    throw error;
  }
  assert.equal(await normalBrowser.locator(".canvas-content-pool-list article").count(), 2, `${viewport.label}: first cursor page should contain two cards`);
  assert.equal(await normalBrowser.locator("select").count(), 2, `${viewport.label}: only project and sort selects should remain`);
  await normalBrowser.locator("article").filter({ hasText: "城市夜景空间" }).locator(".canvas-content-pool-select").click();
  await inspector.locator(".canvas-snapshot-meta").getByText("城市夜景空间", { exact: true }).waitFor();

  await normalBrowser.locator("article").filter({ hasText: "雨夜智驾体验" }).locator(".canvas-content-pool-preview").click();
  await page.locator(".canvas-image-viewer").waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".canvas-image-viewer").waitFor({ state: "hidden" });

  await normalBrowser.getByPlaceholder("搜索标题、正文、作者或来源 ID").fill("雨夜");
  await normalBrowser.getByText("1 条匹配", { exact: false }).waitFor();
  assert.equal(await normalBrowser.locator("article").count(), 1, `${viewport.label}: search should update the result list`);
  await normalBrowser.getByPlaceholder("搜索标题、正文、作者或来源 ID").fill("");
  await normalBrowser.getByRole("button", { name: "加载更多" }).click();
  await normalBrowser.locator("article").nth(2).waitFor();
  assert.equal(await normalBrowser.locator("article").count(), 3, `${viewport.label}: cursor load-more should append results`);
  await normalBrowser.locator("details > summary").click();
  await normalBrowser.getByText("内容标签（同时满足）", { exact: true }).waitFor();

  await page.getByRole("button", { name: "批量调度" }).click();
  const dialog = page.getByRole("dialog", { name: "Canvas 批量调度" });
  await dialog.waitFor();
  const parameter = dialog.locator('.canvas-schedule-parameter:has(input[value="内容池素材"])');
  await parameter.locator(".canvas-content-pool-list article").first().waitFor();
  const expansion = parameter.locator("label", { hasText: "展开" }).locator("select");
  assert.deepEqual(await expansion.locator("option").allTextContents(), ["固定单条", "每条一项", "随机抽取"]);
  await parameter.locator("article").filter({ hasText: "城市夜景空间" }).locator(".canvas-content-pool-select").click();
  await parameter.getByText("已选 2", { exact: false }).waitFor();
  await parameter.getByRole("button", { name: "选择全部匹配" }).click();
  await parameter.getByText("已选 3", { exact: false }).waitFor();
  await parameter.getByRole("button", { name: "条件匹配" }).click();
  await parameter.getByText("预演时动态冻结", { exact: false }).waitFor();
  assert.equal(await parameter.locator(".canvas-content-pool-select").first().isDisabled(), true, `${viewport.label}: condition mode cards must not alter manual ids`);

  await assertNoHorizontalOverflow(page, viewport.label);
  await page.screenshot({ path: `.tmp-canvas-content-pool-${viewport.label}.png`, fullPage: true });
  assert.deepEqual(errors, [], `${viewport.label}: browser page errors`);
  await page.close();
}

async function installMocks(page) {
  await page.route("**/mock/*.jpg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#1f6f5f"/><path d="M20 170l70-80 55 50 55-70 100 100z" fill="#f7f5ef"/></svg>',
  }));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/canvas/workflows") return json(route, { workflows: [workflow] });
    if (path === `/api/canvas/workflows/${workflow.id}`) {
      if (request.method() === "PATCH") {
        const body = request.postDataJSON();
        if (body.graph) workflow.graph = body.graph;
      }
      return json(route, { workflow });
    }
    if (path === "/api/canvas/runs") return json(route, { runs: [], latestSuccessfulNodeRuns: [] });
    if (path === "/api/canvas/schedules") return json(route, { schedules: [schedule] });
    if (path === `/api/canvas/schedules/${schedule.id}`) {
      if (request.method() === "PATCH") {
        const body = request.postDataJSON();
        if (body.action === "save") schedule = { ...schedule, name: body.name, definition: body.definition, revision: schedule.revision + 1, updatedAt: new Date().toISOString() };
      }
      return json(route, { schedule });
    }
    if (path === "/api/content-pool/selection") {
      selectionRequests.push(request.url());
      const itemId = url.searchParams.get("itemId");
      if (itemId) return json(route, { items: items.filter((item) => item.id === itemId), projects: [], total: 1 });
      const query = url.searchParams.get("q") || "";
      const matching = query ? items.filter((item) => `${item.title} ${item.body} ${item.authorName} ${item.sourceId}`.includes(query)) : items;
      const cursor = url.searchParams.get("cursor");
      return json(route, cursor
        ? { items: matching.slice(2), projects, total: matching.length }
        : { items: matching.slice(0, 2), projects, total: matching.length, nextCursor: matching.length > 2 ? "page-2" : undefined });
    }
    if (path === "/api/library/assets") return json(route, { assets: [], collections: [], total: 0 });
    if (path === "/api/copy-library") return json(route, { entries: [], tags: [] });
    return json(route, {});
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    panelClientWidth: document.querySelector(".canvas-schedule-panel")?.clientWidth,
    panelScrollWidth: document.querySelector(".canvas-schedule-panel")?.scrollWidth,
  }));
  assert.ok(dimensions.documentWidth <= dimensions.viewport, `${label} document overflow: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.panelScrollWidth <= dimensions.panelClientWidth, `${label} schedule panel overflow: ${JSON.stringify(dimensions)}`);
}

function material(id, title, projectName, platform, contentTags, hotScore) {
  const projectId = projectName === "项目 A" ? "project-a" : "project-b";
  return {
    id, projectId, projectName, platform, status: "new", mediaType: "mixed", contentTags,
    title, body: `${title} 的完整正文`, authorName: `作者 ${title}`, sourceId: `origin-${id}`,
    sourceUrl: `https://example.test/${id}`, imageUrls: [`/mock/${id}.jpg`], videoUrls: [`/mock/${id}.mp4`],
    thumbnailUrl: `/mock/${id}.jpg`, hotScore, publishedAt: now, crawledAt: now, localMediaComplete: true,
  };
}

function snapshotConfig(item) {
  return { sourceItemId: item.id, snapshotAt: now, snapshotTitle: item.title, snapshotBody: item.body, snapshotSourceUrl: item.sourceUrl, snapshotImageUrls: item.imageUrls, snapshotVideoUrls: item.videoUrls };
}

function json(route, body) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    const driverPath = execFileSync("python", ["-c", "import pathlib, playwright; print(pathlib.Path(playwright.__file__).parent / 'driver' / 'package' / 'index.mjs')"], { encoding: "utf8" }).trim();
    return import(pathToFileURL(driverPath).href);
  }
}
