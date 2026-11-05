"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Layers3, LoaderCircle, Play, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import {
  api, errorMessage, canvasNodeDisplayName, canvasScheduleStatusLabel, mergeCanvasScheduleWorkbookPaths,
  ScheduleV2Preview, ScheduleV2RuntimeTree, CanvasScheduleMainImageDownload,
  type PreviewState,
} from "@/components/canvas-schedule/shared";
import { getCanvasBatchBindings } from "@/lib/canvas/registry";
import { getCanvasIterationOutputPorts } from "@/lib/canvas/iteration";
import { batchCanvasHref, batchInputIssues, batchOutputIssue, editBatchDraft } from "@/lib/canvas/batch-create";
import type { CanvasArtifact, CanvasSchedule, CanvasScheduleV2Definition, CanvasScheduleSummary, CanvasScheduleListResult, CanvasScheduleFavorite, CanvasWorkflow } from "@/lib/canvas/types";
import { ScheduleFavoriteControl } from "@/components/canvas-schedule/FavoriteControl";
import { ScheduleList } from "./ScheduleList";
import { DefinitionEditor } from "./DefinitionEditor";
import "./batch-create.css";

const steps = ["选择配置", "填写内容与素材", "设置生成方式", "预览并开始"];
const activeStates = ["queued", "running", "paused"];
const editableStates = ["draft", "ready"];

