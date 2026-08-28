"use client";

import Link from "next/link";
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, Folder, FolderPlus, Heart, Image as ImageIcon,
  Images, LoaderCircle, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Share2, Sparkles, Tag,
  Trash2, Upload, UserRound, UsersRound, WandSparkles, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react";
import { getLibraryUnifiedTagsForAsset } from "@/lib/library-tags";
import { getStoredTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";
import type {
  LibraryAsset, LibraryAssetFilters, LibraryAssetPage, LibraryCollection, LibraryListSort, LibraryNavigation,
  LibrarySelection, LibrarySmartFolder, LibrarySmartFolderCondition, LibraryTagSuggestion, LibraryVisibility,
} from "@/lib/types";
import styles from "./library.module.css";

type View = { kind: "all" } | { kind: "uncategorized" } | { kind: "favorites" } | { kind: "collection"; id: string } | { kind: "smart"; id: string };
type ImportRow = { id: string; name: string; state: "loading" | "done" | "duplicate" | "error"; message?: string };
type SmartDraft = Pick<LibrarySmartFolder, "name" | "visibility" | "match" | "conditions"> & { id?: string };
const emptyNavigation: LibraryNavigation = { collections: [], smartFolders: [], counts: { all: 0, uncategorized: 0, favorites: 0 } };
const emptyPage: LibraryAssetPage = { assets: [], total: 0 };

export default function LibraryPage() {
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, () => "professional" as ThemeMode);
  const [navigation, setNavigation] = useState(emptyNavigation);
  const [data, setData] = useState(emptyPage);
  const [view, setView] = useState<View>({ kind: "all" });
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [suggestions, setSuggestions] = useState<LibraryTagSuggestion[]>([]);
  const [visibility, setVisibility] = useState<"" | LibraryVisibility>("");
  const [taggingStatus, setTaggingStatus] = useState("");
  const [sort, setSort] = useState<LibraryListSort>("newest");
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(new Set<string>());
  const [allMatching, setAllMatching] = useState(false);
  const [excluded, setExcluded] = useState(new Set<string>());
  const [detailId, setDetailId] = useState<string>();
  const [previewIndex, setPreviewIndex] = useState<number>();
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [smartDraft, setSmartDraft] = useState<SmartDraft>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const filters = useMemo<LibraryAssetFilters>(() => ({
    search: search || undefined, tags, visibility: visibility || undefined,
    taggingStatus: (taggingStatus || undefined) as LibraryAssetFilters["taggingStatus"], sort, limit: 60,
    collectionId: view.kind === "collection" ? view.id : undefined,
    includeDescendants: view.kind === "collection" ? includeDescendants : undefined,
    smartFolderId: view.kind === "smart" ? view.id : undefined,
    uncategorized: view.kind === "uncategorized", favorite: view.kind === "favorites",
  }), [includeDescendants, search, sort, taggingStatus, tags, view, visibility]);
  const queryString = useMemo(() => filtersToQuery(filters), [filters]);
  const detail = data.assets.find((asset) => asset.id === detailId);
  const selectedCount = allMatching ? Math.max(0, data.total - excluded.size) : selected.size;
  const selection = useMemo<LibrarySelection>(() => allMatching
    ? { mode: "query", filters: { ...filters, limit: undefined }, excludedAssetIds: [...excluded] }
    : { mode: "ids", assetIds: [...selected] }, [allMatching, excluded, filters, selected]);

  const loadNavigation = useCallback(async () => setNavigation(await api<LibraryNavigation>("/api/library/navigation")), []);
  const reloadAssets = useCallback(async () => setData(await api<LibraryAssetPage>(`/api/library/assets?${queryString}`)), [queryString]);

  useEffect(() => { const timer = setTimeout(() => setSearch(searchDraft.trim()), 300); return () => clearTimeout(timer); }, [searchDraft]);
  useEffect(() => { void loadNavigation().catch((error) => setMessage(errorMessage(error))); }, [loadNavigation]);
  useEffect(() => {
    const id = ++requestRef.current; const controller = new AbortController();
    setLoading(true); setMessage(""); clearSelectionState(setSelected, setExcluded, setAllMatching); setDetailId(undefined);
    void api<LibraryAssetPage>(`/api/library/assets?${queryString}`, { signal: controller.signal })
      .then((result) => { if (id === requestRef.current) setData(result); })
      .catch((error) => { if (!controller.signal.aborted && id === requestRef.current) setMessage(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted && id === requestRef.current) setLoading(false); });
    return () => controller.abort();
  }, [queryString]);
  useEffect(() => {
    if (!tagDraft.trim()) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => void api<{ tags: LibraryTagSuggestion[] }>(`/api/library/tags?q=${encodeURIComponent(tagDraft)}&limit=8`, { signal: controller.signal }).then((result) => setSuggestions(result.tags)).catch(() => undefined), 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tagDraft]);
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => { const files = [...event.clipboardData?.files || []].filter((file) => file.type.startsWith("image/")); if (files.length) void importFiles(files); };
    window.addEventListener("paste", onPaste); return () => window.removeEventListener("paste", onPaste);
  });

  function clearSelection() { clearSelectionState(setSelected, setExcluded, setAllMatching); }
  function isSelected(id: string) { return allMatching ? !excluded.has(id) : selected.has(id); }
  function toggleAsset(id: string) { if (allMatching) setExcluded((current) => toggleSet(current, id)); else setSelected((current) => toggleSet(current, id)); }

  async function loadMore() {
    if (!data.nextCursor || loadingMore) return; setLoadingMore(true);
    try {
      const next = await api<LibraryAssetPage>(`/api/library/assets?${queryString}&cursor=${encodeURIComponent(data.nextCursor)}`);
      setData((current) => ({ ...next, assets: [...current.assets, ...next.assets.filter((asset) => !current.assets.some((item) => item.id === asset.id))] }));
    } catch (error) { setMessage(errorMessage(error)); } finally { setLoadingMore(false); }
  }

  async function runBatch(body: Record<string, unknown>, label: string) {
    if (!selectedCount || busy) return; setBusy(true); setMessage("");
    try {
      const result = await api<{ succeeded?: number; failed?: number; assets?: LibraryAsset[]; failures?: unknown[] }>("/api/library/assets/batch", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...body, selection }) });
      setMessage(`${label} ${result.succeeded ?? result.assets?.length ?? 0} 张${(result.failed ?? result.failures?.length ?? 0) ? `，失败 ${result.failed ?? result.failures?.length}` : ""}`);
      clearSelection(); await Promise.all([reloadAssets(), loadNavigation()]);
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  async function updateTags(add: string[] = [], remove: string[] = []) {
    if (!selectedCount) return; setBusy(true);
    try {
      const result = await api<{ assets: LibraryAsset[]; failures: unknown[] }>("/api/library/tags", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ selection, add, remove }) });
      setMessage(`已更新 ${result.assets.length} 张${result.failures.length ? `，失败 ${result.failures.length}` : ""}`); clearSelection(); await reloadAssets();
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  async function patchAsset(assetId: string, patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const result = await api<{ asset: LibraryAsset }>(`/api/library/assets/${encodeURIComponent(assetId)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(patch) });
      setData((current) => ({ ...current, assets: current.assets.map((asset) => asset.id === assetId ? result.asset : asset) })); setMessage("已保存");
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  async function toggleFavorite(asset: LibraryAsset) {
    try {
      await api("/api/library/favorites", { method: asset.favorite ? "DELETE" : "POST", headers: jsonHeaders, body: JSON.stringify({ selection: { mode: "ids", assetIds: [asset.id] } }) });
      setData((current) => ({ ...current, assets: current.assets.map((item) => item.id === asset.id ? { ...item, favorite: !asset.favorite } : item) })); void loadNavigation();
    } catch (error) { setMessage(errorMessage(error)); }
  }

  async function createCollection(parentId?: string) {
    const name = window.prompt("图集名称"); if (!name?.trim()) return;
    try { await api("/api/library/collections", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name, parentId, visibility: "private" }) }); await loadNavigation(); }
    catch (error) { setMessage(errorMessage(error)); }
  }

  async function editCollection(collection: LibraryCollection) {
    const name = window.prompt("图集名称", collection.name); if (!name?.trim() || name === collection.name) return;
    try { await api(`/api/library/collections/${encodeURIComponent(collection.id)}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ name }) }); await loadNavigation(); }
    catch (error) { setMessage(errorMessage(error)); }
  }

  async function deleteCollection(collection: LibraryCollection) {
    if (!window.confirm(`删除图集“${collection.name}”？图片不会被删除，子图集会上移。`)) return;
    try { await api(`/api/library/collections/${encodeURIComponent(collection.id)}`, { method: "DELETE" }); if (view.kind === "collection" && view.id === collection.id) setView({ kind: "all" }); await loadNavigation(); }
    catch (error) { setMessage(errorMessage(error)); }
  }

  async function saveSmartFolder() {
    if (!smartDraft) return; setBusy(true);
    try {
      await api(smartDraft.id ? `/api/library/smart-folders/${encodeURIComponent(smartDraft.id)}` : "/api/library/smart-folders", { method: smartDraft.id ? "PATCH" : "POST", headers: jsonHeaders, body: JSON.stringify(smartDraft) });
      setSmartDraft(undefined); await loadNavigation();
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  async function deleteSmartFolder(folder: LibrarySmartFolder) {
    if (!window.confirm(`删除智能文件夹“${folder.name}”？`)) return;
    try { await api(`/api/library/smart-folders/${encodeURIComponent(folder.id)}`, { method: "DELETE" }); if (view.kind === "smart" && view.id === folder.id) setView({ kind: "all" }); await loadNavigation(); }
    catch (error) { setMessage(errorMessage(error)); }
  }

  async function importFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/")); if (!images.length) return;
    const rows = images.map((file, index) => ({ id: `${Date.now()}-${index}`, name: file.name, state: "loading" as const })); setImports((current) => [...rows, ...current].slice(0, 20));
    for (let index = 0; index < images.length; index += 1) {
      const form = new FormData(); form.set("file", images[index]); if (view.kind === "collection") form.set("collectionIds", JSON.stringify([view.id]));
      try { const result = await api<{ status: "imported" | "skipped_duplicate" }>("/api/library/import", { method: "POST", body: form }); setImports((current) => current.map((row) => row.id === rows[index].id ? { ...row, state: result.status === "imported" ? "done" : "duplicate" } : row)); }
      catch (error) { setImports((current) => current.map((row) => row.id === rows[index].id ? { ...row, state: "error", message: errorMessage(error) } : row)); }
    }
    await Promise.all([reloadAssets(), loadNavigation()]);
  }

  const title = viewTitle(view, navigation);

  return <main className={styles.page} onDragEnter={(event) => { if (hasFiles(event)) setDragging(true); }} onDragOver={(event) => { if (hasFiles(event)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); setDragging(false); void importFiles([...event.dataTransfer.files]); }}>
    <header className={styles.header}><div className={styles.brand}><Link href="/" className={styles.iconButton} title="返回内容台"><ArrowLeft /></Link><div><strong>图库</strong><span>{title} · {data.total} 张</span></div></div><div className={styles.headerActions}><button className={styles.iconButton} title="刷新" onClick={() => void Promise.all([reloadAssets(), loadNavigation()])}><RefreshCw /></button><button className={styles.primary} onClick={() => fileInputRef.current?.click()}><Upload />导入</button><input ref={fileInputRef} hidden multiple accept="image/*" type="file" onChange={(event) => { void importFiles([...event.target.files || []]); event.target.value = ""; }} /></div></header>
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <NavButton active={view.kind === "all"} icon={<Images />} label="全部图片" count={navigation.counts.all} onClick={() => setView({ kind: "all" })} />
        <NavButton active={view.kind === "uncategorized"} icon={<ImageIcon />} label="未分类" count={navigation.counts.uncategorized} onClick={() => setView({ kind: "uncategorized" })} />
        <NavButton active={view.kind === "favorites"} icon={<Heart />} label="收藏" count={navigation.counts.favorites} onClick={() => setView({ kind: "favorites" })} />
        <SidebarHeading label="图集" onAdd={() => void createCollection(view.kind === "collection" ? view.id : undefined)} />
        <div className={styles.tree}>{navigation.collections.map((collection) => <div className={styles.navRow} key={collection.id} style={{ paddingLeft: 8 + collectionDepth(collection, navigation.collections) * 14 }}><button className={view.kind === "collection" && view.id === collection.id ? styles.navActive : styles.navButton} onClick={() => setView({ kind: "collection", id: collection.id })}><Folder /><span>{collection.name}</span>{collection.visibility === "team" ? <UsersRound /> : null}</button>{collection.canEdit ? <div className={styles.rowActions}><button title="重命名" onClick={() => void editCollection(collection)}><Pencil /></button><button title="删除" onClick={() => void deleteCollection(collection)}><Trash2 /></button></div> : null}</div>)}</div>
        <SidebarHeading label="智能文件夹" onAdd={() => setSmartDraft(newSmartDraft())} />
        <div className={styles.tree}>{navigation.smartFolders.map((folder) => <div className={styles.navRow} key={folder.id}><button className={view.kind === "smart" && view.id === folder.id ? styles.navActive : styles.navButton} onClick={() => setView({ kind: "smart", id: folder.id })}><WandSparkles /><span>{folder.name}</span>{folder.visibility === "team" ? <UsersRound /> : null}</button>{folder.canEdit ? <div className={styles.rowActions}><button title="编辑" onClick={() => setSmartDraft({ ...folder })}><Pencil /></button><button title="删除" onClick={() => void deleteSmartFolder(folder)}><Trash2 /></button></div> : null}</div>)}</div>
      </aside>
      <section className={styles.content}>
        <LibraryToolbar search={searchDraft} tags={tags} tagDraft={tagDraft} suggestions={suggestions} visibility={visibility} taggingStatus={taggingStatus} sort={sort} includeDescendants={includeDescendants} showDescendants={view.kind === "collection"} onSearch={setSearchDraft} onTagDraft={setTagDraft} onAddTag={(tag) => { setTags((current) => current.includes(tag) ? current : [...current, tag]); setTagDraft(""); }} onRemoveTag={(tag) => setTags((current) => current.filter((item) => item !== tag))} onVisibility={setVisibility} onTaggingStatus={setTaggingStatus} onSort={setSort} onDescendants={setIncludeDescendants} />
        {selectedCount ? <BatchBar count={selectedCount} allMatching={allMatching} canSelectAll={!allMatching && selected.size === data.assets.length && data.total > data.assets.length} busy={busy} onSelectAll={() => { setAllMatching(true); setSelected(new Set()); }} onAddTag={() => { const value = window.prompt("添加标签"); if (value?.trim()) void updateTags(splitComma(value)); }} onRemoveTag={() => { const value = window.prompt("移除标签"); if (value?.trim()) void updateTags([], splitComma(value)); }} onFavorite={() => void runBatch({ action: "set_favorite", favorite: true }, "已收藏")} onTeam={() => void runBatch({ action: "set_visibility", visibility: "team" }, "已共享")} onPrivate={() => void runBatch({ action: "set_visibility", visibility: "private" }, "已设为个人")} onCollection={() => { const id = window.prompt(`图集 ID\n${navigation.collections.map((item) => `${item.name}: ${item.id}`).join("\n")}`); if (id) void runBatch({ action: "add_to_collections", collectionIds: [id] }, "已加入图集"); }} onTagging={() => void api("/api/library/tagging", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ selection, mode: "all" }) }).then(() => { setMessage("已提交打标"); clearSelection(); }).catch((error) => setMessage(errorMessage(error)))} onDelete={() => { if (window.confirm(`永久删除 ${selectedCount} 张图片？此操作不可撤销。`)) void runBatch({ action: "delete", confirm: true }, "已删除"); }} onClear={clearSelection} /> : null}
        {message ? <div className={styles.message}>{message}<button onClick={() => setMessage("")}><X /></button></div> : null}
        <div className={styles.grid} aria-busy={loading}>{loading ? <div className={styles.state}><LoaderCircle className={styles.spin} />加载中</div> : null}{!loading && !data.assets.length ? <div className={styles.state}><ImageIcon />暂无图片</div> : null}{data.assets.map((asset, index) => <AssetCard key={asset.id} asset={asset} selected={isSelected(asset.id)} onSelect={() => toggleAsset(asset.id)} onDetail={() => setDetailId(asset.id)} onPreview={() => setPreviewIndex(index)} onFavorite={() => void toggleFavorite(asset)} />)}</div>
        {data.nextCursor ? <button className={styles.loadMore} disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <LoaderCircle className={styles.spin} /> : <MoreHorizontal />}{loadingMore ? "加载中" : "加载更多"}</button> : null}
      </section>
      {detail ? <DetailPanel key={detail.id} asset={detail} collections={navigation.collections} busy={busy} onClose={() => setDetailId(undefined)} onSave={(patch) => patchAsset(detail.id, patch)} onFavorite={() => void toggleFavorite(detail)} onPreview={() => setPreviewIndex(data.assets.findIndex((item) => item.id === detail.id))} /> : null}
    </div>
    {previewIndex !== undefined && data.assets[previewIndex] ? <Preview assets={data.assets} index={previewIndex} onIndex={setPreviewIndex} onClose={() => setPreviewIndex(undefined)} /> : null}
    {smartDraft ? <SmartFolderDialog draft={smartDraft} collections={navigation.collections} busy={busy} onChange={setSmartDraft} onClose={() => setSmartDraft(undefined)} onSave={() => void saveSmartFolder()} /> : null}
    {imports.length ? <div className={styles.imports}><strong>导入队列</strong>{imports.map((row) => <div key={row.id}><span>{row.name}</span><small data-state={row.state}>{row.state === "loading" ? "上传中" : row.state === "done" ? "已导入" : row.state === "duplicate" ? "已存在" : row.message || "失败"}</small></div>)}</div> : null}
    {dragging ? <div className={styles.dropZone} onDragLeave={() => setDragging(false)}><Upload /><strong>松开以导入图片</strong></div> : null}
  </main>;
}

