"use client";

import { useEffect, useState } from "react";
import type { LibraryAssetFilters, LibrarySelection } from "@/lib/types";
import { beijingDate, dateBoundary } from "@/app/library/library-ui";

export const generatedEntryLabels: Record<string, string> = { canvas: "画布", batch: "批量生产", simple: "一键生产", images: "图片生成", unknown: "历史入口未确认" };
export const generatedFilterKeys = ["generated", "generationEntry", "filename", "generatedFrom", "generatedBefore", "unlabelledVehicle"] as const;

export function GeneratedImageFilters({ filters, onChange, dates = false }: {
  filters: LibraryAssetFilters; onChange: (patch: Partial<LibraryAssetFilters>) => void; dates?: boolean;
}) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8, minWidth: 0, flexBasis: "100%" }}>
    <select aria-label="图片来源" value={filters.generationEntry || (filters.generated ? "generated" : "")} onChange={(event) => onChange({ generated: Boolean(event.target.value), generationEntry: event.target.value === "generated" ? undefined : event.target.value || undefined })}>
      <option value="">全部图片</option><option value="generated">生成图片</option>{Object.entries(generatedEntryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <input aria-label="原始文件名" placeholder="原始文件名" value={filters.filename || ""} onChange={(event) => onChange({ filename: event.target.value })} style={{ minWidth: 0, flex: "1 1 140px" }} />
    <input aria-label="车型筛选" placeholder="车型（逗号分隔）" value={(filters.vehicleModels || []).join(",")} onChange={(event) => onChange({ vehicleModels: event.target.value.split(",") })} style={{ minWidth: 0, flex: "1 1 140px" }} />
    <label><input type="checkbox" checked={Boolean(filters.unlabelledVehicle)} onChange={(event) => onChange({ unlabelledVehicle: event.target.checked })} />未标注车型</label>
    {dates ? <><label>生成起始<input aria-label="生成起始日期" type="date" value={beijingDate(filters.generatedFrom)} onChange={(event) => onChange({ generatedFrom: event.target.value ? dateBoundary(event.target.value) : undefined })} /></label>
      <label>生成截止<input aria-label="生成截止日期" type="date" value={filters.generatedBefore ? beijingDate(new Date(Date.parse(filters.generatedBefore) - 1).toISOString()) : ""} onChange={(event) => onChange({ generatedBefore: event.target.value ? dateBoundary(event.target.value, true) : undefined })} /></label></> : null}
  </div>;
}

type Coverage = { counts: Record<string, number>; captureFailed?: number; scan: { status: string; uncertain: number; duplicates: number; error?: string } | null; failures: Array<{ id: string; error: string }> };
export function GeneratedImageStatus({ onRefresh }: { onRefresh: () => void }) {
  const [coverage, setCoverage] = useState<Coverage>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void requestCoverage(undefined, controller.signal).then(setCoverage).catch((error) => { if (!controller.signal.aborted) setError(String(error)); });
    return () => controller.abort();
  }, []);
  const update = async (action?: string) => {
    setBusy(true); setError("");
    try { setCoverage(await requestCoverage(action)); onRefresh(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <section aria-label="生成图片收录状态" style={{ padding: 8, overflowWrap: "anywhere" }}>
    <div>{coverage ? `已收录 ${coverage.counts.indexed || 0} · 重复 ${coverage.scan?.duplicates || 0} · 无法确认 ${coverage.scan?.uncertain || 0} · 失败 ${(coverage.counts.failed || 0) + (coverage.captureFailed || 0) + (coverage.scan?.status === "failed" ? 1 : 0)} · 待收录 ${(coverage.counts.queued || 0) + (coverage.counts.indexing || 0)} · 已移除 ${coverage.counts.excluded || 0}` : "正在读取收录状态…"}</div>
    {coverage?.scan && <small>历史补齐：{({ queued: "等待处理", running: "处理中", completed: "已完成可确认记录的检查", failed: "失败，可重试" } as Record<string, string>)[coverage.scan.status] || coverage.scan.status}。未确认记录不代表已收录。</small>}
    <div><button disabled={busy} onClick={() => void update()}>刷新收录状态</button> <button disabled={busy} onClick={() => void update("retry")}>重试失败收录</button> <button disabled={busy || ["running", "queued"].includes(coverage?.scan?.status || "")} onClick={() => void update("rescan")}>重新检查历史</button></div>
    {error || coverage?.scan?.error ? <p role="alert">{error || coverage?.scan?.error}</p> : null}
    {coverage?.failures.map((failure) => <p role="alert" key={failure.id}>{failure.id}：{failure.error}</p>)}
  </section>;
}

async function requestCoverage(action?: string, signal?: AbortSignal): Promise<Coverage> {
  const response = await fetch("/api/library/generated", action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }), signal } : { signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "收录状态查询失败");
  return result;
}

export function GeneratedVehicleEdit({ selection, onComplete }: { selection: LibrarySelection; onComplete: () => void }) {
  const [value, setValue] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <form style={{ display: "flex", flexWrap: "wrap", gap: 4 }} onSubmit={(event) => {
    event.preventDefault(); setBusy(true); setError("");
    void fetch("/api/library/generated", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "vehicle", selection, vehicle: value }) })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (result.failures.length) throw new Error(result.failures.map((item: { error: string }) => item.error).join("；")); onComplete(); })
      .catch((error) => setError(String(error))).finally(() => setBusy(false));
  }}><input aria-label="补充车型" placeholder="补充车型（留空设为未标注）" value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} /><button disabled={busy}>保存所选车型</button>{error ? <span role="alert">{error}</span> : null}</form>;
}
