import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
loadTsModule("src/lib/video-transcription.ts", {
  "./activity-log": { compactError: String, recordExecutionLog: async () => {} },
  "./canvas/types": {},
  "./config": config,
  "./types": {},
});
const transcriptionSource = read("src/lib/video-transcription.ts");
assert.ok(transcriptionSource.includes("export async function transcribeVideoContent"), "plain Ark transcription must remain available");
assert.ok(!transcriptionSource.includes("transcribeVideoSubtitleTimeline"), "Canvas timing must not use the Ark generation model");

const localTimelineSource = read("src/lib/canvas/local-subtitle-timeline.ts");
const NeedsConfigError = class extends Error {};
const localTimelineConfig = {
  canvasSubtitlePythonBin: "python",
  canvasSubtitleWhisperModel: "Systran/faster-whisper-small",
  canvasSubtitleWhisperDevice: "cpu",
  canvasSubtitleWhisperComputeType: "int8",
  canvasSubtitleWhisperTimeoutMs: 1_800_000,
};
const localTimeline = loadTsModule("src/lib/canvas/local-subtitle-timeline.ts", {
  "../activity-log": { compactError: String, recordExecutionLog: async () => {} },
  "../config": { appConfig: localTimelineConfig },
  "./media-tools": { CanvasMediaNeedsConfigError: NeedsConfigError },
  "./types": {},
});
assert.equal(localTimeline.CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION, 4);
assert.match(localTimelineSource, /faster-whisper/);
const recognizerSettings = localTimeline.canvasSubtitleRecognizerSettings();
assert.deepEqual(JSON.parse(JSON.stringify(recognizerSettings)), {
  engine: "faster-whisper",
  model: "Systran/faster-whisper-small",
  device: "cpu",
  computeType: "int8",
  language: "auto",
  vadFilter: true,
  wordTimestamps: true,
  task: "transcribe",
  beamSize: 5,
  conditionOnPreviousText: false,
  localFilesOnly: true,
});
const timeline = localTimeline.normalizeCanvasLocalSubtitleTimeline({
  engine: "faster-whisper",
  segments: [
    { text: "你好", words: [{ startMs: 100, endMs: 450, text: "你好" }] },
    { text: "FluxPost", words: [{ startMs: 500, endMs: 800, text: "Flux" }, { startMs: 810, endMs: 1200, text: "Post" }] },
  ],
}, { durationSeconds: 2, audioStartSeconds: 0.5, mediaStartSeconds: 0 });
assert.deepEqual(JSON.parse(JSON.stringify(timeline)), [
  { startMs: 600, endMs: 950, text: "你好" },
  { startMs: 1000, endMs: 1700, text: "FluxPost" },
]);
const clippedFinalTimeline = localTimeline.normalizeCanvasLocalSubtitleTimeline({ engine: "faster-whisper", segments: [
  { text: "A", words: [{ startMs: 0, endMs: 900, text: "A" }] },
  { text: "B", words: [{ startMs: 900, endMs: 2099, text: "B" }] },
] }, { durationSeconds: 2, audioStartSeconds: 0, mediaStartSeconds: 0 });
assert.deepEqual(JSON.parse(JSON.stringify(clippedFinalTimeline)), [
  { startMs: 0, endMs: 900, text: "A" },
  { startMs: 900, endMs: 2000, text: "B" },
]);
assert.throws(() => localTimeline.normalizeCanvasLocalSubtitleTimeline({ engine: "faster-whisper", segments: [] }, { durationSeconds: 2, audioStartSeconds: 0, mediaStartSeconds: 0 }), /speech segments/i);
assert.throws(
  () => localTimeline.normalizeCanvasLocalSubtitleTimeline({ engine: "faster-whisper", segments: [
    { text: "A", words: [{ startMs: 0, endMs: 1000, text: "A" }] },
    { text: "PRIVATE OVERLAP TEXT", words: [{ startMs: 999, endMs: 1200, text: "B" }] },
  ] }, { durationSeconds: 2, audioStartSeconds: 0, mediaStartSeconds: 0 }),
  /segment 2.*startMs=999, endMs=1200, previousEndMs=1000, durationMs=2000/,
);
assert.throws(
  () => localTimeline.normalizeCanvasLocalSubtitleTimeline({ engine: "faster-whisper", segments: [
    { text: "PRIVATE SUBTITLE TEXT", words: [{ startMs: 0, endMs: 2001, text: "A" }] },
    { text: "B", words: [{ startMs: 2001, endMs: 2100, text: "B" }] },
  ] }, { durationSeconds: 2, audioStartSeconds: 0, mediaStartSeconds: 0 }),
  /segment 1.*intermediate segment overflowMs=1/,
);
let timingBoundaryError;
try {
  localTimeline.normalizeCanvasLocalSubtitleTimeline({ engine: "faster-whisper", segments: [
    { text: "PRIVATE SUBTITLE TEXT", words: [{ startMs: 0, endMs: 2001, text: "A" }] },
    { text: "B", words: [{ startMs: 2001, endMs: 2100, text: "B" }] },
  ] }, { durationSeconds: 2, audioStartSeconds: 0, mediaStartSeconds: 0 });
} catch (error) {
  timingBoundaryError = error;
}
assert.ok(timingBoundaryError, "intermediate overflow must fail");
assert.ok(!String(timingBoundaryError).includes("PRIVATE SUBTITLE TEXT"), "timing diagnostics must not include subtitle text");
assert.throws(
  () => localTimeline.normalizeCanvasLocalSubtitleTimeline({ engine: "faster-whisper", segments: [{ text: "A", words: [{ startMs: 0, endMs: 2101, text: "A" }] }] }, { durationSeconds: 2, audioStartSeconds: 0, mediaStartSeconds: 0 }),
  /segment 1.*overflowMs=101 exceeds toleranceMs=100/,
);
assert.throws(
  () => localTimeline.normalizeCanvasLocalSubtitleTimeline({ engine: "faster-whisper", segments: [{ text: "A", words: [{ startMs: 2000, endMs: 2100, text: "A" }] }] }, { durationSeconds: 2, audioStartSeconds: 0, mediaStartSeconds: 0 }),
  /segment 1.*startMs=2000, endMs=2100, durationMs=2000; final segment start is outside duration/,
);
assert.throws(() => localTimeline.normalizeCanvasLocalSubtitleTimeline({ engine: "faster-whisper", segments: [{ text: "", words: [{ startMs: 0, endMs: 1000, text: "" }] }] }, { durationSeconds: 2, audioStartSeconds: 0, mediaStartSeconds: 0 }), /empty/);
assert.throws(() => localTimeline.normalizeCanvasLocalSubtitleTimeline({ engine: "faster-whisper", segments: [{ text: "A", words: [{ startMs: 100, endMs: 300, text: "A" }, { startMs: 250, endMs: 400, text: "B" }] }] }, { durationSeconds: 2, audioStartSeconds: 0, mediaStartSeconds: 0 }), /word 2 overlaps or is out of order/);
assert.equal(read("requirements/canvas-subtitles.txt").trim(), "faster-whisper==1.2.1");
const pythonRecognizer = read("scripts/canvas/faster_whisper_subtitles.py");
for (const snippet of ["WhisperModel", "word_timestamps=True", "vad_filter=True", "task=args.task", "beam_size=args.beam_size", "local_files_only=True", 'sys.stdout.reconfigure(encoding="utf-8")', "write_json_output("]) assert.ok(pythonRecognizer.includes(snippet), `Python recognizer is missing ${snippet}`);
const unicodeProbe = run("python", [
  "-B",
  "-c",
  'from scripts.canvas.faster_whisper_subtitles import write_json_output; write_json_output({"text": "\\u4e2d\\u6587\\u5b57\\u5e55\\u6d4b\\u8bd5"})',
], root);
assert.deepEqual(JSON.parse(unicodeProbe), { text: "中文字幕测试" }, "Python recognizer stdout must round-trip non-ASCII JSON as UTF-8");

