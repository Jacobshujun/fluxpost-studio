"use client";

import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Folder, FolderInput, FolderPlus, Heart, Image as ImageIcon, Images, LoaderCircle, MoreHorizontal, Pencil, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, Tag, Trash2, Upload, UsersRound, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react";
import { applyLibraryTagChanges, getLibraryUnifiedTagsForAsset, libraryAngleLabels, libraryAngleOptions, libraryImageTypeLabels, libraryImageTypes, mergeLibraryTagProfile } from "@/lib/library-tags";
import { isEditableSelectionTarget } from "@/lib/list-selection";
import { getStoredTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";
import { useUrlQueryParams } from "@/lib/use-url-query-state";
import type { LibraryAsset, LibraryAssetPage, LibraryBatchResult, LibraryCollection, LibraryCollectionBatchRequest, LibraryCollectionBatchResult, LibraryManualTagOverrides, LibraryNavigation, LibrarySelection, LibrarySmartFolder, LibrarySmartFolderCondition, LibraryTagBatchResult, LibraryTagSuggestion, LibraryVisibility } from "@/lib/types";
import { beijingDate, dateBoundary, filterKeys, filtersToQuery, numericFilters, readLibraryFilters, readLibraryView, recentDateRange, smartOperators, taggingLabels, validateFilterRanges, type LibraryView } from "./library-ui";
import styles from "./library.module.css";

type SmartDraft = Pick<LibrarySmartFolder, "name" | "visibility" | "match" | "conditions"> & { id?: string };
type Failure = { assetId: string; error: string };
type ImportRow = { id: number; file: File; collectionId: string; visibility: LibraryVisibility; retryable: boolean; state: "queued" | "loading" | "done" | "duplicate" | "error" | "cancelled"; message?: string };
type CollectionPickerDraft = { selection: LibrarySelection; count: number; source?: LibraryCollection };
const emptyNavigation: LibraryNavigation = { collections: [], smartFolders: [], counts: { all: 0, uncategorized: 0, favorites: 0 } };
const emptyPage: LibraryAssetPage = { assets: [], total: 0 };
const jsonHeaders = { "Content-Type": "application/json" };

export default function LibraryPage() {
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, () => "professional" as ThemeMode);
  const [params, updateParams, hydrated] = useUrlQueryParams();
  const filters = useMemo(() => readLibraryFilters(params), [params]);
  const queryString = useMemo(() => filtersToQuery(filters), [filters]);
  const view = useMemo(() => readLibraryView(params), [params]);
  const assetId = params.get("asset") || "";
  const [navigation, setNavigation] = useState(emptyNavigation);
  const [data, setData] = useState(emptyPage);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failures, setFailures] = useState<Failure[]>([]);
  const [selected, setSelected] = useState(new Set<string>());
  const [allMatching, setAllMatching] = useState(false);
  const [excluded, setExcluded] = useState(new Set<string>());
  const [advanced, setAdvanced] = useState(false);
  const [collectionPicker, setCollectionPicker] = useState<CollectionPickerDraft>();
  const [collectionForm, setCollectionForm] = useState<{ id?: string; parentId?: string; name: string }>();
  const [smartDraft, setSmartDraft] = useState<SmartDraft>();
  const [tagAction, setTagAction] = useState<"add" | "remove">();
  const [confirmation, setConfirmation] = useState<{ title: string; text: string; run: () => Promise<void> }>();
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [dragging, setDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>();
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const listController = useRef<AbortController | null>(null);
  const pageController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const queueRef = useRef<ImportRow[]>([]);
  const queueRunning = useRef(false);
  const queueSequence = useRef(0);
  const selectionRef = useRef(0);
  const pageRequest = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const observer = new ResizeObserver(() => toolbar.parentElement?.style.setProperty("--toolbar-height", `${toolbar.getBoundingClientRect().height}px`));
    observer.observe(toolbar); return () => observer.disconnect();
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; listController.current?.abort(); pageController.current?.abort(); }; }, []);
  const liveQuery = useCallback(() => filtersToQuery(readLibraryFilters(new URLSearchParams(window.location.search))), []);
  const loadNavigation = useCallback(async () => {
    const result = await api<LibraryNavigation>("/api/library/navigation");
    if (mounted.current) setNavigation(result);
  }, []);
  const clearSelection = useCallback(() => { selectionRef.current = 0; setSelected(new Set()); setExcluded(new Set()); setAllMatching(false); }, []);
  const selectedCount = allMatching ? Math.max(0, (data.total ?? 0) - excluded.size) : selected.size;
  const selection: LibrarySelection = allMatching ? { mode: "query", filters: { ...filters, limit: undefined }, excludedAssetIds: [...excluded] } : { mode: "ids", assetIds: [...selected] };
  const sourceCollection = view.kind === "collection" ? navigation.collections.find((item) => item.id === view.id && item.canEdit) : undefined;

  const reloadAssets = useCallback(async () => {
    const query = liveQuery();
    listController.current?.abort(); pageController.current?.abort(); pageRequest.current = null;
    const controller = new AbortController(); listController.current = controller;
    const id = ++generation.current;
    setLoading(true); setLoadingMore(false);
    try {
      const result = await api<LibraryAssetPage>(`/api/library/assets?${query}`, { signal: controller.signal });
      if (id === generation.current && liveQuery() === query && mounted.current) setData(result);
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { if (id === generation.current && mounted.current) setLoading(false); }
  }, [liveQuery]);

  useEffect(() => { void loadNavigation().catch((error) => setMessage(errorMessage(error))); }, [loadNavigation]);
  useEffect(() => {
    if (!hydrated) return;
    if (selectionRef.current) setMessage("筛选已改变，已清空批量选择");
    // Selection is scoped to the external URL query, rather than to list refreshes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    clearSelection();
    void reloadAssets().catch((error) => setMessage(errorMessage(error)));
    return () => { generation.current += 1; listController.current?.abort(); pageController.current?.abort(); };
  }, [hydrated, queryString, reloadAssets, clearSelection]);

  function setFilter(key: string, value: string | string[]) {
    updateParams((next) => { next.delete(key); for (const item of Array.isArray(value) ? value : [value]) if (item.trim()) next.append(key, item.trim()); });
  }
  function setView(next: LibraryView) { setFilter("view", next.kind === "collection" || next.kind === "smart" ? `${next.kind}:${next.id}` : next.kind === "all" ? "" : next.kind); }
  function clearFilters() { updateParams((next) => filterKeys.forEach((key) => next.delete(key))); }
  function toggleAsset(id: string) {
    selectionRef.current += 1;
    if (allMatching) setExcluded((current) => toggleSet(current, id));
    else setSelected((current) => toggleSet(current, id));
  }
  function selectLoaded() { selectionRef.current += 1; setSelected(new Set(data.assets.map((item) => item.id))); setAllMatching(false); setExcluded(new Set()); }

  async function loadMore(): Promise<LibraryAsset | undefined> {
    const cursor = data.nextCursor;
    if (!cursor || pageRequest.current || loading || liveQuery() !== queryString) return;
    const id = generation.current;
    const controller = new AbortController(); pageController.current = controller;
    pageRequest.current = cursor; setLoadingMore(true);
    try {
      const next = await api<LibraryAssetPage>(`/api/library/assets?${queryString}&cursor=${encodeURIComponent(cursor)}`, { signal: controller.signal });
      if (controller.signal.aborted || id !== generation.current || liveQuery() !== queryString || !mounted.current) return;
      if (next.nextCursor === cursor) throw new Error("分页游标重复，无法继续加载");
      setData((current) => ({ ...next, assets: [...current.assets, ...next.assets.filter((asset) => !current.assets.some((item) => item.id === asset.id))] }));
      return next.assets.find((item) => !data.assets.some((asset) => asset.id === item.id));
    } finally { if (pageController.current === controller) { pageRequest.current = null; setLoadingMore(false); } }
  }

  async function refreshAfterWrite() {
    try { await Promise.all([reloadAssets(), loadNavigation()]); }
    catch (error) { setMessage(`操作已完成，刷新失败：${errorMessage(error)}`); }
  }
  function reportResult(label: string, result: LibraryBatchResult | LibraryCollectionBatchResult | LibraryTagBatchResult) {
    const succeeded = "succeeded" in result ? result.succeeded : result.assets.length;
    setFailures(result.failures); clearSelection();
    setSelected(new Set(result.failures.map((item) => item.assetId))); selectionRef.current = result.failures.length;
    setMessage(`${label} ${succeeded} 张${"unchangedAssetIds" in result && result.unchangedAssetIds.length ? `，未变更 ${result.unchangedAssetIds.length} 张` : ""}${result.failures.length ? `，失败 ${result.failures.length} 张` : ""}`);
  }
  async function runBatch(body: Record<string, unknown>, label: string, snapshot = selection) {
    if (busy) return; setBusy(true); setFailures([]);
    try {
      const result = await api<LibraryBatchResult | LibraryCollectionBatchResult>("/api/library/assets/batch", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...body, selection: snapshot }) });
      reportResult(label, result); await refreshAfterWrite(); return result;
    } finally { setBusy(false); }
  }
  function batchCommand(body: Record<string, unknown>, label: string) { void runBatch(body, label).catch((error) => setMessage(errorMessage(error))); }
  function confirmDelete(snapshot: LibrarySelection, count: number, after?: () => void) {
    setConfirmation({ title: "永久删除图片", text: `将永久删除 ${count} 张图片及其原图文件，无法恢复。仅移出图集请使用“移出当前图集”。`, run: async () => { const result = await runBatch({ action: "delete", confirm: true }, "已删除", snapshot); if (after && result && result.failures.length) throw new Error(result.failures[0].error); after?.(); } });
  }
  async function submitCollectionPicker(targetId: string) {
    if (!collectionPicker) return;
    const draft = collectionPicker;
    const body: LibraryCollectionBatchRequest = draft.source
      ? { action: "move_to_collection", selection: draft.selection, sourceCollectionId: draft.source.id, targetCollectionId: targetId }
      : { action: "add_to_collections", selection: draft.selection, collectionIds: [targetId] };
    await runBatch(body, draft.source ? "已移动" : "已加入图集", draft.selection); setCollectionPicker(undefined);
  }
  async function patchAsset(id: string, patch: Record<string, unknown>) {
    const result = await api<{ asset: LibraryAsset }>(`/api/library/assets/${encodeURIComponent(id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(patch) });
    setData((current) => ({ ...current, assets: current.assets.map((asset) => asset.id === id ? result.asset : asset) }));
    setMessage("已保存"); await refreshAfterWrite(); return result.asset;
  }
  async function organizeAsset(asset: LibraryAsset, collectionId: string, add: boolean) {
    const body = add ? { action: "add_to_collections", collectionIds: [collectionId] } : { action: "remove_from_collection", collectionId };
    const result = await api<LibraryCollectionBatchResult>("/api/library/assets/batch", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...body, selection: { mode: "ids", assetIds: [asset.id] } }) });
    if (result.failures.length) throw new Error(result.failures[0].error);
    await refreshAfterWrite(); return result.assets[0] || asset;
  }
  async function toggleFavorite(asset: LibraryAsset) {
    const result = await api<LibraryBatchResult>("/api/library/favorites", { method: asset.favorite ? "DELETE" : "POST", headers: jsonHeaders, body: JSON.stringify({ selection: { mode: "ids", assetIds: [asset.id] } }) });
    if (result.failures.length) throw new Error(result.failures[0].error);
    const next = { ...asset, favorite: !asset.favorite };
    setData((current) => ({ ...current, assets: current.assets.map((item) => item.id === asset.id ? next : item) }));
    await refreshAfterWrite(); return next;
  }
  async function saveCollection(name: string) {
    if (!collectionForm) return;
    await api(collectionForm.id ? `/api/library/collections/${encodeURIComponent(collectionForm.id)}` : "/api/library/collections", { method: collectionForm.id ? "PATCH" : "POST", headers: jsonHeaders, body: JSON.stringify({ name, parentId: collectionForm.parentId, visibility: "private" }) });
    setCollectionForm(undefined); await loadNavigation();
  }
  async function saveSmartFolder() {
    if (!smartDraft) return;
    await api(smartDraft.id ? `/api/library/smart-folders/${encodeURIComponent(smartDraft.id)}` : "/api/library/smart-folders", { method: smartDraft.id ? "PATCH" : "POST", headers: jsonHeaders, body: JSON.stringify(smartDraft) });
    setSmartDraft(undefined); await loadNavigation();
  }
  async function submitTags(values: string[]) {
    const result = await api<LibraryTagBatchResult>("/api/library/tags", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ selection, add: tagAction === "add" ? values : [], remove: tagAction === "remove" ? values : [] }) });
    reportResult("已更新标签", result); setTagAction(undefined); await refreshAfterWrite();
  }

  const updateQueue = (change: (rows: ImportRow[]) => ImportRow[]) => { queueRef.current = change(queueRef.current); if (mounted.current) setImports([...queueRef.current]); };
  async function runImportQueue() {
    if (queueRunning.current) return;
    queueRunning.current = true;
    try {
      while (mounted.current) {
        const row = queueRef.current.find((item) => item.state === "queued");
        if (!row) break;
        updateQueue((rows) => rows.map((item) => item.id === row.id ? { ...item, state: "loading", message: undefined } : item));
        try {
          const form = new FormData(); form.set("file", row.file); form.set("visibility", row.visibility);
          if (row.collectionId) form.set("collectionIds", JSON.stringify([row.collectionId]));
          const result = await api<{ status: "imported" | "skipped_duplicate" }>("/api/library/import", { method: "POST", body: form });
          updateQueue((rows) => rows.map((item) => item.id === row.id ? { ...item, state: result.status === "imported" ? "done" : "duplicate" } : item));
        } catch (error) { updateQueue((rows) => rows.map((item) => item.id === row.id ? { ...item, state: "error", message: errorMessage(error) } : item)); }
      }
    } finally { queueRunning.current = false; }
    if (mounted.current) {
      try { await Promise.all([loadNavigation(), reloadAssets()]); }
      catch (error) { if (mounted.current) setMessage(`导入已结束，刷新失败：${errorMessage(error)}`); }
    }
  }
  function enqueue(files: File[], collectionId: string, visibility: LibraryVisibility) {
    updateQueue((current) => [...current, ...files.map((file): ImportRow => {
      const supported = /\.(jpe?g|png|gif|webp)$/i.test(file.name) || ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type);
      const message = !supported ? "不支持的文件格式，请使用 JPEG、PNG、GIF 或 WebP" : file.size > 30 * 1024 ** 2 ? "单张图片不能超过 30MB" : !file.size ? "文件为空" : undefined;
      return { id: ++queueSequence.current, file, collectionId, visibility, retryable: !message, state: message ? "error" : "queued", message };
    })]);
    setPendingFiles(undefined); setQueueCollapsed(false); void runImportQueue();
  }
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (isEditableSelectionTarget(event.target) || document.querySelector("dialog[open]")) return;
      const files = [...event.clipboardData?.files || []]; if (files.length) { event.preventDefault(); setPendingFiles(files); }
    };
    window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isEditableSelectionTarget(event.target) || document.querySelector("dialog[open]") || !selectedCount || busy) return;
      event.preventDefault(); confirmDelete(selection, selectedCount);
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  });

  const visibleCollections = navigation.collections.filter((item) => {
    if (collectionSearch.trim()) return `${item.name} ${item.relativePath || ""}`.toLocaleLowerCase().includes(collectionSearch.trim().toLocaleLowerCase());
    let parent = item.parentId; const seen = new Set<string>();
    while (parent && !seen.has(parent)) { if (collapsed.has(parent)) return false; seen.add(parent); parent = navigation.collections.find((collection) => collection.id === parent)?.parentId; }
    return true;
  });
  const title = viewTitle(view, navigation);
  return <main className={styles.page} onDragEnter={(event) => { if (hasFiles(event)) setDragging(true); }} onDragOver={(event) => { if (hasFiles(event)) event.preventDefault(); }} onDrop={(event) => { if (!hasFiles(event)) return; event.preventDefault(); setDragging(false); setPendingFiles([...event.dataTransfer.files]); }}>
    <header className={styles.header}><div className={styles.brand}><Link href="/" className={styles.iconButton} title="返回内容台"><ArrowLeft /></Link><div><strong>图库</strong><span>{title} · {data.total ?? 0} 张</span></div></div><div className={styles.headerActions}><button className={styles.iconButton} aria-label="刷新" onClick={() => void refreshAfterWrite()}><RefreshCw /></button><button className={styles.primary} onClick={() => fileInputRef.current?.click()}><Upload />导入</button><input ref={fileInputRef} hidden multiple type="file" onChange={(event) => { setPendingFiles([...event.target.files || []]); event.target.value = ""; }} /></div></header>
    <div className={styles.workspace}>
      <aside className={styles.sidebar} aria-label="图库导航">
        <NavButton active={view.kind === "all"} icon={<Images />} label="全部图片" count={navigation.counts.all} onClick={() => setView({ kind: "all" })} />
        <NavButton active={view.kind === "uncategorized"} icon={<ImageIcon />} label="未分类" count={navigation.counts.uncategorized} onClick={() => setView({ kind: "uncategorized" })} />
        <NavButton active={view.kind === "favorites"} icon={<Heart />} label="收藏" count={navigation.counts.favorites} onClick={() => setView({ kind: "favorites" })} />
        <SidebarHeading label="图集" onAdd={() => setCollectionForm({ name: "", parentId: sourceCollection?.id })} />
        <label className={styles.sidebarSearch}><Search /><input aria-label="搜索图集" placeholder="搜索图集" value={collectionSearch} onChange={(event) => setCollectionSearch(event.target.value)} /></label>
        <div className={styles.tree}>{visibleCollections.map((collection) => <div className={styles.navRow} key={collection.id} style={{ paddingLeft: 4 + collectionDepth(collection, navigation.collections) * 12 }}>
          {navigation.collections.some((item) => item.parentId === collection.id) ? <button className={styles.collapseButton} aria-label={`${collapsed.has(collection.id) ? "展开" : "折叠"}${collection.name}`} aria-expanded={!collapsed.has(collection.id)} onClick={() => setCollapsed((current) => toggleSet(current, collection.id))}>{collapsed.has(collection.id) ? <ChevronRight /> : <ChevronDown />}</button> : null}
          <button className={view.kind === "collection" && view.id === collection.id ? styles.navActive : styles.navButton} title={collection.relativePath} onClick={() => setView({ kind: "collection", id: collection.id })}><Folder /><span>{collection.name}</span>{collection.visibility === "team" ? <UsersRound /> : null}</button>
          {collection.canEdit ? <div className={styles.rowActions}><button title="重命名" onClick={() => setCollectionForm({ id: collection.id, name: collection.name })}><Pencil /></button><button title="删除图集" onClick={() => setConfirmation({ title: "删除图集", text: `删除“${collection.name}”只移除图集关系，图片不会删除，子图集会上移。`, run: async () => { await api(`/api/library/collections/${encodeURIComponent(collection.id)}`, { method: "DELETE" }); if (view.kind === "collection" && view.id === collection.id) setView({ kind: "all" }); await refreshAfterWrite(); } })}><Trash2 /></button></div> : null}
        </div>)}</div>
        <SidebarHeading label="智能文件夹" onAdd={() => setSmartDraft(newSmartDraft())} />
        <div className={styles.tree}>{navigation.smartFolders.map((folder) => <div className={styles.navRow} key={folder.id}><button className={view.kind === "smart" && view.id === folder.id ? styles.navActive : styles.navButton} onClick={() => setView({ kind: "smart", id: folder.id })}><Sparkles /><span>{folder.name}</span></button>{folder.canEdit ? <div className={styles.rowActions}><button title="编辑智能文件夹" onClick={() => setSmartDraft({ ...folder })}><Pencil /></button><button title="删除智能文件夹" onClick={() => setConfirmation({ title: "删除智能文件夹", text: `删除“${folder.name}”不会删除图片。`, run: async () => { await api(`/api/library/smart-folders/${encodeURIComponent(folder.id)}`, { method: "DELETE" }); if (view.kind === "smart" && view.id === folder.id) setView({ kind: "all" }); await refreshAfterWrite(); } })}><Trash2 /></button></div> : null}</div>)}</div>
      </aside>
      <section className={styles.content}>
        <div className={styles.toolbar} ref={toolbarRef}>
          <SearchInput value={filters.search || ""} onSearch={(value) => setFilter("q", value)} />
          <TagInput value={filters.tags || []} onChange={(values) => setFilter("tag", values)} placeholder="标签筛选" />
          <button onClick={() => setAdvanced(true)}>尺寸</button>
          <select aria-label="导入时间" value={filters.addedFrom || filters.addedBefore ? "custom" : ""} onChange={(event) => { if (event.target.value === "custom") setAdvanced(true); else if (!event.target.value) updateParams((next) => { next.delete("addedFrom"); next.delete("addedBefore"); }); else { const range = recentDateRange(Number(event.target.value)); updateParams((next) => { next.set("addedFrom", range.addedFrom); next.set("addedBefore", range.addedBefore); }); } }}><option value="">全部时间</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="custom">自定义日期</option></select>
          <select aria-label="共享范围筛选" value={filters.visibility || ""} onChange={(event) => setFilter("visibility", event.target.value)}><option value="">全部范围</option><option value="private">个人</option><option value="team">团队</option></select>
          <button onClick={() => setAdvanced(true)}><SlidersHorizontal />高级筛选</button>
          <select className={styles.sort} aria-label="排序" value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)}><option value="newest">最新导入</option><option value="oldest">最早导入</option><option value="name-asc">名称 A-Z</option><option value="name-desc">名称 Z-A</option><option value="owner-asc">所有者 A-Z</option><option value="owner-desc">所有者 Z-A</option></select>
        </div>
        <div className={styles.resultSummary}><span>{title}{view.kind === "collection" ? ` / ${navigation.collections.find((item) => item.id === view.id)?.relativePath || ""}` : ""} · {data.total ?? 0} 张</span><button disabled={!data.assets.length || loading} onClick={selectLoaded}>选择已加载 {data.assets.length} 张</button>{view.kind === "collection" ? <label className={styles.check}><input type="checkbox" checked={filters.includeDescendants !== false} onChange={(event) => setFilter("descendants", event.target.checked ? "" : "0")} />包含子图集</label> : null}</div>
        <FilterChips params={params} onRemove={(key, value) => updateParams((next) => { const rest = next.getAll(key).filter((item) => item !== value); next.delete(key); rest.forEach((item) => next.append(key, item)); })} onClear={clearFilters} />
        {selectedCount ? <div className={styles.batchBar}><strong>{allMatching ? `已选择全部匹配 ${selectedCount} 张` : `已选择 ${selectedCount} 张`}</strong>{!allMatching && selected.size === data.assets.length && (data.total ?? 0) > data.assets.length ? <button disabled={busy} onClick={() => { setAllMatching(true); setSelected(new Set()); }}>选择全部匹配</button> : null}<button disabled={busy} onClick={() => setCollectionPicker({ selection, count: selectedCount })}><FolderPlus />加入图集</button>{sourceCollection ? <button disabled={busy} onClick={() => setCollectionPicker({ selection, count: selectedCount, source: sourceCollection })}><FolderInput />移动到图集</button> : null}<button disabled={busy} onClick={() => setTagAction("add")}><Tag />加标签</button><button disabled={busy} onClick={() => batchCommand({ action: "set_favorite", favorite: true }, "已收藏")}><Heart />收藏</button><details className={styles.moreMenu}><summary>更多<ChevronDown /></summary><div><button disabled={busy} onClick={() => setTagAction("remove")}>移除标签</button>{sourceCollection ? <button disabled={busy} onClick={() => batchCommand({ action: "remove_from_collection", collectionId: sourceCollection.id }, "已移出图集")}>移出当前图集</button> : null}<button disabled={busy} onClick={() => batchCommand({ action: "set_visibility", visibility: "team" }, "已共享")}>设为团队</button><button disabled={busy} onClick={() => batchCommand({ action: "set_visibility", visibility: "private" }, "已设为个人")}>设为个人</button><button disabled={busy} onClick={() => void api("/api/library/tagging", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ selection, mode: "all" }) }).then(() => setMessage("已提交 AI 打标")).catch((error) => setMessage(errorMessage(error)))}>AI 打标</button><button className={styles.danger} disabled={busy} onClick={() => confirmDelete(selection, selectedCount)}>永久删除</button></div></details><button disabled={busy} onClick={clearSelection}>取消选择</button></div> : null}
        {message ? <div className={styles.message} role="status"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage("")}><X /></button></div> : null}
        {failures.length ? <details className={styles.failures} open><summary>失败明细（{failures.length}）</summary>{failures.map((item) => <p key={item.assetId}>{data.assets.find((asset) => asset.id === item.assetId)?.name || item.assetId}：{item.error}</p>)}</details> : null}
        <div className={styles.grid} aria-busy={loading}>{loading ? <div className={styles.state}><LoaderCircle className={styles.spin} />加载中</div> : !data.assets.length ? <div className={styles.state}><ImageIcon /><strong>{navigation.counts.all ? "没有匹配的图片" : "图库尚无图片"}</strong><button onClick={navigation.counts.all ? clearFilters : () => fileInputRef.current?.click()}>{navigation.counts.all ? "清空筛选" : "导入图片"}</button></div> : data.assets.map((asset) => <AssetCard key={asset.id} asset={asset} selected={allMatching ? !excluded.has(asset.id) : selected.has(asset.id)} onSelect={() => toggleAsset(asset.id)} onView={() => setFilter("asset", asset.id)} onFavorite={() => void toggleFavorite(asset).catch((error) => setMessage(errorMessage(error)))} />)}</div>
        {data.nextCursor && !loading ? <button className={styles.loadMore} disabled={loadingMore} onClick={() => void loadMore().catch((error) => setMessage(errorMessage(error)))}>{loadingMore ? <LoaderCircle className={styles.spin} /> : <MoreHorizontal />}{loadingMore ? "加载中" : "加载更多"}</button> : null}
      </section>
    </div>
    {hydrated ? <Viewer assetId={assetId} assets={data.assets} collections={navigation.collections} hasMore={!!data.nextCursor} loadingMore={loadingMore} onMore={loadMore} onNavigate={(id, replace) => updateParams((next) => { if (id) next.set("asset", id); else next.delete("asset"); }, replace)} onSave={patchAsset} onFavorite={toggleFavorite} onOrganize={organizeAsset} onDelete={(asset, after) => confirmDelete({ mode: "ids", assetIds: [asset.id] }, 1, after)} /> : null}
    {advanced ? <FilterDialog params={params} onClose={() => setAdvanced(false)} onApply={(draft) => { updateParams((next) => { filterKeys.filter((key) => key !== "q" && key !== "tag").forEach((key) => { next.delete(key); draft.getAll(key).forEach((value) => next.append(key, value)); }); }); setAdvanced(false); }} /> : null}
    {collectionPicker ? <CollectionPicker draft={collectionPicker} collections={navigation.collections} onClose={() => setCollectionPicker(undefined)} onSubmit={submitCollectionPicker} /> : null}
    {collectionForm ? <NameDialog title={collectionForm.id ? "重命名图集" : "新建图集"} initial={collectionForm.name} onClose={() => setCollectionForm(undefined)} onSave={saveCollection} /> : null}
    {smartDraft ? <SmartFolderDialog draft={smartDraft} collections={navigation.collections} onChange={setSmartDraft} onClose={() => setSmartDraft(undefined)} onSave={saveSmartFolder} /> : null}
    {tagAction ? <BatchTagDialog action={tagAction} onClose={() => setTagAction(undefined)} onSave={submitTags} /> : null}
    {pendingFiles?.length ? <ImportDialog files={pendingFiles} collections={navigation.collections} defaultCollection={sourceCollection?.id || ""} onClose={() => setPendingFiles(undefined)} onImport={(collectionId, visibility) => enqueue(pendingFiles, collectionId, visibility)} /> : null}
    {confirmation ? <ConfirmDialog title={confirmation.title} text={confirmation.text} onClose={() => setConfirmation(undefined)} onConfirm={async () => { await confirmation.run(); setConfirmation(undefined); }} /> : null}
    {imports.length ? <ImportQueue rows={imports} collapsed={queueCollapsed} onCollapse={() => setQueueCollapsed((value) => !value)} onCancel={() => updateQueue((rows) => rows.map((row) => row.state === "queued" ? { ...row, state: "cancelled" } : row))} onClear={() => updateQueue((rows) => rows.filter((row) => row.state === "queued" || row.state === "loading"))} onRetry={(id) => { updateQueue((rows) => rows.map((row) => row.id === id && row.state === "error" && row.retryable ? { ...row, state: "queued" } : row)); void runImportQueue(); }} /> : null}
    {dragging ? <div className={styles.dropZone} onDragLeave={() => setDragging(false)}><Upload /><strong>松开以配置图片导入</strong></div> : null}
  </main>;
}

function SearchInput({ value, onSearch }: { value: string; onSearch: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { clearTimeout(timer.current); if (input.current) input.current.value = value; return () => clearTimeout(timer.current); }, [value]);
  return <label className={styles.search}><Search /><input ref={input} defaultValue={value} aria-label="搜索图片" placeholder="搜索名称、文件名、备注或标签" onChange={(event) => { clearTimeout(timer.current); const draft = event.target.value; timer.current = setTimeout(() => onSearch(draft.trim()), 300); }} /></label>;
}

function TagInput({ value, onChange, placeholder, disabled = false, suggest = true }: { value: string[]; onChange: (values: string[]) => void; placeholder: string; disabled?: boolean; suggest?: boolean }) {
  const [draft, setDraft] = useState(""); const [suggestions, setSuggestions] = useState<LibraryTagSuggestion[]>([]); const [error, setError] = useState("");
  useEffect(() => {
    if (!draft.trim() || disabled || !suggest) return;
    const controller = new AbortController();
    const timer = setTimeout(() => void api<{ tags: LibraryTagSuggestion[] }>(`/api/library/tags?q=${encodeURIComponent(draft)}&limit=8`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setSuggestions(result.tags); setError(""); } }).catch((error) => { if (!controller.signal.aborted) setError(errorMessage(error)); }), 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft, disabled, suggest]);
  function add(tag: string) { const next = [...new Set([...value, ...splitComma(tag)])]; onChange(next); setDraft(""); setSuggestions([]); }
  return <div className={styles.tagFilter}>{value.map((tag) => <button type="button" key={tag} disabled={disabled} aria-label={`移除标签 ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))}>{tag}<X /></button>)}{!disabled ? <><input aria-label={placeholder} placeholder={placeholder} value={draft} onChange={(event) => { setDraft(event.target.value); setSuggestions([]); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(draft); } }} /><button type="button" aria-label={`添加${placeholder}`} disabled={!draft.trim()} onClick={() => add(draft)}><Plus /></button>{draft && suggestions.length ? <div className={styles.suggestions}>{suggestions.map((item) => <button key={item.label} type="button" onClick={() => add(item.label)}>{item.label}<span>{item.count}</span></button>)}</div> : null}{error && draft ? <small role="alert">{error}</small> : null}</> : null}</div>;
}

