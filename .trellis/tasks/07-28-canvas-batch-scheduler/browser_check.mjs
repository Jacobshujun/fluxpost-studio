import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:3001";
const now = new Date().toISOString();
let savedWorkflowGraph;

const graph = {
  nodes: [
    canvasNode("scene", "input.library-images", 1, { assetIds: [], assetNames: [], urls: [] }, "场景候选"),
    canvasNode("vehicle", "input.library-images", 1, { assetIds: [], assetNames: [], urls: [] }, "车型候选"),
    canvasNode("prompt-1", "input.text", 1, { text: "提示词 1" }, "提示词 1"),
    canvasNode("prompt-2", "input.text", 1, { text: "提示词 2" }, "提示词 2"),
    canvasNode("prompt-3", "input.text", 1, { text: "提示词 3" }, "提示词 3"),
    { ...canvasNode("switch", "utility.prompt-switch", 2, { selectedInput: "1" }, "提示词 Switch"), schedulerRole: "prompt-switch" },
    canvasNode("image", "model.gpt-image", 2, { prompt: "", count: 1, size: "1024x1024", quality: "high" }, "GPT-Image-2"),
    canvasNode("body", "input.text", 1, { text: "正文" }, "正文"),
    canvasNode("content", "compose.social-post", 1, {}, "内容组装"),
  ],
  edges: [
    edge("prompt-1", "text", "switch", "input1"),
    edge("prompt-2", "text", "switch", "input2"),
    edge("prompt-3", "text", "switch", "input3"),
    edge("switch", "text", "image", "prompt"),
    edge("scene", "images", "image", "references"),
    edge("vehicle", "images", "image", "references"),
    edge("image", "images", "content", "images"),
    edge("body", "text", "content", "body"),
  ],
  viewport: { x: 20, y: 30, zoom: 0.72 },
};

let workflow = {
  id: "canvas-1784869099497-28334d52",
  ownerUserId: "browser-check",
  ownerDisplayName: "Browser Check",
  name: "美图复刻-20260728",
  revision: 306,
  graph,
  createdAt: now,
  updatedAt: now,
};

let schedule = {
  id: "canvas-schedule-1785223521209-20e97112",
  ownerUserId: "browser-check",
  ownerDisplayName: "Browser Check",
  name: "旧版绑定任务",
  revision: 4,
  workflowId: workflow.id,
  workflowRevision: 302,
  status: "draft",
  batches: [{
    id: "batch-1",
    name: "批次 1",
    strategy: "input-1",
    sceneFilter: emptyFilter(),
    sceneCount: 1,
    vehicleFilter: emptyFilter(),
    vehicleCountMin: 1,
    vehicleCountMax: 3,
    status: "draft",
    contentTasks: [],
    createdAt: now,
    updatedAt: now,
  }],
  totalContentTasks: 0,
  totalImageTasks: 0,
  createdAt: now,
  updatedAt: now,
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await installMocks(page);
  await page.goto(`${baseUrl}/canvas`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "批量调度" }).click();
  await page.getByRole("dialog", { name: "Canvas 批量调度" }).waitFor();

  const bindings = page.locator(".canvas-scheduler-bindings");
  await bindings.getByText("画布绑定", { exact: true }).waitFor();
  assert.equal(await bindings.locator("select").count(), 5);
  assert.equal(await bindings.getByLabel("提示词 Switch").inputValue(), "switch");
  assert.equal(await bindings.getByLabel("场景素材输入").inputValue(), "");
  assert.equal(await bindings.getByLabel("车型素材输入").inputValue(), "");
  assert.equal(await bindings.getByLabel("图片生成目标").inputValue(), "");
  assert.equal(await bindings.getByLabel("最终内容目标").inputValue(), "");
  assert.equal(await page.getByRole("button", { name: "预演抽样" }).isDisabled(), true);

  await bindings.getByLabel("场景素材输入").selectOption("scene");
  await bindings.getByLabel("车型素材输入").selectOption("vehicle");
  await bindings.getByLabel("图片生成目标").selectOption("image");
  await bindings.getByLabel("最终内容目标").selectOption("content");
  await bindings.getByRole("button", { name: "保存绑定" }).click();
  await page.getByText("画布调度绑定已保存").waitFor();
  assert.equal(await page.getByRole("button", { name: "预演抽样" }).isEnabled(), true);

  const roleNodes = savedWorkflowGraph.nodes.filter((node) => node.schedulerRole);
  assert.equal(roleNodes.length, 5);
  assert.equal(new Set(roleNodes.map((node) => node.schedulerRole)).size, 5);
  assert.equal(new Set(roleNodes.map((node) => node.id)).size, 5);
  assert.ok(workflow.revision >= 307, `workflow revision must advance after saving bindings, got r${workflow.revision}`);

  await assertNoHorizontalOverflow(page, "desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await bindings.waitFor();
  await assertNoHorizontalOverflow(page, "mobile");
  const selectLefts = await bindings.locator("select").evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().left)));
  assert.equal(new Set(selectLefts).size, 1, "mobile binding selects must use one column");
  console.log("Canvas scheduler binding browser check passed at 1440x960 and 390x844.");
} finally {
  await browser.close();
}

async function installMocks(page) {
  await page.route("**/api/canvas/workflows", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workflows: [workflow] }) }));
  await page.route(`**/api/canvas/workflows/${workflow.id}`, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      savedWorkflowGraph = body.graph;
      workflow = { ...workflow, revision: workflow.revision + 1, graph: body.graph, updatedAt: new Date().toISOString() };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workflow }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workflow }) });
  });
  await page.route("**/api/canvas/runs**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ runs: [] }) }));
  await page.route("**/api/canvas/schedules", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schedules: [schedule] }) }));
  await page.route(`**/api/canvas/schedules/${schedule.id}`, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      schedule = { ...schedule, ...body, revision: schedule.revision + 1, updatedAt: new Date().toISOString() };
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schedule }) });
  });
  await page.route("**/api/library/assets**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assets: [], collections: [], total: 0 }) }));
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    panelClientWidth: document.querySelector(".canvas-schedule-panel")?.clientWidth,
    panelScrollWidth: document.querySelector(".canvas-schedule-panel")?.scrollWidth,
  }));
  assert.ok(dimensions.documentWidth <= dimensions.viewport, `${label} document overflow: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.panelScrollWidth <= dimensions.panelClientWidth, `${label} panel overflow: ${JSON.stringify(dimensions)}`);
}

function canvasNode(id, type, version, config, label) {
  return { id, type, version, position: { x: 80, y: 80 }, config, label };
}

function edge(source, sourcePort, target, targetPort) {
  return { id: `${source}-${target}-${targetPort}`, source, sourcePort, target, targetPort };
}

function emptyFilter() {
  return { mode: "manual", assetIds: [], search: "", tags: [] };
}
