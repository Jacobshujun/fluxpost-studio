"use client";
/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, Eye, FileImage, FolderInput, Images, Info, LoaderCircle,
  Maximize2, Minus, Moon, Plus, RefreshCw, RotateCcw, Save, Search, Share2, Sparkles, Sun, Tag, Tags, Trash2,
  Upload, UserRound, UsersRound, X, ZoomIn,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { getLibraryUnifiedTagsForRole } from "@/lib/library-tags";
import { getStoredTheme, setStoredTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";
import type {
  LibraryAsset, LibraryAssetPage, LibraryAssetRole, LibraryCollection, LibraryTagBatchResult,
  LibraryTagSuggestion, LibraryVisibility,
} from "@/lib/types";
import styles from "./library.module.css";

type ImportItem = { id: string; name: string; status: "uploading" | "imported" | "duplicate" | "error"; message?: string };
type DeleteMode = "menu" | "permanent" | null;
const libraryPageSize = 60;
const manualTagKeys = ["imageType", "scenes", "vehicleModels", "vehicleColors", "angles", "people", "customTags"] as const;
const themeOptions: Array<{ value: ThemeMode; label: string; icon: ReactNode }> = [
  { value: "professional", label: "专业浅色", icon: <Sun size={14} /> },
  { value: "editorial", label: "编辑室", icon: <Sparkles size={14} /> },
  { value: "creator", label: "创作深色", icon: <Moon size={14} /> },
];

export default function LibraryPage() {
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, () => "professional" as ThemeMode);
  const [role, setRole] = useState<LibraryAssetRole>("reference");
  const [data, setData] = useState<LibraryAssetPage>({ assets: [], collections: [], total: 0 });
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("");
  const [taggingStatus, setTaggingStatus] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string>();
  const [preview, setPreview] = useState<{ assets: LibraryAsset[]; index: number }>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [batchTagsOpen, setBatchTagsOpen] = useState(false);
  const requestId = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const loadMorePromiseRef = useRef<Promise<LibraryAsset[]> | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ role, limit: String(libraryPageSize) });
    if (search.trim()) params.set("search", search.trim());
    if (visibility) params.set("visibility", visibility);
    if (role === "reference" && taggingStatus) params.set("taggingStatus", taggingStatus);
    filterTags.forEach((tag) => params.append("tag", tag));
    if (collectionId) params.set("collectionId", collectionId);
    return params.toString();
  }, [collectionId, filterTags, role, search, taggingStatus, visibility]);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const applyUrlRole = () => {
      const nextRole = readLibraryRoleFromUrl();
      setRole(nextRole);
      setCollectionId("");
      setSelected(new Set());
      setDetailId(undefined);
      setPreview(undefined);
      setTaggingStatus("");
    };
    const urlRole = new URL(window.location.href).searchParams.get("role");
    if (urlRole !== "reference" && urlRole !== "vehicle") writeLibraryRoleToUrl("reference", "replace");
    applyUrlRole();
    window.addEventListener("popstate", applyUrlRole);
    return () => window.removeEventListener("popstate", applyUrlRole);
  }, []);

  const loadAssets = useCallback(async (quiet = false) => {
    const current = ++requestId.current;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/library/assets?${queryString}`);
      const result = (await response.json()) as LibraryAssetPage & { error?: string };
      if (!response.ok) throw new Error(result.error || "图库加载失败");
      if (current !== requestId.current) return;
      setData(result);
      setSelected((value) => new Set([...value].filter((id) => result.assets.some((asset) => asset.id === id))));
      setDetailId((value) => value && !result.assets.some((asset) => asset.id === value) ? undefined : value);
      setMessage("");
    } catch (error) {
      if (current === requestId.current) setMessage(error instanceof Error ? error.message : "图库加载失败");
    } finally {
      if (current === requestId.current && !quiet) setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    // Fetching is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAssets();
  }, [loadAssets]);
  useEffect(() => {
    if (role !== "reference") return;
    if (!data.assets.some((asset) => asset.taggingStatus === "queued" || asset.taggingStatus === "running")) return;
    const refreshLoadedPages = async () => {
      if (loadingMoreRef.current) return;
      const current = ++requestId.current;
      const targetCount = Math.max(libraryPageSize, data.assets.length);
      const refreshed: LibraryAsset[] = [];
      let cursor: string | undefined;
      let page: (LibraryAssetPage & { error?: string }) | undefined;
      try {
        do {
          const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
          const response = await fetch(`/api/library/assets?${queryString}${cursorQuery}`);
          page = (await response.json()) as LibraryAssetPage & { error?: string };
          if (!response.ok) throw new Error(page.error || "打标状态刷新失败");
          refreshed.push(...page.assets);
          cursor = page.nextCursor;
        } while (cursor && refreshed.length < targetCount);
        if (current !== requestId.current || !page) return;
        setData({ ...page, assets: refreshed });
        setSelected((value) => new Set([...value].filter((id) => refreshed.some((asset) => asset.id === id))));
      } catch (error) {
        if (current === requestId.current) setMessage(error instanceof Error ? error.message : "打标状态刷新失败");
      }
    };
    const timer = window.setInterval(() => void refreshLoadedPages(), 2500);
    return () => window.clearInterval(timer);
  }, [data.assets, queryString, role]);

  const loadMore = useCallback(() => {
    const cursor = data.nextCursor;
    if (!cursor) return Promise.resolve([] as LibraryAsset[]);
    if (loadMorePromiseRef.current) return loadMorePromiseRef.current;
    const currentRequest = requestId.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const request = (async () => {
      try {
        const response = await fetch(`/api/library/assets?${queryString}&cursor=${encodeURIComponent(cursor)}`);
        const result = (await response.json()) as LibraryAssetPage & { error?: string };
        if (!response.ok) throw new Error(result.error || "下一批图片加载失败");
        if (currentRequest !== requestId.current) return [];
        setData((current) => {
          if (current.nextCursor !== cursor) return current;
          const known = new Set(current.assets.map((asset) => asset.id));
          return { ...result, assets: [...current.assets, ...result.assets.filter((asset) => !known.has(asset.id))] };
        });
        return result.assets;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "下一批图片加载失败");
        return [];
      } finally {
        loadingMoreRef.current = false;
        loadMorePromiseRef.current = null;
        setLoadingMore(false);
      }
    })();
    loadMorePromiseRef.current = request;
    return request;
  }, [data.nextCursor, queryString]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !data.nextCursor) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "500px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [data.nextCursor, loadMore]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!event.clipboardData?.files.length || isEditableTarget(event.target)) return;
      const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
      if (files.length) { setImportOpen(true); void uploadFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, collectionId]);

  async function uploadFiles(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name));
    if (!images.length) return setMessage("未发现可导入的图片文件");
    const queue = images.map((file) => ({ file, id: `${Date.now()}-${crypto.randomUUID()}` }));
    setImports((items) => [...queue.map(({ file, id }) => ({ id, name: file.webkitRelativePath || file.name, status: "uploading" as const })), ...items].slice(0, 100));
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        const form = new FormData();
        form.set("file", item.file);
        form.set("role", role);
        form.set("visibility", "private");
        form.set("relativePath", item.file.webkitRelativePath || item.file.name);
        if (collectionId) form.set("collectionId", collectionId);
        try {
          const response = await fetch("/api/library/import", { method: "POST", body: form });
          const result = (await response.json()) as { status?: string; error?: string };
          if (!response.ok) throw new Error(result.error || "导入失败");
          updateImport(
            item.id,
            result.status === "skipped_duplicate" ? "duplicate" : "imported",
            result.status === "skipped_duplicate"
              ? "重复图片，已跳过"
              : role === "reference" ? "已上传，等待自动打标" : "已导入车型图库",
          );
        } catch (error) {
          updateImport(item.id, "error", error instanceof Error ? error.message : "导入失败");
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
    await loadAssets(true);
  }

  function updateImport(id: string, status: ImportItem["status"], message?: string) {
    setImports((items) => items.map((item) => item.id === id ? { ...item, status, message } : item));
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault(); setDragging(false); setImportOpen(true);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  async function batchPatch(patch: Record<string, unknown>) {
    const ids = [...selected];
    if (!ids.length) return;
    setMessage("正在更新所选图片...");
    const results = await Promise.all(ids.map((id) => apiJson(`/api/library/assets/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).then(() => true).catch(() => false)));
    setMessage(`已更新 ${results.filter(Boolean).length}/${ids.length} 张图片`);
    await loadAssets(true);
  }

  async function batchRetag(mode: "failed" | "all") {
    const ids = selected.size ? [...selected] : data.assets.filter((asset) => mode === "all" || asset.taggingStatus === "failed").map((asset) => asset.id);
    const result = await apiJson<{ queued: number }>("/api/library/tagging", { method: "POST", body: JSON.stringify({ assetIds: ids, mode }) });
    setMessage(`已加入 ${result.queued} 个打标任务`);
    await loadAssets(true);
  }

  async function batchTags(mode: "add" | "remove", label: string) {
    const result = await apiJson<LibraryTagBatchResult>("/api/library/tags", {
      method: "POST",
      body: JSON.stringify({ role, assetIds: [...selected], [mode]: [label] }),
    });
    setData((current) => {
      const changed = new Map(result.assets.map((asset) => [asset.id, asset]));
      return { ...current, assets: current.assets.map((asset) => changed.get(asset.id) || asset) };
    });
    setMessage(`标签${mode === "add" ? `已添加到 ${result.assets.length} 张图片` : `已从 ${result.assets.length} 张图片删除`}${result.failures.length ? `，${result.failures.length} 张只读或更新失败` : ""}`);
  }

  async function batchRemove() {
    const ids = [...selected];
    if (!ids.length || !window.confirm(`确认将 ${ids.length} 张图片移出当前${collectionId ? "集合" : "视图"}？`)) return;
    const tasks = ids.map((id) => collectionId
      ? apiJson(`/api/library/collections/${collectionId}/assets/${id}`, { method: "DELETE" })
      : apiJson(`/api/library/assets/${id}`, { method: "PATCH", body: JSON.stringify({ roles: data.assets.find((item) => item.id === id)?.roles.filter((item) => item !== role) || [] }) }));
    const results = await Promise.all(tasks.map((task) => task.then(() => true).catch(() => false)));
    setMessage(`已移出 ${results.filter(Boolean).length}/${ids.length} 张图片`); setSelected(new Set()); await loadAssets(true);
  }

  async function batchDelete() {
    const ids = [...selected];
    if (!ids.length || !window.confirm(`永久删除 ${ids.length} 张图片及其对象存储原图？此操作无法撤销。`)) return;
    const results = await Promise.all(ids.map((id) => fetch(`/api/library/assets/${id}`, { method: "DELETE" }).then((response) => response.ok)));
    setMessage(`已永久删除 ${results.filter(Boolean).length}/${ids.length} 张图片`); setSelected(new Set()); await loadAssets(true);
  }

  async function addCollection() {
    const name = window.prompt("新集合名称");
    if (!name?.trim()) return;
    try { await apiJson("/api/library/collections", { method: "POST", body: JSON.stringify({ name, role, parentId: collectionId || undefined }) }); await loadAssets(true); }
    catch (error) { setMessage(error instanceof Error ? error.message : "集合创建失败"); }
  }

  function openPreview(asset: LibraryAsset) {
    const index = data.assets.findIndex((item) => item.id === asset.id);
    setPreview({ assets: [...data.assets], index: Math.max(0, index) });
  }

  function selectRole(nextRole: LibraryAssetRole) {
    if (nextRole === role) return;
    writeLibraryRoleToUrl(nextRole, "push");
    setRole(nextRole);
    setCollectionId("");
    setSelected(new Set());
    setDetailId(undefined);
    setPreview(undefined);
    setTaggingStatus("");
  }

  const activeCollections = data.collections.filter((collection) => collection.role === role);
  const detail = data.assets.find((asset) => asset.id === detailId);
  const importedCount = imports.filter((item) => item.status === "imported").length;
  const duplicateCount = imports.filter((item) => item.status === "duplicate").length;
  const errorCount = imports.filter((item) => item.status === "error").length;
  const isVehicle = role === "vehicle";
  const libraryName = isVehicle ? "车型图库" : "参考图库";

  return (
    <main className={styles.page} onDragEnter={() => setDragging(true)} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <header className={styles.header}>
        <div className={styles.brandBlock}>
          <Link href="/" className={styles.iconButton} title="返回内容台"><ArrowLeft size={18} /></Link>
          <div><h1>{libraryName}</h1><p>{isVehicle ? "整理和维护人工标注的车型图片" : "统一管理可复用的视觉资产"}</p></div>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.counter}>{data.total} 张</span>
          <div className="theme-switcher" role="group" aria-label="主题切换">
            {themeOptions.map((option) => <button key={option.value} className={`theme-option ${theme === option.value ? "theme-option-active" : ""}`} type="button" aria-pressed={theme === option.value} onClick={() => setStoredTheme(option.value)}>{option.icon}<span>{option.label}</span></button>)}
          </div>
          <button className={styles.iconButton} title="刷新图库" onClick={() => void loadAssets()}><RefreshCw size={17} /></button>
          <button className={styles.primaryButton} onClick={() => setImportOpen(true)}><Upload size={16} />导入图片</button>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="图库类型">
        <button role="tab" aria-selected={role === "reference"} className={role === "reference" ? styles.activeTab : ""} onClick={() => selectRole("reference")}><Images size={16} />参考图库</button>
        <button role="tab" aria-selected={role === "vehicle"} className={role === "vehicle" ? styles.activeTab : ""} onClick={() => selectRole("vehicle")}><FileImage size={16} />车型图库</button>
      </div>

      <section className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sideTitle}><span>集合</span><span><button title="新建集合" onClick={() => void addCollection()}><Plus size={13} /></button>{activeCollections.length}</span></div>
          <button className={!collectionId ? styles.collectionActive : styles.collectionButton} onClick={() => setCollectionId("")}><Images size={15} />全部图片</button>
          {activeCollections.map((collection) => <button key={collection.id} className={collectionId === collection.id ? styles.collectionActive : styles.collectionButton} style={{ paddingLeft: `${14 + collectionDepth(collection, activeCollections) * 14}px` }} onClick={() => setCollectionId(collection.id)}><FolderInput size={15} /><span>{collection.name}</span></button>)}
          <div className={styles.sideRule} />
          <div className={styles.sideMeta}><span><UserRound size={14} />个人资产</span><span><UsersRound size={14} />团队共享</span></div>
        </aside>

        <div className={styles.content}>
          <div className={styles.filterBar}>
            <label className={styles.search}><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isVehicle ? "搜索名称、文件名或人工标签" : "搜索名称、文件名或标签"} /></label>
            <div className={styles.filterTags}><UnifiedTagPicker tags={filterTags.map((label) => ({ label }))} role={role} placeholder="按标签筛选" onAdd={(label) => setFilterTags((current) => current.some((item) => sameTag(item, label)) ? current : [...current, label])} onRemove={(label) => setFilterTags((current) => current.filter((item) => !sameTag(item, label)))} /></div>
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)} aria-label="共享范围"><option value="">全部范围</option><option value="private">个人</option><option value="team">团队共享</option></select>
            {!isVehicle ? <select value={taggingStatus} onChange={(event) => setTaggingStatus(event.target.value)} aria-label="打标状态"><option value="">全部状态</option><option value="queued">等待打标</option><option value="running">打标中</option><option value="completed">已完成</option><option value="failed">失败</option></select> : null}
            {(search || visibility || taggingStatus || filterTags.length) ? <button className={styles.clearButton} onClick={() => { setSearch(""); setVisibility(""); setTaggingStatus(""); setFilterTags([]); }}><X size={14} />清除</button> : null}
            {!isVehicle ? <button className={styles.clearButton} onClick={() => void batchRetag("failed")}><RefreshCw size={14} />重试失败</button> : null}
          </div>

          {selected.size ? <><div className={styles.batchBar}><strong>已选择 {selected.size} 张</strong><button aria-expanded={batchTagsOpen} onClick={() => setBatchTagsOpen((value) => !value)}><Tags size={14} />管理标签</button><button onClick={() => void batchPatch({ visibility: "team" })}><Share2 size={14} />设为共享</button><button onClick={() => void batchPatch({ visibility: "private" })}><UserRound size={14} />设为个人</button>{!isVehicle ? <button onClick={() => void batchRetag("all")}><RefreshCw size={14} />重新打标</button> : null}<button onClick={() => void batchRemove()}><FolderInput size={14} />移出</button><button className={styles.batchDanger} onClick={() => void batchDelete()}><Trash2 size={14} />永久删除</button><button onClick={() => { setSelected(new Set()); setBatchTagsOpen(false); }}>取消选择</button></div>{batchTagsOpen ? <BatchTagManager count={selected.size} role={role} onApply={batchTags} onClose={() => setBatchTagsOpen(false)} /> : null}</> : null}

          {message ? <div className={styles.notice} role="status">{message}</div> : null}
          {loading ? <div className={styles.state}><LoaderCircle className={styles.spin} size={28} />正在载入图库</div> : data.assets.length ? (
            <><div className={styles.grid}>
              {data.assets.map((asset) => <AssetCard key={asset.id} asset={asset} activeRole={role} selected={selected.has(asset.id)} onSelect={(checked) => setSelected((value) => { const next = new Set(value); if (checked) next.add(asset.id); else next.delete(asset.id); return next; })} onOpen={openPreview} onDetail={() => setDetailId(asset.id)} />)}
            </div>{data.nextCursor ? <div className={styles.loadMore} ref={loadMoreRef}><button disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <LoaderCircle className={styles.spin} size={15} /> : <ChevronRight size={15} />}{loadingMore ? "加载下一批..." : "加载更多"}</button></div> : null}</>
          ) : <div className={styles.empty}><div className={styles.emptyIcon}>{isVehicle ? <FileImage size={30} /> : <Images size={30} />}</div><h2>{message.includes("登录") ? "需要登录工作区" : `${libraryName}还没有图片`}</h2><p>{message.includes("登录") ? "返回内容台完成登录后再进入图库。" : isVehicle ? "导入车型图片，并用人工标签整理和筛选。" : "从剪贴板粘贴，或导入文件和文件夹开始整理。"}</p>{!message.includes("登录") ? <button className={styles.primaryButton} onClick={() => setImportOpen(true)}><Upload size={16} />导入第一批图片</button> : <Link className={styles.primaryButton} href="/">返回登录</Link>}</div>}
        </div>

        {detail ? <AssetEditor key={detail.id} asset={detail} activeRole={role} onClose={() => setDetailId(undefined)} onSaved={(asset) => { setData((value) => ({ ...value, assets: value.assets.map((item) => item.id === asset.id ? asset : item) })); setMessage("图片信息已保存"); void loadAssets(true); }} /> : null}
      </section>

      {importOpen ? <div className={styles.scrim} onMouseDown={(event) => event.target === event.currentTarget && setImportOpen(false)}><section className={styles.importPanel} role="dialog" aria-modal="true" aria-labelledby="import-title"><div className={styles.panelHeader}><div><h2 id="import-title">导入到{libraryName}</h2><p>{isVehicle ? "图片将直接进入车型图库，由用户维护标签" : "图片上传后会自动进入后台打标队列"}</p></div><button className={styles.iconButton} title="关闭" onClick={() => setImportOpen(false)}><X size={18} /></button></div><ImportDropZone dragging={dragging} onFiles={(files) => void uploadFiles(files)} /><div className={styles.importSummary}><span>成功 {importedCount}</span><span>重复 {duplicateCount}</span><span>失败 {errorCount}</span></div><div className={styles.importList}>{imports.length ? imports.map((item) => <div key={item.id} className={styles.importRow}><StatusIcon status={item.status} /><div><strong>{item.name}</strong><span>{item.message || "上传中..."}</span></div></div>) : <p>暂无导入任务</p>}</div></section></div> : null}
      {dragging ? <div className={styles.dropOverlay} onDragLeave={() => setDragging(false)}><Upload size={36} /><strong>释放以导入图片</strong></div> : null}
      {preview ? <PreviewDialog sequence={preview.assets} initialIndex={preview.index} activeRole={role} collectionId={collectionId} hasMore={Boolean(data.nextCursor)} onLoadMore={loadMore} onClose={() => setPreview(undefined)} onChanged={(asset, deleted, removedFromView) => { if (deleted || removedFromView) setData((value) => ({ ...value, assets: value.assets.filter((item) => item.id !== asset.id), total: Math.max(0, value.total - 1) })); else setData((value) => ({ ...value, assets: value.assets.map((item) => item.id === asset.id ? asset : item) })); }} /> : null}
    </main>
  );
}

