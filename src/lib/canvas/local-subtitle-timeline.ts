import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { compactError, recordExecutionLog } from "../activity-log";
import { appConfig } from "../config";
import { CanvasMediaNeedsConfigError } from "./media-tools";
import type { CanvasSubtitleSegment } from "./types";

export const CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION = 3;

const finalEndOverflowToleranceMs = 100;
const recognizerScript = path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "canvas", "faster_whisper_subtitles.py");

type LocalSubtitleWord = {
  startMs?: unknown;
  endMs?: unknown;
  text?: unknown;
};

type LocalSubtitleRawSegment = {
  text?: unknown;
  words?: unknown;
};

export function canvasSubtitleRecognizerSettings() {
  return {
    engine: "faster-whisper" as const,
    model: appConfig.canvasSubtitleWhisperModel,
    device: appConfig.canvasSubtitleWhisperDevice,
    computeType: appConfig.canvasSubtitleWhisperComputeType,
    language: "auto" as const,
    vadFilter: true,
    wordTimestamps: true,
    task: "transcribe" as const,
    beamSize: 5,
    conditionOnPreviousText: false,
    localFilesOnly: true,
  };
}

export function canvasSubtitleRecognizerSettingsHash() {
  return createHash("sha256").update(JSON.stringify(canvasSubtitleRecognizerSettings())).digest("hex");
}

export async function transcribeCanvasLocalSubtitleTimeline(input: {
  videoPath: string;
  durationSeconds: number;
  mediaStartSeconds: number;
  audioStartSeconds: number;
}) {
  const startedAt = Date.now();
  const settings = canvasSubtitleRecognizerSettings();
  try {
    const output = await runLocalRecognizer(input.videoPath, settings);
    const segments = normalizeCanvasLocalSubtitleTimeline(output, input);
    await recordExecutionLog({
      scope: "video/subtitles",
      action: "Local subtitle timeline completed",
      status: "success",
      message: "Local acoustic subtitle timing is ready for Canvas rendering.",
      durationMs: Date.now() - startedAt,
      details: { engine: settings.engine, model: settings.model, segmentCount: segments.length },
    });
    return segments;
  } catch (error) {
    await recordExecutionLog({
      scope: "video/subtitles",
      action: "Local subtitle timeline failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
      details: { engine: settings.engine, model: settings.model },
    });
    throw error;
  }
}