function LibraryToolbar(props: {
  search: string; tags: string[]; tagDraft: string; suggestions: LibraryTagSuggestion[]; visibility: "" | LibraryVisibility;
  taggingStatus: string; sort: LibraryListSort; includeDescendants: boolean; showDescendants: boolean;
  onSearch: (value: string) => void; onTagDraft: (value: string) => void; onAddTag: (value: string) => void;
  onRemoveTag: (value: string) => void; onVisibility: (value: "" | LibraryVisibility) => void;
  onTaggingStatus: (value: string) => void; onSort: (value: LibraryListSort) => void; onDescendants: (value: boolean) => void;
}) {
  return <div className={styles.toolbar}>
    <label className={styles.search}><Search /><input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="搜索名称、文件名、备注或标签" /></label>
    <div className={styles.tagFilter}>{props.tags.map((tag) => <button key={tag} onClick={() => props.onRemoveTag(tag)}>{tag}<X /></button>)}<input value={props.tagDraft} onChange={(event) => props.onTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && props.tagDraft.trim()) props.onAddTag(props.tagDraft.trim()); }} placeholder="标签筛选" />{props.suggestions.length ? <div className={styles.suggestions}>{props.suggestions.map((item) => <button key={item.label} onClick={() => props.onAddTag(item.label)}>{item.label}<span>{item.count}</span></button>)}</div> : null}</div>
    <select value={props.visibility} onChange={(event) => props.onVisibility(event.target.value as "" | LibraryVisibility)}><option value="">全部范围</option><option value="private">个人</option><option value="team">团队</option></select>
    <select value={props.taggingStatus} onChange={(event) => props.onTaggingStatus(event.target.value)}><option value="">全部打标状态</option><option value="idle">未打标</option><option value="queued">排队中</option><option value="running">打标中</option><option value="completed">已完成</option><option value="failed">失败</option></select>
    <select value={props.sort} onChange={(event) => props.onSort(event.target.value as LibraryListSort)}><option value="newest">最新导入</option><option value="oldest">最早导入</option><option value="name-asc">名称 A-Z</option><option value="name-desc">名称 Z-A</option><option value="owner-asc">所有者 A-Z</option><option value="owner-desc">所有者 Z-A</option></select>
    {props.showDescendants ? <label className={styles.check}><input type="checkbox" checked={props.includeDescendants} onChange={(event) => props.onDescendants(event.target.checked)} />包含子图集</label> : null}
  </div>;
}