function AssetCard({ asset, activeRole, selected, onSelect, onOpen, onDetail }: { asset: LibraryAsset; activeRole: LibraryAssetRole; selected: boolean; onSelect(value: boolean): void; onOpen(asset: LibraryAsset): void; onDetail(): void }) {
  const tags = getLibraryUnifiedTagsForRole(asset, activeRole).slice(0, 3);
  return <article className={`${styles.card} ${selected ? styles.cardSelected : ""}`}>
    <button className={styles.cardImage} data-preview-asset={asset.id} onClick={() => onOpen(asset)} aria-label={`预览 ${asset.name}`}><img src={asset.publicUrl} alt="" loading="lazy" /><span className={styles.imageShade} /><span className={styles.previewHint}><Eye size={15} />预览</span></button>
    <label className={styles.selectBox} title="选择图片"><input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} /><span /></label>
    <div className={styles.cardBadges}><span className={asset.visibility === "team" ? styles.sharedBadge : styles.privateBadge}>{asset.visibility === "team" ? <UsersRound size={11} /> : <UserRound size={11} />}{asset.visibility === "team" ? "共享" : "个人"}</span>{activeRole === "reference" ? <TaggingBadge status={asset.taggingStatus} /> : null}</div>
    <button className={styles.cardBody} onClick={onDetail}><strong title={asset.name}>{asset.name}</strong><div className={styles.tags}>{tags.length ? tags.map((tag) => <span key={tag.label} title={activeRole === "vehicle" ? "人工标签" : tagSourceTitle(tag.source)}>{tag.label}</span>) : <span className={styles.mutedTag}>{activeRole === "vehicle" ? "暂无人工标签" : "等待标签"}</span>}</div></button>
  </article>;
}

