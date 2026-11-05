"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CopyPlus, RefreshCw, Search } from "lucide-react";
import { api, canvasScheduleStatusLabel, errorMessage } from "@/components/canvas-schedule/shared";
import { ScheduleFavoriteControl } from "@/components/canvas-schedule/FavoriteControl";
import type { CanvasScheduleListResult, CanvasScheduleSummary, CanvasWorkflow } from "@/lib/canvas/types";

export function ScheduleList({ favoritesOnly = false, workflows, version, selectedId, busy, onOpen, onDuplicate, onChange }: {
  favoritesOnly?: boolean;
  workflows: CanvasWorkflow[];
  version: number;
  selectedId?: string;
  busy: boolean;
  onOpen: (id: string) => void;
  onDuplicate: (item: CanvasScheduleSummary) => void;
  onChange: () => void;
}) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(favoritesOnly);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CanvasScheduleListResult>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const latestQuery = JSON.stringify([q, workflowId, onlyFavorites, offset, version, refresh]);
  const queryRef = useRef(latestQuery);
  useLayoutEffect(() => { queryRef.current = latestQuery; }, [latestQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const identity = latestQuery;
    const params = new URLSearchParams({ view: "summary", q, workflowId, favorite: String(onlyFavorites), limit: "50", offset: String(offset) });
    async function load() {
      setLoading(true); setError("");
      try {
        const result = await api<CanvasScheduleListResult>(`/api/canvas/schedules?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted && queryRef.current === identity) {
          if (offset && !result.schedules.length) setOffset(Math.max(0, offset - 50));
          else setPage(result);
        }
      } catch (cause) { if (!controller.signal.aborted && queryRef.current === identity) setError(errorMessage(cause)); }
      finally { if (!controller.signal.aborted && queryRef.current === identity) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [latestQuery, q, workflowId, onlyFavorites, offset]);

  return <div className="batch-schedule-list" aria-label={favoritesOnly ? "收藏任务列表" : "历史任务列表"}>
    <form className="batch-list-filters" onSubmit={(event) => { event.preventDefault(); setOffset(0); setQ(text.trim()); setRefresh((value) => value + 1); }}>
      <label className="batch-list-query"><span>搜索任务</span><input aria-label="搜索任务" placeholder="任务、工作流、收藏名称或备注" value={text} onChange={(event) => setText(event.target.value)} /></label>
      <button type="submit" disabled={busy}><Search />搜索</button>
      <label><span>工作流</span><select aria-label="筛选工作流" value={workflowId} disabled={busy} onChange={(event) => { setWorkflowId(event.target.value); setOffset(0); }}><option value="">全部工作流</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label>
      {!favoritesOnly ? <label className="batch-checkbox"><input type="checkbox" checked={onlyFavorites} disabled={busy} onChange={(event) => { setOnlyFavorites(event.target.checked); setOffset(0); }} />仅看收藏</label> : null}
      <button type="button" aria-label="刷新任务列表" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw /></button>
    </form>
    {error ? <p role="alert" className="batch-field-error">{error}<button type="button" onClick={() => setRefresh((value) => value + 1)}>重试加载</button></p> : null}
    {loading ? <p role="status">正在查找任务…</p> : !error ? <>
      <p className="batch-list-count" role="status">共 {page?.total ?? 0} 项{page?.total ? ` · 第 ${Math.floor(offset / 50) + 1} 页` : ""}</p>
      {page?.schedules.map((item) => <article className={`batch-saved-task ${item.id === selectedId ? "is-selected" : ""}`} key={item.id}>
        <div className="batch-saved-heading"><strong>{item.favorite?.alias || item.name}</strong><small>{canvasScheduleStatusLabel(item.status)}</small></div>
        {item.favorite ? <p className="batch-saved-note">{item.favorite.note}</p> : null}
        <p><small>{item.favorite ? `原任务：${item.name} · ` : ""}{item.workflowName || "工作流不可用"}</small></p>
        <p><small>{item.schemaVersion === 2 ? `${item.totalMainTasks} 组 / ${item.totalChildTasks} 个结果` : `${item.totalContentTasks} 篇`} · {new Date(item.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></p>
        {!item.workflowAvailable ? <p className="batch-field-error">工作流已删除或无权访问，暂时无法复制。</p> : null}
        <div className="batch-actions"><button type="button" disabled={busy || !item.workflowAvailable} onClick={() => onDuplicate(item)}><CopyPlus />{item.schemaVersion === 2 ? "复制并编辑" : "在原调度复制"}</button><button type="button" disabled={busy} onClick={() => onOpen(item.id)}>查看原任务</button></div>
        <ScheduleFavoriteControl key={`${item.id}-${item.favorite?.updatedAt || "none"}`} scheduleId={item.id} favorite={item.favorite} disabled={busy} onChange={onChange} />
      </article>)}
      {!page?.total ? <p className="batch-empty">{q || workflowId ? "没有符合条件的任务，请调整搜索或筛选。" : onlyFavorites ? "还没有收藏任务。到任务记录中收藏常用任务，下次可直接复制。" : "还没有任务，新建后可以在这里查看和收藏。"}</p> : null}
      {page && page.total > 50 ? <div className="batch-actions batch-list-pagination"><button type="button" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>上一页</button><button type="button" disabled={busy || offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>下一页任务</button></div> : null}
    </> : null}
  </div>;
}
