"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import {
  CONTENT_POOL_CUSTOM_TAG_LIMIT,
  contentPoolCustomTagKey,
  normalizeContentPoolCustomTags,
} from "@/lib/content-pool-tags";
import type { ContentPoolTagSuggestion } from "@/lib/types";

export function ContentPoolCustomTagPicker({
  tags,
  placeholder,
  ariaLabel = placeholder,
  disabled = false,
  allowCreate = true,
  onAdd,
  onRemove,
}: {
  tags: string[];
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  onAdd: (label: string) => void | Promise<void>;
  onRemove?: (label: string) => void | Promise<void>;
}) {
  const listboxId = useId();
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<ContentPoolTagSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedKeys = useMemo(() => new Set(tags.map(contentPoolCustomTagKey)), [tags]);
  const options = useMemo(
    () => suggestions.filter((item) => !selectedKeys.has(contentPoolCustomTagKey(item.label))),
    [selectedKeys, suggestions],
  );

  useEffect(() => {
    if (!open || disabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "20" });
        if (draft.trim()) params.set("q", draft.trim());
        const response = await fetch(`/api/content-pool/tags?${params}`, { signal: controller.signal });
        const result = (await response.json()) as { tags?: ContentPoolTagSuggestion[]; error?: string };
        if (!response.ok) throw new Error(result.error || "标签建议加载失败");
        setSuggestions(result.tags || []);
        setError("");
      } catch (reason) {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setError(reason instanceof Error ? reason.message : "标签建议加载失败");
      }
    }, draft.trim() ? 160 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, draft, open]);

  async function commit(candidate: string) {
    try {
      const label = normalizeContentPoolCustomTags([candidate])[0];
      if (!label || selectedKeys.has(contentPoolCustomTagKey(label))) {
        setDraft("");
        setOpen(false);
        return;
      }
      if (tags.length >= CONTENT_POOL_CUSTOM_TAG_LIMIT) throw new Error(`每条内容最多 ${CONTENT_POOL_CUSTOM_TAG_LIMIT} 个自定义标签`);
      setBusy(true);
      setError("");
      await onAdd(label);
      setDraft("");
      setActiveIndex(-1);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "标签更新失败");
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % options.length);
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
    } else if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const candidate = activeIndex >= 0 ? options[activeIndex]?.label : allowCreate ? draft : options[0]?.label;
      if (candidate) void commit(candidate);
    } else if (event.key === "Backspace" && !draft && tags.length && onRemove) {
      event.preventDefault();
      void onRemove(tags.at(-1)!);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="content-pool-tag-picker" data-shortcuts="off">
      <div className="content-pool-tag-picker-control" onClick={(event) => (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
        {tags.map((label) => (
          <span className="content-pool-tag-chip" key={contentPoolCustomTagKey(label)}>
            {label}
            {onRemove && !disabled ? <button type="button" title={`删除 ${label}`} aria-label={`删除自定义标签 ${label}`} onClick={() => void onRemove(label)}><X /></button> : null}
          </span>
        ))}
        <input
          value={draft}
          disabled={disabled || busy}
          placeholder={tags.length ? "" : placeholder}
          role="combobox"
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && activeIndex >= 0 && options[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { setDraft(event.target.value); setActiveIndex(-1); setOpen(true); setError(""); }}
          onKeyDown={handleKeyDown}
        />
        {busy ? <LoaderCircle className="content-pool-tag-spinner" /> : null}
      </div>
      {open && !disabled ? (
        <div className="content-pool-tag-suggestions" id={listboxId} role="listbox">
          {options.length ? options.map((item, index) => (
            <button
              type="button"
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : ""}
              key={contentPoolCustomTagKey(item.label)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void commit(item.label)}
            >
              <span>{item.label}</span><small>{item.count}</small>
            </button>
          )) : allowCreate && draft.trim() ? (
            <button type="button" role="option" aria-selected="true" onMouseDown={(event) => event.preventDefault()} onClick={() => void commit(draft)}>
              <Plus /><span>添加“{draft.trim()}”</span>
            </button>
          ) : <p>暂无可用标签</p>}
        </div>
      ) : null}
      {error ? <span className="content-pool-tag-error">{error}</span> : null}
    </div>
  );
}