function AssetEditor({ asset, activeRole, onClose, onSaved }: { asset: LibraryAsset; activeRole: LibraryAssetRole; onClose(): void; onSaved(asset: LibraryAsset): void }) {
  const [name, setName] = useState(asset.name);
  const [visibility, setVisibility] = useState<LibraryVisibility>(asset.visibility);
  const [roles, setRoles] = useState(asset.roles);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true); setError("");
    try { const result = await apiJson<{ asset: LibraryAsset }>(`/api/library/assets/${asset.id}`, { method: "PATCH", body: JSON.stringify({ name, visibility, roles }) }); onSaved(result.asset); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } finally { setSaving(false); }
  }
  return <aside className={styles.editor}><div className={styles.panelHeader}><div><h2>图片详情</h2><p>{formatBytes(asset.byteSize)} · {asset.width || "?"} × {asset.height || "?"}</p></div><button className={styles.iconButton} title="关闭详情" onClick={onClose}><X size={17} /></button></div><label className={styles.fieldLabel}>名称<input value={name} onChange={(event) => setName(event.target.value)} disabled={!asset.canEdit} /></label><label className={styles.fieldLabel}>共享范围<select value={visibility} onChange={(event) => setVisibility(event.target.value as LibraryVisibility)} disabled={!asset.canEdit}><option value="private">仅自己</option><option value="team">团队共享</option></select></label><div className={styles.fieldLabel}>图库角色<div className={styles.segmented}>{(["reference", "vehicle"] as LibraryAssetRole[]).map((value) => <button key={value} disabled={!asset.canEdit} className={roles.includes(value) ? styles.segmentActive : ""} onClick={() => setRoles((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value])}>{value === "reference" ? "参考图" : "车型"}</button>)}</div></div><TagEditor asset={asset} activeRole={activeRole} onSaved={onSaved} disabled={!asset.canEdit} />{asset.cleanupStatus === "failed" ? <p className={styles.errorText}>对象清理失败：{asset.cleanupError}</p> : null}{error ? <p className={styles.errorText}>{error}</p> : null}<button className={styles.primaryButton} disabled={!asset.canEdit || saving} onClick={() => void save()}>{saving ? <LoaderCircle className={styles.spin} size={15} /> : <Save size={15} />}{saving ? "保存中" : "保存名称与权限"}</button>{!asset.canEdit ? <p className={styles.readonly}>团队共享资产为只读，仅所有者或管理员可编辑。</p> : null}</aside>;
}

