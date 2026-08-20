import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

function loadTsModule(relative, requireMap = {}) {
  const output = ts.transpileModule(read(relative), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relative,
  }).outputText;
  const cjs = { exports: {} };
  vm.runInNewContext(output, {
    Buffer, URL, console, process, module: cjs, exports: cjs.exports, setTimeout, clearTimeout, structuredClone, FormData, File, fetch, AbortSignal,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      if (name.startsWith("node:")) return nodeRequire(name);
      throw new Error(`Unexpected import ${name} from ${relative}`);
    },
  }, { filename: relative });
  return cjs.exports;
}

const styleModule = loadTsModule("src/lib/canvas/subtitle-style.ts", { "./types": {} });
const defaultStyle = styleModule.defaultCanvasSubtitleStyle;
assert.equal(styleModule.validateCanvasSubtitleStyle(defaultStyle).length, 0);
assert.equal(styleModule.builtInCanvasSubtitlePresets().length, 3);
assert.equal(styleModule.normalizeCanvasSubtitlePresetName("  白字  黑边 "), "白字 黑边");
assert.equal(styleModule.normalizeCanvasSubtitleStyle({ ...defaultStyle, fontSizePercent: 99 }).fontSizePercent, 12);
assert.ok(styleModule.validateCanvasSubtitleStyle({ ...defaultStyle, textColor: "white" }).length > 0);

let presetRows = [];
let forceUniqueFailure = false;
const presetDatabase = {
  listCanvasSubtitlePresetsFromDb: async () => presetRows,
  getCanvasSubtitlePresetFromDb: async (id) => presetRows.find((preset) => preset.id === id),
  createCanvasSubtitlePresetInDb: async (preset) => {
    if (forceUniqueFailure) {
      const error = new Error("UNIQUE constraint failed: canvas_subtitle_presets.owner_user_id, canvas_subtitle_presets.normalized_name");
      error.code = "SQLITE_CONSTRAINT_UNIQUE";
      throw error;
    }
    presetRows.push(preset);
    return preset;
  },
  updateCanvasSubtitlePresetInDb: async (preset, revision) => {
    const index = presetRows.findIndex((item) => item.id === preset.id && item.revision === revision);
    if (index < 0) return false;
    presetRows[index] = preset;
    return true;
  },
  deleteCanvasSubtitlePresetFromDb: async (id, revision) => {
    const index = presetRows.findIndex((item) => item.id === id && item.revision === revision);
    if (index < 0) return false;
    presetRows.splice(index, 1);
    return true;
  },
};
const presetOwnership = {
  scopeWorkspaceOwner: (account) => ({ ownerUserId: account.id, ownerDisplayName: account.displayName }),
  filterWorkspaceOwnedRecords: (records, account) => account.role === "admin" ? records : records.filter((record) => record.ownerUserId === account.id),
  assertCanAccessWorkspaceRecord: (account, record, message) => {
    if (!record || (account.role !== "admin" && record.ownerUserId !== account.id)) throw new Error(message);
  },
};
const presetModule = loadTsModule("src/lib/canvas/subtitle-presets.ts", {
  "../database": presetDatabase,
  "../workspace-ownership": presetOwnership,
  "./subtitle-style": styleModule,
  "./types": {},
});
const operator = { id: "operator-1", displayName: "Operator", role: "operator" };
const admin = { id: "admin-1", displayName: "Admin", role: "admin" };
const personalPreset = await presetModule.createCanvasSubtitlePreset(operator, { name: "My Style", style: defaultStyle });
presetRows.push({ ...personalPreset, id: "other-preset", ownerUserId: "other-1", ownerDisplayName: "Other", name: "Other Style", normalizedName: "other style" });
assert.equal((await presetModule.listCanvasSubtitlePresets(operator)).filter((preset) => !preset.builtIn).length, 1);
assert.equal((await presetModule.listCanvasSubtitlePresets(admin)).filter((preset) => !preset.builtIn).length, 2);
await assert.rejects(() => presetModule.updateCanvasSubtitlePreset(operator, "other-preset", { revision: 1 }), /not found/i);
const adminUpdated = await presetModule.updateCanvasSubtitlePreset(admin, "other-preset", { name: "Admin Updated", style: defaultStyle, revision: 1 });
assert.equal(adminUpdated.revision, 2);
await assert.rejects(() => presetModule.deleteCanvasSubtitlePreset(admin, "other-preset", 1), /revision conflict/i);
await presetModule.deleteCanvasSubtitlePreset(admin, "other-preset", 2);
forceUniqueFailure = true;
await assert.rejects(() => presetModule.createCanvasSubtitlePreset(operator, { name: "Race", style: defaultStyle }), /already exists/i);
forceUniqueFailure = false;

