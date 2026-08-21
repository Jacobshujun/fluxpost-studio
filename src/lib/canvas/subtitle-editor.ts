import type {
  CanvasMediaReference,
  CanvasSubtitleRevisionSnapshot,
  CanvasSubtitleRunMetadata,
  CanvasSubtitleSegment,
} from "./types";

export const CANVAS_SUBTITLE_REVISION_PROTOCOL_VERSION = 1 as const;
export const CANVAS_SUBTITLE_WAVEFORM_PROTOCOL_VERSION = 1 as const;
export const CANVAS_SUBTITLE_WAVEFORM_POINTS_PER_SECOND = 50 as const;
export const CANVAS_SUBTITLE_SEGMENT_LIMIT = 1000;
export const CANVAS_SUBTITLE_TEXT_LIMIT = 500;
export const CANVAS_SUBTITLE_DRAG_STEP_MS = 10;

export function validateCanvasSubtitleSegments(value: unknown, durationMs: number): CanvasSubtitleSegment[] {
  if (!Number.isInteger(durationMs) || durationMs <= 0) throw new Error("Subtitle duration must be a positive integer number of milliseconds.");
  if (!Array.isArray(value) || value.length < 1 || value.length > CANVAS_SUBTITLE_SEGMENT_LIMIT) {
    throw new Error(`Subtitle timeline must contain between 1 and ${CANVAS_SUBTITLE_SEGMENT_LIMIT} segments.`);
  }
  let previousEnd = 0;
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`Subtitle segment ${index + 1} is invalid.`);
    const startMs = Number(entry.startMs);
    const endMs = Number(entry.endMs);
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!Number.isInteger(startMs) || !Number.isInteger(endMs)) throw new Error(`Subtitle segment ${index + 1} must use integer milliseconds.`);
    if (startMs < 0 || startMs >= endMs || endMs > durationMs) throw new Error(`Subtitle segment ${index + 1} is outside the video duration.`);
    if (index > 0 && startMs < previousEnd) throw new Error(`Subtitle segment ${index + 1} overlaps the previous segment.`);
    if (!text || Array.from(text).length > CANVAS_SUBTITLE_TEXT_LIMIT) {
      throw new Error(`Subtitle segment ${index + 1} text must contain 1 to ${CANVAS_SUBTITLE_TEXT_LIMIT} characters.`);
    }
    previousEnd = endMs;
    return { startMs, endMs, text };
  });
}

export function decodeCanvasSubtitleRevisionSnapshot(value: unknown): CanvasSubtitleRevisionSnapshot | undefined {
  if (!isRecord(value) || value.protocolVersion !== CANVAS_SUBTITLE_REVISION_PROTOCOL_VERSION) return undefined;
  if (!isIdentifier(value.revisionId) || !Number.isInteger(value.revision) || Number(value.revision) < 1 || !isSha256(value.videoSha256)) return undefined;
  if (!Array.isArray(value.segments) || value.segments.length < 1 || value.segments.length > CANVAS_SUBTITLE_SEGMENT_LIMIT) return undefined;
  const segments: CanvasSubtitleSegment[] = [];
  let previousEnd = 0;
  for (const entry of value.segments) {
    if (!isRecord(entry)) return undefined;
    const startMs = Number(entry.startMs);
    const endMs = Number(entry.endMs);
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs < previousEnd || startMs >= endMs || !text || Array.from(text).length > CANVAS_SUBTITLE_TEXT_LIMIT) return undefined;
    segments.push({ startMs, endMs, text });
    previousEnd = endMs;
  }
  return {
    protocolVersion: CANVAS_SUBTITLE_REVISION_PROTOCOL_VERSION,
    revisionId: value.revisionId,
    revision: Number(value.revision),
    videoSha256: value.videoSha256,
    segments,
  };
}

export function decodeCanvasSubtitleRunMetadata(value: unknown): CanvasSubtitleRunMetadata | undefined {
  if (!isRecord(value) || value.protocolVersion !== CANVAS_SUBTITLE_REVISION_PROTOCOL_VERSION || !isSha256(value.videoSha256)) return undefined;
  const durationMs = Number(value.durationMs);
  const timelineProtocolVersion = Number(value.timelineProtocolVersion);
  if (!Number.isInteger(durationMs) || durationMs <= 0 || !Number.isInteger(timelineProtocolVersion) || timelineProtocolVersion < 1 || !isMediaReference(value.source)) return undefined;
  try {
    return {
      protocolVersion: CANVAS_SUBTITLE_REVISION_PROTOCOL_VERSION,
      timelineProtocolVersion,
      videoSha256: value.videoSha256,
      durationMs,
      source: { ...value.source },
      segments: validateCanvasSubtitleSegments(value.segments, durationMs),
    };
  } catch {
    return undefined;
  }
}

export function moveCanvasSubtitleSegment(segments: CanvasSubtitleSegment[], index: number, startMs: number, durationMs: number) {
  const current = requireSegment(segments, index);
  const duration = current.endMs - current.startMs;
  const minStart = index > 0 ? segments[index - 1].endMs : 0;
  const maxStart = Math.min(durationMs - duration, index < segments.length - 1 ? segments[index + 1].startMs - duration : durationMs - duration);
  return replaceSegment(segments, index, { ...current, startMs: clamp(roundStep(startMs), minStart, maxStart), endMs: clamp(roundStep(startMs), minStart, maxStart) + duration });
}

