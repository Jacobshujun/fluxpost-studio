"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import type { CanvasScheduleIterationDetails, CanvasScheduleIterationSummary } from "@/lib/canvas/types";
import "./iteration-failures.css";

export function ScheduleIterationFailures({ scheduleId, mainTaskId, childTaskId, label, status, runId, summaries, busy, frozen = false, onAction }: {
  scheduleId: string;
  mainTaskId: string;
  childTaskId?: string;
  label: string;
  status: string;
  runId?: string;
  summaries?: CanvasScheduleIterationSummary[];
  busy: boolean;
  frozen?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<CanvasScheduleIterationDetails>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const phase = childTaskId ? "child" : "shared";
  const identity = `${scheduleId}:${mainTaskId}:${childTaskId || "shared"}:${runId}:${status}`;
  useEffect(() => () => request.current?.abort(), [identity]);

  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ mainTaskId, phase });
      if (childTaskId) query.set("childTaskId", childTaskId);
      const response = await fetch(`/api/canvas/schedules/${encodeURIComponent(scheduleId)}/iterations?${query}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json() as { details?: CanvasScheduleIterationDetails; error?: string };
      if (!response.ok || !data.details) throw new Error(data.error || "读取逐图执行详情失败。");
      if (!controller.signal.aborted) setDetails(data.details);
    } catch (loadError) {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "读取逐图执行详情失败。");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const regions = summaries || details?.regions || [];
  const failed = regions.reduce((sum, region) => sum + region.failed, 0);
  if (!runId || (!failed && !["failed", "partial"].includes(status))) return null;
  const canRetry = !busy && !frozen && ["failed", "partial"].includes(status);
  return <section className="schedule-iteration-failures" aria-label={`${label}逐图执行`}>
    <header><AlertTriangle /><strong>{label} · {failed ? `${failed} 张图片失败` : "查看失败位置"}</strong></header>
    {regions.filter((region) => region.failed).map((region) => <p key={region.nodeId}>
      <strong>{region.label}</strong>：成功 {region.completed}/{region.total} · 失败第 {region.failures.map((item) => item.index).join("、")} 张
    </p>)}
    <button type="button" disabled={loading} aria-expanded={open} onClick={() => {
      const nextOpen = !open;
      setOpen(nextOpen);
      if (nextOpen) void load();
    }}>{loading ? <LoaderCircle className="animate-spin" /> : null}{open ? "收起逐图详情" : "展开逐图详情"}</button>
    {open ? <div className="schedule-iteration-details">
      <button type="button" disabled={loading} onClick={() => void load()}><RefreshCw />刷新逐图状态</button>
      {error ? <p role="alert">{error}</p> : null}
      {details?.regions.length === 0 ? <p>此结果没有逐图执行记录，请查看上方错误或使用结果项重试。</p> : null}
      {details?.regions.map((region) => <section key={region.nodeId} aria-label={region.label}>
        <header><strong>{region.label} · 成功 {region.completed}/{region.total}</strong>
          {region.failed && !region.pending && canRetry ? <button type="button" onClick={() => onAction(childTaskId ? "retry" : "retry-shared", { mainTaskId, ...(childTaskId ? { childTaskId } : {}), iterationNodeId: region.nodeId })}><RotateCcw />仅重试此区域失败图片（{region.failed}）</button> : null}
        </header>
        <p>{region.policy === "all" ? "全部成功：失败图片补齐后，本结果才能继续。" : "至少一项成功：允许使用成功图片继续，成品可能缺图。"}</p>
        <ol>{region.items.map((item) => <li key={item.index} className={["failed", "partial", "cancelled"].includes(item.status) ? "is-failed" : ""}>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`查看第 ${item.index} 张原图`}><Image src={item.sourceUrl} alt={`原图 ${item.index}`} width={64} height={64} unoptimized referrerPolicy="no-referrer" /></a>
          <div><strong>第 {item.index} 张 · {({ completed: "成功", partial: "部分失败", failed: "失败", cancelled: "已取消", running: "运行中", queued: "等待中" })[item.status] || item.status}</strong>
            {item.failedNodeLabel ? <span>失败节点：{item.failedNodeLabel}</span> : null}
            {item.error ? <p>{item.error}</p> : null}
          </div>
        </li>)}</ol>
      </section>)}
      {frozen && failed ? <p>已交付的共享结果已冻结，请新建任务处理。</p> : null}
    </div> : null}
  </section>;
}
