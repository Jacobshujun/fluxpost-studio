"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, ExternalLink, Loader2, RefreshCw, Save, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { defaultDistributionCheckPrompt } from "@/lib/distribution-check-prompt";
import type { DistributionCheckResponse } from "@/lib/distribution-check";
import type { WorkspacePromptSettings } from "@/lib/types";

type BusyState = "run" | "settings" | null;

const samplePlaceholder = "每行一个编号，也可以用逗号、空格或分号分隔";

export default function DistributionCheckPage() {
  const [numbersText, setNumbersText] = useState("");
  const [busy, setBusy] = useState<BusyState>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<DistributionCheckResponse | null>(null);
  const [prompt, setPrompt] = useState(defaultDistributionCheckPrompt);
  const numbers = useMemo(() => splitNumbers(numbersText), [numbersText]);

  useEffect(() => {
    let alive = true;
    async function loadSettings() {
      try {
        const res = await fetch("/api/workspace/settings");
        const data = (await res.json()) as { settings?: WorkspacePromptSettings };
        if (alive && data.settings?.distributionCheckPrompt) setPrompt(data.settings.distributionCheckPrompt);
      } catch {
        // The run action will surface auth/config errors; keep the default prompt visible meanwhile.
      }
    }
    void loadSettings();
    return () => {
      alive = false;
    };
  }, []);

  async function runCheck() {
    if (!numbers.length) {
      setMessage("请先输入至少一个编号");
      return;
    }
    setBusy("run");
    setMessage("");
    setResult(null);
    try {
      const res = await fetch("/api/distribution-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers, prompt }),
      });
      const data = (await res.json()) as DistributionCheckResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "分发审核失败");
      setResult(data);
      setMessage(`已处理 ${data.total} 条，更新 ${data.updated} 条，可分发 ${data.distributable} 条，不可分发 ${data.blocked} 条。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分发审核失败");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setNumbersText("");
    setMessage("");
    setResult(null);
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
              <p className="truncate text-xs text-[var(--text-muted)]">批量编号自动判断，并回写飞书「是否分发」</p>
            </div>
          </div>
          <Link className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" href="/">
            <ExternalLink className="h-4 w-4" />
            返回工作台
          </Link>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.18fr)]">
          <section className="glass ops-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="header-eyebrow">Input</p>
                <h2 className="text-base font-black">批量编号</h2>
              </div>
              <span className="status-badge text-[11px] text-[var(--text-muted)]">{numbers.length} 条</span>
            </div>
            <textarea
              className="field mt-4 min-h-[360px] resize-y leading-6"
              value={numbersText}
              onChange={(event) => setNumbersText(event.target.value)}
              placeholder={samplePlaceholder}
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button className="primary-button inline-flex h-11 items-center justify-center gap-2 text-xs font-black" type="button" onClick={runCheck} disabled={busy === "run" || !numbers.length}>
                {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                开始判断并回写
              </button>
              <button className="soft-button inline-flex h-11 items-center justify-center gap-2 text-xs font-black" type="button" onClick={reset} disabled={busy === "run"}>
                <RefreshCw className="h-4 w-4" />
                清空
              </button>
            </div>
            {message ? <div className="approval-banner mt-4">{message}</div> : null}
          </section>

          <section className="glass-strong ops-panel min-h-[520px]">
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
              <textarea
                className="field mt-3 min-h-[160px] resize-y leading-6"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={Boolean(busy)}
              />
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="header-eyebrow">Result</p>
                <h2 className="text-base font-black">回写结果</h2>
              </div>
              {result ? (
                <div className="flex flex-wrap gap-1.5">
                  <Metric label="更新" value={result.updated} />
                  <Metric label="可分发" value={result.distributable} />
                  <Metric label="不可分发" value={result.blocked} />
                  <Metric label="失败" value={result.failed} />
                </div>
              ) : null}
            </div>

            {result?.results.length ? (
              <div className="mt-4 overflow-x-auto thin-scrollbar">
                <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">编号</th>
                      <th className="px-3 py-2">是否分发</th>
                      <th className="px-3 py-2">标题 / 车型</th>
                      <th className="px-3 py-2">原因</th>
                      <th className="px-3 py-2">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((item) => (
                      <tr key={`${item.number}-${item.recordId || item.error || "missing"}`} className="bg-white/[0.035] align-top">
                        <td className="rounded-l-[8px] px-3 py-3 font-black">{item.number}</td>
                        <td className="px-3 py-3">
                          <DistributionBadge value={item.distribution} />
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
              <div className="empty-state min-h-[420px]">
                <ShieldAlert className="h-6 w-6" />
                <span>输入编号后开始自动审核</span>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="status-badge text-[11px] text-[var(--text-muted)]">
      {label} {value}
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
  return <span className="status-badge text-[11px] text-[var(--text-muted)]">未更新</span>;
}

function StatusBadge({ status }: { status: "updated" | "not_found" | "failed" }) {
  const label = status === "updated" ? "已回写" : status === "not_found" ? "未找到" : "失败";
  const tone = status === "updated" ? "text-[var(--mint)]" : status === "not_found" ? "text-[var(--amber)]" : "text-[var(--rose)]";
  return <span className={`status-badge text-[11px] ${tone}`}>{label}</span>;
}

function splitNumbers(value: string) {
  return Array.from(new Set(value.split(/[\r\n,，;；\t ]+/).map((item) => item.trim()).filter(Boolean))).slice(0, 200);
}