const filterLabels: Record<string, string> = { q: "搜索", tag: "标签", visibility: "范围", taggingStatus: "打标", minWidth: "最小宽度", maxWidth: "最大宽度", minHeight: "最小高度", maxHeight: "最大高度", minByteSize: "最小文件", maxByteSize: "最大文件", addedFrom: "开始", addedBefore: "结束", imageType: "类型", vehicleModel: "车型", vehicleColor: "颜色", angle: "角度", scene: "场景", people: "人物", customTag: "自定义标签", ownerId: "所有者" };
function FilterChips({ params, onRemove, onClear }: { params: URLSearchParams; onRemove: (key: string, value: string) => void; onClear: () => void }) {
  const entries = [...params.entries()].filter(([key]) => filterKeys.includes(key));
  return entries.length ? <div className={styles.filterChips}>{entries.map(([key, value], index) => {
    const display = key === "visibility" ? value === "team" ? "团队" : "个人" : key === "taggingStatus" ? taggingLabels[value as keyof typeof taggingLabels] || value : key === "addedFrom" ? beijingDate(value) : key === "addedBefore" ? Number.isFinite(Date.parse(value)) ? beijingDate(new Date(Date.parse(value) - 1).toISOString()) : value : key.endsWith("ByteSize") ? formatBytes(Number(value)) : key === "imageType" ? libraryImageTypeLabels[value as keyof typeof libraryImageTypeLabels] || value : value;
    return <button key={`${key}-${index}`} onClick={() => onRemove(key, value)}>{filterLabels[key]}：{display}<X /></button>;
  })}<button onClick={onClear}>清空筛选</button></div> : null;
}