export function resizeCanvasSubtitleSegment(segments: CanvasSubtitleSegment[], index: number, edge: "start" | "end", valueMs: number, durationMs: number) {
  const current = requireSegment(segments, index);
  const rounded = roundStep(valueMs);
  const next = edge === "start"
    ? { ...current, startMs: clamp(rounded, index > 0 ? segments[index - 1].endMs : 0, current.endMs - CANVAS_SUBTITLE_DRAG_STEP_MS) }
    : { ...current, endMs: clamp(rounded, current.startMs + CANVAS_SUBTITLE_DRAG_STEP_MS, index < segments.length - 1 ? segments[index + 1].startMs : durationMs) };
  return replaceSegment(segments, index, next);
}

export function splitCanvasSubtitleSegment(segments: CanvasSubtitleSegment[], index: number, playheadMs: number, caret: number) {
  const current = requireSegment(segments, index);
  if (!Number.isInteger(playheadMs) || playheadMs <= current.startMs || playheadMs >= current.endMs) throw new Error("Place the playhead inside the selected subtitle before splitting.");
  if (!Number.isInteger(caret) || caret <= 0 || caret >= current.text.length) throw new Error("Place the text cursor inside the selected subtitle before splitting.");
  const left = current.text.slice(0, caret).trim();
  const right = current.text.slice(caret).trim();
  if (!left || !right) throw new Error("Both split subtitle segments must contain text.");
  return [...segments.slice(0, index), { startMs: current.startMs, endMs: playheadMs, text: left }, { startMs: playheadMs, endMs: current.endMs, text: right }, ...segments.slice(index + 1)];
}

export function mergeCanvasSubtitleSegmentWithNext(segments: CanvasSubtitleSegment[], index: number) {
  const current = requireSegment(segments, index);
  const next = requireSegment(segments, index + 1);
  const text = `${current.text}${subtitleJoiner(current.text, next.text)}${next.text}`;
  if (Array.from(text).length > CANVAS_SUBTITLE_TEXT_LIMIT) throw new Error(`Merged subtitle text exceeds ${CANVAS_SUBTITLE_TEXT_LIMIT} characters.`);
  return [...segments.slice(0, index), { startMs: current.startMs, endMs: next.endMs, text }, ...segments.slice(index + 2)];
}

export function addCanvasSubtitleSegment(segments: CanvasSubtitleSegment[], playheadMs: number, durationMs: number) {
  if (segments.length >= CANVAS_SUBTITLE_SEGMENT_LIMIT) throw new Error(`Subtitle timeline already contains ${CANVAS_SUBTITLE_SEGMENT_LIMIT} segments.`);
  const containing = segments.findIndex((segment) => playheadMs >= segment.startMs && playheadMs < segment.endMs);
  if (containing >= 0) throw new Error("Move the playhead into an empty timeline gap before adding a subtitle.");
  const insertion = segments.findIndex((segment) => segment.startMs > playheadMs);
  const index = insertion < 0 ? segments.length : insertion;
  const minStart = index > 0 ? segments[index - 1].endMs : 0;
  const maxEnd = index < segments.length ? segments[index].startMs : durationMs;
  const startMs = clamp(roundStep(playheadMs), minStart, Math.max(minStart, maxEnd - CANVAS_SUBTITLE_DRAG_STEP_MS));
  const endMs = Math.min(maxEnd, startMs + 2000);
  if (endMs <= startMs) throw new Error("There is not enough room to add a subtitle at the playhead.");
  return [...segments.slice(0, index), { startMs, endMs, text: "新字幕" }, ...segments.slice(index)];
}

export function deleteCanvasSubtitleSegment(segments: CanvasSubtitleSegment[], index: number) {
  requireSegment(segments, index);
  if (segments.length === 1) throw new Error("A subtitle timeline must contain at least one segment.");
  return [...segments.slice(0, index), ...segments.slice(index + 1)];
}

export function cloneCanvasSubtitleSegments(segments: CanvasSubtitleSegment[]) {
  return segments.map((segment) => ({ ...segment }));
}

function subtitleJoiner(left: string, right: string) {
  const leftChar = Array.from(left.trim()).at(-1) || "";
  const rightChar = Array.from(right.trim())[0] || "";
  return /[A-Za-z0-9]/.test(leftChar) && /[A-Za-z0-9]/.test(rightChar) ? " " : "";
}

function replaceSegment(segments: CanvasSubtitleSegment[], index: number, next: CanvasSubtitleSegment) {
  return segments.map((segment, itemIndex) => itemIndex === index ? next : { ...segment });
}

function requireSegment(segments: CanvasSubtitleSegment[], index: number) {
  const segment = segments[index];
  if (!segment) throw new Error("Select a valid subtitle segment.");
  return segment;
}

function roundStep(value: number) {
  if (!Number.isFinite(value)) throw new Error("Subtitle time must be a finite number of milliseconds.");
  return Math.round(value / CANVAS_SUBTITLE_DRAG_STEP_MS) * CANVAS_SUBTITLE_DRAG_STEP_MS;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isMediaReference(value: unknown): value is CanvasMediaReference {
  return isRecord(value) && typeof value.url === "string" && value.url.length > 0;
}