const recognitionInput = { videoPath: "private-input.mp4", durationSeconds: 2, mediaStartSeconds: 0, audioStartSeconds: 0 };
function timelineWithExecFile(execFile, timeoutMs = 1_800_000) {
  return loadTsModule("src/lib/canvas/local-subtitle-timeline.ts", {
    "node:child_process": { execFile },
    "../activity-log": { compactError: String, recordExecutionLog: async () => {} },
    "../config": { appConfig: { ...localTimelineConfig, canvasSubtitleWhisperTimeoutMs: timeoutMs } },
    "./media-tools": { CanvasMediaNeedsConfigError: NeedsConfigError },
    "./types": {},
  });
}
await assert.rejects(
  () => timelineWithExecFile((_bin, _args, _options, callback) => callback(Object.assign(new Error("missing"), { code: "ENOENT" }), "", "")).transcribeCanvasLocalSubtitleTimeline(recognitionInput),
  (error) => error instanceof NeedsConfigError && /interpreter is unavailable/i.test(error.message),
);
await assert.rejects(
  () => timelineWithExecFile((_bin, _args, _options, callback) => callback(new Error("failed"), "", "CONFIG_ERROR: faster-whisper is not installed.")).transcribeCanvasLocalSubtitleTimeline(recognitionInput),
  (error) => error instanceof NeedsConfigError && /not installed/i.test(error.message),
);
await assert.rejects(
  () => timelineWithExecFile((_bin, _args, _options, callback) => callback(Object.assign(new Error("timeout"), { killed: true }), "", ""), 1_234).transcribeCanvasLocalSubtitleTimeline(recognitionInput),
  /timed out after 1 seconds/i,
);
await assert.rejects(
  () => timelineWithExecFile((_bin, _args, _options, callback) => callback(null, "not json", "")).transcribeCanvasLocalSubtitleTimeline(recognitionInput),
  /invalid JSON/i,
);
await assert.rejects(
  () => timelineWithExecFile((_bin, _args, _options, callback) => callback(null, JSON.stringify({ engine: "faster-whisper", segments: [] }), "")).transcribeCanvasLocalSubtitleTimeline(recognitionInput),
  /speech segments/i,
);
await assert.rejects(
  () => timelineWithExecFile((_bin, _args, _options, callback) => callback(new Error("failed"), "", "PRIVATE_PATH_AND_SECRET")).transcribeCanvasLocalSubtitleTimeline(recognitionInput),
  (error) => Boolean(error) && error.message === "Local subtitle recognition failed." && !error.message.includes("PRIVATE_PATH_AND_SECRET"),
);

