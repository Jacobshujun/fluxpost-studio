import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { compactError, recordExecutionLog } from "./activity-log";
import type { CanvasSubtitleSegment } from "./canvas/types";
import { appConfig } from "./config";
import type { SourceVideoTranscript } from "./types";

type TranscribeVideoContentInput = {
  videoPath: string;
  videoPublicUrl?: string;
  sourceItemId?: string;
};

export const CANVAS_SUBTITLE_TIMELINE_PROTOCOL_VERSION = 2;

const CANVAS_SUBTITLE_FINAL_END_OVERFLOW_TOLERANCE_MS = 1_000;

type TranscribeVideoSubtitleInput = TranscribeVideoContentInput & {
  durationSeconds: number;
};

type ArkFileResponse = {
  id?: string;
  file_id?: string;
};

type ArkResponsesApiTextResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

export function isArkVideoTranscriptionConfigured() {
  return Boolean(appConfig.arkApiKey);
}

export async function transcribeVideoContent(input: TranscribeVideoContentInput): Promise<SourceVideoTranscript> {
  const startedAt = Date.now();
  const transcribedAt = new Date().toISOString();
  if (!isArkVideoTranscriptionConfigured()) {
    throw new Error("Ark video transcription is not configured.");
  }

  const videoStat = await stat(input.videoPath);
  if (!videoStat.size) throw new Error("Cached video file is empty.");

  await recordExecutionLog({
    scope: "video/transcription",
    action: "Extract video audio for Ark",
    status: "running",
    message: "Cached source video audio is being extracted to MP3 for speech-to-text.",
    details: {
      sourceItemId: input.sourceItemId || null,
      videoBytes: videoStat.size,
      model: appConfig.arkVideoTranscriptionModel,
    },
  });

  let extractedAudio: ExtractedAudioFile | undefined;
  try {
    extractedAudio = await extractAudioMp3FromVideo(input.videoPath, input, startedAt);
    const fileId = await uploadAudioFileToArk(extractedAudio.audioPath, extractedAudio.audioBytes, input, startedAt);
    const text = await callArkResponsesForAudioText(fileId);
    return await recordTranscriptSuccess(text, transcribedAt, fileId, input, startedAt);
  } catch (error) {
    await recordExecutionLog({
      scope: "video/transcription",
      action: "Ark video transcription failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
      details: {
        sourceItemId: input.sourceItemId || null,
        model: appConfig.arkVideoTranscriptionModel,
      },
    });
    return {
      status: "failed",
      provider: "ark_video",
      model: appConfig.arkVideoTranscriptionModel,
      transcribedAt,
      error: compactError(error),
    };
  } finally {
    await extractedAudio?.cleanup().catch(() => undefined);
  }
}

export async function transcribeVideoSubtitleTimeline(input: TranscribeVideoSubtitleInput): Promise<CanvasSubtitleSegment[]> {
  if (!isArkVideoTranscriptionConfigured()) throw new Error("Ark video transcription is not configured.");
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) throw new Error("Video duration is required for subtitle timing validation.");
  const startedAt = Date.now();
  const videoStat = await stat(input.videoPath);
  if (!videoStat.size) throw new Error("Cached video file is empty.");

  let extractedAudio: ExtractedAudioFile | undefined;
  try {
    extractedAudio = await extractAudioMp3FromVideo(input.videoPath, input, startedAt);
    const fileId = await uploadAudioFileToArk(extractedAudio.audioPath, extractedAudio.audioBytes, input, startedAt);
    const durationMs = Math.round(input.durationSeconds * 1000);
    const requestPrompt = buildVideoSubtitlePrompt(appConfig.arkVideoSubtitlePrompt, durationMs);
    const output = await callArkResponsesForAudioOutput(fileId, appConfig.arkVideoSubtitleModel, requestPrompt);
    const segments = normalizeVideoSubtitleTimeline(output, input.durationSeconds);
    await recordExecutionLog({
      scope: "video/subtitles",
      action: "Ark subtitle timeline completed",
      status: "success",
      message: "Video speech subtitle timing is ready for Canvas rendering.",
      durationMs: Date.now() - startedAt,
      details: { sourceItemId: input.sourceItemId || null, fileId, model: appConfig.arkVideoSubtitleModel, segmentCount: segments.length },
    });
    return segments;
  } catch (error) {
    await recordExecutionLog({
      scope: "video/subtitles",
      action: "Ark subtitle timeline failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
      details: { sourceItemId: input.sourceItemId || null, model: appConfig.arkVideoSubtitleModel },
    });
    throw error;
  } finally {
    await extractedAudio?.cleanup().catch(() => undefined);
  }
}

export function buildVideoSubtitlePrompt(basePrompt: string, durationMs: number) {
  return `${basePrompt}\n\nThe exact media duration upper bound is durationMs=${durationMs}. Every segment must satisfy startMs < ${durationMs} and endMs <= ${durationMs}. Do not return timing beyond this bound.`;
}