function TagEditor({ asset, activeRole, onSaved, disabled }: { asset: LibraryAsset; activeRole: LibraryAssetRole; onSaved(asset: LibraryAsset): void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tags = getLibraryUnifiedTagsForRole(asset, activeRole);
  const hasOverrides = Object.keys(asset.manualOverrides).length > 0;
  async function mutate(mode: "add" | "remove", label: string) {
    setBusy(true); setError("");
    try {
      const result = await apiJson<LibraryTagBatchResult>("/api/library/tags", { method: "POST", body: JSON.stringify({ role: activeRole, assetIds: [asset.id], [mode]: [label] }) });
      if (!result.assets[0]) throw new Error(result.failures[0]?.error || "标签更新失败");
      onSaved(result.assets[0]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "标签更新失败"); }
    finally { setBusy(false); }
  }
  async function restoreAi() {
    if (!window.confirm("恢复 AI 标签会撤销这张图片的全部人工新增和删除，是否继续？")) return;
    setBusy(true); setError("");
    try {
      const result = await apiJson<{ asset: LibraryAsset }>(`/api/library/assets/${asset.id}`, { method: "PATCH", body: JSON.stringify({ restoreAi: manualTagKeys }) });
      onSaved(result.asset);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "恢复 AI 标签失败"); }
    finally { setBusy(false); }
  }
  return <div className={styles.tagEditor}><div className={styles.tagEditorTitle}><span>{activeRole === "vehicle" ? "人工标签" : "标签"}</span>{activeRole === "reference" && hasOverrides && !disabled ? <button className={styles.restoreButton} disabled={busy} onClick={() => void restoreAi()}><RotateCcw size={12} />恢复 AI 标签</button> : null}</div><UnifiedTagPicker tags={tags.map((tag) => ({ label: tag.label, title: activeRole === "vehicle" ? "人工标签" : tagSourceTitle(tag.source) }))} role={activeRole} disabled={disabled || busy} placeholder="添加标签" onAdd={(label) => mutate("add", label)} onRemove={(label) => mutate("remove", label)} />{busy ? <span className={styles.tagSaving}><LoaderCircle className={styles.spin} size={12} />正在保存标签</span> : null}{error ? <p className={styles.errorText}>{error}</p> : null}</div>;
}