const videoSubtitles = loadTsModule("src/lib/canvas/video-subtitles.ts", {
  "../config": config,
  "../concurrency": { runWithConcurrencyPool: async (_name, work) => work() },
  "../database": {},
  "../runtime-media-materializer": {},
  "../runtime-media-storage": {},
  "./local-subtitle-timeline": { CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION: 4 },
  "./subtitle-fonts": {},
  "./subtitle-style": styleModule,
  "./media-tools": { CanvasMediaNeedsConfigError: class extends Error {} },
  "./types": {},
});
const videoSubtitlesSource = read("src/lib/canvas/video-subtitles.ts");
assert.ok(!videoSubtitlesSource.includes('"-shortest"'), "subtitle encoding must preserve the source video duration when audio ends first");
assert.ok(!videoSubtitlesSource.includes("arkVideoSubtitle"), "Canvas subtitle rendering must not depend on Ark timing config");
assert.ok(videoSubtitlesSource.includes('"video-subtitles-v4"'), "subtitle output identity must change with the UTF-8 protocol fix");
assert.match(videoSubtitlesSource, /settingsHash[\s\S]*?protocolVersion: CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION/, "local recognizer settings and protocol must participate in cache identity");
const cacheIdentity = { ownerUserId: "owner-1", videoSha256: "video-hash", engine: "faster-whisper", model: "small", settingsHash: "settings-a" };
const cacheId = videoSubtitles.buildCanvasSubtitleTimelineCacheId(cacheIdentity);
assert.notEqual(cacheId, videoSubtitles.buildCanvasSubtitleTimelineCacheId({ ...cacheIdentity, ownerUserId: "owner-2" }));
assert.notEqual(cacheId, videoSubtitles.buildCanvasSubtitleTimelineCacheId({ ...cacheIdentity, videoSha256: "other-video" }));
assert.notEqual(cacheId, videoSubtitles.buildCanvasSubtitleTimelineCacheId({ ...cacheIdentity, model: "medium" }));
assert.notEqual(cacheId, videoSubtitles.buildCanvasSubtitleTimelineCacheId({ ...cacheIdentity, settingsHash: "settings-b" }));
assert.notEqual(cacheId, videoSubtitles.buildCanvasSubtitleTimelineCacheId({ ...cacheIdentity, protocolVersion: 3 }), "v4 must not reuse v3 timelines that may contain mojibake");
assert.notEqual(cacheId, videoSubtitles.buildCanvasSubtitleTimelineCacheId({ ...cacheIdentity, protocolVersion: 2 }), "v4 must not reuse v2/Ark cache identities");
const ass = videoSubtitles.buildCanvasSubtitleAss({
  segments: timeline,
  style: { ...defaultStyle, fontFamily: "Arial", backgroundEnabled: true, maxCharsPerLine: 4 },
  width: 640,
  height: 360,
});
assert.match(ass, /PlayResX: 640/);
assert.match(ass, /Style: Main,Arial/);
assert.match(ass, /Dialogue: 0,0:00:00\.60,0:00:00\.95,Box/);
assert.match(videoSubtitles.wrapSubtitleText("123456", 4), /1234\\N56/);

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-subtitle-check-"));
try {
  const fixtures = [
    { name: "landscape", codedWidth: 64, codedHeight: 48, width: 64, height: 48, audioOffset: 0.5 },
    { name: "portrait", codedWidth: 48, codedHeight: 64, width: 48, height: 64, audioOffset: 0 },
    { name: "rotated", codedWidth: 64, codedHeight: 48, width: 48, height: 64, audioOffset: 0, rotation: 90 },
  ];
  for (const fixture of fixtures) {
    const baseSource = path.join(temp, `${fixture.name}-base.mp4`);
    const source = path.join(temp, `${fixture.name}-source.mp4`);
    const output = path.join(temp, `${fixture.name}-output.mp4`);
    const assFilename = `${fixture.name}.ass`;
    writeFileSync(path.join(temp, assFilename), videoSubtitles.buildCanvasSubtitleAss({
      segments: timeline,
      style: { ...defaultStyle, fontFamily: "Arial" },
      width: fixture.width,
      height: fixture.height,
    }), "utf8");
    const audioOffsetArgs = fixture.audioOffset ? ["-itsoffset", String(fixture.audioOffset)] : [];
    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `color=c=blue:s=${fixture.codedWidth}x${fixture.codedHeight}:d=2`,
      ...audioOffsetArgs, "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", baseSource,
    ], temp);
    if (fixture.rotation) {
      run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-display_rotation:v:0", String(fixture.rotation), "-i", baseSource, "-c", "copy", source], temp);
    } else {
      copyFileSync(baseSource, source);
    }
    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", source,
      "-map", "0:v:0", "-map", "0:a:0", "-vf", `ass=${assFilename}`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output,
    ], temp);
    assert.ok(statSync(output).size > 500, `${fixture.name} FFmpeg output must be non-empty`);
    const sourceProbe = probeMedia(source, temp);
    const outputProbe = probeMedia(output, temp);
    const outputVideo = outputProbe.streams.find((stream) => stream.codec_type === "video");
    const outputAudio = outputProbe.streams.find((stream) => stream.codec_type === "audio");
    assert.equal(outputVideo.codec_name, "h264");
    assert.equal(outputAudio.codec_name, "aac");
    assert.equal(outputVideo.width, fixture.width, `${fixture.name} output width must use displayed dimensions`);
    assert.equal(outputVideo.height, fixture.height, `${fixture.name} output height must use displayed dimensions`);
    assert.ok(!outputVideo.side_data_list?.some((item) => Number(item.rotation)), `${fixture.name} output must not retain stale rotation metadata`);
    assert.ok(Number(outputProbe.format.duration) >= 1.95, `${fixture.name} output must preserve the complete video duration`);
    if (fixture.rotation) {
      const sourceVideo = sourceProbe.streams.find((stream) => stream.codec_type === "video");
      assert.equal(Math.abs(Number(sourceVideo.side_data_list?.find((item) => item.rotation !== undefined)?.rotation)), 90);
    }
    if (fixture.audioOffset) {
      const sourceVideo = sourceProbe.streams.find((stream) => stream.codec_type === "video");
      const sourceAudio = sourceProbe.streams.find((stream) => stream.codec_type === "audio");
      const sourceDelta = Number(sourceAudio.start_time) - Number(sourceVideo.start_time);
      const outputDelta = Number(outputAudio.start_time) - Number(outputVideo.start_time);
      assert.ok(sourceDelta > 0.4, `source audio offset was not created: ${sourceDelta}`);
      assert.ok(Math.abs(outputDelta - sourceDelta) < 0.06, `audio/video origin changed during subtitle encode: source=${sourceDelta}, output=${outputDelta}`);
    }
  }
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
for (const snippet of ["CanvasSubtitleStyleEditor", "CanvasSubtitlePreviewMedia", "canvas-subtitle-preview", "canvas-subtitle-preview-meta", "<video", "aspectRatio", "CanvasSubtitleRange", "CanvasSubtitleColor"]) assert.ok(page.includes(snippet), `Canvas subtitle editor is missing ${snippet}`);
assert.ok(docker.includes("fontconfig fonts-noto-cjk"));
assert.ok(read("src/app/api/canvas/subtitle-presets/route.ts").includes("requireWorkspaceAccount"));
assert.ok(read("src/app/api/canvas/subtitle-presets/[id]/route.ts").includes("CanvasSubtitlePresetConflictError"));

console.log("Canvas video subtitles verification passed.");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function probeMedia(filePath, cwd) {
  return JSON.parse(run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,start_time:stream=codec_name,codec_type,width,height,duration,start_time:stream_side_data=rotation",
    "-of", "json", filePath,
  ], cwd));
}
