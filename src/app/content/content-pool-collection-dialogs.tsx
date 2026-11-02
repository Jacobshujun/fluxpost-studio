"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ContentPoolCustomTagPicker } from "@/components/content-pool-custom-tag-picker";
import { contentPoolCustomTagKey } from "@/lib/content-pool-tags";
import type { ContentPoolCollection } from "@/lib/types";

export function ContentPoolDialog({
  title,
  children,
  onClose,
  busy = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`content-pool-dialog ${className}`.trim()}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <strong>{title}</strong>
        <button type="button" disabled={busy} aria-label={`关闭${title}`} onClick={onClose}><X /></button>
      </header>
      {children}
    </dialog>
  );
}

export function ContentPoolCollectionNameDialog({
  title,
  initial = "",
  parentPath,
  onClose,
  onSave,
}: {
  title: string;
  initial?: string;
  parentPath?: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <ContentPoolDialog title={title} onClose={onClose} busy={busy} className="content-pool-dialog-compact">
      <form
        className="content-pool-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          setError("");
          void onSave(name.trim()).catch((reason) => setError(reason instanceof Error ? reason.message : "保存失败")).finally(() => setBusy(false));
        }}
      >
        <label>
          <span>名称</span>
          <input autoFocus maxLength={120} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
        </label>
        {parentPath ? <p className="content-pool-dialog-hint">创建在：{parentPath}</p> : null}
        {error ? <p className="content-pool-dialog-error" role="alert">{error}</p> : null}
        <footer>
          <button className="soft-button" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button className="primary-button" type="submit" disabled={busy || !name.trim()}>{busy ? "保存中…" : "保存"}</button>
        </footer>
      </form>
    </ContentPoolDialog>
  );
}

export function ContentPoolConfirmDialog({
  title,
  text,
  confirmLabel = "确认删除",
  onClose,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <ContentPoolDialog title={title} onClose={onClose} busy={busy} className="content-pool-dialog-compact">
      <p className="content-pool-dialog-text">{text}</p>
      {error ? <p className="content-pool-dialog-error" role="alert">{error}</p> : null}
      <footer className="content-pool-dialog-actions">
        <button className="soft-button" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button
          className="content-pool-danger-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void onConfirm().catch((reason) => setError(reason instanceof Error ? reason.message : "操作失败")).finally(() => setBusy(false));
          }}
        >
          {busy ? "处理中…" : confirmLabel}
        </button>
      </footer>
    </ContentPoolDialog>
  );
}

export function ContentPoolCollectionPicker({
  mode,
  collections,
  selectedCount,
  sourceCollectionId,
  onClose,
  onSubmit,
}: {
  mode: "add" | "move";
  collections: ContentPoolCollection[];
  selectedCount: number;
  sourceCollectionId?: string;
  onClose: () => void;
  onSubmit: (collectionIds: string[], moveToDefault: boolean) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const targets = collections.filter((collection) => collection.canEdit && collection.id !== sourceCollectionId);
  const term = search.normalize("NFKC").trim().toLocaleLowerCase();
  const visible = targets.filter((collection) => !term || `${collection.name} ${collection.relativePath || ""}`.normalize("NFKC").toLocaleLowerCase().includes(term));
  const title = mode === "move" ? "移动到内容库" : "加入内容库";

  function toggle(collectionId: string) {
    setSelected((current) => {
      if (mode === "move") return new Set([collectionId]);
      const next = new Set(current);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  }

  async function submit(moveToDefault: boolean) {
    if (!moveToDefault && !selected.size) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(Array.from(selected), moveToDefault);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ContentPoolDialog title={title} onClose={onClose} busy={busy} className="content-pool-collection-picker-dialog">
      <p className="content-pool-dialog-summary">已选 {selectedCount} 条内容</p>
      <label className="content-pool-dialog-search">
        <input autoFocus type="search" placeholder="搜索内容库" value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <div className="content-pool-collection-options">
        {visible.length ? visible.map((collection) => (
          <label key={collection.id} className={selected.has(collection.id) ? "is-selected" : ""}>
            <input
              type={mode === "move" ? "radio" : "checkbox"}
              name="content-pool-collection-target"
              checked={selected.has(collection.id)}
              disabled={busy}
              onChange={() => toggle(collection.id)}
            />
            <span>
              <strong>{collection.relativePath || collection.name}</strong>
              <small>{collection.ownerDisplayName}</small>
            </span>
          </label>
        )) : <p className="content-pool-dialog-hint">暂无可选内容库。</p>}
      </div>
      {error ? <p className="content-pool-dialog-error" role="alert">{error}</p> : null}
      <footer className="content-pool-dialog-actions">
        <button className="soft-button" type="button" disabled={busy} onClick={onClose}>取消</button>
        {mode === "move" ? <button className="soft-button" type="button" disabled={busy} onClick={() => void submit(true)}>移回默认库</button> : null}
        <button className="primary-button" type="button" disabled={busy || !selected.size} onClick={() => void submit(false)}>{busy ? "处理中…" : title}</button>
      </footer>
    </ContentPoolDialog>
  );
}

export function ContentPoolBatchTagDialog({
  mode,
  selectedCount,
  onClose,
  onSubmit,
}: {
  mode: "add" | "remove";
  selectedCount: number;
  onClose: () => void;
  onSubmit: (labels: string[]) => Promise<void>;
}) {
  const [labels, setLabels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = mode === "add" ? "批量添加标签" : "批量移除标签";
  return (
    <ContentPoolDialog title={title} onClose={onClose} busy={busy} className="content-pool-dialog-compact">
      <p className="content-pool-dialog-summary">已选 {selectedCount} 条内容</p>
      <ContentPoolCustomTagPicker
        tags={labels}
        placeholder="输入或选择标签，按回车添加"
        allowCreate={mode === "add"}
        disabled={busy}
        onAdd={(label) => setLabels((current) => current.some((item) => contentPoolCustomTagKey(item) === contentPoolCustomTagKey(label)) ? current : [...current, label])}
        onRemove={(label) => setLabels((current) => current.filter((item) => contentPoolCustomTagKey(item) !== contentPoolCustomTagKey(label)))}
      />
      {error ? <p className="content-pool-dialog-error" role="alert">{error}</p> : null}
      <footer className="content-pool-dialog-actions">
        <button className="soft-button" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button
          className="primary-button"
          type="button"
          disabled={busy || !labels.length}
          onClick={() => {
            setBusy(true);
            setError("");
            void onSubmit(labels).catch((reason) => setError(reason instanceof Error ? reason.message : "标签更新失败")).finally(() => setBusy(false));
          }}
        >
          {busy ? "处理中…" : "应用标签"}
        </button>
      </footer>
    </ContentPoolDialog>
  );
}
