"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Merge, Pencil, Search, Trash2, X } from "lucide-react";
import {
  contentPoolTagColorHex,
  contentPoolTagColorValues,
} from "@/lib/content-pool-tags";
import type { ContentPoolTagSuggestion } from "@/lib/types";
import { ContentPoolDialog } from "./content-pool-collection-dialogs";

export function ContentPoolTagManagerDialog({
  tags: initialTags,
  onClose,
  onChanged,
}: {
  tags: ContentPoolTagSuggestion[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [tags, setTags] = useState<ContentPoolTagSuggestion[]>(initialTags);
  const [search, setSearch] = useState("");
  const [editingKey, setEditingKey] = useState("");
  const [editingLabel, setEditingLabel] = useState("");
  const [mergeKey, setMergeKey] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [deleteKey, setDeleteKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadTags() {
    const response = await fetch("/api/content-pool/tags?limit=500");
    const data = (await response.json()) as { tags?: ContentPoolTagSuggestion[]; error?: string };
    if (!response.ok) throw new Error(data.error || "标签读取失败");
    setTags(data.tags || []);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/content-pool/tags?limit=500")
      .then(async (response) => {
        const data = (await response.json()) as { tags?: ContentPoolTagSuggestion[]; error?: string };
        if (!response.ok) throw new Error(data.error || "标签读取失败");
        if (!cancelled) setTags(data.tags || []);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "标签读取失败");
      });
    return () => { cancelled = true; };
  }, []);

  const term = search.normalize("NFKC").trim().toLocaleLowerCase();
  const visible = useMemo(() => tags.filter((tag) => !term || tag.label.normalize("NFKC").toLocaleLowerCase().includes(term)), [tags, term]);
  const mergeTargets = tags.filter((tag) => tag.key !== mergeKey);

  async function run(action: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/content-pool/tags/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "标签操作失败");
      await onChanged();
      await loadTags();
      setEditingKey("");
      setMergeKey("");
      setMergeTarget("");
      setDeleteKey("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "标签操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ContentPoolDialog title="管理自定义标签" onClose={onClose} busy={busy} className="content-pool-tag-manager-dialog">
      <div className="content-pool-tag-manager-toolbar">
        <label className="content-pool-dialog-search">
          <Search />
          <input type="search" placeholder="搜索标签" value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <span>{tags.length} 个标签</span>
      </div>
      <div className="content-pool-tag-manager-list thin-scrollbar">
        {visible.length ? visible.map((tag) => {
          const editing = editingKey === tag.key;
          const merging = mergeKey === tag.key;
          const deleting = deleteKey === tag.key;
          return (
            <div key={tag.key} className="content-pool-tag-manager-row">
              <i className="content-pool-tag-dot" style={{ background: contentPoolTagColorHex[tag.color] }} />
              {editing ? (
                <form
                  className="content-pool-tag-manager-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editingLabel.trim() || busy) return;
                    void run({ action: "rename", from: tag.label, to: editingLabel.trim() });
                  }}
                >
                  <input autoFocus value={editingLabel} disabled={busy} onChange={(event) => setEditingLabel(event.target.value)} />
                  <button type="submit" disabled={busy || !editingLabel.trim()} title="保存标签名" aria-label="保存标签名"><Check /></button>
                  <button type="button" disabled={busy} title="取消重命名" aria-label="取消重命名" onClick={() => setEditingKey("")}><X /></button>
                </form>
              ) : (
                <strong className="content-pool-tag-manager-label">{tag.label}</strong>
              )}
              <small>{tag.count}</small>
              <div className="content-pool-tag-manager-colors" role="group" aria-label={`设置“${tag.label}”颜色`}>
                {contentPoolTagColorValues.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={tag.color === color ? "is-active" : ""}
                    style={{ background: contentPoolTagColorHex[color] }}
                    disabled={busy}
                    title={`设为${color}`}
                    aria-label={`将“${tag.label}”设为${color}`}
                    onClick={() => void run({ action: "set_color", label: tag.label, color })}
                  />
                ))}
              </div>
              <div className="content-pool-tag-manager-actions">
                {editing ? null : (
                  <button type="button" disabled={busy} title="重命名" aria-label={`重命名“${tag.label}”`} onClick={() => { setEditingKey(tag.key); setEditingLabel(tag.label); }}><Pencil /></button>
                )}
                <button type="button" disabled={busy} title="合并标签" aria-label={`合并“${tag.label}”`} onClick={() => { setMergeKey(merging ? "" : tag.key); setMergeTarget(""); }}><Merge /></button>
                <button type="button" disabled={busy} title="删除标签" aria-label={`删除“${tag.label}”`} onClick={() => setDeleteKey(deleting ? "" : tag.key)}><Trash2 /></button>
              </div>
              {merging ? (
                <div className="content-pool-tag-manager-merge">
                  <select value={mergeTarget} disabled={busy} onChange={(event) => setMergeTarget(event.target.value)}>
                    <option value="">合并到…</option>
                    {mergeTargets.map((target) => <option key={target.key} value={target.label}>{target.label}（{target.count}）</option>)}
                  </select>
                  <button type="button" className="soft-button" disabled={busy || !mergeTarget} onClick={() => void run({ action: "merge", from: tag.label, to: mergeTarget })}>合并</button>
                </div>
              ) : null}
              {deleting ? (
                <div className="content-pool-tag-manager-delete">
                  <span>将从所有内容移除“{tag.label}”，确定吗？</span>
                  <button type="button" className="content-pool-danger-button" disabled={busy} onClick={() => void run({ action: "delete", label: tag.label })}>确认删除</button>
                  <button type="button" className="soft-button" disabled={busy} onClick={() => setDeleteKey("")}>取消</button>
                </div>
              ) : null}
            </div>
          );
        }) : <p className="content-pool-dialog-hint">{term ? "没有匹配的标签。" : "暂无自定义标签。"}</p>}
      </div>
      {error ? <p className="content-pool-dialog-error" role="alert">{error}</p> : null}
      <footer className="content-pool-dialog-actions">
        <button className="soft-button" type="button" disabled={busy} onClick={onClose}>关闭</button>
      </footer>
    </ContentPoolDialog>
  );
}
