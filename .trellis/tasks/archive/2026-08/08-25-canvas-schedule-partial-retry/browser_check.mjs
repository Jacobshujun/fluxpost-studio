import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const { chromium } = await loadPlaywright();

const baseUrl = process.env.FLUXPOST_BROWSER_BASE_URL || "http://127.0.0.1:3001";
const now = new Date().toISOString();
const actionRequests = [];
let releaseAction;

const workflow = {
  id: "workflow-partial-retry",
  ownerUserId: "browser-check",
  ownerDisplayName: "Browser Check",
  name: "Partial retry workflow",
  revision: 1,
  graph: {
    nodes: [{ id: "input", type: "input.text", version: 1, position: { x: 80, y: 80 }, config: { text: "fixture" } }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  createdAt: now,
  updatedAt: now,
};

const v2Schedule = {
  id: "schedule-v2-partial",
  schemaVersion: 2,
  ownerUserId: "browser-check",
  ownerDisplayName: "Browser Check",
  name: "V2 partial schedule",
  revision: 1,
  workflowId: workflow.id,
  workflowRevision: workflow.revision,
  workflowSnapshot: workflow.graph,
  status: "partial",
  batches: [],
  definition: {
    parameters: [],
    expansion: { main: "cartesian", child: "cartesian" },
    sharedOutputs: [],
    childResult: { nodeId: "image-each", outputPort: "images", artifactKind: "images" },
    aggregationPolicy: "at-least-one",
  },
  mainTasks: [{
    id: "main-1",
    parameterValues: {},
    status: "partial",
    resultArtifacts: [],
    childTasks: [{
      id: "child-partial",
      parameterValues: {},
      status: "partial",
      runId: "run-v2-partial",
      resultArtifacts: [{ kind: "images", items: [{ url: "/fixture-success.jpg" }] }],
      createdAt: now,
      updatedAt: now,
    }],
    createdAt: now,
    updatedAt: now,
  }],
  totalMainTasks: 1,
  totalChildTasks: 1,
  totalContentTasks: 1,
  totalImageTasks: 1,
  createdAt: now,
  updatedAt: now,
};

const v1Schedule = {
  id: "schedule-v1-partial",
  schemaVersion: 1,
  ownerUserId: "browser-check",
  ownerDisplayName: "Browser Check",
  name: "V1 partial schedule",
  revision: 1,
  workflowId: workflow.id,
  workflowRevision: workflow.revision,
  status: "partial",
  batches: [{
    id: "batch-1",
    name: "Batch 1",
    strategy: "input-1",
    sceneFilter: emptyFilter(),
    sceneCount: 1,
    vehicleFilter: emptyFilter(),
    vehicleCountMin: 1,
    vehicleCountMax: 1,
    status: "partial",
    contentTasks: [{
      id: "content-1",
      scene: { id: "scene-1", name: "Scene", url: "/fixture-scene.jpg" },
      vehicles: [{ id: "vehicle-1", name: "Vehicle", url: "/fixture-vehicle.jpg" }],
      imageTasks: [{
        id: "image-partial",
        vehicle: { id: "vehicle-1", name: "Vehicle", url: "/fixture-vehicle.jpg" },
        status: "partial",
        runId: "run-v1-partial",
        imageUrls: ["/fixture-success.jpg"],
        createdAt: now,
        updatedAt: now,
      }],
      status: "partial",
      candidateImageUrls: ["/fixture-success.jpg"],
      createdAt: now,
      updatedAt: now,
    }],
    createdAt: now,
    updatedAt: now,
  }],
  totalContentTasks: 1,
  totalImageTasks: 1,
  createdAt: now,
  updatedAt: now,
};

const schedules = [v2Schedule, v1Schedule];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await installMocks(page);
  await page.goto(`${baseUrl}/canvas`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "批量调度" }).click();
  await page.getByRole("dialog", { name: "Canvas 批量调度" }).waitFor();

  const v2Retry = page.getByRole("button", { name: "重试失败图片", exact: true });
  await v2Retry.waitFor();
  await page.getByRole("button", { name: "重试本行未完成卡片", exact: true }).waitFor();
  const v2RetryHandle = await v2Retry.elementHandle();
  const v2Click = v2Retry.click();
  await page.waitForFunction((button) => button.disabled, v2RetryHandle);
  assert.equal(await v2Retry.isDisabled(), true, "V2 retry must stay disabled while its request is pending");
  releaseAction();
  await v2Click;
  await page.getByText("排队中", { exact: true }).last().waitFor();
  assert.deepEqual(actionRequests[0], { action: "retry", mainTaskId: "main-1", childTaskId: "child-partial" });
  await assertNoHorizontalOverflow(page, "desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /V1 partial schedule/ }).click();
  await page.locator(".canvas-schedule-runtime details details > summary").click();
  const v1Retry = page.getByRole("button", { name: "重试失败图片", exact: true });
  await v1Retry.waitFor();
  const v1RetryHandle = await v1Retry.elementHandle();
  const v1Click = v1Retry.click();
  await page.waitForFunction((button) => button.disabled, v1RetryHandle);
  assert.equal(await v1Retry.isDisabled(), true, "V1 retry must stay disabled while its request is pending");
  releaseAction();
  await v1Click;
  await page.getByText("排队中", { exact: true }).last().waitFor();
  assert.deepEqual(actionRequests[1], { action: "retry", batchId: "batch-1", contentTaskId: "content-1", imageTaskId: "image-partial" });
  await assertNoHorizontalOverflow(page, "mobile");

  console.log("Canvas partial schedule retry browser check passed at 1440x960 and 390x844.");
} finally {
  await browser.close();
}

async function installMocks(page) {
  await page.route("**/api/canvas/workflows", (route) => json(route, { workflows: [workflow] }));
  await page.route(`**/api/canvas/workflows/${workflow.id}`, (route) => json(route, { workflow }));
  await page.route("**/api/canvas/runs**", (route) => json(route, { runs: [] }));
  await page.route("**/api/canvas/schedules", (route) => json(route, { schedules }));
  for (const schedule of schedules) {
    await page.route(`**/api/canvas/schedules/${schedule.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return json(route, { schedule });
      const body = route.request().postDataJSON();
      actionRequests.push(Object.fromEntries(Object.entries(body).filter(([key]) => !["revision"].includes(key))));
      await new Promise((resolve) => { releaseAction = resolve; });
      if (schedule.schemaVersion === 2) {
        schedule.status = "running";
        schedule.mainTasks[0].status = "running";
        schedule.mainTasks[0].childTasks[0].status = "queued";
      } else {
        schedule.status = "running";
        schedule.batches[0].status = "running";
        schedule.batches[0].contentTasks[0].status = "running";
        schedule.batches[0].contentTasks[0].imageTasks[0].status = "queued";
      }
      schedule.revision += 1;
      schedule.updatedAt = new Date().toISOString();
      return json(route, { schedule });
    });
  }
  await page.route("**/api/library/assets**", (route) => json(route, { assets: [], collections: [], total: 0 }));
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

function json(route, body) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

function emptyFilter() {
  return { mode: "manual", assetIds: [], search: "", tags: [] };
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    const driverPath = execFileSync("python", [
      "-c",
      "import pathlib, playwright; print(pathlib.Path(playwright.__file__).parent / 'driver' / 'package' / 'index.mjs')",
    ], { encoding: "utf8" }).trim();
    return import(pathToFileURL(driverPath).href);
  }
}