const config = {
  appConfig: {
    arkApiKey: "mock",
    arkBaseUrl: "https://example.invalid",
    arkVideoTranscriptionModel: "plain-model",
    arkVideoTranscriptionPrompt: "plain prompt",
    arkVideoSubtitleModel: "subtitle-model",
    arkVideoSubtitlePrompt: "timeline prompt",
    arkVideoTranscriptionAudioExtractTimeoutMs: 1,
    arkVideoTranscriptionUploadTimeoutMs: 1,
    arkVideoTranscriptionTimeoutMs: 1,
    arkVideoTranscriptionMaxAudioBytes: 1024,
  },
};
const transcription = loadTsModule("src/lib/video-transcription.ts", {
  "./activity-log": { compactError: String, recordExecutionLog: async () => {} },
  "./canvas/types": {},
  "./config": config,
  "./types": {},
});
assert.equal(transcription.CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION, 2);
const baseSubtitlePrompt = config.appConfig.arkVideoSubtitlePrompt;
const requestSubtitlePrompt = transcription.buildVideoSubtitlePrompt(baseSubtitlePrompt, 16136);
assert.equal(config.appConfig.arkVideoSubtitlePrompt, baseSubtitlePrompt, "request prompt construction must not mutate the configured base prompt");
assert.ok(requestSubtitlePrompt.startsWith(`${baseSubtitlePrompt}\n\n`));
assert.match(requestSubtitlePrompt, /durationMs=16136/);
assert.match(requestSubtitlePrompt, /startMs < 16136/);
assert.match(requestSubtitlePrompt, /endMs <= 16136/);
const transcriptionSource = read("src/lib/video-transcription.ts");
assert.ok(transcriptionSource.includes("buildVideoSubtitlePrompt(appConfig.arkVideoSubtitlePrompt, durationMs)"));
assert.ok(transcriptionSource.includes("callArkResponsesForAudioOutput(fileId, appConfig.arkVideoSubtitleModel, requestPrompt)"));
const timeline = transcription.normalizeVideoSubtitleTimeline({ segments: [
  { startMs: 0, endMs: 900, text: "你好" },
  { startMs: 900, endMs: 1900, text: "FluxPost" },
] }, 2);
assert.deepEqual(JSON.parse(JSON.stringify(timeline)), [
  { startMs: 0, endMs: 900, text: "你好" },
  { startMs: 900, endMs: 1900, text: "FluxPost" },
]);
const clippedFinalTimeline = transcription.normalizeVideoSubtitleTimeline({ segments: [
  { startMs: 0, endMs: 900, text: "A" },
  { startMs: 900, endMs: 3000, text: "B" },
] }, 2);
assert.deepEqual(JSON.parse(JSON.stringify(clippedFinalTimeline)), [
  { startMs: 0, endMs: 900, text: "A" },
  { startMs: 900, endMs: 2000, text: "B" },
]);
assert.throws(() => transcription.normalizeVideoSubtitleTimeline({ segments: [] }, 2), /did not contain/);
assert.throws(
  () => transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: 0, endMs: 1000, text: "A" }, { startMs: 999, endMs: 1200, text: "PRIVATE OVERLAP TEXT" }] }, 2),
  /segment 2.*startMs=999, endMs=1200, previousEndMs=1000, durationMs=2000/,
);
assert.throws(() => transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: 0.5, endMs: 1000, text: "A" }] }, 2), /integer milliseconds/);
assert.throws(() => transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: -1, endMs: 1000, text: "A" }] }, 2), /outside/);
assert.throws(() => transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: 1000, endMs: 1000, text: "A" }] }, 2), /outside/);
assert.throws(
  () => transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: 0, endMs: 2100, text: "PRIVATE SUBTITLE TEXT" }, { startMs: 2100, endMs: 2200, text: "B" }] }, 2),
  /segment 1.*startMs=0, endMs=2100, durationMs=2000; intermediate segment overflowMs=100/,
);
let timingBoundaryError;
try {
  transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: 0, endMs: 2100, text: "PRIVATE SUBTITLE TEXT" }, { startMs: 2100, endMs: 2200, text: "B" }] }, 2);
} catch (error) {
  timingBoundaryError = error;
}
assert.ok(timingBoundaryError, "intermediate overflow must fail");
assert.ok(!String(timingBoundaryError).includes("PRIVATE SUBTITLE TEXT"), "timing diagnostics must not include subtitle text");
assert.throws(
  () => transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: 0, endMs: 3001, text: "A" }] }, 2),
  /segment 1.*overflowMs=1001 exceeds toleranceMs=1000/,
);
assert.throws(
  () => transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: 2000, endMs: 2100, text: "A" }] }, 2),
  /segment 1.*startMs=2000, endMs=2100, durationMs=2000; final segment start is outside duration/,
);
assert.throws(() => transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: 0, endMs: 1000, text: "" }] }, 2), /empty/);
assert.throws(() => transcription.normalizeVideoSubtitleTimeline({ segments: [{ startMs: 0, endMs: 1000, text: "A".repeat(501) }] }, 2), /too long/);