function BatchBar(props: {
  count: number; allMatching: boolean; canSelectAll: boolean; busy: boolean; onSelectAll: () => void; onAddTag: () => void;
  onRemoveTag: () => void; onFavorite: () => void; onTeam: () => void; onPrivate: () => void; onCollection: () => void;
  onTagging: () => void; onDelete: () => void; onClear: () => void;
}) {
  return <div className={styles.batchBar}><strong>{props.allMatching ? `已选择全部匹配 ${props.count} 张` : `已选择 ${props.count} 张`}</strong>{props.canSelectAll ? <button onClick={props.onSelectAll}>选择全部匹配</button> : null}<button disabled={props.busy} onClick={props.onAddTag}><Tag />加标签</button><button disabled={props.busy} onClick={props.onRemoveTag}><X />移除标签</button><button disabled={props.busy} onClick={props.onFavorite}><Heart />收藏</button><button disabled={props.busy} onClick={props.onTeam}><Share2 />团队</button><button disabled={props.busy} onClick={props.onPrivate}><UserRound />个人</button><button disabled={props.busy} onClick={props.onCollection}><FolderPlus />加入图集</button><button disabled={props.busy} onClick={props.onTagging}><Sparkles />AI 打标</button><button disabled={props.busy} className={styles.danger} onClick={props.onDelete}><Trash2 />删除</button><button disabled={props.busy} onClick={props.onClear}><X />取消</button></div>;
}