function UnifiedTagPicker({ tags, role, placeholder, disabled, onAdd, onRemove }: {
  tags: Array<{ label: string; title?: string }>;
  role: LibraryAssetRole;
  placeholder: string;
  disabled?: boolean;
  onAdd(label: string): void | Promise<void>;
  onRemove?(label: string): void | Promise<void>;
}) {
  const listboxId = useId();
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<LibraryTagSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const selectedKeys = useMemo(() => new Set(tags.map((tag) => tag.label.trim().toLocaleLowerCase())), [tags]);
  const options = suggestions.filter((item) => !selectedKeys.has(item.label.trim().toLocaleLowerCase()));

  useEffect(() => {
    if (disabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ role, q: draft.trim(), limit: "12" });
        const response = await fetch(`/api/library/tags?${params}`, { signal: controller.signal });
        const result = (await response.json()) as { tags?: LibraryTagSuggestion[]; error?: string };
        if (!response.ok) throw new Error(result.error || "标签建议加载失败");
        setSuggestions(result.tags || []);
        setActiveIndex(0);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "标签建议加载失败");
      }
    }, 140);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [disabled, draft, role]);

  async function commit(label: string) {
    const value = label.trim().replace(/\s+/g, " ");
    if (!value || selectedKeys.has(value.toLocaleLowerCase()) || committing) return;
    setCommitting(true); setError("");
    try { await onAdd(value); setDraft(""); setOpen(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "标签更新失败"); }
    finally { setCommitting(false); }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setOpen(true);
      setActiveIndex((current) => options.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault(); void commit(options[activeIndex]?.label || draft);
    } else if (event.key === "Escape") {
      event.preventDefault(); setOpen(false);
    } else if (event.key === "Backspace" && !draft && tags.length && onRemove) {
      event.preventDefault(); void onRemove(tags[tags.length - 1].label);
    }
  }

  return <div className={styles.tagPicker} data-shortcuts="off"><div className={styles.tagPickerControl} onClick={(event) => (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>{tags.map((tag) => <span className={styles.tagChip} key={tag.label} title={tag.title}>{tag.label}{onRemove && !disabled ? <button type="button" title={`删除 ${tag.label}`} aria-label={`删除标签 ${tag.label}`} onClick={() => void onRemove(tag.label)}><X size={11} /></button> : null}</span>)}<input value={draft} disabled={disabled || committing} placeholder={tags.length ? "" : placeholder} role="combobox" aria-label={placeholder} aria-autocomplete="list" aria-expanded={open} aria-controls={listboxId} aria-activedescendant={open && options[activeIndex] ? `${listboxId}-${activeIndex}` : undefined} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onChange={(event) => { setDraft(event.target.value); setOpen(true); setError(""); }} onKeyDown={handleKeyDown} /></div>{open && !disabled ? <div className={styles.tagSuggestions} id={listboxId} role="listbox">{options.length ? options.map((item, itemIndex) => <button type="button" id={`${listboxId}-${itemIndex}`} role="option" aria-selected={itemIndex === activeIndex} className={itemIndex === activeIndex ? styles.tagSuggestionActive : ""} key={item.label} onMouseDown={(event) => event.preventDefault()} onClick={() => void commit(item.label)}><span>{item.label}</span><small>{item.count}</small></button>) : draft.trim() ? <button type="button" role="option" aria-selected="true" onMouseDown={(event) => event.preventDefault()} onClick={() => void commit(draft)}>添加“{draft.trim()}”</button> : <p>暂无可用标签</p>}</div> : null}{error ? <span className={styles.tagPickerError}>{error}</span> : null}</div>;
}

function BatchTagManager({ count, role, onApply, onClose }: { count: number; role: LibraryAssetRole; onApply(mode: "add" | "remove", label: string): Promise<void>; onClose(): void }) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  return <section className={styles.batchTagPanel} aria-label="批量管理标签"><div><strong>管理 {count} 张图片的标签</strong><button className={styles.iconButton} title="关闭批量标签" onClick={onClose}><X size={15} /></button></div><div className={styles.batchTagModes} role="group" aria-label="标签操作"><button className={mode === "add" ? styles.segmentActive : ""} aria-pressed={mode === "add"} onClick={() => setMode("add")}><Plus size={13} />批量添加</button><button className={mode === "remove" ? styles.segmentActive : ""} aria-pressed={mode === "remove"} onClick={() => setMode("remove")}><Minus size={13} />批量删除</button></div><UnifiedTagPicker key={mode} tags={[]} role={role} placeholder={mode === "add" ? "输入或选择要添加的标签" : "输入或选择要删除的标签"} onAdd={(label) => onApply(mode, label)} /><p>只读团队资产会跳过，并计入失败数量。</p></section>;
}

