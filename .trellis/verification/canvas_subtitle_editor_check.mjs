import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const nodeRequire = createRequire(import.meta.url);

function loadTsModule(relative, requireMap = {}, extras = {}) {
  const output = ts.transpileModule(read(relative), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relative,
  }).outputText;
  const cjs = { exports: {} };
  vm.runInNewContext(output, {
    Buffer, URL, console, process, module: cjs, exports: cjs.exports, setTimeout, clearTimeout, structuredClone,
    ...extras,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      if (name.startsWith("node:")) return nodeRequire(name);
      throw new Error(`Unexpected import ${name} from ${relative}`);
    },
  }, { filename: relative });
  return cjs.exports;
}

const editor = loadTsModule("src/lib/canvas/subtitle-editor.ts", { "./types": {} });
const durationMs = 12_000;
const base = [
  { startMs: 500, endMs: 1800, text: "你好" },
  { startMs: 2200, endMs: 3600, text: "FluxPost Studio" },
];
assert.deepEqual(JSON.parse(JSON.stringify(editor.validateCanvasSubtitleSegments(base, durationMs))), base);
assert.throws(() => editor.validateCanvasSubtitleSegments([], durationMs), /between 1 and 1000/);
assert.throws(() => editor.validateCanvasSubtitleSegments([{ startMs: 0, endMs: 100, text: " " }], durationMs), /text must contain/);
assert.throws(() => editor.validateCanvasSubtitleSegments([{ startMs: 0, endMs: 13_000, text: "x" }], durationMs), /outside/);
assert.throws(() => editor.validateCanvasSubtitleSegments([{ startMs: 0, endMs: 900, text: "x" }, { startMs: 800, endMs: 1000, text: "y" }], durationMs), /overlaps/);
assert.equal(editor.validateCanvasSubtitleSegments(Array.from({ length: 1000 }, (_, i) => ({ startMs: i * 10, endMs: i * 10 + 10, text: "x" })), 10_000).length, 1000);
assert.throws(() => editor.validateCanvasSubtitleSegments(Array.from({ length: 1001 }, (_, i) => ({ startMs: i * 10, endMs: i * 10 + 10, text: "x" })), 10_010), /between 1 and 1000/);

const moved = editor.moveCanvasSubtitleSegment(base, 0, 999, durationMs);
assert.equal(moved[0].startMs, 900, "dragging must round to 10ms");
assert.equal(moved[0].endMs, 2200, "dragging must clamp against the next segment");
assert.throws(() => editor.moveCanvasSubtitleSegment(base, 0, Number.NaN, durationMs), /finite/);
assert.equal(editor.resizeCanvasSubtitleSegment(base, 1, "start", 1700, durationMs)[1].startMs, 1800, "resize must clamp to the previous segment");
const added = editor.addCanvasSubtitleSegment(base, 1900, durationMs);
assert.equal(added.length, 3);
assert.equal(added[1].startMs, 1900);
assert.throws(() => editor.addCanvasSubtitleSegment(base, 1000, durationMs), /empty timeline gap/);
const split = editor.splitCanvasSubtitleSegment(base, 1, 2800, 8);
assert.equal(split.length, 3);
assert.equal(split[1].text, "FluxPost");
assert.equal(split[2].text, "Studio");
assert.throws(() => editor.splitCanvasSubtitleSegment(base, 1, 2200, 8), /playhead inside/);
const mergedEnglish = editor.mergeCanvasSubtitleSegmentWithNext([{ startMs: 0, endMs: 10, text: "FluxPost" }, { startMs: 20, endMs: 30, text: "Studio" }], 0);
assert.equal(mergedEnglish[0].text, "FluxPost Studio");
const mergedChinese = editor.mergeCanvasSubtitleSegmentWithNext([{ startMs: 0, endMs: 10, text: "人工" }, { startMs: 20, endMs: 30, text: "校对" }], 0);
assert.equal(mergedChinese[0].text, "人工校对");
assert.equal(editor.deleteCanvasSubtitleSegment(base, 0).length, 1);
assert.throws(() => editor.deleteCanvasSubtitleSegment([base[0]], 0), /at least one/);