function AssetCard({ asset, selected, onSelect, onDetail, onPreview, onFavorite }: { asset: LibraryAsset; selected: boolean; onSelect: () => void; onDetail: () => void; onPreview: () => void; onFavorite: () => void }) {
  return <article className={`${styles.card} ${selected ? styles.cardSelected : ""}`}><button className={styles.cardMain} onClick={onSelect} onDoubleClick={onPreview}><img src={asset.thumbnailUrl} alt={asset.name} loading="lazy" /><span className={styles.cardCheck}>{selected ? <Check /> : null}</span><span className={styles.scope}>{asset.visibility === "team" ? <UsersRound /> : <UserRound />}</span></button><div className={styles.cardMeta}><button onClick={onDetail}><strong>{asset.name}</strong><span>{asset.ownerDisplayName}</span></button><button className={asset.favorite ? styles.favoriteActive : ""} title={asset.favorite ? "取消收藏" : "收藏"} onClick={onFavorite}><Heart /></button><button title="预览" onClick={onPreview}><Eye /></button></div></article>;
}

function DetailPanel({ asset, collections, busy, onClose, onSave, onFavorite, onPreview }: { asset: LibraryAsset; collections: LibraryCollection[]; busy: boolean; onClose: () => void; onSave: (patch: Record<string, unknown>) => void; onFavorite: () => void; onPreview: () => void }) {
  const [name, setName] = useState(asset.name); const [note, setNote] = useState(asset.note || ""); const [tag, setTag] = useState("");
  const unifiedTags = getLibraryUnifiedTagsForAsset(asset);
  return <aside className={styles.detail}><header><strong>图片详情</strong><button onClick={onClose}><X /></button></header><button className={styles.detailImage} onClick={onPreview}><img src={asset.thumbnailUrl} alt={asset.name} /></button><label><span>名称</span><input value={name} disabled={!asset.canEdit} onChange={(event) => setName(event.target.value)} /></label><label><span>备注</span><textarea value={note} disabled={!asset.canEdit} onChange={(event) => setNote(event.target.value)} /></label><label><span>共享范围</span><select value={asset.visibility} disabled={!asset.canEdit} onChange={(event) => onSave({ visibility: event.target.value })}><option value="private">个人</option><option value="team">团队</option></select></label><fieldset><legend>图集</legend>{collections.filter((item) => item.canEdit).map((collection) => <label className={styles.collectionCheck} key={collection.id}><input type="checkbox" checked={asset.collectionIds.includes(collection.id)} onChange={(event) => onSave({ collectionIds: event.target.checked ? [...asset.collectionIds, collection.id] : asset.collectionIds.filter((id) => id !== collection.id) })} />{collection.relativePath || collection.name}</label>)}</fieldset><fieldset><legend>标签</legend><div className={styles.detailTags}>{unifiedTags.map((item) => <span key={`${item.source}-${item.label}`}>{item.label}</span>)}</div>{asset.canEdit ? <div className={styles.inlineInput}><input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="添加标签" /><button onClick={() => { if (!tag.trim()) return; const customTags = [...new Set([...(asset.manualOverrides.customTags || []), tag.trim()])]; onSave({ manualOverrides: { ...asset.manualOverrides, customTags } }); setTag(""); }}><Plus /></button></div> : null}</fieldset><div className={styles.detailInfo}><span>{asset.width || "?"} × {asset.height || "?"}</span><span>{formatBytes(asset.byteSize)}</span><span>{new Date(asset.createdAt).toLocaleString("zh-CN")}</span><span>{asset.taggingStatus}</span></div><footer><button onClick={onFavorite}><Heart />{asset.favorite ? "取消收藏" : "收藏"}</button>{asset.canEdit ? <button className={styles.primary} disabled={busy} onClick={() => onSave({ name, note })}>{busy ? <LoaderCircle className={styles.spin} /> : <Check />}保存</button> : <span>只读</span>}</footer></aside>;
}

