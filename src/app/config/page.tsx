"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Cloud,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  ShieldCheck,
  SlidersHorizontal,
  TestTube2,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { getStoredTheme, setStoredTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";
import type {
  AdvancedConfigField,
  AdvancedConfigPatchValue,
  AdvancedConfigSnapshot,
  ConfigStatus,
  ContentSafetyPolicy,
  GeneratedMediaRepairBatchResult,
  ImageProviderProbeResult,
  ImageTransportHealth,
  SourceSafetyAssessment,
  TosStorageProbeResult,
  WorkspaceAccount,
} from "@/lib/types";

type AccountSessionResponse = {
  account?: WorkspaceAccount | null;
  error?: string;
};

type ConfigResponse = {
  status?: ConfigStatus;
  advanced?: AdvancedConfigSnapshot;
  error?: string;
};

type ImageTransportHealthResponse = {
  health?: ImageTransportHealth;
  error?: string;
};

type PolicyResponse = {
  policy?: ContentSafetyPolicy;
  error?: string;
};

type PolicyTestResponse = PolicyResponse & {
  localAssessment?: SourceSafetyAssessment;
  assessment?: SourceSafetyAssessment;
};

type PolicySample = {
  title: string;
  contentText: string;
  authorName: string;
};

type DraftField = {
  value: string;
  dirty: boolean;
  clear: boolean;
};

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: "professional", label: "专业浅色" },
  { value: "editorial", label: "编辑室" },
  { value: "creator", label: "创作深色" },
];

