import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const load = (name) => require("tsx/cjs/api").require(`./src/lib/canvas/${name}.ts`, fileURLToPath(new URL("../../package.json", import.meta.url)));
const { editBatchDraft, batchInputIssues, batchOutputIssue, batchCanvasHref } = load("batch-create");
const { createCanvasNode, getCanvasBatchBindings } = load("registry");
const nodes = ["input.text", "input.images", "input.library-images", "input.video-loader", "input.source-video", "input.content-pool", "input.copy-library", "input.local-directory", "model.gpt-image"].map((type, index) => createCanvasNode(type, `node-${index}`, { x: 0, y: 0 }));
const graph = { nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
const bindings = getCanvasBatchBindings(graph);
const parameter = { id: "text", name: "文案", valueType: "text", scope: "main", expansion: "each", binding: bindings.find((item) => item.node.type === "input.text").binding, source: { mode: "manual-list", values: ["A\n\nB", "C"], listSeparator: "delimiter" } };
const definition = { parameters: [parameter], expansion: { main: "zip", child: "cartesian" }, aggregationPolicy: "all", childResult: { nodeId: "node-0", outputPort: "text", artifactKind: "text" }, sharedOutputs: [] };
const schedule = { id: "schedule", revision: 7, status: "ready", previewRevision: "preview", definition, mainTasks: [{ id: "stale" }], totalMainTasks: 1, totalChildTasks: 4 };
const changed = editBatchDraft(schedule, { name: "new name" });
assert.equal(changed.revision, 7, "editing must retain optimistic concurrency revision");
assert.equal(changed.previewRevision, undefined, "editing invalidates the launch token");
assert.equal(changed.status, "draft");
assert.deepEqual(changed.mainTasks, [], "stale preview rows must disappear");
assert.deepEqual(changed.definition, definition, "renaming must not rewrite advanced parameters");
assert.equal(schedule.status, "ready", "editing cannot mutate prior server snapshot");
assert.deepEqual(batchInputIssues(definition, graph), []);
assert.equal(batchOutputIssue(definition, graph), "");
assert.match(batchOutputIssue({ ...definition, childResult: { ...definition.childResult, nodeId: "deleted" } }, graph), /有效/);
assert.match(batchInputIssues({ ...definition, parameters: [{ ...parameter, binding: { nodeId: "missing", fieldKey: "text" } }] }, graph)[0], /使用位置/);
assert.match(batchInputIssues({ ...definition, parameters: [{ ...parameter, source: { mode: "fixed", values: [" "] } }] }, graph)[0], /填写/);

// Every supported value shape must remain byte-for-byte intact through unrelated edits.
const sources = [
  { mode: "library-filter", filter: { mode: "manual", assetIds: ["image"], tags: ["tag"], collectionId: "collection" } },
  { mode: "copy-filter", filter: { mode: "manual", entryIds: ["copy"], tags: [] } },
  { mode: "content-pool-filter", filter: { mode: "manual", itemIds: ["item"], customTags: ["tag"] } },
  { mode: "video-loader-queue", nodeId: "video" },
  { mode: "source-video-links", links: ["https://example.invalid/video"], projectName: "视频" },
  { mode: "competitor-workbook", worksheet: "文案汇总", rowStart: 2, rowEnd: 8, field: "card", snapshot: { id: "snapshot", rows: [] } },
  { mode: "manual-list", values: [{ id: "directory", snapshotId: "snapshot", images: [], audios: [], videos: [], valid: true, errors: [] }] },
  { mode: "manual-list", values: [true, false] }, { mode: "manual-list", values: [1, 2] }, { mode: "fixed", values: ["enum"] },
];
const complex = { ...definition, parameters: sources.map((source, index) => ({ ...parameter, id: String(index), source, binding: { nodeId: "region", innerNodeId: "inner", fieldKey: "text" }, sampleCount: { mode: "range", min: 2, max: 5 } })), sharedOutputs: [{ nodeId: "shared", outputPort: "images", artifactKind: "images" }], mainTargetNodeId: "compose" };
const restored = JSON.parse(JSON.stringify(editBatchDraft({ ...schedule, definition: complex }, { name: "renamed" })));
assert.deepEqual(restored.definition, complex, "source snapshots, inner bindings, shared outputs and sample ranges survive save serialization");
const href = new URL(batchCanvasHref("workflow & 1", "schedule / 2"), "http://localhost");
assert.equal(href.searchParams.get("workflowId"), "workflow & 1");
assert.equal(href.searchParams.get("scheduleId"), "schedule / 2");
assert.equal(href.searchParams.get("panel"), "schedules");
console.log("Batch creation: preview invalidation, revision preservation, input/output validation, lossless value shapes and cross-page links passed.");