export function normalizeVideoSubtitleTimeline(value: string | unknown, durationSeconds: number): CanvasSubtitleSegment[] {
  const parsed = typeof value === "string" ? parseJsonObject(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Ark subtitle response must be a JSON object.");
  const rawSegments = (parsed as { segments?: unknown }).segments;
  if (!Array.isArray(rawSegments) || !rawSegments.length) throw new Error("Ark subtitle response did not contain any speech segments.");
  const durationMs = Math.round(durationSeconds * 1000);
  let previousEndMs = 0;
  return rawSegments.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Subtitle segment ${index + 1} is invalid.`);
    const segment = raw as { startMs?: unknown; endMs?: unknown; text?: unknown };
    const startMs = Number(segment.startMs);
    const rawEndMs = Number(segment.endMs);
    const text = typeof segment.text === "string" ? segment.text.replace(/\s+/g, " ").trim() : "";
    if (!Number.isInteger(startMs) || !Number.isInteger(rawEndMs)) {
      throw new Error(`Subtitle segment ${index + 1} timing must use integer milliseconds (startMs=${startMs}, endMs=${rawEndMs}, durationMs=${durationMs}).`);
    }
    if (startMs < 0 || rawEndMs <= startMs) {
      throw subtitleTimingBoundaryError(index, startMs, rawEndMs, durationMs);
    }
    let endMs = rawEndMs;
    if (endMs > durationMs) {
      const overflowMs = endMs - durationMs;
      const isFinalSegment = index === rawSegments.length - 1;
      if (!isFinalSegment) {
        throw subtitleTimingBoundaryError(index, startMs, endMs, durationMs, `intermediate segment overflowMs=${overflowMs}`);
      }
      if (startMs >= durationMs) {
        throw subtitleTimingBoundaryError(index, startMs, endMs, durationMs, `final segment start is outside duration; overflowMs=${overflowMs}`);
      }
      if (overflowMs > CANVAS_SUBTITLE_FINAL_END_OVERFLOW_TOLERANCE_MS) {
        throw subtitleTimingBoundaryError(
          index,
          startMs,
          endMs,
          durationMs,
          `final segment overflowMs=${overflowMs} exceeds toleranceMs=${CANVAS_SUBTITLE_FINAL_END_OVERFLOW_TOLERANCE_MS}`,
        );
      }
      endMs = durationMs;
    }
    if (index > 0 && startMs < previousEndMs) {
      throw new Error(
        `Subtitle segment ${index + 1} overlaps or is out of order (startMs=${startMs}, endMs=${endMs}, previousEndMs=${previousEndMs}, durationMs=${durationMs}).`,
      );
    }
    if (!text) throw new Error(`Subtitle segment ${index + 1} text is empty.`);
    if (text.length > 500) throw new Error(`Subtitle segment ${index + 1} text is too long.`);
    previousEndMs = endMs;
    return { startMs, endMs, text };
  });
}

function subtitleTimingBoundaryError(index: number, startMs: number, endMs: number, durationMs: number, reason?: string) {
  const suffix = reason ? `; ${reason}` : "";
  return new Error(
    `Subtitle segment ${index + 1} timing is outside the video duration (startMs=${startMs}, endMs=${endMs}, durationMs=${durationMs}${suffix}).`,
  );
}

export function mergeTranscriptIntoContentText(contentText: string | undefined, transcriptText: string | undefined) {
  const transcript = normalizeTranscriptText(transcriptText);
  const original = (contentText || "").trim();
  if (!transcript) return original || undefined;
  if (original.includes(transcript)) return original;
  return [original, `视频语音转写：\n${transcript}`].filter(Boolean).join("\n\n");
}

type ExtractedAudioFile = {
  audioPath: string;
  audioBytes: number;
  cleanup: () => Promise<void>;
};

async function extractAudioMp3FromVideo(videoPath: string, input: TranscribeVideoContentInput, startedAt: number): Promise<ExtractedAudioFile> {
  const tempDir = await mkdtemp(join(tmpdir(), "fluxpost-video-audio-"));
  const audioPath = join(tempDir, "audio.mp3");
  try {
    await runFfmpeg(
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        videoPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "64k",
        audioPath,
      ],
      appConfig.arkVideoTranscriptionAudioExtractTimeoutMs,
    );
    const audioStat = await stat(audioPath);
    if (!audioStat.size) throw new Error("Extracted audio file is empty.");
    if (audioStat.size > appConfig.arkVideoTranscriptionMaxAudioBytes) {
      throw new Error(`Extracted audio is too large (${Math.round(audioStat.size / 1024 / 1024)} MB).`);
    }
    await recordExecutionLog({
      scope: "video/transcription",
      action: "Video audio MP3 extraction completed",
      status: "success",
      message: "Cached source video audio was extracted to MP3 for Ark upload.",
      durationMs: Date.now() - startedAt,
      details: {
        sourceItemId: input.sourceItemId || null,
        audioBytes: audioStat.size,
        audioExtractTimeoutMs: appConfig.arkVideoTranscriptionAudioExtractTimeoutMs,
      },
    });
    return {
      audioPath,
      audioBytes: audioStat.size,
      cleanup: () => rm(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function uploadAudioFileToArk(audioPath: string, audioBytes: number, input: TranscribeVideoContentInput, startedAt: number) {
  const formData = new FormData();
  formData.set("purpose", "user_data");
  formData.set("file", await fileFromPath(audioPath));

  const response = await fetchWithStageTimeout(
    arkUrl("files"),
    {
      method: "POST",
      headers: arkHeaders(),
      body: formData,
    },
    appConfig.arkVideoTranscriptionUploadTimeoutMs,
    "Ark audio file upload timed out",
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Ark file upload failed: ${response.status} ${text.slice(0, 260)}`);
  }
  const data = parseJsonObject(text) as ArkFileResponse;
  const fileId = data.id || data.file_id;
  if (!fileId) throw new Error("Ark file upload did not return a file_id.");
  await recordExecutionLog({
    scope: "video/transcription",
    action: "Ark audio file upload completed",
    status: "success",
    message: "Extracted source audio was uploaded to Ark Files; starting audio transcription.",
    durationMs: Date.now() - startedAt,
    details: {
      sourceItemId: input.sourceItemId || null,
      fileId,
      audioBytes,
      uploadTimeoutMs: appConfig.arkVideoTranscriptionUploadTimeoutMs,
    },
  });
  return fileId;
}

