"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, ExternalLink, Loader2, RefreshCw, Save, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { defaultDistributionCheckPrompt } from "@/lib/distribution-check-prompt";
import type { DistributionCheckJob, DistributionCheckResponse, WorkspacePromptSettings } from "@/lib/types";

type BusyState = "run" | "settings" | "refresh" | null;

const samplePlaceholder = "每行一个编号，也可以用逗号、空格或分号分隔";

export default function DistributionCheckPage() {
  const [numbersText, setNumbersText] = useState("");
  const [busy, setBusy] = useState<BusyState>(null);
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<DistributionCheckJob | null>(null);
  const [jobs, setJobs] = useState<DistributionCheckJob[]>([]);
  const [prompt, setPrompt] = useState(defaultDistributionCheckPrompt);
  const numbers = useMemo(() => splitNumbers(numbersText), [numbersText]);
  const running = job?.status === "queued" || job?.status === "running";

  const loadJob = useCallback(async (jobId: string, alive = true) => {
    const res = await fetch(`/api/distribution-check?jobId=${encodeURIComponent(jobId)}`);
    const data = (await res.json()) as { job?: DistributionCheckJob; error?: string };
    if (!res.ok || !data.job) throw new Error(data.error || "审核任务读取失败");
    if (!alive) return;
    setJob(data.job);
    setJobs((current) => [data.job!, ...current.filter((item) => item.id !== data.job!.id)].slice(0, 30));
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadInitialState() {
      try {
        const [settingsRes, jobsRes] = await Promise.all([fetch("/api/workspace/settings"), fetch("/api/distribution-check")]);
        const settingsData = (await settingsRes.json()) as { settings?: WorkspacePromptSettings };
        const jobsData = (await jobsRes.json()) as { jobs?: DistributionCheckJob[] };
        if (!alive) return;
        if (settingsData.settings?.distributionCheckPrompt) setPrompt(settingsData.settings.distributionCheckPrompt);
        const latestJobs = jobsData.jobs || [];
        setJobs(latestJobs);
        setJob(latestJobs[0] || null);
      } catch {
        // The run action will surface auth/config errors; keep the default prompt visible meanwhile.
      }
    }
    void loadInitialState();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!running || !job?.id) return;
    let alive = true;
    const timer = setInterval(() => {
      void loadJob(job.id, alive);
    }, 2500);
    const initialTimer = setTimeout(() => {
      void loadJob(job.id, alive);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [job?.id, loadJob, running]);

  async function refreshJobs() {
    setBusy("refresh");
    setMessage("");
    try {
      const res = await fetch("/api/distribution-check");
      const data = (await res.json()) as { jobs?: DistributionCheckJob[]; error?: string };
      if (!res.ok) throw new Error(data.error || "任务列表刷新失败");
      const latestJobs = data.jobs || [];
      setJobs(latestJobs);
      if (latestJobs.length && (!job || !latestJobs.some((item) => item.id === job.id))) setJob(latestJobs[0]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "任务列表刷新失败");
    } finally {
      setBusy(null);
    }
  }

  async function runCheck() {
    if (!numbers.length) {
      setMessage("请先输入至少一个编号");
      return;
    }
    setBusy("run");
    setMessage("");
    try {
      const res = await fetch("/api/distribution-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers, prompt }),
      });
      const data = (await res.json()) as { job?: DistributionCheckJob; error?: string };
      if (!res.ok || !data.job) throw new Error(data.error || "分发审核入队失败");
      setJob(data.job);
      setJobs((current) => [data.job!, ...current.filter((item) => item.id !== data.job!.id)].slice(0, 30));
      setMessage(`审核任务已入队：${data.job.total} 条编号，后台会持续回写飞书。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分发审核入队失败");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setNumbersText("");
    setMessage("");
  }

  async function savePrompt(nextPrompt = prompt) {
    setBusy("settings");
    setMessage("");
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distributionCheckPrompt: nextPrompt }),
      });
      const data = (await res.json()) as { settings?: WorkspacePromptSettings; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error || "审核提示词保存失败");
      setPrompt(data.settings.distributionCheckPrompt);
      setMessage("审核提示词已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "审核提示词保存失败");
    } finally {
      setBusy(null);
    }
  }

  function restoreDefaultPrompt() {
    setPrompt(defaultDistributionCheckPrompt);
    void savePrompt(defaultDistributionCheckPrompt);
  }

  const progress = job ? Math.round((job.processed / Math.max(job.total, 1)) * 100) : 0;

  return (
    <main className="app-shell overflow-x-hidden">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 text-sm">
        <header className="glass-strong ops-panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark grid h-12 w-12 shrink-0 place-items-center rounded-[8px]">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="header-eyebrow">Feishu distribution check</p>
              <h1 className="truncate text-xl font-black sm:text-2xl">是否分发审核</h1>
              <p className="truncate text-xs text-[var(--text-muted)]">持久化队列处理大批量编号，并回写飞书「是否分发」</p>
            </div>
          </div>
          <Link className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" href="/">
            <ExternalLink className="h-4 w-4" />
            返回工作台
          </Link>
        </header>

        <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.78fr)_minmax(0,1.22fr)]">
          <section className="flex flex-col gap-4">
            <section className="glass ops-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="header-eyebrow">Input</p>
                  <h2 className="text-base font-black">批量编号</h2>
                </div>
                <span className="status-badge text-[11px] text-[var(--text-muted)]">{numbers.length} 条</span>
              </div>
              <textarea
                className="field mt-4 min-h-[300px] resize-y leading-6"
                value={numbersText}
                onChange={(event) => setNumbersText(event.target.value)}
                placeholder={samplePlaceholder}
              />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button className="primary-button inline-flex h-11 items-center justify-center gap-2 text-xs font-black" type="button" onClick={runCheck} disabled={busy === "run" || !numbers.length}>
                  {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  提交审核队列
                </button>
                <button className="soft-button inline-flex h-11 items-center justify-center gap-2 text-xs font-black" type="button" onClick={reset} disabled={busy === "run"}>
                  <RefreshCw className="h-4 w-4" />
                  清空
                </button>
              </div>
              {message ? <div className="approval-banner mt-4">{message}</div> : null}
            </section>

            <section className="glass ops-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="header-eyebrow">Jobs</p>
                  <h2 className="text-base font-black">最近审核任务</h2>
                </div>
                <button className="icon-button" type="button" onClick={refreshJobs} disabled={busy === "refresh"} title="刷新任务">
                  {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-3 flex max-h-[320px] flex-col gap-2 overflow-y-auto thin-scrollbar">
                {jobs.length ? (
                  jobs.map((item) => (
                    <button
                      key={item.id}
                      className={`soft-button flex min-h-14 items-center justify-between gap-3 px-3 text-left text-xs ${job?.id === item.id ? "ring-1 ring-[var(--accent)]" : ""}`}
                      type="button"
                      onClick={() => setJob(item)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-black">{item.id}</span>
                        <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
                          {item.processed}/{item.total} · 更新 {item.updated} · 失败 {item.failed}
                        </span>
                      </span>
                      <QueueStatusBadge status={item.status} />
                    </button>
                  ))
                ) : (
                  <div className="empty-state min-h-[160px]">
                    <ShieldAlert className="h-6 w-6" />
                    <span>暂无审核任务</span>
                  </div>
                )}
              </div>
            </section>
          </section>

          <section className="glass-strong ops-panel min-h-[640px]">
            <div className="mb-4 rounded-[8px] border border-white/10 bg-white/[0.025] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="header-eyebrow">Prompt</p>
                  <h2 className="text-base font-black">审核提示词</h2>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button className="soft-button inline-flex h-9 items-center justify-center gap-2 px-3 text-xs font-black" type="button" onClick={restoreDefaultPrompt} disabled={Boolean(busy)}>
                    <RefreshCw className="h-4 w-4" />
                    恢复默认
                  </button>
                  <button className="primary-button inline-flex h-9 items-center justify-center gap-2 px-3 text-xs font-black" type="button" onClick={() => savePrompt()} disabled={Boolean(busy) || !prompt.trim()}>
                    {busy === "settings" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    保存提示词
                  </button>
                </div>
              </div>
              <textarea className="field mt-3 min-h-[140px] resize-y leading-6" value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={Boolean(busy)} />
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="header-eyebrow">Progress</p>
                <h2 className="text-base font-black">{job ? "审核进度" : "回写结果"}</h2>
              </div>
              {job ? (
                <div className="flex flex-wrap gap-1.5">
                  <Metric label="处理" value={job.processed} suffix={`/${job.total}`} />
                  <Metric label="更新" value={job.updated} />
                  <Metric label="可分发" value={job.distributable} />
                  <Metric label="不可分发" value={job.blocked} />
                  <Metric label="失败" value={job.failed} />
                  <Metric label="均分" value={averageScore(job) ?? 0} />
                </div>
              ) : null}
            </div>

            {job ? (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-muted)]">
                  <span>{job.status === "running" || job.status === "queued" ? "进行中" : "已结束"}</span>
                  <span>{progress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}

            {job?.results.length ? (
              <div className="mt-4 overflow-x-auto thin-scrollbar">
                <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-left text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">编号</th>
                      <th className="px-3 py-2">是否分发</th>
                      <th className="px-3 py-2">评分</th>
                      <th className="px-3 py-2">标题 / 车型</th>
                      <th className="px-3 py-2">原因</th>
                      <th className="px-3 py-2">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.results.map((item) => (
                      <tr key={`${item.number}-${item.recordId || item.error || "missing"}`} className="bg-white/[0.035] align-top">
                        <td className="rounded-l-[8px] px-3 py-3 font-black">{item.number}</td>
                        <td className="px-3 py-3">
                          <DistributionBadge value={item.distribution} />
                        </td>
                        <td className="px-3 py-3">
                          <ScoreBadge score={item.score} />
                        </td>
                        <td className="max-w-[220px] px-3 py-3">
                          <p className="line-clamp-2 font-semibold">{item.title || "未读取到标题"}</p>
                          {item.vehicle ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">{item.vehicle}</p> : null}
                        </td>
                        <td className="max-w-[340px] px-3 py-3">
                          {item.riskTags?.length ? (
                            <div className="mb-1 flex flex-wrap gap-1">
                              {item.riskTags.map((tag) => (
                                <span key={tag} className="status-badge text-[10px] text-[var(--amber)]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <p className="line-clamp-3 leading-5 text-[var(--text-muted)]">{item.error || item.reasons?.join("；") || "已完成"}</p>
                          {item.score?.dimensions.length ? (
                            <p className="mt-1 line-clamp-2 text-[11px] text-[var(--text-muted)]">
                              {item.score.dimensions.map((dimension) => `${dimension.name} ${dimension.score}/${dimension.max}`).join(" · ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="rounded-r-[8px] px-3 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state min-h-[360px]">
                {running ? <Loader2 className="h-6 w-6 animate-spin" /> : <ShieldAlert className="h-6 w-6" />}
                <span>{job ? "任务已创建，等待第一批结果" : "输入编号后提交审核队列"}</span>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <span className="status-badge text-[11px] text-[var(--text-muted)]">
      {label} {value}
      {suffix}
    </span>
  );
}

function DistributionBadge({ value }: { value?: string }) {
  if (value === "可分发") {
    return (
      <span className="status-badge text-[11px] text-[var(--mint)]">
        <Check className="h-3.5 w-3.5" />
        可分发
      </span>
    );
  }
  if (value === "不可分发") {
    return (
      <span className="status-badge text-[11px] text-[var(--rose)]">
        <X className="h-3.5 w-3.5" />
        不可分发
      </span>
    );
  }
  return <span className="status-badge text-[11px] text-[var(--text-muted)]">未回写</span>;
}

function ScoreBadge({ score }: { score?: DistributionCheckResponse["results"][number]["score"] }) {
  if (!score) return <span className="status-badge text-[11px] text-[var(--text-muted)]">未评分</span>;
  const tone = score.total >= 85 ? "text-[var(--mint)]" : score.total >= score.threshold ? "text-[var(--amber)]" : "text-[var(--rose)]";
  return (
    <span className={`status-badge text-[11px] ${tone}`} title={score.dimensions.map((dimension) => `${dimension.name}: ${dimension.reason}`).join("\n")}>
      {score.total}/100 · {score.prediction}
    </span>
  );
}

function StatusBadge({ status }: { status: DistributionCheckResponse["results"][number]["status"] }) {
  if (status === "updated") return <span className="status-badge text-[11px] text-[var(--mint)]">已回写</span>;
  if (status === "not_found") return <span className="status-badge text-[11px] text-[var(--amber)]">未找到</span>;
  return <span className="status-badge text-[11px] text-[var(--rose)]">失败</span>;
}

function QueueStatusBadge({ status }: { status: DistributionCheckJob["status"] }) {
  const tone =
    status === "completed"
      ? "text-[var(--mint)]"
      : status === "partial" || status === "queued" || status === "running"
        ? "text-[var(--amber)]"
        : "text-[var(--rose)]";
  const label =
    status === "completed"
      ? "完成"
      : status === "partial"
        ? "部分完成"
        : status === "running"
          ? "运行中"
          : status === "queued"
            ? "排队"
            : "失败";
  return <span className={`status-badge shrink-0 text-[11px] ${tone}`}>{label}</span>;
}

function splitNumbers(value: string) {
  return Array.from(new Set(value.split(/[\r\n,，;；\t ]+/).map((item) => item.trim()).filter(Boolean)));
}

function averageScore(result: DistributionCheckResponse) {
  const scores = result.results.map((item) => item.score?.total).filter((value): value is number => typeof value === "number");
  if (!scores.length) return undefined;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}
