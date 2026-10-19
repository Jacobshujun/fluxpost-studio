import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const code = ts.transpileModule(readFileSync("src/lib/canvas/video-encoding.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const environment = {};
const loaded = { exports: {} };
Function("module", "exports", "process", code)(loaded, loaded.exports, { env: environment });
const encodingArgs = loaded.exports.canvasVideoEncodingArgs;
assert.deepEqual(encodingArgs(), ["-c:v", "libx264"]);
assert.deepEqual(encodingArgs({ crf: 19, preset: "medium" }), ["-c:v", "libx264", "-preset", "medium", "-crf", "19"]);
environment.FFMPEG_VIDEO_ENCODER = "invalid";
assert.throws(() => encodingArgs(), /FFMPEG_VIDEO_ENCODER/);
environment.FFMPEG_VIDEO_ENCODER = "h264_nvenc";
const gpuArgs = encodingArgs({ crf: 19, preset: "medium" });
assert.equal(gpuArgs[gpuArgs.indexOf("-c:v") + 1], "h264_nvenc");
assert.equal(gpuArgs.includes("-crf"), false, "CPU CRF is not an NVENC rate-control option");
assert.equal(gpuArgs[gpuArgs.indexOf("-preset") + 1], "p5");

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-video-encoding-"));
try {
  for (const encoder of process.argv.includes("--nvenc") ? ["libx264", "h264_nvenc"] : ["libx264"]) {
    environment.FFMPEG_VIDEO_ENCODER = encoder;
    const output = path.join(temp, `${encoder}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=1",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1", "-vf", "scale=320:180,drawbox=x=10:y=10:w=40:h=20:c=red:t=fill",
      ...encodingArgs({ crf: 19, preset: "medium" }), "-profile:v", "main", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", output], { timeout: 30_000, windowsHide: true });
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", output], { encoding: "utf8", windowsHide: true }));
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    assert.equal(video.codec_name, "h264");
    assert.equal(video.width, 320); assert.equal(video.height, 180);
    assert.equal(video.pix_fmt, "yuv420p");
    assert.match(video.tags.encoder, new RegExp(encoder));
    assert.equal(probe.streams.find((stream) => stream.codec_type === "audio").codec_name, "aac");
    assert.ok(Math.abs(Number(probe.format.duration) - 1) < 0.15);
    execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"], { timeout: 30_000, windowsHide: true });
    console.log(`Canvas ${encoder}: actual filtered H.264 MP4, dimensions, duration, audio, encoder receipt and decode passed.`);
  }
} finally { rmSync(temp, { recursive: true, force: true }); }