export function normalizeCanvasLocalSubtitleTimeline(
  value: unknown,
  input: { durationSeconds: number; mediaStartSeconds: number; audioStartSeconds: number },
): CanvasSubtitleSegment[] {
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) throw new Error("Video duration is required for subtitle timing validation.");
  if (!Number.isFinite(input.mediaStartSeconds) || !Number.isFinite(input.audioStartSeconds)) throw new Error("Media time origins are required for subtitle timing validation.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Local subtitle recognizer must return a JSON object.");
  const payload = value as { engine?: unknown; segments?: unknown };
  if (payload.engine !== "faster-whisper") throw new Error("Local subtitle recognizer returned an unexpected engine.");
  if (!Array.isArray(payload.segments) || !payload.segments.length) throw new Error("Local subtitle recognizer did not contain any speech segments.");
  const rawSegments = payload.segments;

  const durationMs = Math.round(input.durationSeconds * 1000);
  const offsetMs = Math.round((input.audioStartSeconds - input.mediaStartSeconds) * 1000);
  let previousEndMs = 0;
  return rawSegments.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Subtitle segment ${index + 1} is invalid.`);
    const segment = raw as LocalSubtitleRawSegment;
    const text = typeof segment.text === "string" ? segment.text.replace(/\s+/g, " ").trim() : "";
    if (!text) throw new Error(`Subtitle segment ${index + 1} text is empty.`);
    if (text.length > 500) throw new Error(`Subtitle segment ${index + 1} text is too long.`);
    if (!Array.isArray(segment.words) || !segment.words.length) throw new Error(`Subtitle segment ${index + 1} has no word timing.`);
    const words = segment.words.map((word, wordIndex) => normalizeWord(word, index, wordIndex));
    for (let wordIndex = 1; wordIndex < words.length; wordIndex += 1) {
      if (words[wordIndex].startMs < words[wordIndex - 1].endMs) {
        throw new Error(`Subtitle segment ${index + 1} word ${wordIndex + 1} overlaps or is out of order.`);
      }
    }
    const startMs = words[0].startMs + offsetMs;
    const rawEndMs = words.at(-1)!.endMs + offsetMs;
    if (startMs < 0 || rawEndMs <= startMs) throw subtitleTimingBoundaryError(index, startMs, rawEndMs, durationMs);
    let endMs = rawEndMs;
    if (endMs > durationMs) {
      const overflowMs = endMs - durationMs;
      const finalSegment = index === rawSegments.length - 1;
      if (!finalSegment) throw subtitleTimingBoundaryError(index, startMs, endMs, durationMs, `intermediate segment overflowMs=${overflowMs}`);
      if (startMs >= durationMs) throw subtitleTimingBoundaryError(index, startMs, endMs, durationMs, "final segment start is outside duration");
      if (overflowMs > finalEndOverflowToleranceMs) {
        throw subtitleTimingBoundaryError(index, startMs, endMs, durationMs, `final segment overflowMs=${overflowMs} exceeds toleranceMs=${finalEndOverflowToleranceMs}`);
      }
      endMs = durationMs;
    }
    if (index > 0 && startMs < previousEndMs) {
      throw new Error(`Subtitle segment ${index + 1} overlaps or is out of order (startMs=${startMs}, endMs=${endMs}, previousEndMs=${previousEndMs}, durationMs=${durationMs}).`);
    }
    previousEndMs = endMs;
    return { startMs, endMs, text };
  });
}

function normalizeWord(value: unknown, segmentIndex: number, wordIndex: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Subtitle segment ${segmentIndex + 1} word ${wordIndex + 1} is invalid.`);
  const word = value as LocalSubtitleWord;
  const startMs = Number(word.startMs);
  const endMs = Number(word.endMs);
  if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs < 0 || endMs <= startMs) {
    throw new Error(`Subtitle segment ${segmentIndex + 1} word ${wordIndex + 1} timing is invalid.`);
  }
  return { startMs, endMs };
}

function subtitleTimingBoundaryError(index: number, startMs: number, endMs: number, durationMs: number, reason?: string) {
  const suffix = reason ? `; ${reason}` : "";
  return new Error(`Subtitle segment ${index + 1} timing is outside the video duration (startMs=${startMs}, endMs=${endMs}, durationMs=${durationMs}${suffix}).`);
}

function runLocalRecognizer(videoPath: string, settings: ReturnType<typeof canvasSubtitleRecognizerSettings>) {
  return new Promise<unknown>((resolve, reject) => {
    execFile(appConfig.canvasSubtitlePythonBin, [
      recognizerScript,
      "--video", videoPath,
      "--model", settings.model,
      "--device", settings.device,
      "--compute-type", settings.computeType,
      "--task", settings.task,
      "--beam-size", String(settings.beamSize),
    ], { timeout: appConfig.canvasSubtitleWhisperTimeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return reject(new CanvasMediaNeedsConfigError("The configured Canvas subtitle Python interpreter is unavailable."));
        if (/CONFIG_ERROR: faster-whisper is not installed/i.test(stderr)) return reject(new CanvasMediaNeedsConfigError("faster-whisper is not installed for the configured Python interpreter."));
        if (/CONFIG_ERROR: the Faster Whisper model is not available locally/i.test(stderr)) return reject(new CanvasMediaNeedsConfigError(`The Canvas subtitle model ${settings.model} is not available locally.`));
        if (error.killed || error.signal === "SIGTERM" || code === "ETIMEDOUT" || /timed out/i.test(error.message)) return reject(new Error(`Local subtitle recognition timed out after ${Math.round(appConfig.canvasSubtitleWhisperTimeoutMs / 1000)} seconds.`));
        return reject(new Error("Local subtitle recognition failed."));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Local subtitle recognizer returned invalid JSON."));
      }
    });
  });
}
