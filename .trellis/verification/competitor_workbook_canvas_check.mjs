import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const require = createRequire(import.meta.url);
const tsxLoader = require.resolve("tsx");
const runtime = spawnSync(process.execPath, ["--import", pathToFileURL(tsxLoader).href, ".trellis/verification/competitor_workbook_canvas_runtime_check.ts"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, FLUXPOST_DISABLE_BACKGROUND_WORKERS: "1" },
});
if (runtime.status !== 0) throw new Error(`${runtime.stdout}\n${runtime.stderr}`.trim());
process.stdout.write(runtime.stdout);

const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const scheduler = read("src/lib/canvas/scheduler.ts");
const runs = read("src/lib/canvas/runs.ts");
const workflows = read("src/lib/canvas/workflows.ts");
const inspectRoute = read("src/app/api/canvas/competitor-workbook/route.ts");
const scheduleResponse = read("src/lib/canvas/schedule-response.ts");
const runRoute = read("src/app/api/canvas/runs/route.ts");
const runDetailRoute = read("src/app/api/canvas/runs/[id]/route.ts");
const page = read("src/app/canvas/page.tsx");

assert.match(inspectRoute, /requireWorkspaceAccount\(request\)/);
assert.match(inspectRoute, /isWorkspaceAdmin\(account\)/);
assert.match(inspectRoute, /status: 403/);
assert.ok(!inspectRoute.includes("console."), "the workbook route must not log paths or request bodies");
assert.match(scheduler, /assertCompetitorWorkbookSourcesMatch\(workbookSources\)/);
assert.match(scheduler, /prepareCanvasScheduleV2PendingChildRuns\(next, now\)/);
assert.match(scheduler, /retryPending: true/);
assert.ok(!scheduler.includes("canvasScheduleV2ImageBatch"), "Excel card failures must not become review-layer image-batch metadata");
assert.match(runs, /account\.role !== "admin"[\s\S]*input\.competitor-workbook/);
assert.match(workflows, /assertCompetitorWorkbookGraphAccess\(graph, account\)/);
assert.match(scheduleResponse, /filePath: undefined/);
assert.match(scheduleResponse, /config: \{[\s\S]*path: ""/);
assert.match(runRoute, /canvasRunHistoryResponse/);
assert.match(runRoute, /canvasRunResponse\(run\)/);
assert.match(runDetailRoute, /canvasRunResponse\(result\.run\)/);
assert.ok(page.includes('onAction("retry-row", { mainTaskId: main.id })'));
assert.ok(!page.includes("请人工核对图片中的中文、数字和参数"), "Excel must not add a dedicated review warning");
assert.ok(page.includes("main.workbookRow.excelRowNumber"), "Excel row provenance must remain visible");
assert.ok(page.includes("child.workbookCard.cardIndex"), "Excel card provenance must remain visible");
assert.ok(!page.includes("taskConcurrency"), "Canvas batch UI must not impose a schedule-level concurrency limit");
assert.ok(!read("src/lib/canvas/templates.ts").includes('type: "publish.feishu"'));
console.log("Competitor workbook Canvas boundary checks passed.");
