"use client";

import { RotateCcw } from "lucide-react";
import type { CanvasScheduleV2MainTask } from "@/lib/canvas/types";

export function ScheduleAggregateFailure({ main, busy, onAction }: {
  main: CanvasScheduleV2MainTask;
  busy: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
}) {
  if (!main.mainRunId || (!main.aggregateFailedNodeLabel && !main.aggregateRetryable && !main.aggregateRetryPending)) return null;
  return <div className="schedule-iteration-failures" aria-label="组完成后处理失败">
    <strong>组完成后处理 · {main.aggregateFailedNodeLabel || "失败节点"}</strong>
    {main.aggregateRetryPending ? <span role="status">等待补跑失败节点</span> : null}
    {main.aggregateRetryable ? <button type="button" disabled={busy} onClick={() => onAction("retry-main", { mainTaskId: main.id })}><RotateCcw />重试本组失败处理</button> : null}
    <small>复用已成功结果，更新原审核草稿。</small>
  </div>;
}
