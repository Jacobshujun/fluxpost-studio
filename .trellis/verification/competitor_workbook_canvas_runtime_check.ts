import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import {
  COMPETITOR_WORKBOOK_MAX_BYTES,
  freezeCompetitorWorkbook,
  inspectCompetitorWorkbook,
  readCompetitorWorkbookSelection,
  type CompetitorWorkbookSnapshot,
} from "../../src/lib/competitor-workbook";
import { expandCompetitorWorkbookScheduleV2, type ResolvedCanvasScheduleParameter } from "../../src/lib/canvas/scheduler-v2";
import { getCanvasNodeDefinition, validateCanvasNodeConfig } from "../../src/lib/canvas/registry";
import { createCanvasWorkflowTemplateGraph } from "../../src/lib/canvas/templates";
import { canvasRunHistoryResponse, canvasRunResponse, canvasScheduleResponse, canvasWorkflowResponse } from "../../src/lib/canvas/schedule-response";
import type { CanvasSchedule, CanvasScheduleParameter, CanvasWorkflow } from "../../src/lib/canvas/types";

async function main() {
  const temp = mkdtempSync(path.join(os.tmpdir(), "fluxpost-competitor-workbook-"));
  try {
  const workbookPath = path.join(temp, "competitor.xlsx");
  const longBody = "长".repeat(1_205);
  const rows = Array.from({ length: 200 }, (_, index) => {
    const cardCount = index < 178 ? 4 : 3;
    return [
      String(index + 1),
      `标题${index + 1}`,
      index === 0 ? longBody : `正文${index + 1}`,
      ...Array.from({ length: 6 }, (_, cardIndex) => cardIndex < cardCount ? `第${index + 1}行参数卡片${cardIndex + 1}` : ""),
    ];
  });
  writeWorkbook(workbookPath, rows, { verificationRows: [["历史JSON路径"], ["C:\\obsolete\\ignored.json"]] });

  const inspection = await inspectCompetitorWorkbook({ filePath: workbookPath });
  assert.equal(inspection.rowCount, 200);
  assert.equal(inspection.cardCount, 778);
  assert.equal(inspection.selectedRowCount, 200);
  assert.equal(inspection.selectedCardCount, 778);
  assert.deepEqual(inspection.worksheets.map((sheet) => sheet.name), ["文案汇总", "校验"]);
  assert.equal(inspection.previewRows[0].excelRowNumber, 2);
  assert.equal(inspection.previewRows[0].body.length, 1_205);

  const snapshot = await freezeCompetitorWorkbook({ filePath: workbookPath, rowStart: 2, rowEnd: 201 });
  assert.equal(snapshot.rows.length, 200);
  assert.equal(snapshot.rows.flatMap((row) => row.cards).length, 778);
  assert.equal(snapshot.rows[0].body, longBody, "the frozen snapshot must preserve the full body");
  assert.ok(/^[a-f0-9]{64}$/.test(snapshot.fileSha256));
  const selected = await readCompetitorWorkbookSelection({ filePath: workbookPath, rowNumber: 2, cardIndex: 4 });
  assert.equal(selected.card.text, "第1行参数卡片4");
  await assert.rejects(readCompetitorWorkbookSelection({ filePath: workbookPath, rowNumber: 200, cardIndex: 4 }), /is empty/);

  const parameters = workbookParameters(snapshot);
  const references = Array.from({ length: 16 }, (_, index) => ({ id: `vehicle-${index + 1}`, url: `/vehicle-${index + 1}.jpg`, name: `vehicle ${index + 1}` }));
  const sharedReferenceParameter: ResolvedCanvasScheduleParameter = {
    id: "references",
    name: "共享车型参考图",
    scope: "child",
    valueType: "image-group",
    source: { mode: "fixed", values: [references] },
    expansion: "fixed",
    binding: { nodeId: "vehicle-references", fieldKey: "assetIds" },
  };
  let sequence = 0;
  const expansion = expandCompetitorWorkbookScheduleV2(parameters, [sharedReferenceParameter], "2026-08-24T00:00:00.000Z", (level) => `${level}-${++sequence}`);
  assert.equal(expansion.totalMainTasks, 200);
  assert.equal(expansion.totalChildTasks, 778);
  assert.equal(expansion.mainTasks[0].childTasks.length, 4);
  assert.equal(expansion.mainTasks[199].childTasks.length, 3);
  assert.deepEqual(expansion.mainTasks[0].childTasks.map((child) => child.workbookCard?.cardIndex), [1, 2, 3, 4]);
  assert.equal(expansion.mainTasks[0].parameterValues.body, longBody);
  assert.deepEqual(expansion.mainTasks[0].childTasks[0].parameterValues.references, references);
  assert.deepEqual(expansion.mainTasks[199].childTasks[2].parameterValues.references, references);

  const blankRowPath = path.join(temp, "blank-row.xlsx");
  writeWorkbook(blankRowPath, [rows[0], null, rows[1]]);
  const blankInspection = await inspectCompetitorWorkbook({ filePath: blankRowPath });
  assert.equal(blankInspection.rowCount, 2);
  assert.deepEqual(blankInspection.previewRows.map((row) => row.excelRowNumber), [2, 4]);

  const missingColumnPath = path.join(temp, "missing-column.xlsx");
  writeWorkbook(missingColumnPath, [rows[0]], { headers: workbookHeaders().slice(0, -1) });
  await assert.rejects(inspectCompetitorWorkbook({ filePath: missingColumnPath }), /missing required columns/);
  const missingBodyPath = path.join(temp, "missing-body.xlsx");
  writeWorkbook(missingBodyPath, [["1", "标题", "", "卡片1", "", "", "", "", ""]]);
  await assert.rejects(inspectCompetitorWorkbook({ filePath: missingBodyPath }), /both title and body/);
  const noCardsPath = path.join(temp, "no-cards.xlsx");
  writeWorkbook(noCardsPath, [["1", "标题", "正文", "", "", "", "", "", ""]]);
  await assert.rejects(inspectCompetitorWorkbook({ filePath: noCardsPath }), /no parameter cards/);
  await assert.rejects(inspectCompetitorWorkbook({ filePath: "relative.xlsx" }), /absolute local path/);
  await assert.rejects(inspectCompetitorWorkbook({ filePath: path.join(temp, "missing.xlsx") }), /not found/);
  const wrongExtension = path.join(temp, "workbook.csv");
  writeFileSync(wrongExtension, "not excel", "utf8");
  await assert.rejects(inspectCompetitorWorkbook({ filePath: wrongExtension }), /must be an \.xlsx/);
  const invalidXlsx = path.join(temp, "invalid.xlsx");
  writeFileSync(invalidXlsx, "not a zip", "utf8");
  await assert.rejects(inspectCompetitorWorkbook({ filePath: invalidXlsx }), /not a valid \.xlsx/);
  const oversized = path.join(temp, "oversized.xlsx");
  writeFileSync(oversized, Buffer.alloc(COMPETITOR_WORKBOOK_MAX_BYTES + 1));
  await assert.rejects(inspectCompetitorWorkbook({ filePath: oversized }), /exceeds the 25 MB limit/);
  await assert.rejects(inspectCompetitorWorkbook({ filePath: workbookPath, rowStart: 1 }), /rowStart must be an integer/);
  await assert.rejects(inspectCompetitorWorkbook({ filePath: workbookPath, rowStart: 10, rowEnd: 9 }), /rowEnd must be greater/);
  const tooManyRows = path.join(temp, "too-many-rows.xlsx");
  writeWorkbook(tooManyRows, Array.from({ length: 301 }, (_, index) => [String(index + 1), `标题${index}`, `正文${index}`, "卡1", "卡2", "卡3", "", "", ""]));
  await assert.rejects(inspectCompetitorWorkbook({ filePath: tooManyRows }), /at most 300 workbook rows/);

  const gptV2 = getCanvasNodeDefinition("model.gpt-image", 2);
  assert.ok(gptV2);
  assert.equal(gptV2.label, "GPT-Image-2");
  assert.deepEqual(gptV2.fields.map((field) => field.key), ["ratio", "resolution", "quality", "count", "outputFormat", "outputCompression"]);
  assert.equal(validateCanvasNodeConfig("model.gpt-image", { ...gptV2.defaultConfig, referenceUrls: references.map((item) => item.url) }, 2).length, 0);
  assert.match(validateCanvasNodeConfig("model.gpt-image", { ...gptV2.defaultConfig, referenceUrls: [...references.map((item) => item.url), "/vehicle-17.jpg"] }, 2)[0], /cannot exceed 16/);

  const template = createCanvasWorkflowTemplateGraph("competitor-workbook-posts");
  assert.ok(template.graph.nodes.some((node) => node.type === "input.competitor-workbook"));
  assert.ok(template.graph.nodes.some((node) => node.type === "model.gpt-image" && node.version === 2));
  assert.ok(template.graph.nodes.some((node) => node.type === "compose.social-post"));
  assert.ok(!template.graph.nodes.some((node) => node.type === "publish.feishu"));
  assert.ok(template.graph.edges.some((edge) => edge.source === "vehicle-references" && edge.target === "card-image" && edge.targetPort === "references"));

  const workflow = workflowFixture(snapshot);
  const workflowResponse = canvasWorkflowResponse(workflow);
  assert.equal(workflowResponse.graph.nodes[0].config.path, "");
  const schedule = scheduleFixture(workflow, snapshot);
  const response = canvasScheduleResponse(schedule);
  const source = response.definition?.parameters[0].source;
  assert.equal(source?.mode === "competitor-workbook" ? source.filePath : "unexpected", undefined);
  assert.equal(response.workflowSnapshot?.nodes[0].config.path, "");
  const run = {
    id: "run",
    workflowId: workflow.id,
    workflowRevision: workflow.revision,
    ownerUserId: "admin",
    ownerDisplayName: "Admin",
    status: "completed" as const,
    graphSnapshot: workflow.graph,
    runMode: "with-upstream" as const,
    steps: [],
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
  assert.equal(canvasRunResponse(run).graphSnapshot.nodes[0].config.path, "");
  const runHistory = canvasRunHistoryResponse({
    runs: [run],
    latestSuccessfulNodeRuns: [{
      runId: run.id,
      workflowRevision: run.workflowRevision,
      runCreatedAt: run.createdAt,
      nodeVersion: 1,
      nodeConfig: workflow.graph.nodes[0].config,
      nodeRun: { id: "node-run", runId: run.id, nodeId: "workbook", attempt: 1, status: "completed", inputs: {}, outputs: {}, startedAt: run.createdAt, completedAt: run.updatedAt },
    }],
  });
  assert.equal(runHistory.latestSuccessfulNodeRuns[0].nodeConfig.path, "");

  console.log("Competitor workbook Canvas runtime checks passed.");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function workbookHeaders() {
  return ["序号", "标题", "正文", "参数卡片1", "参数卡片2", "参数卡片3", "参数卡片4", "参数卡片5", "参数卡片6"];
}

function workbookParameters(snapshot: CompetitorWorkbookSnapshot): CanvasScheduleParameter[] {
  return ([
    ["title", "main", "rowTitle"],
    ["body", "main", "rowBody"],
    ["card", "child", "cardText"],
  ] as const).map(([field, scope, fieldKey]) => ({
    id: field,
    name: field,
    scope,
    valueType: "text",
    source: { mode: "competitor-workbook", worksheet: snapshot.worksheet, snapshot, field },
    expansion: "each",
    binding: { nodeId: "competitor-workbook", fieldKey },
  }));
}

function workflowFixture(snapshot: CompetitorWorkbookSnapshot): CanvasWorkflow {
  return {
    id: "workflow",
    ownerUserId: "admin",
    ownerDisplayName: "Admin",
    name: "Workbook",
    revision: 1,
    graph: {
      nodes: [{ id: "workbook", type: "input.competitor-workbook", version: 1, position: { x: 0, y: 0 }, config: { path: "C:\\private\\source.xlsx", worksheet: "文案汇总", snapshot } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

function scheduleFixture(workflow: CanvasWorkflow, snapshot: CompetitorWorkbookSnapshot): CanvasSchedule {
  return {
    id: "schedule",
    ownerUserId: "admin",
    ownerDisplayName: "Admin",
    name: "Workbook schedule",
    revision: 1,
    workflowId: workflow.id,
    workflowRevision: workflow.revision,
    schemaVersion: 2,
    status: "ready",
    batches: [],
    definition: {
      parameters: workbookParameters(snapshot).map((parameter) => ({ ...parameter, source: { ...parameter.source, filePath: "C:\\private\\source.xlsx" } } as CanvasScheduleParameter)),
      expansion: { main: "zip", child: "zip" },
      childResult: { nodeId: "image", outputPort: "images", artifactKind: "images" },
      aggregationPolicy: "at-least-one",
    },
    mainTasks: [],
    workflowSnapshot: workflow.graph,
    totalMainTasks: 0,
    totalChildTasks: 0,
    totalContentTasks: 0,
    totalImageTasks: 0,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

function writeWorkbook(
  filePath: string,
  rows: Array<string[] | null>,
  options: { headers?: string[]; verificationRows?: string[][] } = {},
) {
  const sheets = [
    { name: "文案汇总", rows: [options.headers || workbookHeaders(), ...rows] },
    { name: "校验", rows: options.verificationRows || [["校验"], ["忽略"]] },
  ];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`),
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = xml(sheetXml(sheet.rows)); });
  writeFileSync(filePath, Buffer.from(zipSync(files, { level: 6 })));
}

function sheetXml(rows: Array<string[] | null>) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${(row || []).map((value, columnIndex) => `<c r="${columnName(columnIndex + 1)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
}

function columnName(index: number) {
  let value = index;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function xml(value: string) {
  return strToU8(value);
}