function FilterDialog({ params, onClose, onApply }: { params: URLSearchParams; onClose: () => void; onApply: (draft: URLSearchParams) => void }) {
  const [draft, setDraft] = useState(() => new URLSearchParams(params)); const [error, setError] = useState("");
  const change = (key: string, value: string | string[]) => setDraft((current) => { const next = new URLSearchParams(current); next.delete(key); for (const item of Array.isArray(value) ? value : [value]) if (item.trim()) next.append(key, item.trim()); return next; });
  const dateEnd = Number.isFinite(Date.parse(draft.get("addedBefore") || "")) ? draft.get("addedBefore") : null;
  return <Dialog title="高级筛选" onClose={onClose}><div className={styles.filterForm}>
    <fieldset><legend>图片尺寸 · px</legend><div className={styles.formGrid}>{numericFilters.slice(0, 4).map((key) => <label key={key}>{filterLabels[key]}<input type="number" min="0" step="1" value={draft.get(key) || ""} onChange={(event) => change(key, event.target.value)} /></label>)}</div></fieldset>
    <fieldset><legend>导入时间 · 北京时间</legend><div className={styles.formGrid}><label>起始日期<input type="date" value={beijingDate(draft.get("addedFrom") || undefined)} onChange={(event) => change("addedFrom", event.target.value ? dateBoundary(event.target.value) : "")} /></label><label>结束日期<input type="date" value={dateEnd ? beijingDate(new Date(Date.parse(dateEnd) - 1).toISOString()) : ""} onChange={(event) => change("addedBefore", event.target.value ? dateBoundary(event.target.value, true) : "")} /></label></div></fieldset>
    <fieldset><legend>文件与状态</legend><div className={styles.formGrid}>{numericFilters.slice(4).map((key) => <label key={key}>{filterLabels[key]} · MB<input type="number" min="0" step="0.1" value={draft.has(key) ? Number(draft.get(key)) / 1024 ** 2 : ""} onChange={(event) => change(key, event.target.value ? String(Number(event.target.value) * 1024 ** 2) : "")} /></label>)}<label>打标状态<select aria-label="打标状态" value={draft.get("taggingStatus") || ""} onChange={(event) => change("taggingStatus", event.target.value)}><option value="">全部状态</option>{Object.entries(taggingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></fieldset>
    <fieldset><legend>素材内容</legend><div className={styles.formGrid}><label>图片类型<select aria-label="图片类型" value={draft.get("imageType") || ""} onChange={(event) => change("imageType", event.target.value)}><option value="">全部类型</option>{libraryImageTypes.map((type) => <option key={type} value={type}>{libraryImageTypeLabels[type]}</option>)}</select></label><label>人物<select aria-label="人物" value={draft.get("people") || ""} onChange={(event) => change("people", event.target.value)}><option value="">不限</option><option value="yes">有人物</option><option value="no">无人物</option><option value="unknown">未知</option></select></label>{["vehicleModel", "vehicleColor", "scene"].map((key) => <label key={key}>{filterLabels[key]}<TagInput suggest={false} value={draft.getAll(key)} onChange={(values) => change(key, values)} placeholder={`添加${filterLabels[key]}`} /></label>)}<label>角度<select aria-label="角度" value={draft.get("angle") || ""} onChange={(event) => change("angle", event.target.value)}><option value="">不限角度</option>{libraryAngleOptions.map((angle) => <option key={angle} value={angle}>{libraryAngleLabels[angle]}</option>)}</select></label></div></fieldset>
  </div>{error ? <p className={styles.pickerError} role="alert">{error}</p> : null}<footer><button onClick={onClose}>取消</button><button className={styles.primary} onClick={() => { try { validateFilterRanges(draft); onApply(draft); } catch (error) { setError(errorMessage(error)); } }}>应用筛选</button></footer></Dialog>;
}

function AssetCard({ asset, selected, onSelect, onView, onFavorite }: { asset: LibraryAsset; selected: boolean; onSelect: () => void; onView: () => void; onFavorite: () => void }) {
  return <article className={`${styles.card} ${selected ? styles.cardSelected : ""}`}><div className={styles.cardImage}><button className={styles.cardMain} onClick={onView} aria-label={`查看 ${asset.name}`}><img src={asset.thumbnailUrl} alt={asset.name} loading="lazy" /></button><label className={styles.cardCheck}><input type="checkbox" aria-label={`选择 ${asset.name}`} checked={selected} onChange={onSelect} /></label><span className={styles.scope} title={asset.visibility === "team" ? "团队" : "个人"}>{asset.visibility === "team" ? <UsersRound /> : <ImageIcon />}</span></div><div className={styles.cardMeta}><button onClick={onView}><strong>{asset.name}</strong><span>{asset.width || "?"} × {asset.height || "?"} · {asset.ownerDisplayName}</span></button><button className={asset.favorite ? styles.favoriteActive : ""} title={asset.favorite ? "取消收藏" : "收藏"} onClick={onFavorite}><Heart /></button></div></article>;
}

type ViewerProps = {
  assetId: string; assets: LibraryAsset[]; collections: LibraryCollection[]; hasMore: boolean; loadingMore: boolean;
  onMore: () => Promise<LibraryAsset | undefined>; onNavigate: (id: string, replace?: boolean) => void;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<LibraryAsset>;
  onFavorite: (asset: LibraryAsset) => Promise<LibraryAsset>;
  onOrganize: (asset: LibraryAsset, collectionId: string, add: boolean) => Promise<LibraryAsset>;
  onDelete: (asset: LibraryAsset, after: () => void) => void;
};
function Viewer(props: ViewerProps) {
  const [requestedId, setRequestedId] = useState(props.assetId);
  const [asset, setAsset] = useState<LibraryAsset>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const guard = useRef<((go: () => void) => void) | null>(null);
  useEffect(() => {
    if (props.assetId === requestedId) return;
    const go = () => setRequestedId(props.assetId);
    if (guard.current) guard.current(go); else go();
  }, [props.assetId, requestedId]);
  useEffect(() => {
    // Synchronize the open viewer with external browser history, including close.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!requestedId) { setAsset(undefined); setError(""); return; }
    const controller = new AbortController(); setError("");
    void api<{ asset: LibraryAsset }>(`/api/library/assets/${encodeURIComponent(requestedId)}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setAsset(result.asset); }).catch((error) => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [requestedId, retry]);
  if (!requestedId && !asset) return null;
  const close = () => { setRequestedId(""); setAsset(undefined); props.onNavigate(""); };
  if (!asset || asset.id !== requestedId) return <Dialog title="图片查看" onClose={close}>{error ? <><p role="alert" className={styles.pickerError}>{error}</p><button onClick={() => setRetry((value) => value + 1)}>重试详情</button></> : <p><LoaderCircle className={styles.spin} />正在读取图片详情</p>}</Dialog>;
  return <ViewerEditor key={asset.id} {...props} asset={asset} onAsset={setAsset} registerGuard={(handler) => { guard.current = handler; }} onClose={close} onCancelTransition={() => props.onNavigate(asset.id, true)} />;
}

function ViewerEditor({ asset, onAsset, registerGuard, onClose, onCancelTransition, ...props }: ViewerProps & { asset: LibraryAsset; onAsset: (asset: LibraryAsset) => void; registerGuard: (handler: ((go: () => void) => void) | null) => void; onClose: () => void; onCancelTransition: () => void }) {
  const initialDraft = () => ({ name: asset.name, note: asset.note || "", visibility: asset.visibility, manualOverrides: asset.manualOverrides });
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(false);
  const [pending, setPending] = useState<{ go: () => void }>();
  const [zoom, setZoom] = useState<number | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number }>();
  const [imageError, setImageError] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const stageRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const anchor = useRef<{ x: number; y: number; left: number; top: number; width: number; height: number } | null>(null);
  const zoomRef = useRef<number | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft());
  const index = props.assets.findIndex((item) => item.id === asset.id);
  const fit = natural ? Math.min(1, Math.max(1, stageSize.width - 32) / natural.width, Math.max(1, stageSize.height - 32) / natural.height) : 1;
  const scale = zoom ?? fit;
  const tags = getLibraryUnifiedTagsForAsset({ ...asset, manualOverrides: draft.manualOverrides, effectiveTags: asset.effectiveTags });
  const displayedTags = dirty ? getLibraryUnifiedTagsForAsset({ ...asset, manualOverrides: draft.manualOverrides, effectiveTags: mergeDraftTags(asset, draft.manualOverrides) }) : tags;

  async function save() {
    setBusy(true); setError("");
    try { const saved = await props.onSave(asset.id, draft); onAsset(saved); setDraft({ name: saved.name, note: saved.note || "", visibility: saved.visibility, manualOverrides: saved.manualOverrides }); }
    catch (error) { setError(errorMessage(error)); throw error; }
    finally { setBusy(false); }
  }
  const request = useCallback((go: () => void) => { if (busy) return; if (dirty) setPending({ go }); else go(); }, [busy, dirty, setPending]);
  useEffect(() => { registerGuard(request); return () => registerGuard(null); }, [request, registerGuard]);
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const stage = stageRef.current; if (!stage) return;
    const wheel = (event: WheelEvent) => {
      if (!natural) return;
      event.preventDefault();
      const current = zoomRef.current ?? fit;
      const next = Math.min(4, Math.max(0.05, current * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
      if (next === current) return;
      const bounds = stage.getBoundingClientRect();
      anchor.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, left: stage.scrollLeft, top: stage.scrollTop, width: stage.scrollWidth, height: stage.scrollHeight };
      zoomRef.current = next; setZoom(next);
    };
    stage.addEventListener("wheel", wheel, { passive: false }); return () => stage.removeEventListener("wheel", wheel);
  }, [natural, fit]);
  useEffect(() => {
    const point = anchor.current, stage = stageRef.current;
    if (point && stage) { stage.scrollLeft = (point.left + point.x) / point.width * stage.scrollWidth - point.x; stage.scrollTop = (point.top + point.y) / point.height * stage.scrollHeight - point.y; anchor.current = null; }
  }, [zoom]);
  function changeZoom(value: number | null) { zoomRef.current = value; anchor.current = null; setZoom(value); if (stageRef.current) { stageRef.current.scrollLeft = 0; stageRef.current.scrollTop = 0; } }
  async function move(direction: number) {
    if (busy || props.loadingMore) return;
    const target = props.assets[index + direction];
    if (index >= 0 && target) { request(() => props.onNavigate(target.id)); return; }
    if (index >= 0 && direction > 0 && props.hasMore) {
      request(() => { void props.onMore().then((next) => { if (next) props.onNavigate(next.id); }).catch((error) => setError(`下一页加载失败：${errorMessage(error)}，请再次点击下一张重试`)); });
    }
  }
  async function action(command: () => Promise<LibraryAsset>) {
    setBusy(true); setError(""); try { onAsset(await command()); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  function changeTags(change: { add?: string[]; remove?: string[] }) {
    try { setDraft({ ...draft, manualOverrides: applyLibraryTagChanges({ effectiveTags: mergeDraftTags(asset, draft.manualOverrides), manualOverrides: draft.manualOverrides }, change) }); setError(""); }
    catch (error) { setError(errorMessage(error)); }
  }
  return <><Dialog title="图片查看" onClose={() => request(onClose)} busy={busy} className={styles.viewer} onKeyDown={(event) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || isEditableSelectionTarget(event.target) || pending || busy) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); void move(event.key === "ArrowRight" ? 1 : -1); }
    else if (event.key === "Delete" && asset.canEdit && !event.repeat) { event.preventDefault(); request(() => props.onDelete(asset, onClose)); }
  }}>
    <div className={styles.viewerHeading}><strong>{asset.name}</strong><span>{index < 0 ? "独立素材" : `${index + 1} / ${props.assets.length}${props.hasMore ? "+" : ""}`}</span><button aria-expanded={details} onClick={() => setDetails((value) => !value)}>图片详情</button></div>
    <div className={styles.viewerBody}>
      <div className={styles.viewerVisual}><div className={styles.zoomTools}><button disabled={!natural || busy} aria-label="缩小" onClick={() => changeZoom(Math.max(0.05, scale / 1.25))}><ZoomOut /></button><span>{Math.round(scale * 100)}%</span><button disabled={!natural || busy} aria-label="放大" onClick={() => changeZoom(Math.min(4, scale * 1.25))}><ZoomIn /></button><button disabled={!natural || busy} onClick={() => changeZoom(1)}>实际尺寸</button><button disabled={!natural || busy} onClick={() => changeZoom(null)}>复位</button></div>
        <div className={styles.imageStage} ref={stageRef} onPointerDown={(event) => { if (event.button !== 0 && event.button !== 1) return; event.preventDefault(); const stage = event.currentTarget; stage.setPointerCapture(event.pointerId); pan.current = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop }; }} onPointerMove={(event) => { if (!pan.current) return; event.currentTarget.scrollLeft = pan.current.left - event.clientX + pan.current.x; event.currentTarget.scrollTop = pan.current.top - event.clientY + pan.current.y; }} onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }}>
          <div className={styles.imageSurface} style={natural ? { width: Math.max(stageSize.width, natural.width * scale + 32), height: Math.max(stageSize.height, natural.height * scale + 32) } : undefined}>
            <img key={imageRetry} src={asset.publicUrl} alt={asset.name} draggable={false} style={natural ? { width: natural.width * scale, height: natural.height * scale } : { maxWidth: "100%", maxHeight: "100%" }} onLoad={(event) => { setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setImageError(false); }} onError={() => setImageError(true)} />
            {imageError ? <div role="alert" className={styles.imageFailure}>原图加载失败<button onClick={() => { setImageError(false); setImageRetry((value) => value + 1); }}>重试原图</button></div> : !natural ? <span className={styles.imageFailure}><LoaderCircle className={styles.spin} />加载原图</span> : null}
          </div>
        </div>
        <div className={styles.viewerNavigation}><button aria-label="上一张" disabled={busy || index <= 0 || props.loadingMore} onClick={() => void move(-1)}><ChevronLeft />上一张</button><button aria-label="下一张" disabled={busy || props.loadingMore || index < 0 || (index === props.assets.length - 1 && !props.hasMore)} onClick={() => void move(1)}>{props.loadingMore ? <LoaderCircle className={styles.spin} /> : <ChevronRight />}下一张</button></div>
        <div className={styles.previewRail}>{props.assets.slice(Math.max(0, index - 5), Math.max(0, index) + 6).map((item) => <button key={item.id} disabled={busy} aria-label={`查看 ${item.name}`} className={item.id === asset.id ? styles.previewCurrent : ""} onClick={() => request(() => props.onNavigate(item.id))}><img src={item.thumbnailUrl} alt="" loading="lazy" /></button>)}</div>
      </div>
      <aside className={`${styles.viewerDetails} ${details ? styles.detailsOpen : ""}`} aria-label="图片详情">
        <label>名称<input disabled={!asset.canEdit || busy} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>备注<textarea aria-label="备注" disabled={!asset.canEdit || busy} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
        <label>共享范围<select aria-label="共享范围" disabled={!asset.canEdit || busy} value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value as LibraryVisibility })}><option value="private">个人</option><option value="team">团队</option></select></label>
        <fieldset><legend>标签</legend><div className={styles.detailTags}>{displayedTags.map((tag) => <span key={tag.label}>{tag.label}{asset.canEdit ? <button disabled={busy} aria-label={`移除素材标签 ${tag.label}`} onClick={() => changeTags({ remove: [tag.label] })}><X /></button> : null}</span>)}</div>{asset.canEdit ? <TagInput value={[]} onChange={(tags) => changeTags({ add: tags })} placeholder="添加素材标签" disabled={busy} /> : null}</fieldset>
        <fieldset><legend>所属图集</legend>{asset.collectionIds.map((id) => { const collection = props.collections.find((item) => item.id === id); return <p key={id}>{collection?.relativePath || collection?.name || "无权查看的图集"}</p>; })}<p className={styles.hint}>图集归属单独保存，共享图片也可加入本人图集。</p>{props.collections.filter((item) => item.canEdit).map((collection) => <label className={styles.collectionCheck} key={collection.id}><input type="checkbox" disabled={busy} checked={asset.collectionIds.includes(collection.id)} onChange={(event) => { const checked = event.target.checked; request(() => void action(() => props.onOrganize(asset, collection.id, checked))); }} />{collection.relativePath || collection.name}</label>)}</fieldset>
        <dl className={styles.detailInfo}><dt>尺寸</dt><dd>{asset.width || "?"} × {asset.height || "?"}</dd><dt>大小</dt><dd>{formatBytes(asset.byteSize)}</dd><dt>导入时间</dt><dd>{new Date(asset.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd><dt>打标状态</dt><dd>{taggingLabels[asset.taggingStatus]}</dd><dt>所有者</dt><dd>{asset.ownerDisplayName}</dd></dl>
        <div className={styles.viewerEditActions}><button disabled={busy} onClick={() => void action(() => props.onFavorite(asset))}><Heart />{asset.favorite ? "取消收藏" : "收藏"}</button>{asset.canEdit ? <><button className={styles.primary} disabled={busy || !dirty || !draft.name.trim()} onClick={() => void save().catch(() => undefined)}><Check />保存</button><button className={styles.danger} disabled={busy} onClick={() => request(() => props.onDelete(asset, onClose))}>永久删除</button></> : <span>元数据只读</span>}</div>
      </aside>
    </div>{error ? <p role="alert" className={styles.viewerError}>{error}</p> : null}
  </Dialog>{pending ? <Dialog title="尚有未保存修改" busy={busy} onClose={() => { setPending(undefined); onCancelTransition(); }}><p>保存修改后继续，或放弃本次修改。</p>{error ? <p className={styles.pickerError} role="alert">{error}</p> : null}<footer><button disabled={busy} onClick={() => { setPending(undefined); onCancelTransition(); }}>继续编辑</button><button disabled={busy} onClick={() => { const go = pending.go; setDraft(initialDraft()); setPending(undefined); go(); }}>放弃修改</button><button className={styles.primary} disabled={busy || !draft.name.trim()} onClick={() => { const go = pending.go; void save().then(() => { setPending(undefined); go(); }).catch(() => undefined); }}>保存后继续</button></footer></Dialog> : null}</>;
}

function Dialog({ title, children, onClose, busy = false, className = "", onKeyDown }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string; onKeyDown?: (event: React.KeyboardEvent<HTMLDialogElement>) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const opener = document.activeElement; dialog?.showModal(); return () => { dialog?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); }; }, []);
  return <dialog ref={ref} className={`${styles.modal} ${className}`} aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={onKeyDown}><header><strong>{title}</strong><button disabled={busy} aria-label={`关闭${title}`} onClick={onClose}><X /></button></header>{children}</dialog>;
}

function ConfirmDialog({ title, text, onClose, onConfirm }: { title: string; text: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <Dialog title={title} onClose={onClose} busy={busy}><p>{text}</p>{error ? <p role="alert" className={styles.pickerError}>{error}</p> : null}<footer><button disabled={busy} onClick={onClose}>取消</button><button className={styles.danger} disabled={busy} onClick={() => { setBusy(true); setError(""); void onConfirm().catch((error) => setError(errorMessage(error))).finally(() => setBusy(false)); }}>{busy ? "处理中…" : "确认删除"}</button></footer></Dialog>;
}

function NameDialog({ title, initial, onClose, onSave }: { title: string; initial: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <Dialog title={title} onClose={onClose} busy={busy}><label>图集名称<input autoFocus value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>{error ? <p className={styles.pickerError} role="alert">{error}</p> : null}<footer><button disabled={busy} onClick={onClose}>取消</button><button className={styles.primary} disabled={busy || !name.trim()} onClick={() => { setBusy(true); void onSave(name.trim()).catch((error) => setError(errorMessage(error))).finally(() => setBusy(false)); }}>保存</button></footer></Dialog>;
}

function BatchTagDialog({ action, onClose, onSave }: { action: "add" | "remove"; onClose: () => void; onSave: (values: string[]) => Promise<void> }) {
  const [tags, setTags] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <Dialog title={action === "add" ? "批量添加标签" : "批量移除标签"} onClose={onClose} busy={busy}><TagInput value={tags} onChange={setTags} placeholder="输入标签并按回车" disabled={busy} />{error ? <p className={styles.pickerError} role="alert">{error}</p> : null}<footer><button disabled={busy} onClick={onClose}>取消</button><button className={styles.primary} disabled={busy || !tags.length} onClick={() => { setBusy(true); void onSave(tags).catch((error) => setError(errorMessage(error))).finally(() => setBusy(false)); }}>应用标签</button></footer></Dialog>;
}

function CollectionPicker({ draft, collections, onClose, onSubmit }: { draft: CollectionPickerDraft; collections: LibraryCollection[]; onClose: () => void; onSubmit: (targetId: string) => Promise<void> }) {
  const [search, setSearch] = useState(""); const [targetId, setTargetId] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const title = draft.source ? "移动到图集" : "加入图集";
  const targets = collections.filter((item) => item.canEdit && item.id !== draft.source?.id);
  const visible = targets.filter((item) => `${item.relativePath || item.name} ${item.ownerDisplayName}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <Dialog title={title} onClose={onClose} busy={busy} className={styles.collectionPicker}><div className={styles.collectionSummary}><span>已选图片</span><strong>{draft.count} 张</strong>{draft.source ? <><span>来源图集</span><strong>{draft.source.relativePath || draft.source.name}</strong></> : null}<span>目标图集</span><strong>{targets.find((item) => item.id === targetId)?.relativePath || "未选择"}</strong></div><label>搜索图集<input autoFocus type="search" value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} /></label><fieldset className={styles.collectionOptions} disabled={busy}><legend>目标图集</legend>{visible.length ? visible.map((item) => <label key={item.id}><input type="radio" name="target-collection" checked={targetId === item.id} onChange={() => setTargetId(item.id)} /><span><strong>{item.relativePath || item.name}</strong><small>{item.ownerDisplayName}</small></span></label>) : <p>暂无可选图集</p>}</fieldset>{error ? <p className={styles.pickerError} role="alert">{error}</p> : null}<footer><button disabled={busy} onClick={onClose}>取消</button><button className={styles.primary} disabled={busy || !targetId} onClick={() => { setBusy(true); void onSubmit(targetId).catch((error) => setError(errorMessage(error))).finally(() => setBusy(false)); }}>{title}</button></footer></Dialog>;
}

function ImportDialog({ files, collections, defaultCollection, onClose, onImport }: { files: File[]; collections: LibraryCollection[]; defaultCollection: string; onClose: () => void; onImport: (collectionId: string, visibility: LibraryVisibility) => void }) {
  const [collectionId, setCollectionId] = useState(defaultCollection); const [visibility, setVisibility] = useState<LibraryVisibility>("team");
  return <Dialog title="导入图片" onClose={onClose}><p>已选择 {files.length} 个文件。支持 JPEG、PNG、GIF、WebP，单张不超过 30MB。</p><label>目标图集<select aria-label="目标图集" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">未分类</option>{collections.filter((item) => item.canEdit).map((item) => <option key={item.id} value={item.id}>{item.relativePath || item.name}</option>)}</select></label><label>共享范围<select aria-label="共享范围" value={visibility} onChange={(event) => setVisibility(event.target.value as LibraryVisibility)}><option value="team">团队</option><option value="private">个人</option></select></label><p className={styles.hint}>串行上传；重复文件显示“已存在”，不会改变原素材的共享范围。导入后不会自动 AI 打标。</p><footer><button onClick={onClose}>取消</button><button className={styles.primary} onClick={() => onImport(collectionId, visibility)}>开始导入</button></footer></Dialog>;
}

function ImportQueue({ rows, collapsed, onCollapse, onCancel, onClear, onRetry }: { rows: ImportRow[]; collapsed: boolean; onCollapse: () => void; onCancel: () => void; onClear: () => void; onRetry: (id: number) => void }) {
  const counts = Object.fromEntries(["queued", "loading", "done", "duplicate", "error", "cancelled"].map((state) => [state, rows.filter((row) => row.state === state).length]));
  const ended = rows.length - counts.queued - counts.loading;
  return <section className={styles.imports} aria-label="导入队列"><header><strong>导入队列 {ended}/{rows.length}</strong><button aria-label={collapsed ? "展开导入队列" : "收起导入队列"} onClick={onCollapse}>{collapsed ? <ChevronDown /> : <X />}</button></header><p>成功 {counts.done} · 重复 {counts.duplicate} · 失败 {counts.error} · 取消 {counts.cancelled}</p>{!collapsed ? <><progress value={ended} max={rows.length} /><div className={styles.queueRows}>{rows.map((row) => <div key={row.id}><span title={row.file.name}>{row.file.name}</span><small data-state={row.state}>{row.state === "queued" ? "等待上传" : row.state === "loading" ? "上传中" : row.state === "done" ? "已导入" : row.state === "duplicate" ? "已存在" : row.state === "cancelled" ? "已取消" : row.message}</small>{row.state === "error" && row.retryable ? <button onClick={() => onRetry(row.id)}>重试</button> : null}</div>)}</div><footer><button disabled={!counts.queued} onClick={onCancel}>取消等待项</button><button disabled={!ended} onClick={onClear}>清除已结束</button></footer><small>仅保留当前页面会话的导入记录</small></> : null}</section>;
}

const smartFields: Array<{ value: LibrarySmartFolderCondition["field"]; label: string }> = [{ value: "tag", label: "标签" }, { value: "collection", label: "所属图集" }, { value: "text", label: "名称 / 文件名 / 备注" }, { value: "owner", label: "所有者 ID" }, { value: "visibility", label: "共享范围" }, { value: "imageType", label: "图片类型" }, { value: "width", label: "宽度" }, { value: "height", label: "高度" }, { value: "byteSize", label: "文件大小 · 字节" }, { value: "createdAt", label: "入库时间" }, { value: "taggingStatus", label: "打标状态" }, { value: "favorite", label: "收藏" }];
const operatorLabels = { contains: "包含", not_contains: "不包含", equals: "等于", one_of: "任一", gte: "大于等于", lte: "小于等于", before: "早于", after: "晚于", is: "是" };
function SmartFolderDialog({ draft, collections, onChange, onClose, onSave }: { draft: SmartDraft; collections: LibraryCollection[]; onChange: (draft: SmartDraft) => void; onClose: () => void; onSave: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const update = (index: number, patch: Partial<LibrarySmartFolderCondition>) => onChange({ ...draft, conditions: draft.conditions.map((item, i) => i === index ? { ...item, ...patch } : item) });
  return <Dialog title={draft.id ? "编辑智能文件夹" : "新建智能文件夹"} onClose={onClose} busy={busy}><label>名称<input value={draft.name} disabled={busy} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label><div className={styles.segment}>{(["all", "any"] as const).map((match) => <button disabled={busy} key={match} aria-pressed={draft.match === match} onClick={() => onChange({ ...draft, match })}>{match === "all" ? "满足全部" : "满足任一"}</button>)}</div>{draft.conditions.map((condition, index) => <div className={styles.condition} key={condition.id}><select aria-label="条件字段" disabled={busy} value={condition.field} onChange={(event) => { const field = event.target.value as LibrarySmartFolderCondition["field"]; update(index, { field, operator: smartOperators[field][0], value: field === "favorite" ? true : ["width", "height", "byteSize"].includes(field) ? 0 : "" }); }}>{smartFields.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select aria-label="条件操作符" disabled={busy} value={condition.operator} onChange={(event) => { const operator = event.target.value as LibrarySmartFolderCondition["operator"]; update(index, { operator, value: operator === "one_of" ? [String(condition.value)].filter(Boolean) : Array.isArray(condition.value) ? condition.value[0] || "" : condition.value }); }}>{smartOperators[condition.field].map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}</select><SmartValue condition={condition} collections={collections} disabled={busy} onChange={(value) => update(index, { value })} /><button disabled={busy} title="删除条件" onClick={() => onChange({ ...draft, conditions: draft.conditions.filter((_, i) => i !== index) })}><Trash2 /></button>{condition.field === "collection" ? <label className={styles.check}><input type="checkbox" disabled={busy} checked={condition.includeDescendants !== false} onChange={(event) => update(index, { includeDescendants: event.target.checked })} />包含子图集</label> : null}</div>)}<button disabled={busy} onClick={() => onChange({ ...draft, conditions: [...draft.conditions, newCondition()] })}><Plus />添加条件</button><label>共享范围<select disabled={busy} value={draft.visibility} onChange={(event) => onChange({ ...draft, visibility: event.target.value as LibraryVisibility })}><option value="private">个人</option><option value="team">团队</option></select></label>{error ? <p className={styles.pickerError} role="alert">{error}</p> : null}<footer><button disabled={busy} onClick={onClose}>取消</button><button className={styles.primary} disabled={busy || !draft.name.trim() || !draft.conditions.length} onClick={() => { setBusy(true); void onSave().catch((error) => setError(errorMessage(error))).finally(() => setBusy(false)); }}>保存</button></footer></Dialog>;
}
function SmartValue({ condition, collections, disabled, onChange }: { condition: LibrarySmartFolderCondition; collections: LibraryCollection[]; disabled: boolean; onChange: (value: LibrarySmartFolderCondition["value"]) => void }) {
  const options = condition.field === "collection" ? collections.map((item) => [item.id, item.relativePath || item.name]) : condition.field === "visibility" ? [["private", "个人"], ["team", "团队"]] : condition.field === "taggingStatus" ? Object.entries(taggingLabels) : condition.field === "imageType" ? Object.entries(libraryImageTypeLabels) : condition.field === "favorite" ? [["true", "已收藏"], ["false", "未收藏"]] : undefined;
  if (options) return <select aria-label="条件值" disabled={disabled} multiple={condition.operator === "one_of"} value={condition.operator === "one_of" ? Array.isArray(condition.value) ? condition.value : [String(condition.value)] : String(condition.value)} onChange={(event) => onChange(condition.field === "favorite" ? event.target.value === "true" : condition.operator === "one_of" ? [...event.target.selectedOptions].map((option) => option.value) : event.target.value)}><option value="" disabled>请选择</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>;
  if (["width", "height", "byteSize"].includes(condition.field)) return <input aria-label="条件值" type="number" min="0" disabled={disabled} value={String(condition.value)} onChange={(event) => onChange(Number(event.target.value))} />;
  if (condition.field === "createdAt") return <input aria-label="条件值" type="date" disabled={disabled} value={beijingDate(String(condition.value) || undefined)} onChange={(event) => onChange(event.target.value ? dateBoundary(event.target.value) : "")} />;
  return <input aria-label="条件值" disabled={disabled} placeholder={condition.operator === "one_of" ? "逗号分隔多个值" : "输入条件值"} value={Array.isArray(condition.value) ? condition.value.join(",") : String(condition.value)} onChange={(event) => onChange(condition.operator === "one_of" ? splitComma(event.target.value) : event.target.value)} />;
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count: number; onClick: () => void }) { return <button className={active ? styles.navActive : styles.navButton} onClick={onClick}>{icon}<span>{label}</span><small>{count}</small></button>; }
function SidebarHeading({ label, onAdd }: { label: string; onAdd: () => void }) { return <div className={styles.sideHeading}><strong>{label}</strong><button title={`新建${label}`} onClick={onAdd}><Plus /></button></div>; }
function collectionDepth(collection: LibraryCollection, collections: LibraryCollection[]) { let depth = 0, parent = collection.parentId; const seen = new Set<string>(); while (parent && !seen.has(parent)) { seen.add(parent); depth += 1; parent = collections.find((item) => item.id === parent)?.parentId; } return Math.min(depth, 8); }
function viewTitle(view: LibraryView, navigation: LibraryNavigation) { if (view.kind === "all") return "全部图片"; if (view.kind === "uncategorized") return "未分类"; if (view.kind === "favorites") return "收藏"; if (view.kind === "collection") return navigation.collections.find((item) => item.id === view.id)?.name || "图集"; return navigation.smartFolders.find((item) => item.id === view.id)?.name || "智能文件夹"; }
function toggleSet(current: Set<string>, value: string) { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }
let conditionSequence = 0;
function newCondition(): LibrarySmartFolderCondition { return { id: `condition-${Date.now()}-${++conditionSequence}`, field: "tag", operator: "contains", value: "", includeDescendants: true }; }
function newSmartDraft(): SmartDraft { return { name: "", visibility: "private", match: "all", conditions: [newCondition()] }; }
function hasFiles(event: DragEvent) { return event.dataTransfer.types.includes("Files"); }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }
function splitComma(value: string) { return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "请求失败"; }
function mergeDraftTags(asset: LibraryAsset, overrides: LibraryManualTagOverrides) { return mergeLibraryTagProfile(asset.aiTags, overrides); }
async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const body = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(body.error || `请求失败 (${response.status})`); return body; }
