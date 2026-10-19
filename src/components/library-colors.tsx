"use client";

import { useEffect, useRef, useState } from "react";
import { libraryColorPresets } from "@/lib/library-color";
import type { LibraryColorJobState, LibraryPalette } from "@/lib/types";
import styles from "./library-colors.module.css";

export function LibraryPalette({ palette, onColor, disabled = false }: { palette?: LibraryPalette; onColor: (hex: string) => void; disabled?: boolean }) {
  return <div className={`${styles.palette} nodrag nopan nowheel`} aria-label="图片主色" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
    {palette?.status === "completed" ? palette.colors.length ? palette.colors.map((color) => <button key={color.hex} type="button" className={styles.swatch} disabled={disabled} style={{ backgroundColor: color.hex }} title={`${color.hex} · ${(color.coverage * 100).toFixed(1)}%`} aria-label={`按主色 ${color.hex} 筛选，占比 ${(color.coverage * 100).toFixed(1)}%`} onClick={() => onColor(color.hex)} />) : <small>无可见颜色</small>
      : <small title={palette?.error}>{palette?.status === "failed" ? `颜色分析失败：${palette.error}` : "颜色待分析"}</small>}
  </div>;
}

export function LibraryColorFilter({ color, onChange, hint = false }: { color?: string; onChange: (hex?: string) => void; hint?: boolean }) {
  return <div className={`${styles.filter} nodrag nopan nowheel`} onPointerDown={(event) => event.stopPropagation()}>
    <span>颜色</span><div className={styles.presets} role="group" aria-label="颜色筛选">{libraryColorPresets.map(([name, hex]) => <button key={hex} type="button" className={styles.swatch} style={{ backgroundColor: hex }} title={name} aria-label={`筛选${name}`} aria-pressed={color === hex} onClick={() => onChange(color === hex ? undefined : hex)} />)}</div>
    {color ? <span className={styles.current}><i style={{ backgroundColor: color }} />{color}<button type="button" onClick={() => onChange(undefined)} aria-label="清除颜色筛选">清除</button></span> : null}
    {hint && color ? <small>未分析的图片暂不匹配。<a href="/library" target="_blank" rel="noreferrer">前往图库分析</a></small> : null}
  </div>;
}

async function readState(url: string, init?: RequestInit): Promise<LibraryColorJobState> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "读取颜色分析状态失败。");
  return body;
}

export function LibraryColorAnalysis({ onComplete, revision }: { onComplete: () => void; revision: number }) {
  const [state, setState] = useState<LibraryColorJobState>();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(0);
  const completeRef = useRef(onComplete);
  const runningRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    void readState("/api/library/colors/jobs", { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setState(result); setError(""); } }).catch((e) => { if (!controller.signal.aborted) setError(String(e.message)); });
    return () => controller.abort();
  }, [revision, retry]);
  const jobId = state?.job?.id;
  const active = state?.job?.status === "running";
  useEffect(() => {
    if (!active || !jobId) return;
    runningRef.current = true;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const result = await readState(`/api/library/colors/jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setState(result); setError("");
        if (result.job?.status === "running") timer = setTimeout(() => void tick(), 1200);
        else if (runningRef.current) { runningRef.current = false; completeRef.current(); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "状态读取失败。"); }
    };
    timer = setTimeout(() => void tick(), 600);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, jobId, retry]);
  const submit = async (mode: "missing" | "failed") => {
    setSubmitting(true); setError("");
    try {
      const result = await readState("/api/library/colors/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      if (mounted.current) { setState(result); if (result.job?.status === "completed") completeRef.current(); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "提交颜色分析失败。"); }
    finally { if (mounted.current) setSubmitting(false); }
  };
  return <div className={styles.analysis}>
    {state ? <small>{state.coverage.analyzed < state.coverage.total ? `颜色筛选尚不完整：已分析 ${state.coverage.analyzed}/${state.coverage.total} 张` : `颜色已分析 ${state.coverage.analyzed} 张`}</small> : null}
    <button type="button" disabled={submitting || active || !state?.coverage.manageableMissing} onClick={() => void submit("missing")}>分析已有图片</button>
    {state?.coverage.manageableFailed ? <button type="button" disabled={submitting || active} onClick={() => void submit("failed")}>重试失败项（{state.coverage.manageableFailed}）</button> : null}
    {state?.job ? <small role="status">{active ? "正在分析" : "分析完成"} {state.job.completed + state.job.failed}/{state.job.total}{state.job.failed ? ` · ${state.job.failed} 张失败` : ""}</small> : null}
    {state?.job?.failures.length ? <details><summary>失败详情</summary>{state.job.failures.map((f) => <p key={f.assetId}>{f.assetId}：{f.error}</p>)}</details> : null}
    {error ? <span role="alert">{error}<button type="button" onClick={() => setRetry((v) => v + 1)}>重试读取</button></span> : null}
  </div>;
}