const snapshot = {
  protocolVersion: 1,
  revisionId: "revision-1",
  revision: 3,
  videoSha256: "a".repeat(64),
  segments: base,
};
assert.equal(editor.decodeCanvasSubtitleRevisionSnapshot(snapshot).revision, 3);
assert.equal(editor.decodeCanvasSubtitleRevisionSnapshot({ ...snapshot, videoSha256: "wrong" }), undefined);
assert.equal(editor.decodeCanvasSubtitleRevisionSnapshot({ ...snapshot, segments: [base[1], base[0]] }), undefined);
assert.ok(editor.decodeCanvasSubtitleRunMetadata({
  protocolVersion: 1,
  timelineProtocolVersion: 4,
  videoSha256: "b".repeat(64),
  durationMs,
  source: { url: "/media/source.mp4" },
  segments: base,
}));

const videoSubtitles = loadTsModule("src/lib/canvas/video-subtitles.ts", {
  "../concurrency": {}, "../database": {}, "../runtime-media-materializer": {}, "../runtime-media-storage": {},
  "./subtitle-fonts": {}, "./subtitle-style": {}, "./media-tools": { CanvasMediaNeedsConfigError: class extends Error {} },
  "./local-subtitle-timeline": { CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION: 4 }, "./subtitle-editor": editor, "./types": {},
});
assert.equal(videoSubtitles.resolveCanvasSubtitleRevisionSegments(snapshot, "a".repeat(64), durationMs).length, 2);
assert.equal(videoSubtitles.resolveCanvasSubtitleRevisionSegments(snapshot, "b".repeat(64), durationMs), undefined, "mismatched video hashes must ignore the snapshot");
let recognitionCalls = 0;
assert.equal((await videoSubtitles.resolveCanvasSubtitleTimeline(snapshot, "a".repeat(64), durationMs, async () => { recognitionCalls += 1; return []; })).length, 2);
assert.equal(recognitionCalls, 0, "matching manual snapshots must skip Whisper entirely");
assert.deepEqual(await videoSubtitles.resolveCanvasSubtitleTimeline(snapshot, "b".repeat(64), durationMs, async () => { recognitionCalls += 1; return base; }), base);
assert.equal(recognitionCalls, 1, "mismatched video hashes must use recognition");
const videoSource = read("src/lib/canvas/video-subtitles.ts");
assert.match(videoSource, /resolveCanvasSubtitleTimeline[\s\S]*?recognizeTimeline/, "subtitle execution must resolve the frozen snapshot before recognition");

const waveform = loadTsModule("src/lib/canvas/subtitle-waveform.ts", {
  "../concurrency": {}, "../database": {}, "../runtime-media-materializer": {}, "./subtitle-editor": editor, "./types": {},
});
const reducer = new waveform.CanvasSubtitlePcmReducer();
const pcm = Buffer.alloc(160 * 2);
for (let index = 0; index < 160; index += 1) pcm.writeInt16LE(index % 2 ? 16384 : -8192, index * 2);
reducer.push(pcm.subarray(0, 101));
reducer.push(pcm.subarray(101));
assert.deepEqual(JSON.parse(JSON.stringify(reducer.finish())), [[-0.25, 0.5]], "PCM chunk boundaries must preserve deterministic min/max peaks");
assert.equal(waveform.canvasSubtitleWaveformCacheId("owner-1", "a".repeat(64)), waveform.canvasSubtitleWaveformCacheId("owner-1", "a".repeat(64)));
assert.notEqual(waveform.canvasSubtitleWaveformCacheId("owner-1", "a".repeat(64)), waveform.canvasSubtitleWaveformCacheId("owner-2", "a".repeat(64)));