export default function BatchCreatePage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);
  const [listVersion, setListVersion] = useState(0);
  const [source, setSource] = useState<"favorites" | "workflow">("workflow");
  const [workflowId, setWorkflowId] = useState("");
  const [selected, setSelected] = useState<CanvasSchedule>();
  const [tab, setTab] = useState<"new" | "records">("new");
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<PreviewState>(null);
  const busyRef = useRef(false);
  const selectedRef = useRef<CanvasSchedule | undefined>(undefined);
  const selectionEpoch = useRef(0);
  const dirtyRef = useRef(false);
  const summaryRef = useCallback((node: HTMLDetailsElement | null) => { if (node) node.open = window.matchMedia("(min-width: 761px)").matches; }, []);
  const workflow = workflows.find((item) => item.id === (selected?.workflowId || workflowId));
  const graph = workflow?.graph;
  const editable = Boolean(selected?.schemaVersion === 2 && editableStates.includes(selected.status));
  const setDirtyState = (value: boolean) => { dirtyRef.current = value; setDirty(value); };
  const adopt = useCallback((value: CanvasSchedule) => {
    selectedRef.current = value;
    setSelected(value);

  }, []);

  function syncUrl(value?: CanvasSchedule, nextWorkflowId = "") {
    const url = new URL(window.location.href);
    url.search = "";
    if (value) { url.searchParams.set("scheduleId", value.id); url.searchParams.set("workflowId", value.workflowId); }
    else if (nextWorkflowId) url.searchParams.set("workflowId", nextWorkflowId);
    window.history.replaceState(null, "", url);
  }

  useEffect(() => {
    let disposed = false;
    async function initialize() {
      try {
        const [workflowData, scheduleData] = await Promise.all([
          api<{ workflows: CanvasWorkflow[] }>("/api/canvas/workflows"), api<CanvasScheduleListResult>("/api/canvas/schedules?view=summary&favorite=true&limit=1"),
        ]);
        if (disposed) return;
        setWorkflows(workflowData.workflows); setSource(scheduleData.total > 0 ? "favorites" : "workflow");
        const params = new URLSearchParams(window.location.search);
        const id = params.get("scheduleId");
        const requestedWorkflow = params.get("workflowId");
        if (id) {
          const detail = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${encodeURIComponent(id)}`);
          if (disposed) return;
          adopt(detail.schedule); setWorkflowId(detail.schedule.workflowId);
          setTab(detail.schedule.schemaVersion === 2 && editableStates.includes(detail.schedule.status) ? "new" : "records"); setStep(1);
        } else if (requestedWorkflow) {
          if (!workflowData.workflows.some((item) => item.id === requestedWorkflow)) throw new Error("指定工作流不存在或无权访问，请重新选择。");
          setWorkflowId(requestedWorkflow); setSource("workflow");
        }
      } catch (cause) { if (!disposed) setError(errorMessage(cause)); }
      finally { if (!disposed) setLoading(false); }
    }
    void initialize();
    return () => { disposed = true; };
  }, [adopt]);

  useEffect(() => {
    document.getElementById("batch-step-title")?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) event.preventDefault(); };
    const guardLink = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (target && dirtyRef.current && !window.confirm("有未保存的修改，确定离开吗？")) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", guardLink);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardLink); };
  }, []);

  const pollingId = selected?.id;
  const pollingStatus = selected?.status;
  useEffect(() => {
    if (!pollingId || !pollingStatus || !activeStates.includes(pollingStatus)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = pollingId;
    async function refresh() {
      if (disposed) return;
      if (busyRef.current) { timer = setTimeout(refresh, 2000); return; }
      const epoch = selectionEpoch.current;
      try {
        const data = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${encodeURIComponent(id)}`);
        if (disposed || selectedRef.current?.id !== id) return;
        if (epoch !== selectionEpoch.current || busyRef.current) { timer = setTimeout(refresh, 2000); return; }
        adopt(data.schedule);
        if (activeStates.includes(data.schedule.status)) timer = setTimeout(refresh, 2000);
      } catch (cause) { if (!disposed) setError(errorMessage(cause)); }
    }
    timer = setTimeout(refresh, 2000);
    return () => { disposed = true; clearTimeout(timer); };
  }, [pollingId, pollingStatus, adopt]);

  async function perform(job: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; selectionEpoch.current += 1; setBusy(true); setError(""); setNotice("");
    try { await job(); } catch (cause) { setError(errorMessage(cause)); }
    finally { busyRef.current = false; setBusy(false); setListVersion((value) => value + 1); }
  }

  async function persist() {
    const current = selectedRef.current;
    if (!current) throw new Error("请先选择工作流并创建任务。");
    if (!dirtyRef.current) return current;
    const data = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${encodeURIComponent(current.id)}`, {
      method: "PATCH", body: JSON.stringify({ action: "save", revision: current.revision, name: current.name, definition: current.definition }),
    });
    const saved = mergeCanvasScheduleWorkbookPaths(data.schedule, current);
    adopt(saved); setDirtyState(false); setNotice("草稿已保存");
    return saved;
  }

  function edit(patch: { name?: string; definition?: CanvasScheduleV2Definition }) {
    if (!selectedRef.current || busyRef.current) return;
    const next = editBatchDraft(selectedRef.current, patch);
    selectedRef.current = next; setSelected(next); setDirtyState(true); setNotice(""); setError("");
  }

  function confirmDiscard() { return !dirtyRef.current || window.confirm("有未保存的修改，确定放弃这些修改吗？"); }

  async function startNew() {
    if (busyRef.current || !confirmDiscard()) return;
    await perform(async () => {
      const favorites = await api<CanvasScheduleListResult>("/api/canvas/schedules?view=summary&favorite=true&limit=1");
      selectedRef.current = undefined; setSelected(undefined);
      setSource(favorites.total > 0 ? "favorites" : "workflow");
      setDirtyState(false); setTab("new"); setStep(0); syncUrl();
    });
  }

  async function openSchedule(id: string) {
    if (!confirmDiscard()) return;
    await perform(async () => {
      const data = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${encodeURIComponent(id)}`);
      adopt(data.schedule); setDirtyState(false); setWorkflowId(data.schedule.workflowId); syncUrl(data.schedule);
      setStep(1); setTab(data.schedule.schemaVersion === 2 && editableStates.includes(data.schedule.status) ? "new" : "records");
    });
  }

  async function next() {
    await perform(async () => {
      if (step === 0) {
        if (!workflowId) throw new Error("请先选择一个工作流。");
        const data = await api<{ schedule: CanvasSchedule }>("/api/canvas/schedules", { method: "POST", body: JSON.stringify({ workflowId, schemaVersion: 2 }) });
        adopt(data.schedule); setDirtyState(false); syncUrl(data.schedule); setStep(1); return;
      }
      if (!selectedRef.current?.definition || !graph) throw new Error("工作流不可用，请返回重新选择。");
      const issues = batchInputIssues(selectedRef.current.definition, graph);
      if (issues.length) throw new Error(issues.join("\n"));
      if (step >= 2) {
        const issue = batchOutputIssue(selectedRef.current.definition, graph);
        if (issue) throw new Error(issue);
      }
      const saved = await persist();
      if (step >= 2) {
        const data = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${encodeURIComponent(saved.id)}`, { method: "PATCH", body: JSON.stringify({ action: "preflight", revision: saved.revision }) });
        adopt(mergeCanvasScheduleWorkbookPaths(data.schedule, saved)); setStep(3);
      } else setStep(2);
    });
  }

  async function action(actionName: string, payload: Record<string, unknown> = {}) {
    await perform(async () => {
      const current = await persist();
      if (actionName === "launch" && (!current.previewRevision || current.status !== "ready")) throw new Error("配置已变更，请重新预览。");
      if (actionName === "cancel" && !window.confirm("取消后将停止安排未开始的内容，确定取消这项任务吗？")) return;
      const data = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${encodeURIComponent(current.id)}`, { method: "PATCH", body: JSON.stringify({ action: actionName, revision: current.revision, previewRevision: current.previewRevision, ...payload }) });
      adopt(mergeCanvasScheduleWorkbookPaths(data.schedule, current)); setDirtyState(false); syncUrl(data.schedule);
      if (actionName === "duplicate") { setWorkflowId(data.schedule.workflowId); setStep(1); setTab("new"); } else if (actionName === "launch") setTab("records");
    });
  }

  async function remove() {
    if (!selected) return;
    await perform(async () => {
      const { favorite } = await api<{ favorite: CanvasScheduleFavorite | null }>(`/api/canvas/schedules/${encodeURIComponent(selected.id)}/favorite`);
      if (!window.confirm(`确定删除“${selected.name}”吗？${favorite ? "\n此任务已收藏，删除任务也会移除收藏。" : ""}`)) return;
      await api(`/api/canvas/schedules/${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      selectedRef.current = undefined; setSelected(undefined); setDirtyState(false); syncUrl();
    });
  }

  async function duplicateSaved(item: CanvasScheduleSummary) {
    await perform(async () => {
      if (dirtyRef.current) await persist();
      const data = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ action: "duplicate" }) });
      if (data.schedule.schemaVersion !== 2) { setDirtyState(false); router.push(batchCanvasHref(data.schedule.workflowId, data.schedule.id)); return; }
      adopt(data.schedule); setDirtyState(false); setWorkflowId(data.schedule.workflowId); syncUrl(data.schedule);
      setStep(1); setTab("new");
    });
  }

  const inputIssues = selected?.definition && graph ? batchInputIssues(selected.definition, graph) : [];
  return <main className="batch-page">
    <header className="batch-header"><div className="batch-brand"><Layers3 /><div><h1>批量创作</h1><p>选好流程，安排素材，一起生成。</p></div></div><nav aria-label="页面导航"><Link href="/">返回工作台</Link><Link href={workflow ? batchCanvasHref(workflow.id, selected?.id) : "/canvas"}>原批量调度 <ExternalLink /></Link></nav></header>
    <div className="batch-tabs" role="group" aria-label="工作区"><button type="button" aria-pressed={tab === "new"} disabled={busy} onClick={() => { if (selected && !editable) startNew(); else setTab("new"); }}>新建任务</button><button type="button" aria-pressed={tab === "records"} disabled={busy} onClick={() => setTab("records")}>任务记录</button></div>
    {error ? <div className="batch-error" role="alert"><strong>暂时无法完成操作</strong><p>{error}</p><div className="batch-actions">{selected ? <button type="button" disabled={busy} onClick={() => void openSchedule(selected.id)}>重新加载任务</button> : <button type="button" onClick={() => window.location.reload()}>重新加载页面</button>}{selected && editable ? <button type="button" disabled={busy} onClick={() => setStep(1)}>检查内容与素材</button> : null}<Link href="/">返回工作台登录或检查配置</Link></div></div> : null}
    {loading ? <div className="batch-loading" role="status"><LoaderCircle />正在读取工作流与任务…</div> : tab === "new" ? <>
      <nav className="batch-steps" aria-label="创建步骤">{steps.map((label, index) => <button type="button" key={label} aria-current={step === index ? "step" : undefined} disabled={busy || index > step || (index > 0 && !selected)} onClick={() => index === 0 && selected ? startNew() : setStep(index)}><span>{index < step ? <Check /> : index + 1}</span>{label}</button>)}</nav>
      <div className="batch-layout"><section className="batch-main" aria-labelledby="batch-step-title"><div className="batch-section-heading"><div><p className="batch-kicker">步骤 {step + 1} / 4</p><h2 id="batch-step-title" tabIndex={-1}>{steps[step]}</h2></div>{selected ? <button type="button" disabled={busy} onClick={() => void perform(async () => { await persist(); })}><Save />保存草稿</button> : null}</div>
        <fieldset disabled={busy} className="batch-form">
          {step === 0 ? <><div className="batch-source-tabs" role="group" aria-label="新建方式"><button type="button" aria-pressed={source === "favorites"} onClick={() => setSource("favorites")}>从收藏复用</button><button type="button" aria-pressed={source === "workflow"} onClick={() => setSource("workflow")}>从工作流新建</button></div>{source === "favorites" ? <ScheduleList favoritesOnly workflows={workflows} version={listVersion} busy={busy} onOpen={(id) => void openSchedule(id)} onDuplicate={(item) => void duplicateSaved(item)} onChange={() => setListVersion((value) => value + 1)} /> : <><label className="batch-search"><Search /><input aria-label="搜索工作流" placeholder="搜索工作流名称" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="batch-workflows">{workflows.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())).map((item) => <label className={`batch-workflow ${workflowId === item.id ? "is-selected" : ""}`} key={item.id}><input type="radio" name="workflow" value={item.id} checked={workflowId === item.id} onChange={() => { setWorkflowId(item.id); syncUrl(undefined, item.id); }} /><span><strong>{item.name}</strong><small>可填写：{Array.from(new Set(getCanvasBatchBindings(item.graph).map((binding) => binding.field.label))).join("、") || "沿用固定配置"}</small><small>可输出：{item.graph.nodes.flatMap((node) => getCanvasIterationOutputPorts(node).filter((port) => ["text", "images", "videos"].includes(port.kind)).map((port) => `${canvasNodeDisplayName(node)} · ${port.label}`)).join("、") || "尚未配置输出"}</small></span></label>)}</div>{!workflows.length ? <div className="batch-empty"><h3>先准备一个工作流</h3><p>在画布中搭建并保存处理流程，再回到这里安排批量内容。</p><Link href="/canvas">打开画布 <ArrowRight /></Link></div> : null}<p className="batch-hint">常用配置可以在任务记录中收藏，下次直接复制并替换内容。</p></>}</> : !selected || !workflow || !graph ? <p role="alert">此任务的工作流已删除或无权访问，请返回第一步。</p> : selected.schemaVersion !== 2 ? <p>这是一项旧版调度。<Link href={batchCanvasHref(selected.workflowId, selected.id)}>在原模块打开</Link></p> : <>
            <label className="batch-task-name"><span>任务名称</span><input maxLength={100} value={selected.name} onChange={(event) => edit({ name: event.target.value })} /></label>
            {step === 1 || step === 2 ? <DefinitionEditor schedule={selected} graph={graph} stage={step === 1 ? "inputs" : "generation"} busy={busy} onChange={(definition) => edit({ definition })} onPreview={setPreview} /> : <><div className="batch-preview-heading"><h3>{selected.totalMainTasks ?? 0} 组内容，共 {selected.totalChildTasks ?? 0} 个结果</h3><p>以下数量与分配来自实际预览。检查后再开始生成。</p></div>{selected.error ? <p role="alert">{selected.error}</p> : null}<ScheduleV2Preview schedule={selected} onPreview={setPreview} /></>}
          </>}
        </fieldset>
        {step > 0 || source === "workflow" ? <footer className="batch-footer"><div><span role="status">{busy ? "正在处理…" : dirty ? "有未保存的修改" : notice || (selected ? "已保存" : "选择已保存的工作流")}</span></div><div className="batch-actions">{step > 0 ? <button type="button" disabled={busy} onClick={() => step === 1 ? startNew() : setStep(step - 1)}><ArrowLeft />上一步</button> : null}{step === 3 ? <><button type="button" disabled={busy} onClick={() => void next()}><RefreshCw />重新预览</button><button className="batch-primary" type="button" disabled={busy || dirty || selected?.status !== "ready" || !selected.previewRevision} onClick={() => void action("launch")}><Play />开始生成</button></> : <button className="batch-primary" type="button" disabled={busy || (step === 0 ? source !== "workflow" || !workflowId : !editable || !workflow)} onClick={() => void next()}>{busy ? <LoaderCircle /> : null}{step === 2 ? "预览生成内容" : "下一步"}<ArrowRight /></button>}</div></footer> : null}
      </section><aside className="batch-summary"><details ref={summaryRef}><summary>本次任务</summary><dl><dt>工作流</dt><dd>{workflow?.name || "尚未选择"}</dd><dt>内容与素材</dt><dd>{selected?.definition?.parameters.length ?? 0} 项</dd><dt>实际生成数量</dt><dd>{selected?.previewRevision ? `${selected.totalMainTasks} 组 / ${selected.totalChildTasks} 个结果` : "预览后确认"}</dd></dl>{inputIssues.length ? <p>{inputIssues.length} 项内容需要补充</p> : null}{selected?.definition?.parameters.map((item) => <p key={item.id}><strong>{item.name}</strong><br />{item.scope === "main" ? "每组内容" : "组内结果"} · {({ fixed: "固定使用", each: "逐项生成", random: "随机选取" })[item.expansion]}</p>)}{workflow ? <Link href={batchCanvasHref(workflow.id)}>去画布编辑工作流 <ExternalLink /></Link> : null}<p className="batch-hint">配置只影响本次任务。生成前可以返回任一步修改。</p></details></aside></div>
    </> : <div className="batch-record-layout"><aside className="batch-records"><div className="batch-actions"><h2>任务记录</h2><button type="button" disabled={busy} onClick={startNew}><Plus />新建</button></div><ScheduleList workflows={workflows} version={listVersion} selectedId={selected?.id} busy={busy} onOpen={(id) => void openSchedule(id)} onDuplicate={(item) => void duplicateSaved(item)} onChange={() => setListVersion((value) => value + 1)} /></aside>
      <section className="batch-main">{selected ? <><div className="batch-section-heading"><div><p className="batch-kicker">{canvasScheduleStatusLabel(selected.status)}</p><h2>{selected.name}</h2></div><button type="button" disabled={busy} onClick={() => void openSchedule(selected.id)}><RefreshCw />刷新</button></div><ScheduleFavoriteControl key={selected.id} scheduleId={selected.id} disabled={busy} onChange={() => setListVersion((value) => value + 1)} /><div className="batch-actions"><Link href={batchCanvasHref(selected.workflowId, selected.id)}>在原调度打开 <ExternalLink /></Link>{selected.schemaVersion === 2 ? <button type="button" disabled={busy || !workflow} onClick={() => void action("duplicate")}>复制为新任务</button> : null}{!activeStates.includes(selected.status) ? <button type="button" disabled={busy} onClick={() => void remove()}>删除任务</button> : null}{editable ? <button type="button" disabled={busy} onClick={() => { setTab("new"); setStep(1); }}>继续编辑</button> : null}</div>{selected.error ? <p className="batch-field-error">{selected.error}</p> : null}{selected.schemaVersion === 2 ? <><BatchResults schedule={selected} busy={busy} onAction={(name, payload) => void action(name, payload)} /><details className="batch-advanced"><summary>执行详情与单项重试</summary><ScheduleV2RuntimeTree schedule={selected} busy={busy} onAction={(name, payload) => void action(name, payload)} /></details></> : <p className="batch-empty">旧版任务保留在原调度模块中，可从上方入口查看和操作。</p>}</> : <p className="batch-empty">选择一项任务，查看进度和生成结果。</p>}</section>
    </div>}
    {preview ? <div className="batch-image-overlay" role="dialog" aria-modal="true" aria-label="素材预览" onKeyDown={(event) => { if (event.key === "Escape") setPreview(null); }}><button type="button" autoFocus aria-label="关闭预览" onClick={() => setPreview(null)}><X /></button>{preview.kind === "image" ? <Image src={preview.url} alt="所选素材" width={1200} height={900} unoptimized /> : null}</div> : null}
  </main>;
}

function BatchResults({ schedule, busy, onAction }: { schedule: CanvasSchedule; busy: boolean; onAction: (action: string, payload?: Record<string, unknown>) => void }) {
  const tasks = schedule.mainTasks || [];
  const failed = tasks.some((task) => task.sharedStatus === "failed" || task.childTasks.some((child) => child.status === "failed" || child.retryable));
  return <div className="batch-results"><div className="batch-actions">{["queued", "running"].includes(schedule.status) ? <button type="button" disabled={busy} onClick={() => onAction("pause")}>暂停生成</button> : null}{schedule.status === "paused" ? <button type="button" disabled={busy} onClick={() => onAction("resume")}>继续生成</button> : null}{activeStates.includes(schedule.status) ? <button type="button" disabled={busy} onClick={() => onAction("cancel")}>取消任务</button> : null}{failed ? <button type="button" disabled={busy} onClick={() => onAction("retry-all")}>重试失败项</button> : null}</div><p role="status">{tasks.filter((task) => ["completed", "partial"].includes(task.status)).length} / {tasks.length} 组内容已完成</p>
    {tasks.map((task, index) => <section className="batch-result-group" key={task.id}><header><h3>{task.workbookRow?.title || `第 ${index + 1} 组内容`}</h3><span>{canvasScheduleStatusLabel(task.status)}</span></header>{task.error || task.sharedError ? <p className="batch-field-error">{task.error || task.sharedError}</p> : null}<ArtifactPreview artifacts={task.resultArtifacts} />{task.childTasks.map((child, childIndex) => <div className="batch-result" key={child.id}><h4>结果 {childIndex + 1} · {canvasScheduleStatusLabel(child.status)}</h4><ArtifactPreview artifacts={child.resultArtifacts} />{child.error ? <p className="batch-field-error">{child.error}</p> : null}{child.status === "failed" || child.retryable ? <button type="button" disabled={busy} onClick={() => onAction("retry", { mainTaskId: task.id, childTaskId: child.id })}>重试此结果</button> : null}</div>)}<div className="batch-actions">{task.generatedPostId ? <Link href={`/review?postId=${encodeURIComponent(task.generatedPostId)}`}>查看审核草稿</Link> : null}{["completed", "partial"].includes(task.status) && task.mainRunId ? <CanvasScheduleMainImageDownload runId={task.mainRunId} /> : null}{task.pendingCandidateSync ? <button type="button" disabled={busy} onClick={() => onAction("accept-candidates", { mainTaskId: task.id })}>接受新增候选</button> : null}{task.sharedStatus === "failed" ? <button type="button" disabled={busy} onClick={() => onAction("retry-shared", { mainTaskId: task.id })}>重试共用处理</button> : null}</div></section>)}
  </div>;
}

function ArtifactPreview({ artifacts }: { artifacts: CanvasArtifact[] }) {
  return <div className="batch-artifacts">{artifacts.map((artifact, index) => artifact.kind === "text" ? <p key={index}>{artifact.value}</p> : artifact.kind === "images" ? <div className="batch-result-images" key={index}>{artifact.items.map((item, i) => <a href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${i}`} aria-label={`查看图片 ${i + 1}`}><Image src={item.url} alt={`生成图片 ${i + 1}`} width={400} height={400} unoptimized /></a>)}</div> : artifact.kind === "videos" ? <div key={index}>{artifact.items.map((item, i) => <video key={`${item.url}-${i}`} controls preload="metadata" src={item.url} />)}</div> : artifact.kind === "socialPost" ? <div key={index}><h4>{artifact.post.title}</h4><p>{artifact.post.body}</p></div> : null)}</div>;
}