async function callArkResponsesForAudioText(fileId: string) {
  const output = await callArkResponsesForAudioOutput(fileId, appConfig.arkVideoTranscriptionModel, appConfig.arkVideoTranscriptionPrompt);
  const transcript = normalizeTranscriptText(output);
  if (!transcript) throw new Error("Ark Responses did not return transcript text.");
  return transcript;
}

async function callArkResponsesForAudioOutput(fileId: string, model: string, prompt: string) {
  const response = await fetchWithStageTimeout(
    arkUrl("responses"),
    {
      method: "POST",
      headers: {
        ...arkHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                file_id: fileId,
              },
              {
                type: "input_text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    },
    appConfig.arkVideoTranscriptionTimeoutMs,
    "Ark Responses audio transcription timed out",
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Ark Responses audio transcription failed: ${response.status} ${text.slice(0, 260)}`);
  }
  const output = extractResponseOutputText(parseJsonObject(text));
  if (!output.trim()) throw new Error("Ark Responses did not return output text.");
  return output;
}

async function recordTranscriptSuccess(
  text: string,
  transcribedAt: string,
  fileId: string,
  input: TranscribeVideoContentInput,
  startedAt: number,
): Promise<SourceVideoTranscript> {
  const normalizedText = normalizeTranscriptText(text);
  await recordExecutionLog({
    scope: "video/transcription",
    action: "Ark video transcription completed",
    status: "success",
    message: "Video audio speech-to-text transcript is ready for source rewrite.",
    durationMs: Date.now() - startedAt,
    details: {
      sourceItemId: input.sourceItemId || null,
      fileId,
      transcriptLength: normalizedText.length,
      model: appConfig.arkVideoTranscriptionModel,
    },
  });
  return {
    status: "success",
    provider: "ark_video",
    model: appConfig.arkVideoTranscriptionModel,
    text: normalizedText,
    audioUrl: input.videoPublicUrl,
    requestId: fileId,
    transcribedAt,
  };
}

async function fileFromPath(filePath: string) {
  const buffer = await readFile(filePath);
  if (!buffer.length) throw new Error("Audio file is empty.");
  return new File([buffer], basename(filePath), { type: mimeTypeFromFilePath(filePath) });
}

function mimeTypeFromFilePath(filePath: string) {
  const lower = basename(filePath).toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}

function extractResponseOutputText(data: unknown): string {
  const directText = typeof (data as ArkResponsesApiTextResponse)?.output_text === "string" ? (data as ArkResponsesApiTextResponse).output_text || "" : "";
  if (directText.trim()) return directText.trim();
  const output = (data as ArkResponsesApiTextResponse)?.output || [];
  const texts = output.flatMap((item) => item.content || []).map((content) => content.text || "").filter(Boolean);
  return texts.join("\n").trim();
}

function arkHeaders() {
  return {
    Authorization: `Bearer ${appConfig.arkApiKey}`,
  };
}

function arkUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${appConfig.arkBaseUrl}/${cleanPath}`;
}

async function fetchWithStageTimeout(url: string, init: RequestInit, timeoutMs: number, stage: string) {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortTimeoutError(error)) {
      throw new Error(`${stage} after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const parsed = JSON.parse(text) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function isAbortTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError" || /aborted due to timeout|operation was aborted/i.test(error.message))
  );
}

function normalizeTranscriptText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function runFfmpeg(args: string[], timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = execFile("ffmpeg", args, { timeout: timeoutMs }, (error, _stdout, stderr) => {
      if (error) {
        const detail = stderr?.toString().trim().split(/\r?\n/).slice(-2).join(" ") || error.message;
        reject(new Error(detail.slice(0, 240)));
        return;
      }
      resolve();
    });
    child.on("error", reject);
  });
}
