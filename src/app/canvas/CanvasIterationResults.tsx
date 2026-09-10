"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CanvasArtifact, CanvasIterationItem, CanvasIterationRunMetadata, CanvasNodeRun } from "@/lib/canvas/types";

type IterationDetails = {
  metadata: CanvasIterationRunMetadata;
  items: Array<{ item: CanvasIterationItem; nodeRuns: CanvasNodeRun[] }>;
};

const itemStatusLabels: Record<CanvasIterationItem["status"], string> = {
  queued: "排队中", running: "执行中", completed: "成功", partial: "部分成功", failed: "失败", cancelled: "已取消",
};

async function iterationRequest(endpoint: string, action?: "retry-failed" | "refresh-downstream", signal?: AbortSignal) {
  const response = await fetch(endpoint, action ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }), signal,
  } : { signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `读取逐图结果失败 (${response.status})`);
  return payload;
}

export function CanvasIterationResults({ runId, nodeId, metadata, locked = false, onRefreshRun }: {
  runId?: string;
  nodeId: string;
  metadata?: CanvasIterationRunMetadata;
  locked?: boolean;
  onRefreshRun: () => void;
}) {
  const [details, setDetails] = useState<IterationDetails>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const actionPendingRef = useRef(false);
  const requestSequence = useRef(0);
  const endpoint = runId ? `/api/canvas/runs/${encodeURIComponent(runId)}/iterations/${encodeURIComponent(nodeId)}` : undefined;

  useEffect(() => {
    if (!endpoint || !metadata || actionPendingRef.current) return;
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    async function load() {
      setBusy(true);
      try {
        const payload: IterationDetails = await iterationRequest(endpoint!, undefined, controller.signal);
        if (!controller.signal.aborted && sequence === requestSequence.current) { setDetails(payload); setError(""); }
      } catch (cause) {
        if (!controller.signal.aborted && sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : "读取逐图结果失败");
      } finally {
        if (!controller.signal.aborted && sequence === requestSequence.current) setBusy(false);
      }
    }
    void load();
    return () => { controller.abort(); };
  }, [endpoint, metadata]);

  async function refresh(action?: "retry-failed" | "refresh-downstream") {
    if (!endpoint || actionPendingRef.current) return;
    actionPendingRef.current = true;
    const sequence = ++requestSequence.current;
    setBusy(true);
    setError("");
    try {
      if (action) await iterationRequest(endpoint, action);
      const payload: IterationDetails = await iterationRequest(endpoint);
      if (sequence === requestSequence.current) setDetails(payload);
      setConfirmRefresh(false);
      onRefreshRun();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "逐图操作失败");
    } finally {
      actionPendingRef.current = false;
      setBusy(false);
    }
  }

  const current = details?.metadata || metadata;
  const items = details ? details.items.map((entry) => entry.item) : current?.items || [];
  const successful = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => ["failed", "cancelled", "partial"].includes(item.status)).length;
  const running = items.some((item) => item.status === "running" || item.status === "queued");
  return <section className="canvas-iteration-results" aria-label="逐图运行结果">
    <header><strong>逐图运行结果</strong><span>{successful}/{items.length} 项成功</span></header>
    {current ? <>
      <small>结果版本 r{current.revision} · 已交付 {current.deliveredRevision === undefined ? "无" : `r${current.deliveredRevision}`}</small>
      {locked ? <p role="status">共享结果已完成并锁定，不能重试或刷新下游；请新建批量任务使用修改后的流程。</p> : null}
      {current.downstreamStale ? <p role="status">修复结果尚未交付下游。下游仍使用旧版本，请确认后刷新；不会自动发布。</p> : null}
      <div className="canvas-iteration-result-actions">
        <button type="button" disabled={busy} onClick={() => void refresh()}>刷新逐图结果</button>
        {failed > 0 ? <button type="button" disabled={busy || running || locked} onClick={() => void refresh("retry-failed")}>仅重试失败项（{failed}）</button> : null}
        {current.downstreamStale ? <button type="button" disabled={busy || running || locked} onClick={() => setConfirmRefresh(true)}>刷新下游</button> : null}
      </div>
      {confirmRefresh ? <div className="canvas-iteration-confirm"><p>使用修复后的结果重新计算下游，不会自动发布。批量任务会重新汇总为新草稿并保留旧草稿。已被消费的共享结果不可修改。</p><button type="button" disabled={busy || running || locked} onClick={() => void refresh("refresh-downstream")}>确认刷新下游</button><button type="button" disabled={busy} onClick={() => setConfirmRefresh(false)}>取消</button></div> : null}
      {[...items].sort((left, right) => left.index - right.index).map((item) => {
        const nodeRuns = details?.items.find((entry) => entry.item.id === item.id)?.nodeRuns;
        return <details className="canvas-iteration-item" key={item.id}>
          <summary><strong>原图 {item.index + 1}</strong><span>{itemStatusLabels[item.status]}</span><small>原始索引 {item.index}</small></summary>
          {item.source.url ? <Image src={item.source.url} alt={`原图 ${item.index + 1}`} width={160} height={120} unoptimized /> : null}
          {item.error ? <p role="alert">{item.error}</p> : null}
          <small>子运行：{item.runId}</small>
          {item.outputs?.text ? <IterationArtifact artifact={item.outputs.text} /> : null}
          {item.outputs?.images ? <IterationArtifact artifact={item.outputs.images} /> : null}
          {nodeRuns?.map((attempt) => <details key={attempt.id}><summary>{attempt.nodeId} · {attempt.status}</summary>{attempt.error ? <p role="alert">{attempt.error}</p> : null}{Object.entries(attempt.outputs || {}).map(([port, artifact]) => <div key={port}><small>{port}</small><IterationArtifact artifact={artifact} /></div>)}</details>)}
        </details>;
      })}
    </> : <p>区域尚未执行。运行后显示各原图结果与失败明细。</p>}
    {busy ? <p role="status">正在更新逐图结果…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}

function IterationArtifact({ artifact }: { artifact: CanvasArtifact }) {
  if (artifact.kind === "text") return <pre>{artifact.value}</pre>;
  if (artifact.kind === "images") return <div className="canvas-iteration-result-images"><small>{artifact.items.length} 张结果图片</small>{artifact.items.map((image, index) => <a key={`${image.url}-${index}`} href={image.url} target="_blank" rel="noreferrer"><Image src={image.url} alt={`结果图片 ${index + 1}`} width={160} height={120} unoptimized /></a>)}</div>;
  return <small>{artifact.kind}</small>;
}