function PreviewDialog({ sequence, initialIndex, activeRole, collectionId, hasMore, onLoadMore, onClose, onChanged }: { sequence: LibraryAsset[]; initialIndex: number; activeRole: LibraryAssetRole; collectionId: string; hasMore: boolean; onLoadMore(): Promise<LibraryAsset[]>; onClose(): void; onChanged(asset: LibraryAsset, deleted: boolean, removedFromView?: boolean): void }) {
  const [assets, setAssets] = useState(sequence);
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [deleteMode, setDeleteMode] = useState<DeleteMode>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const loadingNextPage = useRef(false);
  const returnAssetId = useRef(sequence[initialIndex]?.id);
  const gesture = useRef({ startDistance: 0, startScale: 1, startX: 0, startY: 0, moved: false });
  const asset = assets[index];

  const resetView = useCallback(() => { setPan({ x: 0, y: 0 }); setScale(fitScale); }, [fitScale]);
  const navigate = useCallback((direction: -1 | 1) => { setIndex((value) => Math.max(0, Math.min(assets.length - 1, value + direction))); setLoadState("loading"); setPan({ x: 0, y: 0 }); setDeleteMode(null); }, [assets.length]);
  const close = useCallback(() => { onClose(); window.setTimeout(() => { const target = Array.from(document.querySelectorAll<HTMLElement>("[data-preview-asset]")).find((item) => item.dataset.previewAsset === returnAssetId.current); target?.focus(); }, 0); }, [onClose]);

  useEffect(() => { document.body.style.overflow = "hidden"; dialogRef.current?.focus(); return () => { document.body.style.overflow = ""; }; }, []);
  useEffect(() => { [assets[index - 1], assets[index + 1]].filter(Boolean).forEach((item) => { const preload = new Image(); preload.src = item.publicUrl; }); }, [assets, index]);
  useEffect(() => {
    if (!hasMore || index < assets.length - 8 || loadingNextPage.current) return;
    loadingNextPage.current = true;
    void onLoadMore().then((nextAssets) => {
      if (!nextAssets.length) return;
      setAssets((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...nextAssets.filter((item) => !known.has(item.id))];
      });
    }).finally(() => { loadingNextPage.current = false; });
  }, [assets.length, hasMore, index, onLoadMore]);
  if (!asset) return null;
  function handlePreviewKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || []).filter((item) => item.offsetParent !== null);
      if (focusable.length) { const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
      return;
    }
    if (isEditableTarget(event.target)) { if (event.key === "Escape") (event.target as HTMLElement).blur(); return; }
    if (event.key === "Escape") { event.preventDefault(); if (deleteMode) setDeleteMode(null); else close(); return; }
    if (deleteMode) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); navigate(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); navigate(1); }
    else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1); }
    else if (event.key === "-") { event.preventDefault(); zoom(-1); }
    else if (event.key === "0") { event.preventDefault(); resetView(); }
    else if (event.key === "1") { event.preventDefault(); setScale(Math.max(fitScale, 1)); setPan({ x: 0, y: 0 }); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); if (asset.canEdit) setDeleteMode("menu"); }
  }
  function calculateFit() { const image = imageRef.current; const stage = stageRef.current; if (!image || !stage) return; const next = Math.min((stage.clientWidth - 40) / image.naturalWidth, (stage.clientHeight - 40) / image.naturalHeight, 1); setFitScale(Math.max(.01, next)); setScale(Math.max(.01, next)); setPan({ x: 0, y: 0 }); setLoadState("ready"); }
  function zoom(direction: -1 | 1) { const levels = Array.from(new Set([fitScale, .25, .5, .75, 1, 1.5, 2, 3, 4, 6, 8].filter((value) => value >= fitScale))).sort((a, b) => a - b); setScale((currentScale) => { const current = levels.findIndex((value) => value >= currentScale - .001); const next = levels[Math.max(0, Math.min(levels.length - 1, current + direction))]; if (next === fitScale) setPan({ x: 0, y: 0 }); return next; }); }
  async function saveAsset(patch: Record<string, unknown>) { const result = await apiJson<{ asset: LibraryAsset }>(`/api/library/assets/${asset.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setAssets((items) => items.map((item) => item.id === asset.id ? result.asset : item)); onChanged(result.asset, false); return result.asset; }
  async function removeFromView() { setBusy(true); try { if (collectionId) await apiJson(`/api/library/collections/${collectionId}/assets/${asset.id}`, { method: "DELETE" }); else await saveAsset({ roles: asset.roles.filter((item) => item !== activeRole) }); removeCurrent(false); setAnnouncement("图片已移出当前视图"); } catch (error) { setAnnouncement(error instanceof Error ? error.message : "移出失败"); } finally { setBusy(false); setDeleteMode(null); } }
  async function permanentDelete() { setBusy(true); try { const response = await fetch(`/api/library/assets/${asset.id}`, { method: "DELETE" }); const result = (await response.json()) as { status?: string; asset?: LibraryAsset; error?: string }; if (!response.ok || result.status !== "deleted") { if (result.asset) { setAssets((items) => items.map((item) => item.id === asset.id ? result.asset! : item)); onChanged(result.asset, false); } throw new Error(result.asset?.cleanupError || result.error || "对象清理失败，资产已保留，可稍后重试"); } removeCurrent(true); setAnnouncement("图片已永久删除"); } catch (error) { setAnnouncement(error instanceof Error ? error.message : "删除失败"); } finally { setBusy(false); setDeleteMode(null); } }
  function removeCurrent(deleted: boolean) { const removed = asset; const next = assets.filter((item) => item.id !== removed.id); setAssets(next); onChanged(removed, deleted, true); if (!next.length) { close(); return; } setIndex(Math.min(index, next.length - 1)); setLoadState("loading"); setPan({ x: 0, y: 0 }); }
  function pointerDown(event: ReactPointerEvent) { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.current.size === 1) gesture.current = { ...gesture.current, startX: event.clientX, startY: event.clientY, moved: false }; if (pointers.current.size === 2) { const points = [...pointers.current.values()]; gesture.current.startDistance = distance(points[0], points[1]); gesture.current.startScale = scale; } }
  function pointerMove(event: ReactPointerEvent) { const previous = pointers.current.get(event.pointerId); if (!previous) return; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const points = [...pointers.current.values()]; if (points.length === 2) { const ratio = distance(points[0], points[1]) / Math.max(1, gesture.current.startDistance); setScale(Math.min(8, Math.max(fitScale, gesture.current.startScale * ratio))); gesture.current.moved = true; } else if (scale > fitScale + .001) { setPan((value) => ({ x: value.x + event.clientX - previous.x, y: value.y + event.clientY - previous.y })); gesture.current.moved = true; } }
  function pointerUp(event: ReactPointerEvent) { const startX = gesture.current.startX; const startY = gesture.current.startY; pointers.current.delete(event.pointerId); if (scale <= fitScale + .001 && Math.abs(event.clientX - startX) > 60 && Math.abs(event.clientX - startX) > Math.abs(event.clientY - startY)) navigate(event.clientX < startX ? 1 : -1); }
  return <div className={styles.preview} ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`图片预览：${asset.name}`} aria-keyshortcuts="ArrowLeft ArrowRight + - 0 1 Delete Backspace Escape" onKeyDown={handlePreviewKeyDown}>
    <div className={styles.previewToolbar}><div className={styles.previewName}><strong>{asset.name}</strong><span>{index + 1} / {assets.length}</span></div><div className={styles.toolGroup}><Tool title="上一张" disabled={index === 0} onClick={() => navigate(-1)}><ChevronLeft /></Tool><Tool title="下一张" disabled={index === assets.length - 1} onClick={() => navigate(1)}><ChevronRight /></Tool><span className={styles.toolDivider} /><Tool title="缩小" onClick={() => zoom(-1)}><Minus /></Tool><button className={styles.zoomReadout} title="当前缩放比例" onClick={resetView}>{Math.round(scale * 100)}%</button><Tool title="放大" onClick={() => zoom(1)}><Plus /></Tool><Tool title="适应窗口" onClick={resetView}><Maximize2 /></Tool><Tool title="原始比例 100%" onClick={() => { setScale(Math.max(fitScale, 1)); setPan({ x: 0, y: 0 }); }}><ZoomIn /></Tool><span className={styles.toolDivider} /><Tool title="图片信息与标签" onClick={() => setInfoOpen((value) => !value)}><Info /></Tool><Tool title="下载原图" onClick={() => { const link = document.createElement("a"); link.href = asset.publicUrl; link.download = asset.originalName; link.target = "_blank"; link.click(); }}><Download /></Tool>{asset.canEdit ? <Tool title="删除或移出" danger onClick={() => setDeleteMode("menu")}><Trash2 /></Tool> : null}<Tool title="关闭预览" onClick={close}><X /></Tool></div></div>
    <div className={styles.previewBody}>
      <div className={styles.previewStage} ref={stageRef} onWheel={(event) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoom(event.deltaY < 0 ? 1 : -1); } }} onDoubleClick={() => scale <= fitScale + .001 ? setScale(Math.max(fitScale, 1)) : resetView()} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        {loadState === "loading" ? <div className={styles.previewState}><LoaderCircle className={styles.spin} />正在解码原图</div> : null}
        {loadState === "error" ? <div className={styles.previewState}><FileImage />原图暂时不可用<button onClick={() => { setLoadState("loading"); if (imageRef.current) imageRef.current.src = `${asset.publicUrl}${asset.publicUrl.includes("?") ? "&" : "?"}retry=${Date.now()}`; }}>重新加载</button></div> : null}
        <img ref={imageRef} src={asset.publicUrl} alt={asset.name} draggable={false} onLoad={calculateFit} onError={() => setLoadState("error")} style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`, opacity: loadState === "ready" ? 1 : 0 }} />
        <button className={styles.stagePrev} disabled={index === 0} aria-label="上一张" onClick={() => navigate(-1)}><ChevronLeft /></button><button className={styles.stageNext} disabled={index === assets.length - 1} aria-label="下一张" onClick={() => navigate(1)}><ChevronRight /></button>
      </div>
      <div className={`${styles.previewInfo} ${infoOpen ? styles.previewInfoOpen : ""}`}><div className={styles.previewInfoHead}><div><span className={asset.visibility === "team" ? styles.sharedBadge : styles.privateBadge}>{asset.visibility === "team" ? "团队共享" : "仅自己"}</span>{activeRole === "reference" ? <TaggingBadge status={asset.taggingStatus} /> : null}</div><p>{asset.originalName}</p><p>{formatBytes(asset.byteSize)} · {asset.width || "?"} × {asset.height || "?"} · {asset.extension.replace(".", "").toUpperCase()}</p></div><AssetEditor key={asset.id} asset={asset} activeRole={activeRole} onClose={() => setInfoOpen(false)} onSaved={(next) => { setAssets((items) => items.map((item) => item.id === next.id ? next : item)); onChanged(next, false); }} /></div>
    </div>
    <div className={styles.thumbnailRail}>{assets.map((item, itemIndex) => <button key={item.id} className={itemIndex === index ? styles.thumbnailActive : ""} onClick={() => { setIndex(itemIndex); setLoadState("loading"); setPan({ x: 0, y: 0 }); }} aria-label={`打开第 ${itemIndex + 1} 张`}><img src={item.publicUrl} alt="" /></button>)}</div>
    {deleteMode ? <div className={styles.deleteScrim} role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><div className={styles.deletePanel}><div className={styles.deleteIcon}><Trash2 /></div><h2 id="delete-title">{deleteMode === "permanent" ? "确认永久删除？" : "如何处理这张图片？"}</h2><p>{deleteMode === "permanent" ? "将删除全部角色、集合关系和对象存储原图。此操作无法撤销。" : "移出当前视图会保留资产和标签；永久删除会清理原图。"}</p>{deleteMode === "menu" ? <><button disabled={busy} className={styles.secondaryAction} onClick={() => void removeFromView()}>移出当前{collectionId ? "集合" : "视图"}</button><button disabled={busy} className={styles.dangerAction} onClick={() => setDeleteMode("permanent")}>永久删除资产</button></> : <button disabled={busy} className={styles.dangerAction} onClick={() => void permanentDelete()}>{busy ? "正在删除..." : "确认永久删除"}</button>}<button disabled={busy} className={styles.cancelAction} autoFocus onClick={() => setDeleteMode(null)}>取消</button></div></div> : null}
    <div className={styles.srOnly} aria-live="polite">{announcement}</div>
  </div>;
}

