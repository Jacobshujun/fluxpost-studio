import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { runWithConcurrencyPool } from "../concurrency";
import { getCanvasSubtitleWaveformFromDb, saveCanvasSubtitleWaveformToDb } from "../database";
import { materializeRuntimeMedia } from "../runtime-media-materializer";
import {
  CANVAS_SUBTITLE_WAVEFORM_POINTS_PER_SECOND,
  CANVAS_SUBTITLE_WAVEFORM_PROTOCOL_VERSION,
} from "./subtitle-editor";
import type { CanvasSubtitleRevision, CanvasSubtitleWaveform } from "./types";

const sampleRate = 8000;
const samplesPerPeak = sampleRate / CANVAS_SUBTITLE_WAVEFORM_POINTS_PER_SECOND;
const maxVideoBytes = 512 * 1024 * 1024;
export const CANVAS_SUBTITLE_WAVEFORM_TIMEOUT_MS = 5 * 60_000;
const activeWaveforms = new Map<string, Promise<CanvasSubtitleWaveform>>();

export async function getCanvasSubtitleWaveform(revision: CanvasSubtitleRevision) {
  const cacheId = canvasSubtitleWaveformCacheId(revision.ownerUserId, revision.videoSha256);
  const cached = await getCanvasSubtitleWaveformFromDb(cacheId);
  if (cached) return cached;
  const active = activeWaveforms.get(cacheId);
  if (active) return active;
  const request = buildCanvasSubtitleWaveform(revision).then((waveform) => saveCanvasSubtitleWaveformToDb(cacheId, waveform)).finally(() => activeWaveforms.delete(cacheId));
  activeWaveforms.set(cacheId, request);
  return request;
}

export function canvasSubtitleWaveformCacheId(ownerUserId: string, videoSha256: string) {
  return createHash("sha256").update(JSON.stringify({ ownerUserId, videoSha256, protocolVersion: CANVAS_SUBTITLE_WAVEFORM_PROTOCOL_VERSION })).digest("hex");
}

async function buildCanvasSubtitleWaveform(revision: CanvasSubtitleRevision): Promise<CanvasSubtitleWaveform> {
  const media = await materializeRuntimeMedia(revision.source.url, { maxBytes: maxVideoBytes, kind: "video" });
  try {
    const peaks = await runWithConcurrencyPool("localVideo", () => decodeCanvasSubtitleWaveformPcm(media.filePath));
    if (!peaks.length) throw new Error("Subtitle source video does not contain a decodable audio track.");
    const now = new Date().toISOString();
    return {
      protocolVersion: CANVAS_SUBTITLE_WAVEFORM_PROTOCOL_VERSION,
      ownerUserId: revision.ownerUserId,
      videoSha256: revision.videoSha256,
      durationMs: revision.durationMs,
      pointsPerSecond: CANVAS_SUBTITLE_WAVEFORM_POINTS_PER_SECOND,
      peaks,
      createdAt: now,
      updatedAt: now,
    };
  } finally {
    await media.cleanup();
  }
}

export function decodeCanvasSubtitleWaveformPcm(
  filePath: string,
  options: { timeoutMs?: number; spawnProcess?: typeof spawn } = {},
) {
  return new Promise<Array<[number, number]>>((resolve, reject) => {
    const child = (options.spawnProcess || spawn)("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", filePath,
      "-map", "0:a:0", "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", "pipe:1",
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const peaks: Array<[number, number]> = [];
    const reducer = new CanvasSubtitlePcmReducer();
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Subtitle waveform generation timed out."));
    }, options.timeoutMs ?? CANVAS_SUBTITLE_WAVEFORM_TIMEOUT_MS);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(peaks);
    };
    child.stdout.on("data", (chunk: Buffer) => reducer.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-1000); });
    child.on("error", (error) => finish((error as NodeJS.ErrnoException).code === "ENOENT" ? new Error("ffmpeg is not installed or available on PATH.") : error));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) return finish(new Error(`Subtitle waveform generation failed: ${stderr.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 300) || `ffmpeg exited with code ${code}`}`));
      peaks.push(...reducer.finish());
      finish();
    });
  });
}

export class CanvasSubtitlePcmReducer {
  private readonly peaks: Array<[number, number]> = [];
  private sampleCount = 0;
  private bucketMin = 1;
  private bucketMax = -1;
  private trailingByte: number | undefined;

  push(chunk: Buffer) {
    let offset = 0;
    if (this.trailingByte !== undefined && chunk.length) {
      this.consumeSample(Buffer.from([this.trailingByte, chunk[0]]).readInt16LE(0));
      this.trailingByte = undefined;
      offset = 1;
    }
    for (; offset + 1 < chunk.length; offset += 2) this.consumeSample(chunk.readInt16LE(offset));
    if (offset < chunk.length) this.trailingByte = chunk[offset];
  }

  finish() {
    if (this.sampleCount > 0) this.peaks.push([roundPeak(this.bucketMin), roundPeak(this.bucketMax)]);
    return this.peaks.map((peak) => [...peak] as [number, number]);
  }

  private consumeSample(sample: number) {
    const normalized = sample / 32768;
    this.bucketMin = Math.min(this.bucketMin, normalized);
    this.bucketMax = Math.max(this.bucketMax, normalized);
    this.sampleCount += 1;
    if (this.sampleCount === samplesPerPeak) {
      this.peaks.push([roundPeak(this.bucketMin), roundPeak(this.bucketMax)]);
      this.sampleCount = 0;
      this.bucketMin = 1;
      this.bucketMax = -1;
    }
  }
}

function roundPeak(value: number) {
  return Math.round(Math.max(-1, Math.min(1, value)) * 10_000) / 10_000;
}
