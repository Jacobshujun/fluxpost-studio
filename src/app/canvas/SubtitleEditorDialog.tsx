"use client";

import {
  Captions,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Merge,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addCanvasSubtitleSegment,
  cloneCanvasSubtitleSegments,
  deleteCanvasSubtitleSegment,
  mergeCanvasSubtitleSegmentWithNext,
  moveCanvasSubtitleSegment,
  resizeCanvasSubtitleSegment,
  splitCanvasSubtitleSegment,
  validateCanvasSubtitleSegments,
} from "@/lib/canvas/subtitle-editor";
import type {
  CanvasSubtitleRevision,
  CanvasSubtitleRevisionSnapshot,
  CanvasSubtitleSegment,
  CanvasSubtitleStyle,
} from "@/lib/canvas/types";

type Waveform = { durationMs: number; pointsPerSecond: number; peaks: Array<[number, number]> };
type DragState = { index: number; mode: "move" | "start" | "end"; originX: number; original: CanvasSubtitleSegment[]; changed: boolean };

export function SubtitleEditorDialog({
  workflowId,
  nodeId,
  nodeRunId,
  style,
  onApply,
  onClose,
}: {
  workflowId: string;
  nodeId: string;
  nodeRunId: string;
  style: CanvasSubtitleStyle;
  onApply: (snapshot: CanvasSubtitleRevisionSnapshot) => Promise<void>;
  onClose: () => void;
}) {
  const [revision, setRevision] = useState<CanvasSubtitleRevision>();
  const [segments, setSegments] = useState<CanvasSubtitleSegment[]>([]);
  const [baseline, setBaseline] = useState<CanvasSubtitleSegment[]>([]);
  const [waveform, setWaveform] = useState<Waveform>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(64);
  const [undoStack, setUndoStack] = useState<CanvasSubtitleSegment[][]>([]);
  const [redoStack, setRedoStack] = useState<CanvasSubtitleSegment[][]>([]);
  const [busy, setBusy] = useState<"loading" | "saving" | "applying">("loading");
  const [message, setMessage] = useState("正在载入字幕时间轴...");
  const videoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | undefined>(undefined);

  const dirty = Boolean(revision) && JSON.stringify(segments) !== JSON.stringify(baseline);
  const durationMs = revision?.durationMs || waveform?.durationMs || 1;
  const timelineWidth = Math.max(900, Math.min(30_000, durationMs / 1000 * pixelsPerSecond));
  const selected = segments[selectedIndex];
  const activeIndex = segments.findIndex((segment) => playheadMs >= segment.startMs && playheadMs < segment.endMs);
  const overlay = activeIndex >= 0 ? segments[activeIndex] : undefined;

  useEffect(() => {
    let cancelled = false;
    void requestJson<{ revision: CanvasSubtitleRevision }>("/api/canvas/subtitle-revisions", {
      method: "POST",
      body: JSON.stringify({ workflowId, nodeId, nodeRunId }),
    }).then((data) => {
      if (cancelled) return;
      setRevision(data.revision);
      setSegments(cloneCanvasSubtitleSegments(data.revision.segments));
      setBaseline(cloneCanvasSubtitleSegments(data.revision.segments));
      setSelectedIndex(0);
      setPlayheadMs(data.revision.segments[0]?.startMs || 0);
      setBusy("loading");
      setMessage("正在生成音频波形...");
      return requestJson<Waveform>(`/api/canvas/subtitle-revisions/${encodeURIComponent(data.revision.id)}/waveform`);
    }).then((data) => {
      if (!cancelled && data) {
        setWaveform(data);
        setBusy("loading");
        setMessage("");
      }
    }).catch((error) => {
      if (!cancelled) {
        setBusy("loading");
        setMessage(errorMessage(error));
      }
    });
    return () => { cancelled = true; };
  }, [nodeId, nodeRunId, workflowId]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas || !waveform?.peaks.length) return;
    const cssHeight = 112;
    const drawWidth = Math.max(1, Math.min(16_000, Math.round(timelineWidth * Math.min(2, window.devicePixelRatio || 1))));
    canvas.width = drawWidth;
    canvas.height = cssHeight * Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = `${timelineWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    const center = canvas.height / 2;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(124, 222, 227, .28)";
    context.beginPath();
    context.moveTo(0, center);
    context.lineTo(canvas.width, center);
    context.stroke();
    context.strokeStyle = "#7cdee3";
    context.lineWidth = Math.max(1, canvas.width / waveform.peaks.length * 0.55);
    context.beginPath();
    waveform.peaks.forEach(([min, max], index) => {
      const x = index / Math.max(1, waveform.peaks.length - 1) * canvas.width;
      context.moveTo(x, center + min * center * .88);
      context.lineTo(x, center + max * center * .88);
    });
    context.stroke();
  }, [timelineWidth, waveform]);

  function commit(next: CanvasSubtitleSegment[]) {
    setUndoStack((current) => [...current.slice(-99), cloneCanvasSubtitleSegments(segments)]);
    setRedoStack([]);
    setSegments(next);
    setSelectedIndex((current) => Math.min(current, next.length - 1));
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((current) => [...current.slice(-99), cloneCanvasSubtitleSegments(segments)]);
    setUndoStack((current) => current.slice(0, -1));
    setSegments(cloneCanvasSubtitleSegments(previous));
    setSelectedIndex((current) => Math.min(current, previous.length - 1));
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((current) => [...current.slice(-99), cloneCanvasSubtitleSegments(segments)]);
    setRedoStack((current) => current.slice(0, -1));
    setSegments(cloneCanvasSubtitleSegments(next));
    setSelectedIndex((current) => Math.min(current, next.length - 1));
  }

  function seek(milliseconds: number) {
    const next = Math.max(0, Math.min(durationMs, Math.round(milliseconds)));
    setPlayheadMs(next);
    if (videoRef.current) videoRef.current.currentTime = next / 1000;
  }

  function startDrag(event: React.PointerEvent, index: number, mode: DragState["mode"]) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedIndex(index);
    seek(segments[index].startMs);
    dragRef.current = { index, mode, originX: event.clientX, original: cloneCanvasSubtitleSegments(segments), changed: false };
  }

  function moveDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const original = drag.original[drag.index];
    const deltaMs = (event.clientX - drag.originX) / pixelsPerSecond * 1000;
    try {
      const next = drag.mode === "move"
        ? moveCanvasSubtitleSegment(drag.original, drag.index, original.startMs + deltaMs, durationMs)
        : resizeCanvasSubtitleSegment(drag.original, drag.index, drag.mode, (drag.mode === "start" ? original.startMs : original.endMs) + deltaMs, durationMs);
      drag.changed = JSON.stringify(next) !== JSON.stringify(drag.original);
      setSegments(next);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = undefined;
    if (!drag?.changed) return;
    setUndoStack((current) => [...current.slice(-99), drag.original]);
    setRedoStack([]);
  }

  async function saveDraft() {
    if (!revision) throw new Error("字幕修订尚未载入。");
    const valid = validateCanvasSubtitleSegments(segments, revision.durationMs);
    setBusy("saving");
    setMessage("正在保存字幕草稿...");
    try {
      const data = await requestJson<{ revision: CanvasSubtitleRevision }>(`/api/canvas/subtitle-revisions/${encodeURIComponent(revision.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: revision.revision, segments: valid }),
      });
      setRevision(data.revision);
      setSegments(cloneCanvasSubtitleSegments(data.revision.segments));
      setBaseline(cloneCanvasSubtitleSegments(data.revision.segments));
      setMessage("字幕草稿已保存。");
      return data.revision;
    } finally {
      setBusy("loading");
    }
  }

  async function applyRevision() {
    setBusy("applying");
    try {
      const saved = dirty ? await saveDraft() : revision;
      if (!saved) throw new Error("字幕修订尚未载入。");
      setBusy("applying");
      setMessage("正在保存工作流并重新烧录字幕...");
      await onApply({
        protocolVersion: 1,
        revisionId: saved.id,
        revision: saved.revision,
        videoSha256: saved.videoSha256,
        segments: cloneCanvasSubtitleSegments(saved.segments),
      });
      onClose();
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy("loading");
    }
  }

  function close() {
    if (dirty && !window.confirm("字幕有未保存修改，确认关闭？")) return;
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (command && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    const target = event.target as HTMLElement;
    if (target.matches("input, textarea, select")) return;
    if (!selected || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -10 : 10;
    commit(moveCanvasSubtitleSegment(segments, selectedIndex, selected.startMs + delta, durationMs));
  }

  const overlayStyle = useMemo(() => ({
    color: style.textColor,
    fontWeight: style.bold ? 800 : 500,
    textAlign: style.horizontalAlign,
    WebkitTextStroke: `${Math.max(0, style.outlineWidthPercent * 3)}px ${style.outlineColor}`,
    background: style.backgroundEnabled ? hexWithOpacity(style.backgroundColor, style.backgroundOpacity) : "transparent",
    alignSelf: style.horizontalAlign === "left" ? "flex-start" : style.horizontalAlign === "right" ? "flex-end" : "center",
  } as React.CSSProperties), [style]);

  return <div className="canvas-subtitle-dialog-backdrop" role="presentation">
    <section className="canvas-subtitle-dialog" role="dialog" aria-modal="true" aria-label="字幕人工校对编辑器" onKeyDown={handleKeyDown}>
      <header className="canvas-subtitle-dialog-header">
        <div><Captions /><span><strong>字幕人工校对</strong><small>{revision ? `${segments.length} 段 · ${formatTime(durationMs)}` : "载入中"}</small></span></div>
        <div className="canvas-subtitle-dialog-actions">
          <button type="button" onClick={undo} disabled={!undoStack.length || busy !== "loading"} aria-label="撤销" title="撤销"><Undo2 /></button>
          <button type="button" onClick={redo} disabled={!redoStack.length || busy !== "loading"} aria-label="重做" title="重做"><Redo2 /></button>
          <button type="button" onClick={() => void saveDraft().catch((error) => setMessage(errorMessage(error)))} disabled={!revision || !dirty || busy !== "loading"}><Save />保存草稿</button>
          <button className="is-primary" type="button" onClick={() => void applyRevision()} disabled={!revision || busy !== "loading"}>{busy === "applying" ? <LoaderCircle className="animate-spin" /> : <Captions />}应用并重新生成</button>
          <button type="button" onClick={close} aria-label="关闭字幕编辑器" title="关闭"><X /></button>
        </div>
      </header>

      <div className="canvas-subtitle-dialog-workspace">
        <div className="canvas-subtitle-video-stage">
          {revision ? <video ref={videoRef} src={revision.source.url} preload="metadata" playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setPlayheadMs(Math.round(event.currentTarget.currentTime * 1000))} onEnded={() => { setPlaying(false); setPlayheadMs(durationMs); }} /> : null}
          {overlay ? <div className={`canvas-subtitle-live-overlay is-${style.verticalPosition}`}><span style={overlayStyle}>{overlay.text}</span></div> : null}
          <div className="canvas-subtitle-transport">
            <button type="button" onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (video.paused) void video.play(); else video.pause();
            }} aria-label="播放或暂停" title="播放或暂停">{playing ? <Pause /> : <Play />}</button>
            <span>{formatTime(playheadMs)} / {formatTime(durationMs)}</span>
          </div>
        </div>

        <aside className="canvas-subtitle-segment-inspector">
          <header><strong>字幕段 {selected ? selectedIndex + 1 : "-"}</strong><small>{activeIndex >= 0 ? `播放中：第 ${activeIndex + 1} 段` : "播放点位于空白"}</small></header>
          {selected ? <>
            <textarea ref={textRef} value={selected.text} maxLength={500} aria-label="字幕文字" onChange={(event) => commit(segments.map((segment, index) => index === selectedIndex ? { ...segment, text: event.target.value } : segment))} />
            <div className="canvas-subtitle-time-fields">
              <label><span>开始</span><input type="number" step={10} min={0} max={selected.endMs - 10} value={selected.startMs} onChange={(event) => commit(resizeCanvasSubtitleSegment(segments, selectedIndex, "start", Number(event.target.value), durationMs))} /></label>
              <label><span>结束</span><input type="number" step={10} min={selected.startMs + 10} max={durationMs} value={selected.endMs} onChange={(event) => commit(resizeCanvasSubtitleSegment(segments, selectedIndex, "end", Number(event.target.value), durationMs))} /></label>
            </div>
            <div className="canvas-subtitle-edit-commands">
              <button type="button" onClick={() => {
                try { commit(splitCanvasSubtitleSegment(segments, selectedIndex, playheadMs, textRef.current?.selectionStart || 0)); }
                catch (error) { setMessage(errorMessage(error)); }
              }}><Scissors />拆分</button>
              <button type="button" disabled={selectedIndex >= segments.length - 1} onClick={() => { try { commit(mergeCanvasSubtitleSegmentWithNext(segments, selectedIndex)); } catch (error) { setMessage(errorMessage(error)); } }}><Merge />合并下一段</button>
              <button type="button" onClick={() => { try { commit(deleteCanvasSubtitleSegment(segments, selectedIndex)); } catch (error) { setMessage(errorMessage(error)); } }}><Trash2 />删除</button>
            </div>
          </> : null}
          <div className="canvas-subtitle-navigation">
            <button type="button" disabled={selectedIndex <= 0} onClick={() => { const index = selectedIndex - 1; setSelectedIndex(index); seek(segments[index].startMs); }} aria-label="上一字幕段" title="上一字幕段"><ChevronLeft /></button>
            <button type="button" onClick={() => { try { const next = addCanvasSubtitleSegment(segments, playheadMs, durationMs); commit(next); setSelectedIndex(next.findIndex((segment) => segment.startMs <= playheadMs && segment.endMs > playheadMs)); } catch (error) { setMessage(errorMessage(error)); } }}><Plus />新增</button>
            <button type="button" disabled={selectedIndex >= segments.length - 1} onClick={() => { const index = selectedIndex + 1; setSelectedIndex(index); seek(segments[index].startMs); }} aria-label="下一字幕段" title="下一字幕段"><ChevronRight /></button>
          </div>
          <button className="canvas-subtitle-restore" type="button" disabled={!revision || busy !== "loading"} onClick={() => {
            if (!revision || !window.confirm("确认恢复最初识别稿？当前未保存修改将被替换。")) return;
            commit(cloneCanvasSubtitleSegments(revision.originalSegments));
            setSelectedIndex(0);
          }}><RotateCcw />恢复识别稿</button>
        </aside>
      </div>

      <div className="canvas-subtitle-timeline-toolbar">
        <span>{message || (dirty ? "字幕有未保存修改" : "字幕草稿已同步")}</span>
        <div><ZoomOut /><input type="range" min={30} max={100} step={5} value={pixelsPerSecond} onChange={(event) => setPixelsPerSecond(Number(event.target.value))} aria-label="时间轴缩放" /><ZoomIn /></div>
      </div>
      <div className="canvas-subtitle-timeline-scroll">
        <div className="canvas-subtitle-timeline-content" style={{ width: timelineWidth }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={(event) => {
          if (dragRef.current) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          seek((event.clientX - bounds.left) / pixelsPerSecond * 1000);
        }}>
          <canvas ref={waveformRef} aria-label="音频波形" />
          <div className="canvas-subtitle-time-ruler">{timeTicks(durationMs, pixelsPerSecond).map((tick) => <span key={tick} style={{ left: tick / 1000 * pixelsPerSecond }}>{formatTime(tick)}</span>)}</div>
          <div className="canvas-subtitle-blocks">
            {segments.map((segment, index) => <button
              key={`${index}-${segment.startMs}-${segment.endMs}`}
              type="button"
              className={`${selectedIndex === index ? "is-selected" : ""} ${activeIndex === index ? "is-active" : ""}`}
              style={{ left: segment.startMs / 1000 * pixelsPerSecond, width: Math.max(8, (segment.endMs - segment.startMs) / 1000 * pixelsPerSecond) }}
              onPointerDown={(event) => startDrag(event, index, "move")}
              onClick={(event) => { event.stopPropagation(); setSelectedIndex(index); seek(segment.startMs); }}
              title={segment.text}
            ><i onPointerDown={(event) => startDrag(event, index, "start")} /><span>{segment.text}</span><i onPointerDown={(event) => startDrag(event, index, "end")} /></button>)}
          </div>
          <div className="canvas-subtitle-playhead" style={{ left: playheadMs / 1000 * pixelsPerSecond }} />
        </div>
      </div>
    </section>
  </div>;
}

function timeTicks(durationMs: number, pixelsPerSecond: number) {
  const step = pixelsPerSecond >= 80 ? 5000 : 10_000;
  return Array.from({ length: Math.floor(durationMs / step) + 1 }, (_, index) => index * step);
}

function formatTime(milliseconds: number) {
  const total = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor(total % 60_000 / 1000);
  const millis = total % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function hexWithOpacity(hex: string, opacity: number) {
  const value = hex.replace("#", "");
  if (!/^[a-f0-9]{6}$/i.test(value)) return "transparent";
  return `#${value}${Math.round(Math.max(0, Math.min(100, opacity)) * 2.55).toString(16).padStart(2, "0")}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "字幕编辑操作失败。";
}
