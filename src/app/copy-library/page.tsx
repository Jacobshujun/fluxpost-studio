"use client";

import { BookOpenText, ChevronLeft, FilePlus2, Home, LoaderCircle, Save, Search, Share2, Tag, Trash2, UserRound, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CopyLibraryEntryView, LibraryVisibility } from "@/lib/types";
import styles from "./copy-library.module.css";

type CopyLibraryResponse = { entries: CopyLibraryEntryView[]; tags: string[]; error?: string };
type Draft = { title: string; body: string; tags: string[]; visibility: LibraryVisibility };
const emptyDraft: Draft = { title: "", body: "", tags: [], visibility: "private" };

export default function CopyLibraryPage() {
  const [data, setData] = useState<CopyLibraryResponse>({ entries: [], tags: [] });
  const [selectedId, setSelectedId] = useState<string>();
  const selectedIdRef = useRef<string | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const selected = data.entries.find((entry) => entry.id === selectedId);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (visibility) params.set("visibility", visibility);
    filterTags.forEach((tagValue) => params.append("tag", tagValue));
    return params.toString();
  }, [filterTags, search, visibility]);

  const load = useCallback(async (preserveSelection = true) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/copy-library${query ? `?${query}` : ""}`);
      const result = (await response.json()) as CopyLibraryResponse;
      if (!response.ok) throw new Error(result.error || "文案库加载失败");
      setData(result);
      const nextId = preserveSelection && result.entries.some((entry) => entry.id === selectedIdRef.current)
        ? selectedIdRef.current
        : result.entries[0]?.id;
      const nextEntry = result.entries.find((entry) => entry.id === nextId);
      selectedIdRef.current = nextId;
      setSelectedId(nextId);
      setDraft(nextEntry ? draftFromEntry(nextEntry) : emptyDraft);
      setTagDraft("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文案库加载失败");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function startNew() {
    selectedIdRef.current = undefined;
    setSelectedId(undefined);
    setDraft(emptyDraft);
    setMessage("");
    setDeleteOpen(false);
  }

  async function save() {
    if (selected && !selected.canEdit) return;
    setBusy(true);
    try {
      const response = await fetch(selected ? `/api/copy-library/${selected.id}` : "/api/copy-library", {
        method: selected ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { entry?: CopyLibraryEntryView; error?: string };
      if (!response.ok || !result.entry) throw new Error(result.error || "文案保存失败");
      setData((current) => ({
        entries: [result.entry!, ...current.entries.filter((entry) => entry.id !== result.entry!.id)],
        tags: uniqueTags([...current.tags, ...result.entry!.tags]),
      }));
      selectedIdRef.current = result.entry.id;
      setSelectedId(result.entry.id);
      setDraft(draftFromEntry(result.entry));
      setMessage("文案已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文案保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected?.canEdit) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/copy-library/${selected.id}`, { method: "DELETE" });
      const result = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !result.deleted) throw new Error(result.error || "文案删除失败");
      setData((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== selected.id) }));
      selectedIdRef.current = undefined;
      setSelectedId(undefined);
      setDraft(emptyDraft);
      setDeleteOpen(false);
      setMessage("文案已删除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文案删除失败");
    } finally {
      setBusy(false);
    }
  }

  function addTag(value = tagDraft) {
    const tagValue = value.trim();
    if (!tagValue || draft.tags.some((item) => sameTag(item, tagValue))) return;
    setDraft((current) => ({ ...current, tags: [...current.tags, tagValue] }));
    setTagDraft("");
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div className={styles.brand}><BookOpenText /><div><h1>文案库</h1><p>沉淀可复用标题与正文</p></div></div>
      <div className={styles.headerActions}>
        <span>{data.entries.length} 篇</span>
        <Link href="/" className={styles.iconButton} aria-label="返回工作台" title="返回工作台"><Home /></Link>
        <button className={styles.primaryButton} type="button" onClick={startNew}><FilePlus2 />新建文案</button>
      </div>
    </header>

    <section className={styles.workspace}>
      <aside className={styles.libraryPane}>
        <div className={styles.filters}>
          <label className={styles.search}><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题、正文或标签" /></label>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value)} aria-label="可见性筛选"><option value="">全部可见性</option><option value="private">仅自己</option><option value="team">团队共享</option></select>
          <div className={styles.filterTags}>{data.tags.map((tagValue) => <button key={tagValue} className={filterTags.some((item) => sameTag(item, tagValue)) ? styles.filterTagActive : ""} onClick={() => setFilterTags((current) => current.some((item) => sameTag(item, tagValue)) ? current.filter((item) => !sameTag(item, tagValue)) : [...current, tagValue])}><Tag />{tagValue}</button>)}</div>
        </div>
        {message ? <p className={styles.notice} role="status">{message}</p> : null}
        <div className={styles.list}>
          {loading ? <div className={styles.state}><LoaderCircle className={styles.spin} />正在加载文案</div> : data.entries.length ? data.entries.map((entry) => <button key={entry.id} className={`${styles.entry} ${entry.id === selectedId ? styles.entryActive : ""}`} onClick={() => {
            selectedIdRef.current = entry.id;
            setSelectedId(entry.id);
            setDraft(draftFromEntry(entry));
            setTagDraft("");
          }}>
            <span className={styles.entryHead}><strong>{entry.title}</strong><span title={entry.visibility === "team" ? "团队共享" : "仅自己"}>{entry.visibility === "team" ? <UsersRound /> : <UserRound />}</span></span>
            <span className={styles.excerpt}>{entry.body}</span>
            <span className={styles.entryMeta}><span>{entry.ownerDisplayName}</span><time>{formatDate(entry.updatedAt)}</time></span>
            <span className={styles.tags}>{entry.tags.slice(0, 4).map((tagValue) => <small key={tagValue}>{tagValue}</small>)}</span>
          </button>) : <div className={styles.empty}><BookOpenText /><h2>暂无匹配文案</h2><button className={styles.primaryButton} onClick={startNew}><FilePlus2 />录入第一篇</button></div>}
        </div>
      </aside>

      <article className={styles.editor}>
        <div className={styles.editorHead}><div><span>{selected ? selected.canEdit ? "编辑文案" : "共享文案" : "新建文案"}</span><h2>{selected?.title || "未命名文案"}</h2></div>{selectedId ? <button className={styles.mobileBack} onClick={() => setSelectedId(undefined)} aria-label="返回文案列表"><ChevronLeft /></button> : null}</div>
        {selected && !selected.canEdit ? <div className={styles.readonly}><Share2 />这是团队共享文案，仅原作者和管理员可以修改。</div> : null}
        <label className={styles.field}><span>标题</span><input maxLength={200} value={draft.title} disabled={Boolean(selected && !selected.canEdit)} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="输入图文标题" /></label>
        <label className={`${styles.field} ${styles.bodyField}`}><span>正文</span><textarea maxLength={30000} value={draft.body} disabled={Boolean(selected && !selected.canEdit)} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} placeholder="输入完整正文" /></label>
        <div className={styles.field}><span>人工标签</span><div className={styles.tagEditor}>{draft.tags.map((tagValue) => <span key={tagValue}>{tagValue}{!selected || selected.canEdit ? <button onClick={() => setDraft((current) => ({ ...current, tags: current.tags.filter((item) => !sameTag(item, tagValue)) }))} aria-label={`移除标签 ${tagValue}`}><X /></button> : null}</span>)}{!selected || selected.canEdit ? <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(); } }} onBlur={() => addTag()} placeholder="输入后按回车" /> : null}</div></div>
        <div className={styles.field}><span>可见性</span><div className={styles.segmented} role="group" aria-label="文案可见性"><button className={draft.visibility === "private" ? styles.segmentActive : ""} disabled={Boolean(selected && !selected.canEdit)} onClick={() => setDraft((current) => ({ ...current, visibility: "private" }))}><UserRound />仅自己</button><button className={draft.visibility === "team" ? styles.segmentActive : ""} disabled={Boolean(selected && !selected.canEdit)} onClick={() => setDraft((current) => ({ ...current, visibility: "team" }))}><UsersRound />团队共享</button></div></div>
        {(!selected || selected.canEdit) ? <div className={styles.commands}><button className={styles.primaryButton} disabled={busy || !draft.title.trim() || !draft.body.trim()} onClick={() => void save()}>{busy ? <LoaderCircle className={styles.spin} /> : <Save />}保存</button>{selected ? <button className={styles.dangerButton} disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 />删除</button> : null}</div> : null}
      </article>
    </section>

    {deleteOpen && selected ? <div className={styles.scrim} role="alertdialog" aria-modal="true" aria-labelledby="copy-delete-title"><div className={styles.dialog}><Trash2 /><h2 id="copy-delete-title">确认删除这篇文案？</h2><p>已保存画布和已预检批次仍保留快照，但文案库记录无法恢复。</p><button className={styles.dangerButton} disabled={busy} onClick={() => void remove()}>确认删除</button><button className={styles.cancelButton} disabled={busy} autoFocus onClick={() => setDeleteOpen(false)}>取消</button></div></div> : null}
  </main>;
}

function uniqueTags(tags: string[]) {
  const result: string[] = [];
  tags.forEach((tagValue) => { if (!result.some((item) => sameTag(item, tagValue))) result.push(tagValue); });
  return result.sort((left, right) => left.localeCompare(right, "zh-CN"));
}
function draftFromEntry(entry: CopyLibraryEntryView): Draft {
  return { title: entry.title, body: entry.body, tags: [...entry.tags], visibility: entry.visibility };
}
function sameTag(left: string, right: string) { return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase(); }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