const { EventEmitter } = nodeRequire("node:events");
const { PassThrough } = nodeRequire("node:stream");
function fakeFfmpeg({ code = 0, stderr = "", emitPcm = true } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => child.emit("close", null);
  process.nextTick(() => {
    if (stderr) child.stderr.write(stderr);
    if (emitPcm) child.stdout.write(pcm);
    child.stdout.end();
    child.stderr.end();
    child.emit("close", code);
  });
  return child;
}
assert.deepEqual(JSON.parse(JSON.stringify(await waveform.decodeCanvasSubtitleWaveformPcm("fixture.mp4", { spawnProcess: () => fakeFfmpeg() }))), [[-0.25, 0.5]]);
await assert.rejects(() => waveform.decodeCanvasSubtitleWaveformPcm("no-audio.mp4", { spawnProcess: () => fakeFfmpeg({ code: 1, stderr: "Stream map '0:a:0' matches no streams", emitPcm: false }) }), /matches no streams/);
await assert.rejects(() => waveform.decodeCanvasSubtitleWaveformPcm("timeout.mp4", {
  timeoutMs: 5,
  spawnProcess: () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => undefined;
    return child;
  },
}), /timed out/);

let cachedWaveform;
let waveformDecodeCalls = 0;
let waveformSaveCalls = 0;
let waveformCleanupCalls = 0;
const cachedWaveformModule = loadTsModule("src/lib/canvas/subtitle-waveform.ts", {
  "node:child_process": {
    spawn: () => {
      waveformDecodeCalls += 1;
      return fakeFfmpeg();
    },
  },
  "../concurrency": { runWithConcurrencyPool: async (pool, task) => {
    assert.equal(pool, "localVideo");
    return task();
  } },
  "../database": {
    getCanvasSubtitleWaveformFromDb: async () => cachedWaveform,
    saveCanvasSubtitleWaveformToDb: async (_cacheId, value) => {
      waveformSaveCalls += 1;
      cachedWaveform = structuredClone(value);
      return value;
    },
  },
  "../runtime-media-materializer": { materializeRuntimeMedia: async () => ({
    filePath: "fixture.mp4",
    cleanup: async () => { waveformCleanupCalls += 1; },
  }) },
  "./subtitle-editor": editor,
  "./types": {},
});
const waveformRevision = {
  ownerUserId: "owner-1",
  videoSha256: "a".repeat(64),
  durationMs: 1000,
  source: { url: "/media/fixture.mp4" },
};
const [firstWaveform, duplicateWaveform] = await Promise.all([
  cachedWaveformModule.getCanvasSubtitleWaveform(waveformRevision),
  cachedWaveformModule.getCanvasSubtitleWaveform(waveformRevision),
]);
assert.deepEqual(JSON.parse(JSON.stringify(firstWaveform.peaks)), [[-0.25, 0.5]]);
assert.deepEqual(JSON.parse(JSON.stringify(duplicateWaveform.peaks)), [[-0.25, 0.5]]);
assert.equal(waveformDecodeCalls, 1, "concurrent waveform requests must share one FFmpeg decode");
assert.equal(waveformSaveCalls, 1, "a shared waveform decode must be cached once");
assert.equal(waveformCleanupCalls, 1, "shared waveform generation must clean up one materialized source");
await cachedWaveformModule.getCanvasSubtitleWaveform(waveformRevision);
assert.equal(waveformDecodeCalls, 1, "a cached waveform must not invoke FFmpeg again");