export default function AdvancedConfigPage() {
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, () => "professional" as ThemeMode);
  const [account, setAccount] = useState<WorkspaceAccount | null>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [snapshot, setSnapshot] = useState<AdvancedConfigSnapshot | null>(null);
  const [policy, setPolicy] = useState<ContentSafetyPolicy | null>(null);
  const [policyDraft, setPolicyDraft] = useState<ContentSafetyPolicy | null>(null);
  const [policySample, setPolicySample] = useState<PolicySample>({ title: "", contentText: "", authorName: "" });
  const [policyTestResult, setPolicyTestResult] = useState<PolicyTestResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftField>>({});
  const [activeGroupId, setActiveGroupId] = useState("");
  const [message, setMessage] = useState("");
  const [imageTransportHealth, setImageTransportHealth] = useState<ImageTransportHealth | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | "policy-save" | "policy-reset" | "policy-local-test" | "policy-model-test" | "tos-check" | "tos-reconcile" | "media-scan" | "media-repair" | "image-transport-check" | "image-primary-check" | "image-backup-check" | null>("load");

  const fieldsByKey = useMemo(() => {
    const map = new Map<string, AdvancedConfigField>();
    for (const group of snapshot?.groups || []) {
      for (const field of group.fields) map.set(field.key, field);
    }
    return map;
  }, [snapshot]);

  const activeGroup = useMemo(
    () => snapshot?.groups.find((group) => group.id === activeGroupId) || snapshot?.groups[0] || null,
    [activeGroupId, snapshot],
  );

  const dirtyCount = useMemo(() => Object.values(draft).filter((field) => field.dirty || field.clear).length, [draft]);
  const policyDirty = useMemo(
    () => Boolean(policy && policyDraft && JSON.stringify(policy) !== JSON.stringify(policyDraft)),
    [policy, policyDraft],
  );
  const thresholdError = policyDraft ? policyThresholdError(policyDraft) : "";

  const applySnapshot = useCallback((nextSnapshot: AdvancedConfigSnapshot, nextStatus: ConfigStatus) => {
    setSnapshot(nextSnapshot);
    setConfig(nextStatus);
    setActiveGroupId((current) => current || nextSnapshot.groups[0]?.id || "");
    setDraft(
      nextSnapshot.groups.reduce<Record<string, DraftField>>((result, group) => {
        for (const field of group.fields) {
          result[field.key] = {
            value: field.kind === "secret" ? "" : field.value || "",
            dirty: false,
            clear: false,
          };
        }
        return result;
      }, {}),
    );
  }, []);

  const loadPage = useCallback(async () => {
    setBusy("load");
    setMessage("");
    try {
      const sessionRes = await fetch("/api/accounts/session");
      const sessionData = (await sessionRes.json()) as AccountSessionResponse;
      if (!sessionRes.ok || !sessionData.account) throw new Error(sessionData.error || "请先登录工作区账号。");
      setAccount(sessionData.account);
      const policyRes = await fetch("/api/content-safety-policy");
      const policyData = (await policyRes.json()) as PolicyResponse;
      if (!policyRes.ok || !policyData.policy) throw new Error(policyData.error || "内容安全策略读取失败。");
      setPolicy(policyData.policy);
      setPolicyDraft(policyData.policy);
      if (sessionData.account.role !== "admin") {
        setActiveGroupId("content-safety");
        setMessage("当前账号不是管理员，无法查看或修改高级配置。");
        return;
      }

      const configRes = await fetch("/api/config?advanced=1");
      const configData = (await configRes.json()) as ConfigResponse;
      if (!configRes.ok || !configData.advanced || !configData.status) throw new Error(configData.error || "高级配置读取失败");
      applySnapshot(configData.advanced, configData.status);
      const healthRes = await fetch("/api/config/image-transport-health");
      const healthData = (await healthRes.json()) as ImageTransportHealthResponse;
      setImageTransportHealth(healthData.health || null);
      setMessage("高级配置已加载。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "高级配置读取失败");
    } finally {
      setBusy(null);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void Promise.resolve().then(loadPage);
  }, [loadPage]);

  async function savePolicy() {
    if (!policy || !policyDraft || busy || !policyDirty || account?.role !== "admin") return;
    const validationError = policyThresholdError(policyDraft);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    setBusy("policy-save");
    setMessage("");
    try {
      const res = await fetch("/api/content-safety-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: policyDraft, expectedRevision: policy.revision }),
      });
      const data = (await res.json()) as PolicyResponse;
      if (!res.ok || !data.policy) throw new Error(data.error || "内容安全策略保存失败。");
      setPolicy(data.policy);
      setPolicyDraft(data.policy);
      setPolicyTestResult(null);
      setMessage("策略已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "内容安全策略保存失败。");
    } finally {
      setBusy(null);
    }
  }

  async function resetPolicy() {
    if (!policy || busy || account?.role !== "admin") return;
    if (!window.confirm("将工作区内容安全策略重置为系统默认值，是否继续？")) return;
    setBusy("policy-reset");
    setMessage("");
    try {
      const res = await fetch("/api/content-safety-policy/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: policy.revision }),
      });
      const data = (await res.json()) as PolicyResponse;
      if (!res.ok || !data.policy) throw new Error(data.error || "内容安全策略重置失败。");
      setPolicy(data.policy);
      setPolicyDraft(data.policy);
      setPolicyTestResult(null);
      setMessage("策略已重置为系统默认值。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "内容安全策略重置失败。");
    } finally {
      setBusy(null);
    }
  }

  async function testPolicy(runModel: boolean) {
    if (!policyDraft || busy || account?.role !== "admin") return;
    const validationError = policyThresholdError(policyDraft);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    if (runModel && !window.confirm("将使用当前草稿和样例执行一次付费模型审核，是否继续？")) return;
    setBusy(runModel ? "policy-model-test" : "policy-local-test");
    setMessage("");
    setPolicyTestResult(null);
    try {
      const res = await fetch("/api/content-safety-policy/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: policyDraft, sample: policySample, runModel }),
      });
      const data = (await res.json()) as PolicyTestResponse;
      if (!res.ok || !data.localAssessment || !data.assessment) throw new Error(data.error || "内容安全策略测试失败。");
      setPolicyTestResult(data);
      setMessage(runModel ? policyModelTestMessage(data.assessment) : "本地测试已完成。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "内容安全策略测试失败。");
    } finally {
      setBusy(null);
    }
  }

  function updateField(field: AdvancedConfigField, value: string | boolean) {
    setDraft((current) => ({
      ...current,
      [field.key]: {
        value: typeof value === "boolean" ? String(value) : value,
        dirty: true,
        clear: false,
      },
    }));
  }

  function toggleClearSecret(field: AdvancedConfigField, clear: boolean) {
    setDraft((current) => ({
      ...current,
      [field.key]: {
        value: "",
        dirty: false,
        clear,
      },
    }));
  }

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    if (!snapshot || busy || !dirtyCount) return;
    setBusy("save");
    setMessage("");
    try {
      const values: Record<string, AdvancedConfigPatchValue> = {};
      for (const [key, state] of Object.entries(draft)) {
        const field = fieldsByKey.get(key);
        if (!field) continue;
        if (state.clear) {
          values[key] = null;
        } else if (state.dirty) {
          values[key] = field.kind === "boolean" ? state.value === "true" : state.value;
        }
      }

      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const data = (await res.json()) as ConfigResponse;
      if (!res.ok || !data.advanced || !data.status) throw new Error(data.error || "高级配置保存失败");
      applySnapshot(data.advanced, data.status);
      setMessage("高级配置已保存到 .env.local；当前服务内的配置状态已刷新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "高级配置保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function testTosStorage() {
    setBusy("tos-check");
    setMessage("");
    try {
      const res = await fetch("/api/config/tos-check", { method: "POST" });
      const data = (await res.json()) as Partial<TosStorageProbeResult> & { error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "TOS 连接测试失败");
      setMessage("TOS 上传、公共读取、视频 Range 和清理检查通过。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "TOS 连接测试失败");
    } finally {
      setBusy(null);
    }
  }

  async function reconcileTosStorage() {
    setBusy("tos-reconcile");
    setMessage("");
    try {
      const res = await fetch("/api/config/tos-reconcile", { method: "POST" });
      const data = (await res.json()) as { uploaded?: number; failed?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "TOS 暂存重试失败");
      setMessage(`TOS 暂存重试完成：上传 ${data.uploaded || 0} 个，失败 ${data.failed || 0} 个。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "TOS 暂存重试失败");
    } finally {
      setBusy(null);
    }
  }

  async function runHistoricalMediaRepair(mode: "scan" | "apply") {
    if (mode === "apply" && !window.confirm("确认分批修复全部可精确匹配的历史草稿图片？无法确认映射的图片不会被修改。")) return;
    setBusy(mode === "scan" ? "media-scan" : "media-repair");
    setMessage("");
    try {
      let cursor: string | undefined;
      let scannedCount = 0;
      let candidatePostCount = 0;
      let candidateImageCount = 0;
      let repairedPostCount = 0;
      let repairedImageCount = 0;
      let failureCount = 0;
      do {
        const previousCursor = cursor;
        const res = await fetch("/api/config/media-repair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, cursor, limit: 25 }),
        });
        const data = (await res.json()) as GeneratedMediaRepairBatchResult & { error?: string };
        if (!res.ok) throw new Error(data.error || "历史媒体处理失败");
        scannedCount += data.scannedCount;
        candidatePostCount += data.candidatePostCount;
        candidateImageCount += data.candidateImageCount;
        repairedPostCount += data.repairedPostCount;
        repairedImageCount += data.repairedImageCount;
        failureCount += data.failures.length;
        cursor = data.nextCursor;
        if (cursor && cursor === previousCursor) throw new Error("历史媒体处理游标未推进");
      } while (cursor);

      setMessage(
        mode === "scan"
          ? `历史媒体扫描完成：检查 ${scannedCount} 条草稿，发现 ${candidatePostCount} 条草稿共 ${candidateImageCount} 张可安全修复图片。`
          : `历史媒体修复完成：更新 ${repairedPostCount} 条草稿、${repairedImageCount} 张图片，保留 ${failureCount} 个未确认项。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史媒体处理失败");
    } finally {
      setBusy(null);
    }
  }

  async function testImageProvider(route: "primary" | "backup") {
    if (!window.confirm(`将对${route === "primary" ? "主" : "备用"}图片通道执行两次付费生图（文生图和参考图），是否继续？`)) return;
    setBusy(route === "primary" ? "image-primary-check" : "image-backup-check");
    setMessage("");
    try {
      const res = await fetch("/api/config/image-provider-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route }),
      });
      const data = (await res.json()) as Partial<ImageProviderProbeResult> & { error?: string };
      if (!res.ok || !data.ok || !data.generation?.ok || !data.edit?.ok) {
        throw new Error(data.error || data.generation?.error || data.edit?.error || "图片通道测试失败");
      }
      setMessage(`${route === "primary" ? "主" : "备用"}图片通道测试通过：文生图 ${data.generation.durationMs}ms，参考图 ${data.edit.durationMs}ms。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片通道测试失败");
    } finally {
      setBusy(null);
    }
  }

  async function checkImageTransport() {
    setBusy("image-transport-check");
    setMessage("");
    try {
      const res = await fetch("/api/config/image-transport-health");
      const data = (await res.json()) as ImageTransportHealthResponse;
      if (!data.health) throw new Error(data.error || "图片网络检测失败");
      setImageTransportHealth(data.health);
      setMessage(data.health.ok ? "Xray 与图片通道连接正常。" : imageTransportHealthMessage(data.health));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片网络检测失败");
    } finally {
      setBusy(null);
    }
  }

  const pageReady = Boolean(account && policyDraft && (account.role !== "admin" || snapshot));
  const policyActive = activeGroupId === "content-safety";

  return (
    <main className="app-shell overflow-x-hidden">
      <div className="config-frame mx-auto flex w-full max-w-[1440px] flex-col text-sm">
        <header className="design-header mb-4 flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark grid h-12 w-12 shrink-0 place-items-center rounded-[8px]">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="header-eyebrow">Admin configuration</p>
              <h1 className="truncate text-xl font-black text-white sm:text-2xl">高级配置</h1>
              <p className="text-xs text-white/55">环境变量、外部服务和运行时开关</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <div className="theme-switcher" role="group" aria-label="主题切换">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  className={`theme-option ${theme === option.value ? "theme-option-active" : ""}`}
                  type="button"
                  aria-pressed={theme === option.value}
                  onClick={() => setStoredTheme(option.value)}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <Link className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" href="/">
              <ArrowLeft className="h-4 w-4" />
              返回工作台
            </Link>
            <button className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" type="button" onClick={loadPage} disabled={Boolean(busy)}>
              {busy === "load" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>
        </header>

        <section className="config-status-strip mb-4">
          <StatusTile label="TikHub" ok={Boolean(config?.tikhubConfigured)} />
          <StatusTile label={config?.textModel || "文本模型"} ok={Boolean(config?.openaiConfigured)} />
          <StatusTile label={config?.imageModel || "图片模型"} ok={Boolean(config?.openaiImageConfigured)} />
          <StatusTile label="Feishu CLI" ok={Boolean(config?.feishuConfigured)} />
          <StatusTile label="TOS" ok={Boolean(config?.tosConfigured && config?.tosEnabled)} />
          <StatusTile label="数据库" ok={Boolean(config?.postgresConfigured || config?.databaseBackend === "sqlite")} meta={config?.databaseBackend || "读取中"} />
        </section>

        {message ? <div className="config-message mb-4">{message}</div> : null}

        {!pageReady ? (
          <section className="config-empty glass-strong ops-panel">
            {busy === "load" ? <Loader2 className="h-6 w-6 animate-spin text-[var(--cyan)]" /> : <ShieldCheck className="h-7 w-7 text-[var(--amber)]" />}
            <div>
              <h2 className="text-lg font-black text-white">{busy === "load" ? "正在读取权限" : "仅管理员可操作"}</h2>
              <p className="mt-1 text-sm leading-6 text-white/58">高级配置会写入本机 .env.local，并影响外部服务、队列和账号边界。</p>
            </div>
          </section>
        ) : (
          <form className="config-workspace" onSubmit={policyActive ? (event) => { event.preventDefault(); void savePolicy(); } : saveConfig}>
            <aside className="config-sidebar glass ops-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-white/45">Config groups</p>
                  <p className="mt-1 text-sm font-black text-white">{account?.displayName || account?.username}</p>
                </div>
                <span className="account-role">{account?.role}</span>
              </div>
              <nav className="mt-4 grid gap-2" aria-label="配置分组">
                <button
                  className={`config-group-tab ${policyActive ? "config-group-tab-active" : ""}`}
                  type="button"
                  onClick={() => setActiveGroupId("content-safety")}
                >
                  <span className="truncate">内容安全</span>
                  <span>{policyDraft?.revision ?? "-"}</span>
                </button>
                {(snapshot?.groups || []).map((group) => (
                  <button
                    key={group.id}
                    className={`config-group-tab ${activeGroup?.id === group.id ? "config-group-tab-active" : ""}`}
                    type="button"
                    onClick={() => setActiveGroupId(group.id)}
                  >
                    <span className="truncate">{group.title}</span>
                    <span>{group.fields.length}</span>
                  </button>
                ))}
              </nav>
            </aside>

            {policyActive && policyDraft ? (
              <ContentSafetyEditor
                policy={policyDraft}
                sample={policySample}
                result={policyTestResult}
                readOnly={account?.role !== "admin"}
                busy={busy}
                dirty={policyDirty}
                validationError={thresholdError}
                onChange={(nextPolicy) => {
                  setPolicyDraft(nextPolicy);
                  setPolicyTestResult(null);
                }}
                onSampleChange={setPolicySample}
                onSave={savePolicy}
                onReset={resetPolicy}
                onTest={testPolicy}
              />
            ) : (
              <section className="config-editor glass-strong ops-panel">
              <div className="config-editor-head">
                <div className="min-w-0">
                  <p className="header-eyebrow">{activeGroup?.id}</p>
                  <h2 className="truncate text-2xl font-black text-white">{activeGroup?.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-white/58">{activeGroup?.description}</p>
                </div>
                {activeGroup?.id === "tos" ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-sm"
                      type="button"
                      onClick={() => runHistoricalMediaRepair("scan")}
                      disabled={Boolean(busy) || dirtyCount > 0}
                      title="扫描历史草稿媒体"
                    >
                      {busy === "media-scan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                      扫描历史媒体
                    </button>
                    <button
                      className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-sm"
                      type="button"
                      onClick={() => runHistoricalMediaRepair("apply")}
                      disabled={Boolean(busy) || dirtyCount > 0 || !config?.tosConfigured || !config?.tosEnabled}
                      title="修复可精确匹配的历史草稿媒体"
                    >
                      {busy === "media-repair" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                      修复历史媒体
                    </button>
                    <button
                      className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-sm"
                      type="button"
                      onClick={reconcileTosStorage}
                      disabled={Boolean(busy) || dirtyCount > 0 || !config?.tosConfigured}
                      title="重试上传失败暂存"
                    >
                      {busy === "tos-reconcile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      重试暂存
                    </button>
                    <button
                      className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-sm"
                      type="button"
                      onClick={testTosStorage}
                      disabled={Boolean(busy) || dirtyCount > 0 || !config?.tosConfigured}
                      title={dirtyCount > 0 ? "请先保存 TOS 配置" : "测试 TOS 连接"}
                    >
                      {busy === "tos-check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                      测试连接
                    </button>
                  </div>
                ) : null}
                {activeGroup?.id === "openai-image" ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-sm"
                      type="button"
                      onClick={checkImageTransport}
                      disabled={Boolean(busy) || dirtyCount > 0}
                      title="免费检测 Xray 与图片通道，不生成图片"
                    >
                      {busy === "image-transport-check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      检测图片网络
                    </button>
                    <button
                      className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-sm"
                      type="button"
                      onClick={() => testImageProvider("primary")}
                      disabled={Boolean(busy) || dirtyCount > 0 || !config?.openaiImageConfigured}
                      title={dirtyCount > 0 ? "请先保存图片通道配置" : "测试主图片通道"}
                    >
                      {busy === "image-primary-check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                      测试主通道
                    </button>
                    <button
                      className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-sm"
                      type="button"
                      onClick={() => testImageProvider("backup")}
                      disabled={Boolean(busy) || dirtyCount > 0 || !config?.openaiImageBackupConfigured}
                      title={dirtyCount > 0 ? "请先保存图片通道配置" : "测试备用图片通道"}
                    >
                      {busy === "image-backup-check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                      测试备用通道
                    </button>
                  </div>
                ) : null}
                <button className="primary-button inline-flex h-11 items-center justify-center gap-2 px-4 text-sm" type="submit" disabled={busy === "save" || dirtyCount === 0}>
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {dirtyCount ? `保存 ${dirtyCount} 项` : "无改动"}
                </button>
              </div>

              {activeGroup?.id === "openai-image" && imageTransportHealth ? (
                <div className="config-status-strip">
                  <StatusTile label="Xray" ok={imageTransportHealth.proxy.reachable} meta={imageTransportHealth.proxy.endpoint} />
                  <StatusTile label="图片主线路" ok={imageTransportHealth.primary.reachable} />
                  <StatusTile label="图片备用线路" ok={!imageTransportHealth.backup.configured || imageTransportHealth.backup.reachable} meta={imageTransportHealth.backup.configured ? undefined : "未配置"} />
                  <StatusTile label="主备线路" ok={!imageTransportHealth.duplicateOrigins} meta={imageTransportHealth.duplicateOrigins ? "地址相同" : "独立"} />
                </div>
              ) : null}

              <div className="config-field-list">
                {activeGroup?.fields.map((field) => (
                  <ConfigFieldRow
                    key={field.key}
                    field={field}
                    state={draft[field.key] || { value: "", dirty: false, clear: false }}
                    disabled={busy === "save"}
                    onChange={updateField}
                    onClearSecret={toggleClearSecret}
                  />
                ))}
              </div>
              </section>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

type PolicyRule = ContentSafetyPolicy["local"]["rules"][number];
type PolicyGroup = PolicyRule["groups"][number];
type PolicyCategory = ContentSafetyPolicy["categories"][number];

function ContentSafetyEditor({
  policy,
  sample,
  result,
  readOnly,
  busy,
  dirty,
  validationError,
  onChange,
  onSampleChange,
  onSave,
  onReset,
  onTest,
}: {
  policy: ContentSafetyPolicy;
  sample: PolicySample;
  result: PolicyTestResponse | null;
  readOnly: boolean;
  busy: string | null;
  dirty: boolean;
  validationError: string;
  onChange: (policy: ContentSafetyPolicy) => void;
  onSampleChange: (sample: PolicySample) => void;
  onSave: () => void;
  onReset: () => void;
  onTest: (runModel: boolean) => void;
}) {
  const disabled = readOnly || Boolean(busy);

  function updateRule(index: number, nextRule: PolicyRule) {
    onChange({
      ...policy,
      local: { ...policy.local, rules: policy.local.rules.map((rule, ruleIndex) => ruleIndex === index ? nextRule : rule) },
    });
  }

  function addCategory() {
    const id = nextPolicyId("category", policy.categories.map((category) => category.id));
    onChange({ ...policy, categories: [...policy.categories, { id, label: "", description: "" }] });
  }

  function updateCategory(index: number, nextCategory: PolicyCategory) {
    const previousId = policy.categories[index]?.id;
    const idChanged = previousId && previousId !== nextCategory.id;
    onChange({
      ...policy,
      categories: policy.categories.map((category, categoryIndex) => categoryIndex === index ? nextCategory : category),
      local: idChanged ? {
        ...policy.local,
        rules: policy.local.rules.map((rule) => ({
          ...rule,
          categoryIds: rule.categoryIds.map((categoryId) => categoryId === previousId ? nextCategory.id : categoryId),
        })),
      } : policy.local,
    });
  }

  function removeCategory(index: number) {
    const removedId = policy.categories[index]?.id;
    onChange({
      ...policy,
      categories: policy.categories.filter((_, categoryIndex) => categoryIndex !== index),
      local: {
        ...policy.local,
        rules: policy.local.rules.map((rule) => ({
          ...rule,
          categoryIds: rule.categoryIds.filter((categoryId) => categoryId !== removedId),
        })),
      },
    });
  }

  function addRule() {
    const id = nextPolicyId("rule", policy.local.rules.map((rule) => rule.id));
    onChange({
      ...policy,
      local: {
        ...policy.local,
        rules: [...policy.local.rules, {
          id,
          name: "新规则",
          enabled: true,
          action: "review",
          categoryIds: [],
          groups: [{ fields: ["title", "body"], mode: "any", terms: [] }],
        }],
      },
    });
  }

  return (
    <section className="config-editor content-safety-editor glass-strong ops-panel">
      <div className="config-editor-head">
        <div className="min-w-0">
          <p className="header-eyebrow">数据库策略 · 修订版 {policy.revision}</p>
          <h2 className="text-2xl font-black text-white">内容安全</h2>
          <p className="mt-1 text-sm leading-6 text-white/58">用于后续采集与生成任务的全局工作区策略。</p>
        </div>
        <div className="content-safety-actions">
          {readOnly ? <span className="account-role">只读</span> : null}
          <button className="soft-button" type="button" onClick={onReset} disabled={disabled}>
            {busy === "policy-reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            重置策略
          </button>
          <button className="primary-button" type="button" onClick={onSave} disabled={disabled || !dirty || Boolean(validationError)}>
            {busy === "policy-save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存策略
          </button>
        </div>
      </div>

      <div className="content-safety-stack">
        <section className="content-safety-band content-safety-overview">
          <div>
            <h3>策略总开关</h3>
            <p>关闭后内容直接放行，不执行本地规则或模型审核。</p>
          </div>
          <PolicySwitch label="启用内容安全策略" checked={policy.enabled} disabled={disabled} onChange={(enabled) => onChange({ ...policy, enabled })} />
        </section>

        <section className="content-safety-band">
          <div className="content-safety-section-head">
            <div>
              <h3>风险分类</h3>
              <p>本地规则与审核模型返回的稳定分类 ID。</p>
            </div>
            <button className="soft-button" type="button" onClick={addCategory} disabled={disabled}>
              <Plus className="h-4 w-4" /> 添加分类
            </button>
          </div>
          <div className="content-safety-list">
            {policy.categories.map((category, index) => (
              <div className="content-safety-category" key={`${category.id}-${index}`}>
                <label>
                  <span>分类 ID</span>
                  <input
                    className="field field-compact"
                    aria-label={`分类 ID ${index + 1}`}
                    value={category.id}
                    disabled={disabled}
                    onChange={(event) => updateCategory(index, { ...category, id: event.target.value })}
                  />
                </label>
                <label>
                  <span>名称</span>
                  <input
                    className="field field-compact"
                    aria-label={`分类名称 ${index + 1}`}
                    value={category.label}
                    disabled={disabled}
                    onChange={(event) => updateCategory(index, { ...category, label: event.target.value })}
                  />
                </label>
                <label className="content-safety-category-description">
                  <span>说明</span>
                  <input
                    className="field field-compact"
                    aria-label={`分类说明 ${index + 1}`}
                    value={category.description || ""}
                    disabled={disabled}
                    onChange={(event) => updateCategory(index, { ...category, description: event.target.value })}
                  />
                </label>
                <IconButton label={`删除分类 ${index + 1}`} disabled={disabled} onClick={() => removeCategory(index)} icon={<Trash2 />} />
              </div>
            ))}
          </div>
        </section>

        <section className="content-safety-band">
          <div className="content-safety-section-head">
            <div>
              <h3>本地规则</h3>
              <p>按顺序命中的第一条启用规则决定本地结果。</p>
            </div>
            <div className="content-safety-inline-actions">
              <PolicySwitch label="启用本地规则" checked={policy.local.enabled} disabled={disabled} onChange={(enabled) => onChange({ ...policy, local: { ...policy.local, enabled } })} />
              <button className="soft-button" type="button" onClick={addRule} disabled={disabled}>
                <Plus className="h-4 w-4" /> 添加规则
              </button>
            </div>
          </div>
          <div className="content-safety-rule-list">
            {policy.local.rules.map((rule, index) => (
              <PolicyRuleEditor
                key={`${rule.id}-${index}`}
                rule={rule}
                index={index}
                count={policy.local.rules.length}
                categories={policy.categories}
                disabled={disabled}
                onChange={(nextRule) => updateRule(index, nextRule)}
                onMove={(direction) => onChange({ ...policy, local: { ...policy.local, rules: moveListItem(policy.local.rules, index, index + direction) } })}
                onRemove={() => onChange({ ...policy, local: { ...policy.local, rules: policy.local.rules.filter((_, ruleIndex) => ruleIndex !== index) } })}
              />
            ))}
          </div>
        </section>

        <section className="content-safety-band">
          <div className="content-safety-section-head">
            <div>
              <h3>模型审核</h3>
              <p>仅在策略判定需要时，或管理员明确测试时调用模型。</p>
            </div>
            <PolicySwitch label="启用模型审核" checked={policy.model.enabled} disabled={disabled} onChange={(enabled) => onChange({ ...policy, model: { ...policy.model, enabled } })} />
          </div>
          <div className="content-safety-model-grid">
            <label>
              <span>审核范围</span>
              <select className="field field-compact" value={policy.model.scope} disabled={disabled} onChange={(event) => onChange({ ...policy, model: { ...policy.model, scope: event.target.value as ContentSafetyPolicy["model"]["scope"] } })}>
                <option value="local_review">仅本地待审核内容</option>
                <option value="all_non_filtered">全部未被本地过滤的内容</option>
              </select>
            </label>
            <label>
              <span>待审核阈值</span>
              <input className="field field-compact" type="number" min="0" max="99" value={policy.model.reviewThreshold} disabled={disabled} onChange={(event) => onChange({ ...policy, model: { ...policy.model, reviewThreshold: Number(event.target.value) } })} />
            </label>
            <label>
              <span>过滤阈值</span>
              <input className="field field-compact" type="number" min="1" max="100" value={policy.model.filterThreshold} disabled={disabled} onChange={(event) => onChange({ ...policy, model: { ...policy.model, filterThreshold: Number(event.target.value) } })} />
            </label>
            <label className="content-safety-prompt">
              <span>模型提示词</span>
              <textarea className="field config-textarea" value={policy.model.prompt} disabled={disabled} onChange={(event) => onChange({ ...policy, model: { ...policy.model, prompt: event.target.value } })} />
            </label>
          </div>
          {validationError ? <p className="content-safety-validation" role="alert">{validationError}</p> : null}
        </section>

        <section className="content-safety-band">
          <div className="content-safety-section-head">
            <div>
              <h3>策略草稿测试</h3>
              <p>本地测试为确定性检查；模型测试是独立、明确的付费操作。</p>
            </div>
            <div className="content-safety-inline-actions">
              <button className="soft-button" type="button" onClick={() => onTest(false)} disabled={disabled || Boolean(validationError)}>
                {busy === "policy-local-test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />} 运行本地测试
              </button>
              <button className="soft-button" type="button" onClick={() => onTest(true)} disabled={disabled || !policy.enabled || !policy.model.enabled || Boolean(validationError)}>
                {busy === "policy-model-test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />} 运行模型测试
              </button>
            </div>
          </div>
          <div className="content-safety-sample-grid">
            <label>
              <span>样例标题</span>
              <input className="field field-compact" aria-label="样例标题" value={sample.title} disabled={disabled} onChange={(event) => onSampleChange({ ...sample, title: event.target.value })} />
            </label>
            <label>
              <span>样例作者</span>
              <input className="field field-compact" aria-label="样例作者" value={sample.authorName} disabled={disabled} onChange={(event) => onSampleChange({ ...sample, authorName: event.target.value })} />
            </label>
            <label className="content-safety-sample-body">
              <span>样例正文</span>
              <textarea className="field config-textarea" aria-label="样例正文" value={sample.contentText} disabled={disabled} onChange={(event) => onSampleChange({ ...sample, contentText: event.target.value })} />
            </label>
          </div>
          {result?.assessment && result.localAssessment ? (
            <div className="content-safety-results" aria-live="polite">
              <AssessmentResult label="本地结果" assessment={result.localAssessment} />
              <AssessmentResult label="最终结果" assessment={result.assessment} />
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function PolicyRuleEditor({ rule, index, count, categories, disabled, onChange, onMove, onRemove }: {
  rule: PolicyRule;
  index: number;
  count: number;
  categories: ContentSafetyPolicy["categories"];
  disabled: boolean;
  onChange: (rule: PolicyRule) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  function updateGroup(groupIndex: number, group: PolicyGroup) {
    onChange({ ...rule, groups: rule.groups.map((item, itemIndex) => itemIndex === groupIndex ? group : item) });
  }

  return (
    <article className="content-safety-rule">
      <header>
        <span className="content-safety-order">{index + 1}</span>
        <input className="field field-compact" aria-label={`规则名称 ${index + 1}`} value={rule.name} disabled={disabled} onChange={(event) => onChange({ ...rule, name: event.target.value })} />
        <div className="content-safety-icon-actions">
          <IconButton label={`规则 ${index + 1} 上移`} disabled={disabled || index === 0} onClick={() => onMove(-1)} icon={<ArrowUp />} />
          <IconButton label={`规则 ${index + 1} 下移`} disabled={disabled || index === count - 1} onClick={() => onMove(1)} icon={<ArrowDown />} />
          <IconButton label={`删除规则 ${index + 1}`} disabled={disabled} onClick={onRemove} icon={<Trash2 />} />
        </div>
      </header>
      <div className="content-safety-rule-meta">
        <label>
          <span>规则 ID</span>
          <input className="field field-compact" value={rule.id} disabled={disabled} onChange={(event) => onChange({ ...rule, id: event.target.value })} />
        </label>
        <label>
          <span>命中动作</span>
          <select className="field field-compact" value={rule.action} disabled={disabled} onChange={(event) => onChange({ ...rule, action: event.target.value as PolicyRule["action"] })}>
            <option value="allow">放行</option>
            <option value="review">待审核</option>
            <option value="filter">过滤</option>
          </select>
        </label>
        <PolicySwitch label="启用规则" checked={rule.enabled} disabled={disabled} onChange={(enabled) => onChange({ ...rule, enabled })} />
      </div>
      <fieldset className="content-safety-category-select" disabled={disabled}>
        <legend>风险分类</legend>
        <div>
          {categories.map((category) => (
            <label key={category.id}>
              <input
                type="checkbox"
                checked={rule.categoryIds.includes(category.id)}
                onChange={(event) => onChange({ ...rule, categoryIds: event.target.checked ? [...rule.categoryIds, category.id] : rule.categoryIds.filter((id) => id !== category.id) })}
              />
              <span>{category.label || category.id}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="content-safety-group-list">
        {rule.groups.map((group, groupIndex) => (
          <PolicyGroupEditor
            key={groupIndex}
            group={group}
            label={`条件组 ${groupIndex + 1}`}
            disabled={disabled}
            onChange={(nextGroup) => updateGroup(groupIndex, nextGroup)}
            onRemove={() => onChange({ ...rule, groups: rule.groups.filter((_, itemIndex) => itemIndex !== groupIndex) })}
          />
        ))}
        <button className="soft-button content-safety-add-group" type="button" disabled={disabled} onClick={() => onChange({ ...rule, groups: [...rule.groups, { fields: ["body"], mode: "any", terms: [] }] })}>
          <Plus className="h-4 w-4" /> 添加条件组
        </button>
      </div>
    </article>
  );
}

function PolicyGroupEditor({ group, label, disabled, onChange, onRemove }: {
  group: PolicyGroup;
  label: string;
  disabled: boolean;
  onChange: (group: PolicyGroup) => void;
  onRemove: () => void;
}) {
  const fieldOptions: Array<{ value: PolicyGroup["fields"][number]; label: string }> = [
    { value: "title", label: "标题" },
    { value: "body", label: "正文" },
    { value: "author", label: "作者" },
  ];
  return (
    <div className="content-safety-group">
      <div className="content-safety-group-head">
        <strong>{label}</strong>
        <IconButton label={`删除${label}`} disabled={disabled} onClick={onRemove} icon={<Trash2 />} />
      </div>
      <fieldset disabled={disabled}>
        <legend>匹配字段</legend>
        <div className="content-safety-field-options">
          {fieldOptions.map((field) => (
            <label key={field.value}>
              <input
                type="checkbox"
                checked={group.fields.includes(field.value)}
                onChange={(event) => onChange({ ...group, fields: event.target.checked ? [...group.fields, field.value] : group.fields.filter((value) => value !== field.value) })}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span>匹配方式</span>
        <select className="field field-compact" value={group.mode} disabled={disabled} onChange={(event) => onChange({ ...group, mode: event.target.value as PolicyGroup["mode"] })}>
          <option value="any">任一词命中</option>
          <option value="all">全部词命中</option>
          <option value="at_least">至少命中</option>
        </select>
      </label>
      {group.mode === "at_least" ? (
        <label>
          <span>最少命中数</span>
          <input className="field field-compact" type="number" min="1" value={group.atLeast || 1} disabled={disabled} onChange={(event) => onChange({ ...group, atLeast: Number(event.target.value) })} />
        </label>
      ) : null}
      <label className="content-safety-terms">
        <span>关键词，每行一个</span>
        <textarea className="field" value={group.terms.join("\n")} disabled={disabled} onChange={(event) => onChange({ ...group, terms: event.target.value.split("\n").map((term) => term.trim()).filter(Boolean) })} />
      </label>
    </div>
  );
}

function PolicySwitch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button className={`config-switch ${checked ? "config-switch-on" : ""}`} type="button" aria-label={label} aria-pressed={checked} onClick={() => onChange(!checked)} disabled={disabled}>
      <span /> {checked ? "开启" : "关闭"}
    </button>
  );
}

function IconButton({ label, disabled, onClick, icon }: { label: string; disabled: boolean; onClick: () => void; icon: React.ReactNode }) {
  return <button className="content-safety-icon-button" type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{icon}</button>;
}

function AssessmentResult({ label, assessment }: { label: string; assessment: SourceSafetyAssessment }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{policyDecisionLabel(assessment.decision)}{typeof assessment.riskScore === "number" ? ` · ${assessment.riskScore}` : ""}</strong>
      <small>{assessment.categories.join(", ") || "无风险分类"}</small>
      {assessment.reasons.map((reason, index) => <p key={`${reason}-${index}`}>{reason}</p>)}
    </div>
  );
}

function nextPolicyId(prefix: string, existing: string[]) {
  let index = existing.length + 1;
  while (existing.includes(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function policyThresholdError(policy: ContentSafetyPolicy) {
  const { reviewThreshold, filterThreshold } = policy.model;
  if (!Number.isFinite(reviewThreshold) || !Number.isFinite(filterThreshold) || reviewThreshold < 0 || reviewThreshold >= filterThreshold || filterThreshold > 100) {
    return "阈值必须满足：0 ≤ 待审核阈值 < 过滤阈值 ≤ 100。";
  }
  return "";
}

function policyModelTestMessage(assessment: SourceSafetyAssessment) {
  if (assessment.status === "failed") return `模型测试失败，已保留本地结果：${assessment.error || "模型输出无效。"}`;
  if (assessment.source === "local") return assessment.error
    ? `模型测试未执行：${assessment.error}`
    : "模型测试未执行：策略总开关或模型审核已关闭。";
  return "模型测试已完成。";
}

function policyDecisionLabel(decision: SourceSafetyAssessment["decision"]) {
  return decision === "allow" ? "放行" : decision === "review" ? "待审核" : "过滤";
}

function moveListItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function StatusTile({ label, ok, meta }: { label: string; ok: boolean; meta?: string }) {
  return (
    <div className={`config-status-tile ${ok ? "config-status-tile-ok" : ""}`}>
      {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      <span className="min-w-0 truncate">{label}</span>
      {meta ? <small>{meta}</small> : null}
    </div>
  );
}

function imageTransportHealthMessage(health: ImageTransportHealth) {
  if (!health.proxy.reachable) return "Xray 未运行，请启动 v2rayN 后重试。";
  if (health.duplicateOrigins) return "图片主线路和备用线路地址相同，当前没有真正的备用通道。";
  if (!health.primary.reachable) return "图片主线路网络不可达。";
  if (health.backup.configured && !health.backup.reachable) return "图片备用线路网络不可达。";
  return "图片网络配置需要检查。";
}

function ConfigFieldRow({
  field,
  state,
  disabled,
  onChange,
  onClearSecret,
}: {
  field: AdvancedConfigField;
  state: DraftField;
  disabled: boolean;
  onChange: (field: AdvancedConfigField, value: string | boolean) => void;
  onClearSecret: (field: AdvancedConfigField, clear: boolean) => void;
}) {
  const inputId = `config-${field.key}`;
  return (
    <div className={`config-field-row ${state.dirty || state.clear ? "config-field-row-dirty" : ""}`}>
      <div className="min-w-0">
        <label className="config-field-label" htmlFor={inputId}>
          <span>{field.label}</span>
          {field.required ? <small>required</small> : null}
        </label>
        <p className="mt-1 text-xs leading-5 text-white/52">{field.description}</p>
        <code className="mt-2 inline-flex max-w-full rounded-[6px] border border-white/10 px-2 py-1 text-[11px] text-white/42">{field.key}</code>
      </div>
      <div className="config-field-control">
        {field.kind === "secret" ? (
          <>
            <div className="config-secret-state">
              <EyeOff className="h-4 w-4" />
              <span>{field.configured ? "已配置，值已隐藏" : "未配置"}</span>
            </div>
            <input
              id={inputId}
              className="field field-compact"
              type="password"
              value={state.value}
              onChange={(event) => onChange(field, event.target.value)}
              placeholder={field.configured ? "输入新值以覆盖" : "输入新值"}
              disabled={disabled || state.clear}
            />
            <label className="config-clear-toggle">
              <input
                type="checkbox"
                checked={state.clear}
                onChange={(event) => onClearSecret(field, event.target.checked)}
                disabled={disabled || !field.configured}
              />
              <span>清空该项</span>
            </label>
          </>
        ) : field.kind === "textarea" ? (
          <textarea
            id={inputId}
            className="field config-textarea"
            value={state.value}
            onChange={(event) => onChange(field, event.target.value)}
            disabled={disabled}
          />
        ) : field.kind === "select" ? (
          <select id={inputId} className="field field-compact" value={state.value} onChange={(event) => onChange(field, event.target.value)} disabled={disabled}>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : field.kind === "boolean" ? (
          <button
            id={inputId}
            className={`config-switch ${state.value === "true" ? "config-switch-on" : ""}`}
            type="button"
            aria-pressed={state.value === "true"}
            onClick={() => onChange(field, state.value !== "true")}
            disabled={disabled}
          >
            <span />
            {state.value === "true" ? "开启" : "关闭"}
          </button>
        ) : (
          <input
            id={inputId}
            className="field field-compact"
            type={field.kind === "number" ? "number" : "text"}
            value={state.value}
            onChange={(event) => onChange(field, event.target.value)}
            disabled={disabled}
          />
        )}
        {state.dirty || state.clear ? <span className="config-dirty-mark"><KeyRound className="h-3.5 w-3.5" />待保存</span> : null}
      </div>
    </div>
  );
}