function ImportDropZone({ dragging, onFiles }: { dragging: boolean; onFiles(files: File[]): void }) { const fileRef = useRef<HTMLInputElement>(null); const folderRef = useRef<HTMLInputElement>(null); useEffect(() => folderRef.current?.setAttribute("webkitdirectory", ""), []); return <div className={`${styles.importDrop} ${dragging ? styles.importDropActive : ""}`}><Upload size={28} /><strong>拖放图片或粘贴剪贴板内容</strong><p>单张最大 30 MB，支持 JPEG、PNG、GIF、WebP</p><div><button onClick={() => fileRef.current?.click()}><Images size={15} />选择图片</button><button onClick={() => folderRef.current?.click()}><FolderInput size={15} />选择文件夹</button></div><input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={(event) => onFiles(Array.from(event.target.files || []))} /><input ref={folderRef} hidden type="file" accept="image/*" multiple onChange={(event) => onFiles(Array.from(event.target.files || []))} /></div>; }
function Tool({ title, disabled, danger, onClick, children }: { title: string; disabled?: boolean; danger?: boolean; onClick(): void; children: React.ReactNode }) { return <button className={`${styles.toolButton} ${danger ? styles.toolDanger : ""}`} title={title} aria-label={title} disabled={disabled} onClick={onClick}>{children}</button>; }
function TaggingBadge({ status }: { status: LibraryAsset["taggingStatus"] }) { const labels = { queued: "等待打标", running: "打标中", completed: "已打标", failed: "打标失败" }; return <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>{status === "running" ? <LoaderCircle className={styles.spin} size={11} /> : null}{labels[status]}</span>; }
function StatusIcon({ status }: { status: ImportItem["status"] }) { if (status === "uploading") return <LoaderCircle className={styles.spin} size={17} />; if (status === "error") return <X className={styles.importError} size={17} />; if (status === "duplicate") return <RefreshCw size={17} />; return <Tag className={styles.importSuccess} size={17} />; }
function sameTag(left: string, right: string) { return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase(); }
function readLibraryRoleFromUrl(): LibraryAssetRole { return new URL(window.location.href).searchParams.get("role") === "vehicle" ? "vehicle" : "reference"; }
function writeLibraryRoleToUrl(role: LibraryAssetRole, mode: "push" | "replace") { const url = new URL(window.location.href); url.searchParams.set("role", role); const href = `${url.pathname}${url.search}${url.hash}`; if (mode === "push") window.history.pushState(null, "", href); else window.history.replaceState(null, "", href); }
function tagSourceTitle(source: "ai" | "manual" | "ai_manual") { return source === "ai" ? "AI 标签" : source === "manual" ? "人工标签" : "AI 与人工标签"; }
function collectionDepth(collection: LibraryCollection, all: LibraryCollection[]) { let depth = 0; let parentId = collection.parentId; const seen = new Set<string>(); while (parentId && !seen.has(parentId) && depth < 5) { seen.add(parentId); depth += 1; parentId = all.find((item) => item.id === parentId)?.parentId; } return depth; }
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 ** 2).toFixed(1)} MB`; }
function isEditableTarget(target: EventTarget | null) { return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='dialog'] [data-shortcuts='off']")); }
function distance(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, a.y - b.y); }
async function apiJson<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "请求失败"); return result as T; }