let revisionRow;
const workflow = { id: "workflow-1", ownerUserId: "owner-1", ownerDisplayName: "Owner", graph: { nodes: [{ id: "subtitle-1", type: "utility.video-subtitles" }] } };
const run = { id: "run-1", workflowId: workflow.id, ownerUserId: workflow.ownerUserId };
const nodeRun = {
  id: "node-run-1", runId: run.id, nodeId: "subtitle-1", nodeType: "utility.video-subtitles", status: "completed",
  internalMetadata: { subtitle: { protocolVersion: 1, timelineProtocolVersion: 4, videoSha256: "a".repeat(64), durationMs, source: { url: "/media/source.mp4" }, segments: base } },
};
const revisions = loadTsModule("src/lib/canvas/subtitle-revisions.ts", {
  "../database": {
    getCanvasWorkflowFromDb: async () => workflow,
    getCanvasNodeRunFromDb: async () => nodeRun,
    getCanvasRunFromDb: async () => run,
    getCanvasSubtitleRevisionByKeyFromDb: async () => revisionRow,
    createCanvasSubtitleRevisionInDb: async (value) => { revisionRow = structuredClone(value); return true; },
    getCanvasSubtitleRevisionFromDb: async () => revisionRow,
    updateCanvasSubtitleRevisionInDb: async (value, expected) => {
      if (!revisionRow || revisionRow.revision !== expected) return false;
      revisionRow = structuredClone(value);
      return true;
    },
  },
  "../workspace-ownership": { canAccessWorkspaceOwner: (account, owner) => account.role === "admin" || account.id === owner },
  "./subtitle-editor": editor,
  "./types": {},
});
const owner = { id: "owner-1", displayName: "Owner", role: "operator" };
const other = { id: "owner-2", displayName: "Other", role: "operator" };
const admin = { id: "admin", displayName: "Admin", role: "admin" };
const opened = await revisions.openCanvasSubtitleRevision(owner, { workflowId: workflow.id, nodeId: nodeRun.nodeId, nodeRunId: nodeRun.id });
assert.equal(opened.revision, 1);
assert.equal((await revisions.openCanvasSubtitleRevision(owner, { workflowId: workflow.id, nodeId: nodeRun.nodeId, nodeRunId: nodeRun.id })).id, opened.id, "open must reuse the node/video-keyed revision");
assert.equal(await revisions.getCanvasSubtitleRevision(opened.id, other), undefined);
assert.equal((await revisions.getCanvasSubtitleRevision(opened.id, admin)).ownerUserId, owner.id);
const saved = await revisions.saveCanvasSubtitleRevision(owner, opened.id, { revision: 1, segments: [{ ...base[0], text: "修正" }, base[1]] });
assert.equal(saved.revision, 2);
await assert.rejects(() => revisions.saveCanvasSubtitleRevision(owner, opened.id, { revision: 1, segments: base }), /another tab/);

const database = read("src/lib/database.ts");
const schema = read("db/migrations/001_initial_postgres.sql");
const migration = read("db/migrations/004_canvas_subtitle_revisions.sql");
for (const text of [database, schema, migration]) {
  assert.ok(text.includes("canvas_subtitle_revisions"));
  assert.ok(text.includes("canvas_subtitle_waveform_cache"));
}
assert.match(database, /WHERE id = \$4 AND owner_user_id = \$5 AND revision = \$6/, "PostgreSQL revision saves must compare-and-set");
assert.match(database, /WHERE id = \? AND owner_user_id = \? AND revision = \?/, "SQLite revision saves must compare-and-set");
assert.match(database, /DELETE FROM canvas_subtitle_revisions WHERE workflow_id/, "workflow deletion must clean subtitle revisions");

const page = read("src/app/canvas/page.tsx");
const dialog = read("src/app/canvas/SubtitleEditorDialog.tsx");
for (const value of ["校对字幕", "SubtitleEditorDialog", "revisionSnapshot", 'runMode: "isolated"']) assert.ok(page.includes(value), `Canvas page missing ${value}`);
for (const value of ["恢复识别稿", "应用并重新生成", "canvas-subtitle-live-overlay", "canvas-subtitle-playhead", "window.confirm"]) assert.ok(dialog.includes(value), `Subtitle editor missing ${value}`);

console.log("Canvas subtitle editor checks passed.");
