"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Cloud,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  TestTube2,
  X,
} from "lucide-react";
import { getStoredTheme, setStoredTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";
import type {
  AdvancedConfigField,
  AdvancedConfigPatchValue,
  AdvancedConfigSnapshot,
  ConfigStatus,
  ImageProviderProbeResult,
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
  const [draft, setDraft] = useState<Record<string, DraftField>>({});
  const [activeGroupId, setActiveGroupId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"load" | "save" | "tos-check" | "tos-reconcile" | "image-primary-check" | "image-backup-check" | null>("load");

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
      if (sessionData.account.role !== "admin") {
        setMessage("当前账号不是管理员，无法查看或修改高级配置。");
        return;
      }

      const configRes = await fetch("/api/config?advanced=1");
      const configData = (await configRes.json()) as ConfigResponse;
      if (!configRes.ok || !configData.advanced || !configData.status) throw new Error(configData.error || "高级配置读取失败");
      applySnapshot(configData.advanced, configData.status);
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

  const adminReady = account?.role === "admin" && snapshot;

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

        {!adminReady ? (
          <section className="config-empty glass-strong ops-panel">
            {busy === "load" ? <Loader2 className="h-6 w-6 animate-spin text-[var(--cyan)]" /> : <ShieldCheck className="h-7 w-7 text-[var(--amber)]" />}
            <div>
              <h2 className="text-lg font-black text-white">{busy === "load" ? "正在读取权限" : "仅管理员可操作"}</h2>
              <p className="mt-1 text-sm leading-6 text-white/58">高级配置会写入本机 .env.local，并影响外部服务、队列和账号边界。</p>
            </div>
          </section>
        ) : (
          <form className="config-workspace" onSubmit={saveConfig}>
            <aside className="config-sidebar glass ops-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-white/45">Config groups</p>
                  <p className="mt-1 text-sm font-black text-white">{account.displayName || account.username}</p>
                </div>
                <span className="account-role">admin</span>
              </div>
              <nav className="mt-4 grid gap-2" aria-label="配置分组">
                {snapshot.groups.map((group) => (
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
          </form>
        )}
      </div>
    </main>
  );
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
