import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig } from "./config";
import type { SourceVideoTranscript } from "./types";

type TranscribeVideoContentInput = {
  videoPath: string;
  videoPublicUrl?: string;
  sourceItemId?: string;
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
  const response = await fetchWithStageTimeout(
    arkUrl("responses"),
    {
      method: "POST",
      headers: {
        ...arkHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: appConfig.arkVideoTranscriptionModel,
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
                text: appConfig.arkVideoTranscriptionPrompt,
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
  const transcript = extractTranscriptText(parseJsonObject(text));
  if (!transcript) throw new Error("Ark Responses did not return transcript text.");
  return transcript;
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

function extractTranscriptText(data: unknown): string {
  const directText = typeof (data as ArkResponsesApiTextResponse)?.output_text === "string" ? (data as ArkResponsesApiTextResponse).output_text || "" : "";
  if (directText.trim()) return normalizeTranscriptText(directText);
  const output = (data as ArkResponsesApiTextResponse)?.output || [];
  const texts = output.flatMap((item) => item.content || []).map((content) => content.text || "").filter(Boolean);
  return normalizeTranscriptText(texts.join("\n"));
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