function Preview({ assets, index, onIndex, onClose }: { assets: LibraryAsset[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const asset = assets[index];
  return <div className={styles.preview} role="dialog" aria-modal="true"><header><strong>{asset.name}</strong><button onClick={onClose}><X /></button></header><button className={styles.previewArrow} onClick={() => onIndex((index - 1 + assets.length) % assets.length)}><ChevronLeft /></button><img src={asset.publicUrl} alt={asset.name} /><button className={styles.previewArrow} onClick={() => onIndex((index + 1) % assets.length)}><ChevronRight /></button><div className={styles.previewRail}>{assets.slice(Math.max(0, index - 5), index + 6).map((item) => <button key={item.id} className={item.id === asset.id ? styles.previewCurrent : ""} onClick={() => onIndex(assets.indexOf(item))}><img src={item.thumbnailUrl} alt="" /></button>)}</div></div>;
}

const smartFields: Array<{ value: LibrarySmartFolderCondition["field"]; label: string }> = [
  { value: "tag", label: "标签" }, { value: "collection", label: "所属图集" }, { value: "text", label: "名称 / 文件名 / 备注" },
  { value: "owner", label: "所有者" }, { value: "visibility", label: "共享范围" }, { value: "imageType", label: "图片类型" },
  { value: "width", label: "宽度" }, { value: "height", label: "高度" }, { value: "byteSize", label: "文件大小" },
  { value: "createdAt", label: "入库时间" }, { value: "taggingStatus", label: "打标状态" }, { value: "favorite", label: "收藏" },
];

function SmartFolderDialog({ draft, collections, busy, onChange, onClose, onSave }: { draft: SmartDraft; collections: LibraryCollection[]; busy: boolean; onChange: (draft: SmartDraft) => void; onClose: () => void; onSave: () => void }) {
  const update = (index: number, patch: Partial<LibrarySmartFolderCondition>) => onChange({ ...draft, conditions: draft.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  return <div className={styles.modalBackdrop}><section className={styles.modal}><header><strong>{draft.id ? "编辑智能文件夹" : "新建智能文件夹"}</strong><button onClick={onClose}><X /></button></header><label><span>名称</span><input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label><div className={styles.segment}><button className={draft.match === "all" ? styles.segmentActive : ""} onClick={() => onChange({ ...draft, match: "all" })}>满足全部</button><button className={draft.match === "any" ? styles.segmentActive : ""} onClick={() => onChange({ ...draft, match: "any" })}>满足任一</button></div>{draft.conditions.map((condition, index) => <div className={styles.condition} key={condition.id}><select value={condition.field} onChange={(event) => update(index, { field: event.target.value as LibrarySmartFolderCondition["field"], value: "" })}>{smartFields.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={condition.operator} onChange={(event) => update(index, { operator: event.target.value as LibrarySmartFolderCondition["operator"] })}><option value="contains">包含</option><option value="not_contains">不包含</option><option value="equals">等于</option><option value="one_of">任一</option><option value="gte">大于等于</option><option value="lte">小于等于</option><option value="before">早于</option><option value="after">晚于</option><option value="is">是</option></select>{condition.field === "collection" ? <select value={String(condition.value)} onChange={(event) => update(index, { value: event.target.value })}><option value="">选择图集</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.relativePath || item.name}</option>)}</select> : condition.field === "favorite" ? <select value={String(condition.value)} onChange={(event) => update(index, { value: event.target.value === "true" })}><option value="true">已收藏</option><option value="false">未收藏</option></select> : <input value={Array.isArray(condition.value) ? condition.value.join(",") : String(condition.value)} onChange={(event) => update(index, { value: condition.operator === "one_of" ? splitComma(event.target.value) : event.target.value })} />}<button title="删除条件" onClick={() => onChange({ ...draft, conditions: draft.conditions.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 /></button></div>)}<button className={styles.addCondition} onClick={() => onChange({ ...draft, conditions: [...draft.conditions, newCondition(draft.conditions.length)] })}><Plus />添加条件</button><footer><select value={draft.visibility} onChange={(event) => onChange({ ...draft, visibility: event.target.value as LibraryVisibility })}><option value="private">个人</option><option value="team">团队</option></select><button onClick={onClose}>取消</button><button className={styles.primary} disabled={busy || !draft.name.trim() || !draft.conditions.length} onClick={onSave}>保存</button></footer></section></div>;
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count: number; onClick: () => void }) { return <button className={active ? styles.navActive : styles.navButton} onClick={onClick}>{icon}<span>{label}</span><small>{count}</small></button>; }
function SidebarHeading({ label, onAdd }: { label: string; onAdd: () => void }) { return <div className={styles.sideHeading}><strong>{label}</strong><button title={`新建${label}`} onClick={onAdd}><Plus /></button></div>; }
function collectionDepth(collection: LibraryCollection, collections: LibraryCollection[]) { let depth = 0; let parent = collection.parentId; const seen = new Set<string>(); while (parent && depth < 8 && !seen.has(parent)) { seen.add(parent); depth += 1; parent = collections.find((item) => item.id === parent)?.parentId; } return depth; }
function viewTitle(view: View, navigation: LibraryNavigation) { if (view.kind === "all") return "全部图片"; if (view.kind === "uncategorized") return "未分类"; if (view.kind === "favorites") return "收藏"; if (view.kind === "collection") return navigation.collections.find((item) => item.id === view.id)?.name || "图集"; return navigation.smartFolders.find((item) => item.id === view.id)?.name || "智能文件夹"; }
function toggleSet(current: Set<string>, value: string) { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }
function clearSelectionState(setSelected: (value: Set<string>) => void, setExcluded: (value: Set<string>) => void, setAllMatching: (value: boolean) => void) { setSelected(new Set()); setExcluded(new Set()); setAllMatching(false); }
function filtersToQuery(filters: LibraryAssetFilters) { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value === undefined || value === "" || (value === false && key !== "includeDescendants")) return; const name = key === "tags" ? "tag" : key; if (Array.isArray(value)) value.forEach((item) => params.append(name, String(item))); else params.set(name, String(value)); }); return params.toString(); }
function newCondition(index: number): LibrarySmartFolderCondition { return { id: `condition-${Date.now()}-${index}`, field: "tag", operator: "contains", value: "", includeDescendants: true }; }
function newSmartDraft(): SmartDraft { return { name: "", visibility: "private", match: "all", conditions: [newCondition(0)] }; }
function hasFiles(event: DragEvent) { return event.dataTransfer.types.includes("Files"); }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }
function splitComma(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "请求失败"; }
const jsonHeaders = { "Content-Type": "application/json" };
async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const body = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(body.error || `请求失败 (${response.status})`); return body; }
