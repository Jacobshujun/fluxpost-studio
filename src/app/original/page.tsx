"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClipboardEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  CirclePlay,
  ClipboardPaste,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import type { OriginalBatch, OriginalBatchInputItem, OriginalBatchSettings, OriginalBatchStatus } from "@/lib/types";
import styles from "./original.module.css";

type EditorRow = OriginalBatchInputItem & { id: number };
type RowError = { row: number; field: keyof OriginalBatchInputItem; message: string };
type Preflight = {
  itemCount: number;
  maxImageRequests: number;
  expectedImageCount: number | { min: number; max: number };
  effectiveRatio: "3:4" | "2:3";
  imageSize: string;
  providerProfile: string;
  textConfigured: boolean;
  imageConfigured: boolean;
  webSearchAvailable: boolean;
};

const initialSettings: OriginalBatchSettings = {
  strategy: "auto",
  style: "auto",
  layout: "auto",
  palette: "auto",
  imageCount: "auto",
  webSearch: false,
};

const statusLabels: Record<OriginalBatchStatus, string> = {
  queued: "排队中",
  running: "生成中",
  paused: "已暂停",
  completed: "已完成",
  partial: "部分完成",
  failed: "失败",
  cancelled: "已取消",
};

let nextRowId = 2;

export default function OriginalBatchPage() {
  const [rows, setRows] = useState<EditorRow[]>([{ id: 1, topic: "", requirements: "", vehicleKeyword: "" }]);
  const [settings, setSettings] = useState<OriginalBatchSettings>(initialSettings);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"preflight" | "create" | "history" | "action" | null>("history");
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [duplicateRows, setDuplicateRows] = useState<number[]>([]);
  const [batches, setBatches] = useState<OriginalBatch[]>([]);
  const [statusFilter, setStatusFilter] = useState<OriginalBatchStatus | "all">("all");

  const validRows = useMemo(() => rows.map(stripRow).filter((row) => row.topic || row.requirements || row.vehicleKeyword), [rows]);
  const localDuplicateRows = useMemo(() => findDuplicateRows(validRows), [validRows]);
  const liveBatch = batches.some((batch) => ["queued", "running"].includes(batch.status));

  const loadBatches = useCallback(async (silent = false) => {
    if (!silent) setBusy("history");
    try {
      setBatches(await fetchBatchList(statusFilter));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批次加载失败");
    } finally {
      setBusy((current) => current === "history" ? null : current);
    }
  }, [statusFilter]);

  useEffect(() => {
    let active = true;
    void fetchBatchList(statusFilter)
      .then((next) => { if (active) setBatches(next); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "批次加载失败"); })
      .finally(() => { if (active) setBusy((current) => current === "history" ? null : current); });
    return () => { active = false; };
  }, [statusFilter]);

  useEffect(() => {
    if (!liveBatch) return;
    const timer = window.setInterval(() => void loadBatches(true), 2500);
    return () => window.clearInterval(timer);
  }, [liveBatch, loadBatches]);

  function updateRow(id: number, patch: Partial<OriginalBatchInputItem>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setPreflight(null);
    setRowErrors([]);
  }

  function addRow() {
    setRows((current) => current.length >= 100 ? current : [...current, { id: nextRowId++, topic: "", requirements: "", vehicleKeyword: "" }]);
    setPreflight(null);
  }

  function removeRow(id: number) {
    setRows((current) => current.length === 1 ? [{ ...current[0], topic: "", requirements: "", vehicleKeyword: "" }] : current.filter((row) => row.id !== id));
    setPreflight(null);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, rowId: number) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !/[\r\n]/.test(text)) return;
    event.preventDefault();
    const pasted = parseTsv(text);
    if (!pasted.length) return;
    setRows((current) => {
      const start = Math.max(0, current.findIndex((row) => row.id === rowId));
      const prefix = current.slice(0, start);
      const suffix = current.slice(start + pasted.length);
      return [...prefix, ...pasted.map((row) => ({ ...row, id: nextRowId++ })), ...suffix].slice(0, 100);
    });
    setPreflight(null);
    setRowErrors([]);
  }

  async function runPreflight() {
    setBusy("preflight");
    setMessage("");
    try {
      const response = await fetch("/api/original/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preflight", items: validRows, settings }),
      });
      const data = (await response.json()) as { preflight?: Preflight; duplicateRows?: number[]; rowErrors?: RowError[]; error?: string };
      setRowErrors(data.rowErrors || []);
      if (!response.ok || !data.preflight) throw new Error(data.error || "启动预检失败");
      setDuplicateRows(data.duplicateRows || []);
      setPreflight(data.preflight);
    } catch (error) {
      setPreflight(null);
      setMessage(error instanceof Error ? error.message : "启动预检失败");
    } finally {
      setBusy(null);
    }
  }

  async function createBatch() {
    setBusy("create");
    setMessage("");
    try {
      const response = await fetch("/api/original/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: validRows, settings }),
      });
      const data = (await response.json()) as { batch?: OriginalBatch; rowErrors?: RowError[]; error?: string };
      setRowErrors(data.rowErrors || []);
      if (!response.ok || !data.batch) throw new Error(data.error || "批次创建失败");
      setPreflight(null);
      setRows([{ id: nextRowId++, topic: "", requirements: "", vehicleKeyword: "" }]);
      setMessage(`批次已启动：${data.batch.id}`);
      await loadBatches(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批次创建失败");
    } finally {
      setBusy(null);
    }
  }

  async function applyBatchAction(batch: OriginalBatch, action: "pause" | "resume" | "cancel" | "retry_failed") {
    if (action === "cancel" && !window.confirm("确认取消该批次？已生成结果会保留。")) return;
    setBusy("action");
    setMessage("");
    try {
      const response = await fetch(`/api/original/batches/${encodeURIComponent(batch.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as { batch?: OriginalBatch; error?: string };
      if (!response.ok || !data.batch) throw new Error(data.error || "批次操作失败");
      setBatches((current) => current.map((entry) => entry.id === data.batch!.id ? data.batch! : entry));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批次操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}><Sparkles size={18} /></span>
          <div><h1>批量原创</h1><p>小红书图文工作台</p></div>
        </div>
        <nav className={styles.nav}>
          <Link className="soft-button" href="/"><ArrowLeft size={15} />首页</Link>
          <Link className="soft-button" href="/review"><ExternalLink size={15} />审查台</Link>
        </nav>
      </header>

      <div className={styles.workspace}>
        <section className={styles.editorPane}>
          <div className={styles.sectionHeader}>
            <div><h2>选题队列</h2><p>{validRows.length}/100</p></div>
            <button className="soft-button" type="button" onClick={addRow} disabled={rows.length >= 100}><Plus size={15} />添加</button>
          </div>

          <div className={styles.pasteBanner}><ClipboardPaste size={16} /><span>选题</span><span>创作要求</span><span>车型 / 关键词</span></div>

          <div className={styles.desktopTable}>
            <div className={styles.tableHeader}><span>#</span><span>选题</span><span>创作要求</span><span>车型 / 关键词</span><span /></div>
            <div className={styles.tableBody}>
              {rows.map((row, index) => <EditorTableRow key={row.id} row={row} index={index} errors={rowErrors} duplicate={localDuplicateRows.includes(index + 1)} onChange={updateRow} onRemove={removeRow} onPaste={handlePaste} />)}
            </div>
          </div>

          <div className={styles.mobileRows}>
            {rows.map((row, index) => <EditorMobileRow key={row.id} row={row} index={index} errors={rowErrors} duplicate={localDuplicateRows.includes(index + 1)} onChange={updateRow} onRemove={removeRow} onPaste={handlePaste} />)}
          </div>

          <button className={styles.advancedToggle} type="button" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen}>
            <Settings2 size={16} /><span>高级设置</span><ChevronRight className={advancedOpen ? styles.chevronOpen : ""} size={16} />
          </button>
          {advancedOpen ? <AdvancedSettings settings={settings} onChange={(patch) => { setSettings((current) => ({ ...current, ...patch })); setPreflight(null); }} /> : null}

          {message ? <p className={styles.message}>{message}</p> : null}
          <div className={styles.launchBar}>
            <div><strong>{validRows.length}</strong><span>个选题</span><strong>{settings.imageCount === "auto" ? "2–10" : settings.imageCount}</strong><span>图 / 篇</span></div>
            <button className="primary-button" type="button" onClick={runPreflight} disabled={!validRows.length || Boolean(busy)}>
              {busy === "preflight" ? <Loader2 className={styles.spin} size={16} /> : <CheckCircle2 size={16} />}启动预检
            </button>
          </div>
        </section>

        <aside className={styles.historyPane}>
          <div className={styles.sectionHeader}>
            <div><h2>生成批次</h2><p>{batches.length} 条</p></div>
            <button className={styles.iconButton} type="button" onClick={() => loadBatches()} disabled={busy === "history"} aria-label="刷新批次"><RefreshCw className={busy === "history" ? styles.spin : ""} size={16} /></button>
          </div>
          <select className={styles.filter} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OriginalBatchStatus | "all")}>
            <option value="all">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className={styles.batchList}>
            {batches.map((batch) => <BatchRow key={batch.id} batch={batch} busy={busy === "action"} onAction={applyBatchAction} />)}
            {!batches.length && busy !== "history" ? <div className={styles.empty}>暂无批次</div> : null}
          </div>
        </aside>
      </div>

      {preflight ? <PreflightDialog preflight={preflight} duplicateRows={duplicateRows} busy={busy === "create"} onClose={() => setPreflight(null)} onConfirm={createBatch} /> : null}
    </main>
  );
}

function EditorTableRow({ row, index, errors, duplicate, onChange, onRemove, onPaste }: EditorRowProps) {
  const hasError = errors.some((error) => error.row === index + 1);
  return <div className={`${styles.tableRow} ${hasError ? styles.invalidRow : ""}`}>
    <span className={styles.rowNumber}>{index + 1}</span>
    <input value={row.topic} maxLength={121} onPaste={(event) => onPaste(event, row.id)} onChange={(event) => onChange(row.id, { topic: event.target.value })} aria-label={`第 ${index + 1} 行选题`} />
    <textarea value={row.requirements || ""} maxLength={4001} onChange={(event) => onChange(row.id, { requirements: event.target.value })} aria-label={`第 ${index + 1} 行创作要求`} />
    <input value={row.vehicleKeyword || ""} maxLength={97} onChange={(event) => onChange(row.id, { vehicleKeyword: event.target.value })} aria-label={`第 ${index + 1} 行车型或关键词`} />
    <button className={styles.removeButton} type="button" onClick={() => onRemove(row.id)} aria-label={`删除第 ${index + 1} 行`}><Trash2 size={15} /></button>
    {duplicate ? <span className={styles.rowFlag}>重复</span> : null}
    {hasError ? <span className={styles.rowError}>{errors.filter((error) => error.row === index + 1).map((error) => error.message).join("；")}</span> : null}
  </div>;
}

function EditorMobileRow(props: EditorRowProps) {
  const { row, index, errors, duplicate, onChange, onRemove, onPaste } = props;
  const rowMessages = errors.filter((error) => error.row === index + 1).map((error) => error.message);
  return <article className={`${styles.mobileRow} ${rowMessages.length ? styles.invalidRow : ""}`}>
    <header><strong>#{index + 1}</strong>{duplicate ? <span className={styles.rowFlag}>重复</span> : null}<button type="button" onClick={() => onRemove(row.id)} aria-label={`删除第 ${index + 1} 行`}><Trash2 size={15} /></button></header>
    <label><span>选题</span><input value={row.topic} maxLength={121} onPaste={(event) => onPaste(event, row.id)} onChange={(event) => onChange(row.id, { topic: event.target.value })} /></label>
    <label><span>创作要求</span><textarea value={row.requirements || ""} maxLength={4001} onChange={(event) => onChange(row.id, { requirements: event.target.value })} /></label>
    <label><span>车型 / 关键词</span><input value={row.vehicleKeyword || ""} maxLength={97} onChange={(event) => onChange(row.id, { vehicleKeyword: event.target.value })} /></label>
    {rowMessages.length ? <p>{rowMessages.join("；")}</p> : null}
  </article>;
}

type EditorRowProps = {
  row: EditorRow;
  index: number;
  errors: RowError[];
  duplicate: boolean;
  onChange: (id: number, patch: Partial<OriginalBatchInputItem>) => void;
  onRemove: (id: number) => void;
  onPaste: (event: ClipboardEvent<HTMLInputElement>, rowId: number) => void;
};

function AdvancedSettings({ settings, onChange }: { settings: OriginalBatchSettings; onChange: (patch: Partial<OriginalBatchSettings>) => void }) {
  return <div className={styles.settingsGrid}>
    <label><span>叙事策略</span><select value={settings.strategy} onChange={(event) => onChange({ strategy: event.target.value as OriginalBatchSettings["strategy"] })}><option value="auto">自动</option><option value="a">A 故事驱动</option><option value="b">B 信息密集</option><option value="c">C 视觉优先</option></select></label>
    <label><span>视觉风格</span><select value={settings.style} onChange={(event) => onChange({ style: event.target.value as OriginalBatchSettings["style"] })}><option value="auto">自动</option>{["cute","fresh","warm","bold","minimal","retro","pop","notion","chalkboard","study-notes","screen-print","sketch-notes"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <label><span>布局</span><select value={settings.layout} onChange={(event) => onChange({ layout: event.target.value as OriginalBatchSettings["layout"] })}><option value="auto">自动</option>{["sparse","balanced","dense","list","comparison","flow","mindmap","quadrant"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <label><span>配色</span><select value={settings.palette} onChange={(event) => onChange({ palette: event.target.value as OriginalBatchSettings["palette"] })}><option value="auto">自动</option><option value="default">风格默认</option><option value="macaron">马卡龙</option><option value="warm">暖色</option><option value="neon">霓虹</option></select></label>
    <label><span>图片数</span><select value={settings.imageCount} onChange={(event) => onChange({ imageCount: event.target.value === "auto" ? "auto" : Number(event.target.value) })}><option value="auto">自动 2–10</option>{Array.from({ length: 9 }, (_, index) => index + 2).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <label className={styles.toggle}><input type="checkbox" checked={settings.webSearch} onChange={(event) => onChange({ webSearch: event.target.checked })} /><span>联网检索</span></label>
  </div>;
}

function BatchRow({ batch, busy, onAction }: { batch: OriginalBatch; busy: boolean; onAction: (batch: OriginalBatch, action: "pause" | "resume" | "cancel" | "retry_failed") => void }) {
  const complete = batch.counts.completed + batch.counts.needsReview + batch.counts.failed + batch.counts.cancelled;
  const progress = batch.counts.total ? Math.round(complete / batch.counts.total * 100) : 0;
  return <article className={styles.batchRow}>
    <div className={styles.batchTitle}><span className={`${styles.statusDot} ${styles[`status_${batch.status}`]}`} /><strong>{statusLabels[batch.status]}</strong><time>{formatTime(batch.createdAt)}</time></div>
    <div className={styles.batchMeta}><span>{batch.counts.total} 篇</span><span>{batch.counts.completed} 完成</span><span>{batch.counts.needsReview} 待审</span><span>{batch.counts.failed} 失败</span></div>
    <div className={styles.progress}><i style={{ width: `${progress}%` }} /></div>
    <div className={styles.batchActions}>
      {batch.status === "queued" || batch.status === "running" ? <button type="button" onClick={() => onAction(batch, "pause")} disabled={busy} title="暂停"><CirclePause size={15} /></button> : null}
      {batch.status === "paused" ? <button type="button" onClick={() => onAction(batch, "resume")} disabled={busy} title="继续"><CirclePlay size={15} /></button> : null}
      {["queued", "running", "paused", "partial"].includes(batch.status) ? <button type="button" onClick={() => onAction(batch, "cancel")} disabled={busy} title="取消"><XCircle size={15} /></button> : null}
      {batch.counts.failed > 0 && ["failed", "partial", "completed"].includes(batch.status) ? <button type="button" onClick={() => onAction(batch, "retry_failed")} disabled={busy} title="重试失败项"><RotateCcw size={15} /></button> : null}
      {complete > 0 ? <Link href={`/review?sourceBatchId=${encodeURIComponent(batch.id)}`} title="查看审查结果"><ExternalLink size={15} /></Link> : null}
    </div>
  </article>;
}

function PreflightDialog({ preflight, duplicateRows, busy, onClose, onConfirm }: { preflight: Preflight; duplicateRows: number[]; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const expected = typeof preflight.expectedImageCount === "number" ? String(preflight.expectedImageCount) : `${preflight.expectedImageCount.min}–${preflight.expectedImageCount.max}`;
  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="preflight-title">
    <div className={styles.dialog}>
      <header><div><h2 id="preflight-title">启动确认</h2><p>{preflight.itemCount} 个选题</p></div><button type="button" onClick={onClose} aria-label="关闭"><XCircle size={18} /></button></header>
      <dl>
        <div><dt>预计成图</dt><dd>{expected}</dd></div>
        <div><dt>图片请求上限</dt><dd>{preflight.maxImageRequests}</dd></div>
        <div><dt>实际画幅</dt><dd>{preflight.effectiveRatio} · {preflight.imageSize}</dd></div>
        <div><dt>供应商</dt><dd>{preflight.providerProfile}</dd></div>
        <div><dt>文本模型</dt><dd>{preflight.textConfigured ? "已配置" : "未配置"}</dd></div>
        <div><dt>图片模型</dt><dd>{preflight.imageConfigured ? "已配置" : "未配置"}</dd></div>
      </dl>
      {duplicateRows.length ? <p className={styles.warning}>重复行：{duplicateRows.join("、")}</p> : null}
      <footer><button className="soft-button" type="button" onClick={onClose} disabled={busy}>返回</button><button className="primary-button" type="button" onClick={onConfirm} disabled={busy || !preflight.textConfigured || !preflight.imageConfigured}>{busy ? <Loader2 className={styles.spin} size={16} /> : <ImageIcon size={16} />}确认启动</button></footer>
    </div>
  </div>;
}

function parseTsv(text: string): OriginalBatchInputItem[] {
  return text.split(/\r?\n/).map((line) => {
    const [topic = "", requirements = "", vehicleKeyword = ""] = line.split("\t");
    return { topic: topic.trim(), requirements: requirements.trim(), vehicleKeyword: vehicleKeyword.trim() };
  }).filter((row) => row.topic || row.requirements || row.vehicleKeyword).slice(0, 100);
}

function stripRow(row: EditorRow): OriginalBatchInputItem {
  return { topic: row.topic.trim(), requirements: row.requirements?.trim(), vehicleKeyword: row.vehicleKeyword?.trim() };
}

function findDuplicateRows(rows: OriginalBatchInputItem[]) {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  rows.forEach((row, index) => {
    const key = JSON.stringify([row.topic, row.requirements || "", row.vehicleKeyword || ""]);
    if (seen.has(key)) duplicates.push(index + 1);
    seen.add(key);
  });
  return duplicates;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function fetchBatchList(status: OriginalBatchStatus | "all") {
  const query = new URLSearchParams({ pageSize: "50" });
  if (status !== "all") query.set("status", status);
  const response = await fetch(`/api/original/batches?${query}`);
  const data = (await response.json()) as { batches?: OriginalBatch[]; error?: string };
  if (!response.ok) throw new Error(data.error || "批次加载失败");
  return data.batches || [];
}