const videoSubtitles = loadTsModule("src/lib/canvas/video-subtitles.ts", {
  "../config": config,
  "../concurrency": { runWithConcurrencyPool: async (_name, work) => work() },
  "../database": {},
  "../runtime-media-materializer": {},
  "../runtime-media-storage": {},
  "../video-transcription": { CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION: 2 },
  "./subtitle-fonts": {},
  "./subtitle-style": styleModule,
  "./media-tools": { CanvasMediaNeedsConfigError: class extends Error {} },
  "./types": {},
});
const videoSubtitlesSource = read("src/lib/canvas/video-subtitles.ts");
assert.ok(!videoSubtitlesSource.includes('"-shortest"'), "subtitle encoding must preserve the source video duration when audio ends first");
assert.match(videoSubtitlesSource, /const promptSha256 = sha256\(appConfig\.arkVideoSubtitlePrompt\)/, "cache prompt hash must continue using the configured base prompt");
assert.match(videoSubtitlesSource, /const cacheId = sha256\([\s\S]*?protocolVersion: CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION/, "timeline protocol version must participate in cache identity");
const ass = videoSubtitles.buildCanvasSubtitleAss({
  segments: timeline,
  style: { ...defaultStyle, fontFamily: "Arial", backgroundEnabled: true, maxCharsPerLine: 4 },
  width: 640,
  height: 360,
});
assert.match(ass, /PlayResX: 640/);
assert.match(ass, /Style: Main,Arial/);
assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:00\.90,Box/);
assert.match(videoSubtitles.wrapSubtitleText("123456", 4), /1234\\N56/);

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-subtitle-check-"));
try {
  writeFileSync(path.join(temp, "subtitle.ass"), ass, "utf8");
  const source = path.join(temp, "source.mp4");
  const output = path.join(temp, "output.mp4");
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source], temp);
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vf", "ass=subtitle.ass", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", output], temp);
  assert.ok(statSync(output).size > 1000, "FFmpeg must produce a non-empty subtitled MP4");
  const probe = run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type", "-of", "json", output], temp);
  const streams = JSON.parse(probe).streams;
  assert.ok(streams.some((stream) => stream.codec_type === "video" && stream.codec_name === "h264"));
  assert.ok(streams.some((stream) => stream.codec_type === "audio" && stream.codec_name === "aac"));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const types = read("src/lib/canvas/types.ts");
const registry = read("src/lib/canvas/registry.ts");
const executors = read("src/lib/canvas/executors.ts");
const database = read("src/lib/database.ts");
const migration = read("db/migrations/001_initial_postgres.sql");
const page = read("src/app/canvas/page.tsx");
const docker = read("Dockerfile");
assert.ok(types.includes('"utility.video-subtitles"'));
for (const source of [registry, executors]) assert.ok(source.includes('"utility.video-subtitles"'));
assert.ok(registry.includes('capability: "text_model"'));
assert.ok(registry.includes('bypass: { inputPort: "videos", outputPort: "videos" }'));
for (const source of [database, migration]) {
  assert.ok(source.includes("canvas_subtitle_presets"));
  assert.ok(source.includes("canvas_subtitle_transcript_cache"));
  assert.ok(source.includes("UNIQUE(owner_user_id, normalized_name)"));
}
for (const snippet of ["CanvasSubtitleStyleEditor", "canvas-subtitle-preview", "覆盖字幕预设", "删除字幕预设", "CanvasSubtitleRange", "CanvasSubtitleColor"]) assert.ok(page.includes(snippet));
assert.ok(docker.includes("fontconfig fonts-noto-cjk"));
assert.ok(read("src/app/api/canvas/subtitle-presets/route.ts").includes("requireWorkspaceAccount"));
assert.ok(read("src/app/api/canvas/subtitle-presets/[id]/route.ts").includes("CanvasSubtitlePresetConflictError"));

console.log("Canvas video subtitles verification passed.");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}
