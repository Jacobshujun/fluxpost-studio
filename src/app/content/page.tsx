"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  BarChart3,
  Camera,
  Check,
  ClipboardCheck,
  CloudDownload,
  Database,
  ExternalLink,
  FileText,
  Filter,
  FolderOpen,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  Loader2,
  Maximize2,
  Moon,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  UploadCloud,
  Video,
  Wand2,
  X,
} from "lucide-react";
import { getStoredTheme, setStoredTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";
import { selectBestVideoHighlightFrames } from "@/lib/video-frame-policy";
import { mergeDownloadedAndRemoteImages } from "@/lib/media-url-filter";
import {
  contentTagOptions,
  defaultSimpleRunMediaSettings,
  visualTagOptions,
  type ConfigStatus,
  type ContentProject,
  type ContentTag,
  type CrawlJob,
  type CrawlPlatform,
  type ExecutionLogEntry,
  type MaterialAsset,
  type MaterialFolder,
  type MaterialLibraryAsset,
  type MaterialLibrarySnapshot,
  type NormalizedSourceItem,
  type Platform,
  type PlatformCrawlSetting,
  type ProductionPlan,
  type SimpleRun,
  type SimpleRunMediaSettings,
  type SourceLinkPlatform,
  type SourceUsageStatus,
  type SourceVisualTaggingAsset,
  type VisualTag,
  type WorkspacePromptSettings,
} from "@/lib/types";

type PoolStatusFilter = SourceUsageStatus | "all";
type PoolPlatformFilter = Platform | "all";
type PoolSortMode = "hot_desc" | "published_desc" | "published_asc" | "crawled_desc" | "crawled_asc" | "engagement_desc";
type CrawlInputMode = "keyword" | "links";
type ContentDeskView = "content" | "materials";
type LinkImportPlatform = SourceLinkPlatform | "auto";
type BusyState = "load" | "crawl" | "source" | "batch" | "secondary" | "settings" | "materials" | "materialLibrary" | null;

type MaterialAssetDraft = {
  name: string;
  tags: string;
};

type LinkImportResultStatus = "imported" | "filtered" | "duplicate" | "unsupported" | "failed";

type LinkImportResult = {
  url: string;
  platform?: Platform;
  status: LinkImportResultStatus;
  sourceId?: string;
  itemId?: string;
  title?: string;
  error?: string;
};

type LinkImportSummary = {
  total: number;
  valid: number;
  imported: number;
  filteredUnsafe: number;
  duplicates: number;
  unsupported: number;
  failed: number;
  taggedContent: number;
  taggedVisual: number;
  localImages: number;
  videoFrames: number;
};

type LinkImportResponse = {
  query?: string;
  items?: NormalizedSourceItem[];
  project?: ContentProject;
  results?: LinkImportResult[];
  summary?: LinkImportSummary;
  error?: string;
};

type SourceEditForm = {
  title: string;
  contentText: string;
  authorName: string;
  sourceUrl: string;
  contentTags: ContentTag[];
  visualTags: Array<{ id: string; tag: VisualTag }>;
  poolStatus: SourceUsageStatus;
  mediaType: NonNullable<NormalizedSourceItem["mediaType"]>;
  views: string;
  reads: string;
  plays: string;
  likes: string;
  collects: string;
  comments: string;
  shares: string;
};

type ManualSourceForm = {
  title: string;
  contentText: string;
  sourceUrl: string;
  imageUrls: string;
  videoUrl: string;
};

type EditableVisualAsset = {
  id: string;
  index: number;
  kind: SourceVisualTaggingAsset["kind"];
  url: string;
  tag?: VisualTag;
};

type PreviewState =
  | {
      title: string;
      text?: string;
      imageUrls?: string[];
      videoUrls?: string[];
      imageIndex?: number;
      meta?: string;
      links?: string[];
    }
  | null;

type TaskProgressSnapshot = {
  title: string;
  label: string;
  detail: string;
  value: number;
  status: "running" | "success" | "error";
  total?: number;
  completed?: number;
};

const localMediaPreviewVersion = "20260605-image-format-v2";

const themeOptions: Array<{ value: ThemeMode; label: string; icon: ReactNode }> = [
  { value: "professional", label: "专业浅色", icon: <Sun className="h-3.5 w-3.5" /> },
  { value: "editorial", label: "编辑室", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { value: "creator", label: "创作深色", icon: <Moon className="h-3.5 w-3.5" /> },
];

const platforms: Array<{ value: Platform; label: string; accent: string }> = [
  { value: "wechat_channels", label: "视频号", accent: "bg-cyan-300" },
  { value: "xiaohongshu", label: "小红书", accent: "bg-rose-300" },
  { value: "douyin", label: "抖音", accent: "bg-white" },
  { value: "weibo", label: "微博", accent: "bg-amber-300" },
  { value: "xiaopeng_bbs", label: "小鹏社区", accent: "bg-sky-300" },
  { value: "dongchedi", label: "懂车帝", accent: "bg-lime-300" },
  { value: "feishu", label: "飞书", accent: "bg-emerald-300" },
  { value: "original", label: "原创", accent: "bg-violet-300" },
];

const crawlPlatforms: Array<{ value: CrawlPlatform; label: string; accent: string }> = [
  { value: "wechat_channels", label: "视频号", accent: "bg-cyan-300" },
  { value: "xiaohongshu", label: "小红书", accent: "bg-rose-300" },
  { value: "douyin", label: "抖音", accent: "bg-white" },
  { value: "weibo", label: "微博", accent: "bg-amber-300" },
];

const linkImportPlatforms: Array<{ value: SourceLinkPlatform; label: string }> = [
  ...crawlPlatforms.map((item) => ({ value: item.value, label: item.label })),
  { value: "xiaopeng_bbs", label: "小鹏社区" },
  { value: "dongchedi", label: "懂车帝" },
];

const sortOptions: Record<CrawlPlatform, Array<{ label: string; value: string }>> = {
  wechat_channels: [{ label: "相关", value: "relevance" }],
  xiaohongshu: [
    { label: "综合", value: "general" },
    { label: "最新", value: "time_descending" },
    { label: "最热", value: "popularity_descending" },
    { label: "最多评论", value: "comment_descending" },
    { label: "最多收藏", value: "collect_descending" },
    { label: "英文优先", value: "english_preferred" },
  ],
  douyin: [
    { label: "综合", value: "0" },
    { label: "最多点赞", value: "1" },
    { label: "最新发布", value: "2" },
  ],
  weibo: [
    { label: "综合", value: "all" },
    { label: "热门", value: "hot" },
    { label: "原创", value: "original" },
    { label: "认证用户", value: "verified" },
    { label: "媒体", value: "media" },
    { label: "观点", value: "viewpoint" },
  ],
};

const weiboIncludeOptions = [
  { label: "全部内容", value: "all" },
  { label: "含图片", value: "pic" },
  { label: "含视频", value: "video" },
  { label: "含音乐", value: "music" },
  { label: "含短链", value: "link" },
];

const douyinContentTypeOptions = [
  { label: "全部", value: "0" },
  { label: "视频", value: "1" },
  { label: "图片", value: "2" },
  { label: "文章", value: "3" },
];

const platformDocLinks: Partial<Record<CrawlPlatform, string>> = {
  xiaohongshu: "https://docs.tikhub.io/420136398e0",
};

const defaultPlatformCrawlSettings: Record<CrawlPlatform, PlatformCrawlSetting> = {
  wechat_channels: { sort: "relevance" },
  xiaohongshu: { sort: "popularity_descending", noteType: 0 },
  douyin: { sort: "0", contentType: "0" },
  weibo: { sort: "hot", searchType: "hot", includeType: "all", timeScope: "" },
};

const poolStatusOptions: Array<{ label: string; value: PoolStatusFilter }> = [
  { label: "全部", value: "all" },
  { label: "未使用", value: "new" },
  { label: "已分析", value: "analyzed" },
  { label: "已仿写", value: "rewritten" },
  { label: "已审查", value: "approved" },
  { label: "已发布", value: "published" },
];

const poolPlatformOptions: Array<{ label: string; value: PoolPlatformFilter }> = [
  { label: "全部平台", value: "all" },
  ...platforms.map((item) => ({ label: item.label, value: item.value })),
];

const poolSortOptions: Array<{ label: string; value: PoolSortMode }> = [
  { label: "爆款指数", value: "hot_desc" },
  { label: "发布时间新到旧", value: "published_desc" },
  { label: "发布时间旧到新", value: "published_asc" },
  { label: "抓取时间新到旧", value: "crawled_desc" },
  { label: "抓取时间旧到新", value: "crawled_asc" },
  { label: "互动率", value: "engagement_desc" },
];

export default function ContentDeskPage() {
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, () => "professional" as ThemeMode);
  const [deskView, setDeskView] = useState<ContentDeskView>("content");
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [projects, setProjects] = useState<ContentProject[]>([]);
  const [activeProject, setActiveProject] = useState<ContentProject | null>(null);
  const [sources, setSources] = useState<NormalizedSourceItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedContentItemIds, setSelectedContentItemIds] = useState<string[]>([]);
  const [crawlInputMode, setCrawlInputMode] = useState<CrawlInputMode>("keyword");
  const [platform, setPlatform] = useState<CrawlPlatform>("xiaohongshu");
  const [linkImportPlatform, setLinkImportPlatform] = useState<LinkImportPlatform>("auto");
  const [linkImportText, setLinkImportText] = useState("");
  const [linkImportResults, setLinkImportResults] = useState<LinkImportResult[]>([]);
  const [linkImportSummary, setLinkImportSummary] = useState<LinkImportSummary | null>(null);
  const [query, setQuery] = useState("");
  const [targetCount, setTargetCount] = useState(20);
  const [sort, setSort] = useState(defaultPlatformCrawlSettings.xiaohongshu.sort || "general");
  const [noteType, setNoteType] = useState(0);
  const [includeType, setIncludeType] = useState("all");
  const [timeScope, setTimeScope] = useState("");
  const [contentType, setContentType] = useState("0");
  const [cookie, setCookie] = useState("");
  const [crawlEnableVideoTranscription, setCrawlEnableVideoTranscription] = useState(false);
  const [linkImportVideoFrameOriginalReference, setLinkImportVideoFrameOriginalReference] = useState(true);
  const [linkImportEnableVideoTranscription, setLinkImportEnableVideoTranscription] = useState(false);
  const [poolGenerateImages, setPoolGenerateImages] = useState(defaultSimpleRunMediaSettings.generateImages);
  const [poolUseComfyUiKlein, setPoolUseComfyUiKlein] = useState(defaultSimpleRunMediaSettings.useComfyUiKlein);
  const [poolDirectOriginalReference, setPoolDirectOriginalReference] = useState(defaultSimpleRunMediaSettings.directOriginalReference);
  const [poolIncludeSourceVideo, setPoolIncludeSourceVideo] = useState(defaultSimpleRunMediaSettings.includeSourceVideo);
  const [poolEnableVideoTranscription, setPoolEnableVideoTranscription] = useState(defaultSimpleRunMediaSettings.enableVideoTranscription);
  const [poolStatusFilter, setPoolStatusFilter] = useState<PoolStatusFilter>("all");
  const [poolPlatformFilter, setPoolPlatformFilter] = useState<PoolPlatformFilter>("all");
  const [poolSort, setPoolSort] = useState<PoolSortMode>("hot_desc");
  const [simpleRuns, setSimpleRuns] = useState<SimpleRun[]>([]);
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspacePromptSettings | null>(null);
  const [sourceEditState, setSourceEditState] = useState<{ sourceId: string; form: SourceEditForm }>({
    sourceId: "",
    form: makeEmptySourceEditForm(),
  });
  const [manualSource, setManualSource] = useState<ManualSourceForm>({
    title: "",
    contentText: "",
    sourceUrl: "",
    imageUrls: "",
    videoUrl: "",
  });
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogEntry[]>([]);
  const [crawlProgress, setCrawlProgress] = useState<TaskProgressSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<BusyState>("load");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [materialPath, setMaterialPath] = useState("");
  const [materials, setMaterials] = useState<MaterialAsset[]>([]);
  const [materialLibrary, setMaterialLibrary] = useState<MaterialLibrarySnapshot>({ folders: [], assets: [] });
  const [activeMaterialFolderId, setActiveMaterialFolderId] = useState("root");
  const [newMaterialFolderName, setNewMaterialFolderName] = useState("");
  const [materialAssetPath, setMaterialAssetPath] = useState("");
  const [materialAssetName, setMaterialAssetName] = useState("");
  const [materialAssetTags, setMaterialAssetTags] = useState("");
  const [activeFolderNameDraftState, setActiveFolderNameDraftState] = useState({ folderId: "", name: "" });

  const visibleSources = useMemo(() => {
    const filtered = sources.filter((item) => {
      const statusMatched = poolStatusFilter === "all" || (item.poolStatus || "new") === poolStatusFilter;
      const platformMatched = poolPlatformFilter === "all" || item.platform === poolPlatformFilter;
      return statusMatched && platformMatched;
    });
    return sortSources(filtered, poolSort);
  }, [poolPlatformFilter, poolSort, poolStatusFilter, sources]);

  const selectedContentItems = useMemo(
    () => visibleSources.filter((item) => selectedContentItemIds.includes(item.id)),
    [selectedContentItemIds, visibleSources],
  );

  const selectedSource = useMemo(
    () => visibleSources.find((item) => item.id === selectedSourceId) || visibleSources[0] || null,
    [selectedSourceId, visibleSources],
  );

  const sourceEdit = useMemo(
    () =>
      selectedSource
        ? sourceEditState.sourceId === selectedSource.id
          ? sourceEditState.form
          : makeSourceEditForm(selectedSource)
        : makeEmptySourceEditForm(),
    [selectedSource, sourceEditState],
  );

  const sourceEditVisualAssets = useMemo(() => (selectedSource ? buildEditableVisualAssets(selectedSource) : []), [selectedSource]);
  const selectedSourceImages = useMemo(() => (selectedSource ? getDisplayImages(selectedSource) : []), [selectedSource]);
  const selectedSourceFrames = useMemo(() => selectBestVideoHighlightFrames(selectedSource?.videoFrames), [selectedSource]);
  const selectedSourceFrameUrls = useMemo(() => selectedSourceFrames.map((frame) => frame.url), [selectedSourceFrames]);
  const selectedSourceVisualImages = useMemo(
    () => (selectedSourceImages.length ? selectedSourceImages : selectedSourceFrameUrls),
    [selectedSourceFrameUrls, selectedSourceImages],
  );
  const selectedSourceImagesAreFrameFallback = Boolean(
    selectedSource &&
      shouldUseVideoFramesAsImagePreview(selectedSource) &&
      selectedSourceFrameUrls.length &&
      sameStringList(selectedSourceImages, selectedSourceFrameUrls),
  );
  const projectStats = useMemo(() => buildProjectStats(activeProject), [activeProject]);
  const latestPoolRun = useMemo(() => simpleRuns.find((run) => run.input.sourceMode === "pool") || null, [simpleRuns]);
  const activeMaterialFolder = useMemo(
    () => materialLibrary.folders.find((folder) => folder.id === activeMaterialFolderId) || materialLibrary.folders[0],
    [activeMaterialFolderId, materialLibrary.folders],
  );
  const activeFolderNameDraft =
    activeMaterialFolder && activeFolderNameDraftState.folderId === activeMaterialFolder.id
      ? activeFolderNameDraftState.name
      : activeMaterialFolder?.name || "";
  const materialFolderAssets = useMemo(
    () => materialLibrary.assets.filter((asset) => asset.folderId === activeMaterialFolder?.id),
    [activeMaterialFolder?.id, materialLibrary.assets],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void loadInitialData();
    const timer = window.setInterval(() => {
      void loadSimpleRuns();
      void loadExecutionLogs();
    }, 3500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview]);

  useEffect(() => {
    if (deskView !== "materials") return;
    void loadMaterialLibrary();
  }, [deskView]);

  async function loadInitialData() {
    setBusy("load");
    try {
      await Promise.all([loadConfig(), loadWorkspaceSettings(), loadContentPool(), loadSimpleRuns(), loadExecutionLogs()]);
    } finally {
      setBusy(null);
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch("/api/config");
      const data = (await res.json()) as ConfigStatus & { error?: string };
      if (res.ok) setConfig(data);
    } catch {
      setMessage("配置状态读取失败");
    }
  }

  async function loadWorkspaceSettings() {
    try {
      const res = await fetch("/api/workspace/settings");
      const data = (await res.json()) as { settings?: WorkspacePromptSettings; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error || "默认策略读取失败");
      setWorkspaceSettings(data.settings);
      applyPoolSimpleRunMediaSettings(data.settings.simpleRunMediaSettings);
      applyPlatformCrawlControls(platform, data.settings);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "默认策略读取失败");
    }
  }

  function applyPoolSimpleRunMediaSettings(mediaSettings: SimpleRunMediaSettings) {
    setPoolGenerateImages(mediaSettings.generateImages);
    setPoolUseComfyUiKlein(mediaSettings.useComfyUiKlein);
    setPoolDirectOriginalReference(mediaSettings.directOriginalReference);
    setPoolIncludeSourceVideo(mediaSettings.includeSourceVideo);
    setPoolEnableVideoTranscription(mediaSettings.enableVideoTranscription);
  }

  async function loadContentPool(nextQuery = query) {
    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      const res = await fetch(`/api/content-pool?${params.toString()}`);
      const data = (await res.json()) as { projects?: ContentProject[]; activeProject?: ContentProject; error?: string };
      if (!res.ok) throw new Error(data.error || "内容池读取失败");
      const nextProject = data.activeProject || null;
      setProjects(data.projects || []);
      setActiveProject(nextProject);
      setSources(nextProject?.items || []);
      if (nextProject && !nextQuery.trim()) setQuery(nextProject.query);
      setSelectedSourceId((current) => (nextProject?.items.some((item) => item.id === current) ? current : nextProject?.items[0]?.id || ""));
      setSelectedContentItemIds((current) => current.filter((id) => nextProject?.items.some((item) => item.id === id)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "内容池读取失败");
    }
  }

  async function loadSimpleRuns() {
    try {
      const res = await fetch("/api/simple/runs");
      const data = (await res.json()) as { runs?: SimpleRun[]; error?: string };
      if (res.ok) setSimpleRuns(data.runs || []);
    } catch {
      // Progress is auxiliary on this desk.
    }
  }

  async function loadMaterialLibrary() {
    try {
      const res = await fetch("/api/materials/library");
      const data = (await res.json()) as MaterialLibrarySnapshot & { error?: string };
      if (!res.ok) throw new Error(data.error || "素材库读取失败");
      const folders = data.folders || [];
      setMaterialLibrary({ folders, assets: data.assets || [] });
      setActiveMaterialFolderId((current) => (folders.some((folder) => folder.id === current) ? current : folders[0]?.id || "root"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材库读取失败");
    }
  }

  async function scanMaterials() {
    if (!materialPath.trim()) {
      setMessage("请填写本地素材文件夹路径");
      return;
    }
    setBusy("materials");
    setMessage("");
    try {
      const res = await fetch("/api/materials/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: materialPath }),
      });
      const data = (await res.json()) as { assets?: MaterialAsset[]; error?: string };
      if (!res.ok) throw new Error(data.error || "素材扫描失败");
      setMaterials(data.assets || []);
      setMessage(`已扫描素材：${data.assets?.length || 0} 个文件`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材扫描失败");
    } finally {
      setBusy(null);
    }
  }

  async function createMaterialFolderFromForm() {
    if (!newMaterialFolderName.trim()) {
      setMessage("请填写素材文件夹名称");
      return;
    }
    setBusy("materialLibrary");
    setMessage("");
    try {
      const res = await fetch("/api/materials/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "folder", name: newMaterialFolderName.trim(), parentId: activeMaterialFolder?.id || "root" }),
      });
      const data = (await res.json()) as { folder?: MaterialFolder; error?: string };
      if (!res.ok || !data.folder) throw new Error(data.error || "素材文件夹创建失败");
      setNewMaterialFolderName("");
      setActiveMaterialFolderId(data.folder.id);
      await loadMaterialLibrary();
      setMessage("已创建素材文件夹");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材文件夹创建失败");
    } finally {
      setBusy(null);
    }
  }

  async function saveActiveMaterialFolder() {
    if (!activeMaterialFolder || activeMaterialFolder.id === "root") return;
    setBusy("materialLibrary");
    setMessage("");
    try {
      const res = await fetch("/api/materials/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "folder", id: activeMaterialFolder.id, patch: { name: activeFolderNameDraft.trim() } }),
      });
      const data = (await res.json()) as { folder?: MaterialFolder; error?: string };
      if (!res.ok || !data.folder) throw new Error(data.error || "素材文件夹保存失败");
      await loadMaterialLibrary();
      setMessage("已保存素材文件夹");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材文件夹保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteActiveMaterialFolder() {
    if (!activeMaterialFolder || activeMaterialFolder.id === "root") return;
    if (!window.confirm("确认删除当前素材文件夹？子文件夹和资产索引会一起删除，原始本地文件不会被删除。")) return;
    setBusy("materialLibrary");
    setMessage("");
    try {
      const res = await fetch(`/api/materials/library?type=folder&id=${encodeURIComponent(activeMaterialFolder.id)}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "素材文件夹删除失败");
      setActiveMaterialFolderId("root");
      await loadMaterialLibrary();
      setMessage("已删除素材文件夹");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材文件夹删除失败");
    } finally {
      setBusy(null);
    }
  }

  async function createMaterialAssetFromPath() {
    if (!activeMaterialFolder) {
      setMessage("请先选择素材文件夹");
      return;
    }
    if (!materialAssetPath.trim()) {
      setMessage("请填写本地素材文件路径");
      return;
    }
    setBusy("materialLibrary");
    setMessage("");
    try {
      const res = await fetch("/api/materials/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "asset",
          folderId: activeMaterialFolder.id,
          path: materialAssetPath.trim(),
          name: materialAssetName.trim(),
          tags: splitTags(materialAssetTags),
        }),
      });
      const data = (await res.json()) as { asset?: MaterialLibraryAsset; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error || "素材资产创建失败");
      setMaterialAssetPath("");
      setMaterialAssetName("");
      setMaterialAssetTags("");
      await loadMaterialLibrary();
      setMessage("已新增素材资产");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材资产创建失败");
    } finally {
      setBusy(null);
    }
  }

  async function updateMaterialAssetFromDraft(asset: MaterialLibraryAsset, draft: MaterialAssetDraft) {
    setBusy("materialLibrary");
    setMessage("");
    try {
      const res = await fetch("/api/materials/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "asset", id: asset.id, patch: { name: draft.name.trim(), tags: splitTags(draft.tags) } }),
      });
      const data = (await res.json()) as { asset?: MaterialLibraryAsset; error?: string };
      if (!res.ok || !data.asset) throw new Error(data.error || "素材资产保存失败");
      await loadMaterialLibrary();
      setMessage("已保存素材资产");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材资产保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteMaterialAssetFromLibrary(asset: MaterialLibraryAsset) {
    if (!window.confirm(`确认删除素材索引“${asset.name}”？原始本地文件不会被删除。`)) return;
    setBusy("materialLibrary");
    setMessage("");
    try {
      const res = await fetch(`/api/materials/library?type=asset&id=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "素材资产删除失败");
      await loadMaterialLibrary();
      setMessage("已删除素材资产");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材资产删除失败");
    } finally {
      setBusy(null);
    }
  }

  async function importScannedMaterialsToLibrary() {
    if (!activeMaterialFolder || !materials.length) return;
    setBusy("materialLibrary");
    setMessage("");
    try {
      for (const asset of materials) {
        const res = await fetch("/api/materials/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "asset", folderId: activeMaterialFolder.id, path: asset.path, name: asset.name }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || `导入失败：${asset.name}`);
      }
      await loadMaterialLibrary();
      setMessage(`已导入扫描素材：${materials.length} 个`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "扫描素材导入失败");
    } finally {
      setBusy(null);
    }
  }

  async function loadExecutionLogs() {
    try {
      const res = await fetch("/api/activity?limit=80");
      const data = (await res.json()) as { entries?: ExecutionLogEntry[] };
      if (res.ok) setExecutionLogs(data.entries || []);
    } catch {
      // Execution log is non-blocking.
    }
  }

  async function clearExecutionLogs() {
    try {
      await fetch("/api/activity", { method: "DELETE" });
      await loadExecutionLogs();
    } catch {
      setMessage("执行日志清空失败");
    }
  }

  function applyPlatformCrawlControls(nextPlatform: CrawlPlatform, settingsSource = workspaceSettings) {
    const nextSetting = getPlatformCrawlSettingFromSettings(nextPlatform, settingsSource);
    setSort(nextSetting.sort || sortOptions[nextPlatform][0]?.value || "");
    setNoteType(Number(nextSetting.noteType ?? 0));
    setIncludeType(nextPlatform === "weibo" ? nextSetting.includeType || "all" : "all");
    setTimeScope(nextPlatform === "weibo" ? nextSetting.timeScope || "" : "");
    setContentType(nextPlatform === "douyin" ? nextSetting.contentType || "0" : "0");
  }

  function choosePlatform(nextPlatform: CrawlPlatform) {
    setPlatform(nextPlatform);
    applyPlatformCrawlControls(nextPlatform);
  }

  function getPlatformCrawlSettingFromSettings(targetPlatform: CrawlPlatform, settingsSource = workspaceSettings): PlatformCrawlSetting {
    return {
      ...defaultPlatformCrawlSettings[targetPlatform],
      ...(settingsSource?.platformCrawlSettings?.[targetPlatform] || {}),
    };
  }

  function getCurrentPlatformCrawlSetting(targetPlatform: CrawlPlatform): PlatformCrawlSetting {
    return {
      sort,
      noteType: targetPlatform === "xiaohongshu" ? noteType : undefined,
      searchType: targetPlatform === "weibo" ? sort : undefined,
      includeType: targetPlatform === "weibo" ? includeType : undefined,
      timeScope: targetPlatform === "weibo" ? timeScope : undefined,
      contentType: targetPlatform === "douyin" ? contentType : undefined,
    };
  }

  function updatePlatformCrawlSettingsDraft(targetPlatform: CrawlPlatform, setting: PlatformCrawlSetting) {
    setWorkspaceSettings((current) => {
      if (!current) return current;
      return {
        ...current,
        platformCrawlSettings: {
          ...defaultPlatformCrawlSettings,
          ...current.platformCrawlSettings,
          [targetPlatform]: {
            ...defaultPlatformCrawlSettings[targetPlatform],
            ...(current.platformCrawlSettings?.[targetPlatform] || {}),
            ...setting,
          },
        },
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async function saveCurrentPlatformCrawlSettings() {
    if (!workspaceSettings) return;
    const nextSettings: WorkspacePromptSettings = {
      ...workspaceSettings,
      platformCrawlSettings: {
        ...defaultPlatformCrawlSettings,
        ...workspaceSettings.platformCrawlSettings,
        [platform]: {
          ...defaultPlatformCrawlSettings[platform],
          ...(workspaceSettings.platformCrawlSettings?.[platform] || {}),
          ...getCurrentPlatformCrawlSetting(platform),
        },
      },
      updatedAt: new Date().toISOString(),
    };
    setBusy("settings");
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings),
      });
      const data = (await res.json()) as { settings?: WorkspacePromptSettings; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error || "采集策略保存失败");
      setWorkspaceSettings(data.settings);
      setMessage("采集策略已保存，精简版和内容台都会使用这组设置。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "采集策略保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function startCrawl() {
    if (!query.trim()) {
      setMessage("请输入关键词。");
      return;
    }
    setBusy("crawl");
    setMessage("");
    setCrawlProgress({ title: "关键词采集", label: "运行中", detail: `${getPlatformLabel(platform)} · ${query}`, value: 12, status: "running" });
    try {
      const res = await fetch("/api/crawl/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          query,
          targetCount,
          sort,
          noteType: platform === "xiaohongshu" ? noteType : undefined,
          searchType: platform === "weibo" ? sort : undefined,
          includeType: platform === "weibo" ? includeType : undefined,
          timeScope: platform === "weibo" ? timeScope : undefined,
          contentType: platform === "douyin" ? contentType : undefined,
          cookie: platform === "douyin" ? cookie : undefined,
          enableVideoTranscription: crawlEnableVideoTranscription,
        }),
      });
      const data = (await res.json()) as CrawlJob & { error?: string; project?: ContentProject };
      if (!res.ok) throw new Error(data.error || "采集失败");
      setCrawlProgress({
        title: "关键词采集",
        label: data.status === "completed" ? "已完成" : data.status,
        detail: `${data.items?.length || 0} 条样本进入内容池`,
        value: 100,
        status: "success",
        total: targetCount,
        completed: data.items?.length || 0,
      });
      await loadContentPool(query);
      await loadExecutionLogs();
      setMessage(`采集完成：${data.items?.length || 0} 条样本。`);
    } catch (error) {
      setCrawlProgress({ title: "关键词采集", label: "失败", detail: error instanceof Error ? error.message : "采集失败", value: 100, status: "error" });
      setMessage(error instanceof Error ? error.message : "采集失败");
    } finally {
      setBusy(null);
    }
  }

  async function startLinkImport() {
    const links = splitLines(linkImportText);
    if (!query.trim()) {
      setMessage("请输入归属关键词 / 内容池项目。");
      return;
    }
    if (!links.length) {
      setMessage("请输入至少一条链接或 ID。");
      return;
    }
    setBusy("crawl");
    setMessage("");
    setCrawlProgress({ title: "链接导入", label: "运行中", detail: `${links.length} 条来源`, value: 15, status: "running" });
    try {
      const res = await fetch("/api/crawl/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          links,
          platform: linkImportPlatform === "auto" ? undefined : linkImportPlatform,
          cookie: linkImportPlatform === "douyin" || linkImportPlatform === "dongchedi" ? cookie : undefined,
          videoFrameOriginalReference: linkImportVideoFrameOriginalReference,
          enableVideoTranscription: linkImportEnableVideoTranscription,
        }),
      });
      const data = (await res.json()) as LinkImportResponse;
      if (!res.ok) throw new Error(data.error || "链接导入失败");
      setLinkImportResults(data.results || []);
      setLinkImportSummary(data.summary || null);
      setCrawlProgress({
        title: "链接导入",
        label: "已完成",
        detail: `成功 ${data.summary?.imported || data.items?.length || 0} 条，失败 ${data.summary?.failed || 0} 条`,
        value: 100,
        status: "success",
      });
      await loadContentPool(data.query || query);
      await loadExecutionLogs();
      setMessage(`链接导入完成：${data.summary?.imported || data.items?.length || 0} 条样本。`);
    } catch (error) {
      setCrawlProgress({ title: "链接导入", label: "失败", detail: error instanceof Error ? error.message : "链接导入失败", value: 100, status: "error" });
      setMessage(error instanceof Error ? error.message : "链接导入失败");
    } finally {
      setBusy(null);
    }
  }

  async function saveSourceEdits() {
    if (!selectedSource) return;
    setBusy("source");
    try {
      const patch: Partial<NormalizedSourceItem> = {
        title: sourceEdit.title.trim(),
        contentText: sourceEdit.contentText.trim(),
        authorName: sourceEdit.authorName.trim(),
        sourceUrl: sourceEdit.sourceUrl.trim() || undefined,
        poolStatus: sourceEdit.poolStatus,
        mediaType: sourceEdit.mediaType,
        metrics: parseMetricForm(sourceEdit),
        contentTagging: {
          tags: sourceEdit.contentTags.slice(0, 4),
          reasons: selectedSource.contentTagging?.reasons || [],
          confidence: selectedSource.contentTagging?.confidence,
          model: selectedSource.contentTagging?.model,
          taggedAt: selectedSource.contentTagging?.taggedAt,
          status: "success",
          updatedBy: "user",
          updatedAt: new Date().toISOString(),
        },
        visualTagging: {
          assets: buildVisualTagPatchAssets(selectedSource, sourceEdit.visualTags),
          model: selectedSource.visualTagging?.model,
          taggedAt: selectedSource.visualTagging?.taggedAt,
          status: "success",
          error: selectedSource.visualTagging?.error,
        },
      };
      const res = await fetch("/api/content/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedSource.id, patch }),
      });
      const data = (await res.json()) as { item?: NormalizedSourceItem; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error || "样本保存失败");
      setSourceEditState({ sourceId: data.item.id, form: makeSourceEditForm(data.item) });
      await loadContentPool(query);
      setMessage("样本已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "样本保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function createManualSourceItem() {
    if (!query.trim()) {
      setMessage("请输入内容池项目关键词。");
      return;
    }
    if (!manualSource.title.trim() && !manualSource.contentText.trim() && !manualSource.imageUrls.trim() && !manualSource.videoUrl.trim()) {
      setMessage("至少填写标题、正文、图片或视频之一。");
      return;
    }
    setBusy("source");
    try {
      const images = splitLines(manualSource.imageUrls);
      const res = await fetch("/api/content/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          item: {
            platform,
            title: manualSource.title.trim(),
            contentText: manualSource.contentText.trim(),
            sourceUrl: manualSource.sourceUrl.trim() || undefined,
            images,
            videoUrl: manualSource.videoUrl.trim() || undefined,
            mediaUrls: [...images, manualSource.videoUrl.trim()].filter(Boolean),
            mediaType: manualSource.videoUrl.trim() ? (images.length ? "mixed" : "video") : images.length ? "image" : "text",
            metrics: {},
            raw: { manual: true, createdFrom: "content-desk" },
          },
        }),
      });
      const data = (await res.json()) as { item?: NormalizedSourceItem; project?: ContentProject; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error || "新增样本失败");
      setManualSource({ title: "", contentText: "", sourceUrl: "", imageUrls: "", videoUrl: "" });
      setSelectedSourceId(data.item.id);
      await loadContentPool(query);
      setMessage("已新增内容池样本。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增样本失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelectedSource() {
    if (!selectedSource) return;
    if (!window.confirm("确认删除当前内容池样本？该操作不可撤销。")) return;
    setBusy("source");
    try {
      const res = await fetch(`/api/content/items?id=${encodeURIComponent(selectedSource.id)}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "删除样本失败");
      setSelectedSourceId("");
      await loadContentPool(query);
      setMessage("样本已删除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除样本失败");
    } finally {
      setBusy(null);
    }
  }

  async function updateSelectedContentItemStatus(status: SourceUsageStatus) {
    if (!selectedContentItemIds.length) {
      setMessage("请先勾选内容池样本。");
      return;
    }
    setBusy("batch");
    try {
      const res = await fetch("/api/content/items/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", ids: selectedContentItemIds, status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "批量更新失败");
      setSelectedContentItemIds([]);
      await loadContentPool(query);
      setMessage(`已将 ${selectedContentItemIds.length} 条样本标记为${formatPoolStatus(status)}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量更新失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelectedContentItems() {
    if (!selectedContentItemIds.length) {
      setMessage("请先勾选内容池样本。");
      return;
    }
    if (!window.confirm(`确认删除已选 ${selectedContentItemIds.length} 条内容池样本？该操作不可撤销。`)) return;
    setBusy("batch");
    try {
      const res = await fetch("/api/content/items/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: selectedContentItemIds }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "批量删除失败");
      setSelectedContentItemIds([]);
      await loadContentPool(query);
      setMessage("已删除选中样本。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量删除失败");
    } finally {
      setBusy(null);
    }
  }

  async function cacheSelectedContentItemMedia(sourceItemIds = selectedContentItemIds, options: { forceVideoRefresh?: boolean } = {}) {
    if (!sourceItemIds.length) {
      setMessage("请先勾选内容池样本。");
      return;
    }
    setBusy("batch");
    try {
      const res = await fetch("/api/content/items/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cache_media", ids: sourceItemIds, forceVideoRefresh: options.forceVideoRefresh === true }),
      });
      const data = (await res.json()) as { updatedCount?: number; localImages?: number; localVideos?: number; videoFrames?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "素材补全失败");
      await loadContentPool(query);
      setMessage(`素材补全完成：${data.updatedCount || 0} 条，已缓存图片 ${data.localImages || 0} 张，已缓存视频 ${data.localVideos || 0} 个，关键帧 ${data.videoFrames || 0} 张。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材补全失败");
    } finally {
      setBusy(null);
    }
  }

  async function startPoolSecondaryCreation() {
    if (!selectedContentItemIds.length) {
      setMessage("请先勾选要二次创作的内容池样本。");
      return;
    }
    setBusy("secondary");
    setMessage("");
    const poolMediaSettings: SimpleRunMediaSettings = {
      generateImages: poolGenerateImages,
      useComfyUiKlein: poolUseComfyUiKlein,
      directOriginalReference: poolDirectOriginalReference,
      includeSourceVideo: poolIncludeSourceVideo,
      enableVideoTranscription: poolEnableVideoTranscription,
    };
    try {
      const selectedCount = selectedContentItemIds.length;
      const res = await fetch("/api/simple/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMode: "pool",
          sourceItemIds: selectedContentItemIds,
          keyword: activeProject?.query || query || "内容池二次创作",
          targetCount: selectedCount,
          platforms: [],
          materialPaths: [],
          useComfyUiKlein: poolUseComfyUiKlein,
          directOriginalReference: poolDirectOriginalReference,
          includeSourceVideo: poolIncludeSourceVideo,
          enableVideoTranscription: poolEnableVideoTranscription,
          generateImages: poolGenerateImages,
          writeFeishu: false,
          settings: workspaceSettings
            ? {
                ...workspaceSettings,
                simpleRunMediaSettings: poolMediaSettings,
              }
            : undefined,
        }),
      });
      const data = (await res.json()) as { run?: SimpleRun; error?: string };
      if (!res.ok || !data.run) throw new Error(data.error || "内容池二次创作启动失败");
      await loadSimpleRuns();
      await loadExecutionLogs();
      setMessage(`已启动内容池二次创作：${selectedCount} 条样本，将生成待审草稿并进入内容审查台。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "内容池二次创作启动失败");
    } finally {
      setBusy(null);
    }
  }

  function toggleContentItemSelection(sourceItemId: string) {
    setSelectedContentItemIds((current) =>
      current.includes(sourceItemId) ? current.filter((id) => id !== sourceItemId) : [...current, sourceItemId],
    );
  }

  function selectVisibleContentItems() {
    setSelectedContentItemIds(visibleSources.slice(0, 200).map((item) => item.id));
  }

  function clearContentItemSelection() {
    setSelectedContentItemIds([]);
  }

  function openSourcePreview(item: NormalizedSourceItem) {
    const imageUrls = getDisplayImages(item);
    const frameUrls = selectBestVideoHighlightFrames(item.videoFrames).map((frame) => frame.url);
    const videoUrl = getDisplayVideoUrl(item);
    setPreview({
      title: item.title || item.contentText || "内容池样本",
      text: item.contentText,
      imageUrls: imageUrls.length ? imageUrls : frameUrls,
      videoUrls: videoUrl ? [videoUrl] : undefined,
      imageIndex: 0,
      meta: `${getPlatformLabel(item.platform)} · ${formatMediaType(item.mediaType)} · ${formatPoolStatus(item.poolStatus)}`,
      links: [item.sourceUrl, ...(item.mediaUrls || [])].filter((url): url is string => Boolean(url)).slice(0, 8),
    });
  }

  function openImageGallery(imageUrls: string[], imageIndex: number, title: string, meta?: string) {
    setPreview({ title, meta, imageUrls, imageIndex });
  }

  return (
    <main className="app-shell content-desk-shell overflow-x-hidden">
      <div className="content-desk-frame mx-auto flex w-full max-w-[1880px] flex-col gap-3 text-sm">
        <header className="content-desk-header glass-strong ops-panel">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark grid h-12 w-12 shrink-0 place-items-center rounded-[8px]">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="header-eyebrow">Content operations</p>
              <h1 className="truncate text-xl font-black sm:text-2xl">采集与内容池</h1>
              <p className="truncate text-xs text-[var(--text-muted)]">采集、导入、沉淀样本，并从内容池发起二次创作</p>
            </div>
          </div>
          <div className="content-desk-header-actions">
            <div className="theme-switcher review-theme-switcher" role="tablist" aria-label="内容工作区">
              <button
                className={`theme-option ${deskView === "content" ? "theme-option-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={deskView === "content"}
                onClick={() => setDeskView("content")}
              >
                <Database className="h-3.5 w-3.5" />
                <span>内容池</span>
              </button>
              <button
                className={`theme-option ${deskView === "materials" ? "theme-option-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={deskView === "materials"}
                onClick={() => setDeskView("materials")}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>素材库</span>
              </button>
            </div>
            <div className="theme-switcher review-theme-switcher" role="group" aria-label="主题切换">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  className={`theme-option ${theme === option.value ? "theme-option-active" : ""}`}
                  type="button"
                  aria-pressed={theme === option.value}
                  onClick={() => setStoredTheme(option.value)}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <Link className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" href="/">
              <ExternalLink className="h-4 w-4" />
              主工作台
            </Link>
            <Link className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" href="/review">
              <ClipboardCheck className="h-4 w-4" />
              内容审查台
            </Link>
            <button
              className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black"
              type="button"
              onClick={() => (deskView === "materials" ? loadMaterialLibrary() : loadContentPool(query))}
              disabled={Boolean(busy)}
            >
              {busy === "load" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>
        </header>

        {deskView === "content" ? (
          <>
        <section className="content-desk-metrics">
          <Metric label="内容样本" value={projectStats.total} />
          <Metric label="当前筛选" value={visibleSources.length} />
          <Metric label="已分析" value={projectStats.analyzed} />
          <Metric label="已仿写" value={projectStats.rewritten} />
          <Metric label="已选择" value={selectedContentItemIds.length} />
        </section>

        <section className="content-desk-workspace">
          <aside className="content-desk-pane content-desk-capture glass ops-panel thin-scrollbar">
            <PanelTitle icon={<Radio className="h-4 w-4" />} title="采集入口" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className={`soft-button flex h-10 items-center justify-center gap-2 text-xs font-semibold ${crawlInputMode === "keyword" ? "platform-card-active" : ""}`}
                type="button"
                aria-pressed={crawlInputMode === "keyword"}
                onClick={() => setCrawlInputMode("keyword")}
              >
                <Search className="h-3.5 w-3.5" />
                关键词
              </button>
              <button
                className={`soft-button flex h-10 items-center justify-center gap-2 text-xs font-semibold ${crawlInputMode === "links" ? "platform-card-active" : ""}`}
                type="button"
                aria-pressed={crawlInputMode === "links"}
                onClick={() => setCrawlInputMode("links")}
              >
                <UploadCloud className="h-3.5 w-3.5" />
                链接
              </button>
            </div>

            {crawlInputMode === "keyword" ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {crawlPlatforms.map((item) => (
                    <button
                      key={item.value}
                      className={`platform-card soft-button flex h-12 items-center gap-2 px-3 ${platform === item.value ? "platform-card-active" : ""}`}
                      type="button"
                      aria-pressed={platform === item.value}
                      onClick={() => choosePlatform(item.value)}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${item.accent}`} />
                      <span className="truncate text-xs font-semibold">{item.label}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <FieldLabel label={platform === "douyin" ? "关键词 / 话题 ID" : "关键词"} />
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                    <input className="field search-field" value={query} onChange={(event) => setQuery(event.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <FieldLabel label="数量" />
                    <input className="field" min={1} max={200} type="number" value={targetCount} onChange={(event) => setTargetCount(Number(event.target.value))} />
                  </label>
                  <label>
                    <FieldLabel label={platform === "weibo" ? "搜索类型" : "排序"} />
                    <select
                      className="field"
                      value={sort}
                      onChange={(event) => {
                        const nextSort = event.target.value;
                        setSort(nextSort);
                        updatePlatformCrawlSettingsDraft(platform, {
                          sort: nextSort,
                          searchType: platform === "weibo" ? nextSort : undefined,
                        });
                      }}
                    >
                      {sortOptions[platform].map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {platform === "xiaohongshu" ? (
                  <label>
                    <FieldLabel label="笔记类型" />
                    <select
                      className="field"
                      value={noteType}
                      onChange={(event) => {
                        const nextNoteType = Number(event.target.value);
                        setNoteType(nextNoteType);
                        updatePlatformCrawlSettingsDraft("xiaohongshu", { noteType: nextNoteType });
                      }}
                    >
                      <option value={0}>全部</option>
                      <option value={1}>视频</option>
                      <option value={2}>图文</option>
                      <option value={3}>直播</option>
                    </select>
                  </label>
                ) : null}
                {platformDocLinks[platform] ? (
                  <a className="soft-button inline-flex h-9 items-center justify-center gap-2 px-3 text-xs font-semibold" href={platformDocLinks[platform]} rel="noreferrer" target="_blank">
                    <ExternalLink className="h-3.5 w-3.5" />
                    TikHub 文档
                  </a>
                ) : null}
                {platform === "weibo" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <FieldLabel label="包含类型" />
                      <select
                        className="field"
                        value={includeType}
                        onChange={(event) => {
                          const nextIncludeType = event.target.value;
                          setIncludeType(nextIncludeType);
                          updatePlatformCrawlSettingsDraft("weibo", { includeType: nextIncludeType });
                        }}
                      >
                        {weiboIncludeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <FieldLabel label="时间范围" />
                      <select
                        className="field"
                        value={timeScope}
                        onChange={(event) => {
                          const nextTimeScope = event.target.value;
                          setTimeScope(nextTimeScope);
                          updatePlatformCrawlSettingsDraft("weibo", { timeScope: nextTimeScope });
                        }}
                      >
                        <option value="">不限</option>
                        <option value="hour">一小时内</option>
                        <option value="day">一天内</option>
                        <option value="week">一周内</option>
                        <option value="month">一个月内</option>
                      </select>
                    </label>
                  </div>
                ) : null}
                {platform === "douyin" ? (
                  <div>
                    <FieldLabel label="内容类型" />
                    <select
                      className="field mt-2"
                      value={contentType}
                      onChange={(event) => {
                        const nextContentType = event.target.value;
                        setContentType(nextContentType);
                        updatePlatformCrawlSettingsDraft("douyin", { contentType: nextContentType });
                      }}
                    >
                      {douyinContentTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-3" />
                    <FieldLabel label="Cookie" />
                    <textarea className="field min-h-20 resize-none" value={cookie} onChange={(event) => setCookie(event.target.value)} />
                  </div>
                ) : null}
                <CheckRow checked={crawlEnableVideoTranscription} disabled={Boolean(busy)} onChange={setCrawlEnableVideoTranscription}>
                  启用视频音频转文字
                </CheckRow>
                <button className="soft-button flex h-10 w-full items-center justify-center gap-2" type="button" onClick={saveCurrentPlatformCrawlSettings} disabled={Boolean(busy || !workspaceSettings)}>
                  {busy === "settings" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  保存采集策略
                </button>
                <button className="primary-button flex h-11 w-full items-center justify-center gap-2" type="button" onClick={startCrawl} disabled={Boolean(busy)}>
                  {busy === "crawl" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  开始采集
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label>
                  <FieldLabel label="归属关键词 / 内容池项目" />
                  <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} />
                </label>
                <label>
                  <FieldLabel label="平台" />
                  <select className="field" value={linkImportPlatform} onChange={(event) => setLinkImportPlatform(event.target.value as LinkImportPlatform)}>
                    <option value="auto">自动识别</option>
                    {linkImportPlatforms.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <FieldLabel label="链接列表" />
                  <textarea
                    className="field min-h-36 resize-y"
                    value={linkImportText}
                    onChange={(event) => setLinkImportText(event.target.value)}
                    placeholder="https://... 或小鹏社区帖子 ID"
                  />
                </label>
                <CheckRow checked={linkImportVideoFrameOriginalReference} disabled={Boolean(busy)} onChange={setLinkImportVideoFrameOriginalReference}>
                  视频高光帧原图引用
                </CheckRow>
                <CheckRow checked={linkImportEnableVideoTranscription} disabled={Boolean(busy)} onChange={setLinkImportEnableVideoTranscription}>
                  启用视频音频转文字
                </CheckRow>
                {linkImportPlatform === "douyin" || linkImportPlatform === "dongchedi" ? (
                  <label>
                    <FieldLabel label="Cookie" />
                    <textarea className="field min-h-16 resize-none" value={cookie} onChange={(event) => setCookie(event.target.value)} />
                  </label>
                ) : null}
                <button className="primary-button flex h-11 w-full items-center justify-center gap-2" type="button" onClick={startLinkImport} disabled={Boolean(busy)}>
                  {busy === "crawl" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  导入链接
                </button>
              </div>
            )}

            {crawlProgress ? <TaskProgressCard progress={crawlProgress} /> : null}
            {linkImportSummary ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <PoolMetric label="成功" value={linkImportSummary.imported} />
                <PoolMetric label="失败" value={linkImportSummary.failed} />
                <PoolMetric label="过滤" value={linkImportSummary.filteredUnsafe} />
                <PoolMetric label="重复" value={linkImportSummary.duplicates} />
              </div>
            ) : null}
            {linkImportResults.length ? (
              <div className="thin-scrollbar mt-3 max-h-44 space-y-2 overflow-y-auto">
                {linkImportResults.slice(0, 24).map((result, index) => (
                  <div key={`${result.url}-${index}`} className="rounded-[8px] border border-white/10 bg-white/[0.045] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] font-semibold text-white/70">{result.title || result.sourceId || result.url}</span>
                      <span className="status-badge shrink-0 text-[10px] text-white/52">{formatLinkImportStatus(result.status)}</span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-white/38">{result.error || result.url}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="section-divider" />
            <PanelTitle icon={<Layers3 className="h-4 w-4" />} title="内容池项目" />
            <div className="content-cluster mt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{activeProject?.query || query || "暂无项目"}</p>
                  <p className="mt-1 text-[11px] text-white/45">{projects.length ? `${projects.length} 个项目` : "采集后自动创建项目"}</p>
                </div>
                <span className="status-badge text-[11px] text-white/60">{activeProject?.lastCrawledAt ? formatShortTime(activeProject.lastCrawledAt) : "未更新"}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <PoolMetric label="内容池" value={projectStats.total} />
                <PoolMetric label="当前筛选" value={visibleSources.length} />
                <PoolMetric label="已仿写" value={projectStats.rewritten} />
                <PoolMetric label="已分析" value={projectStats.analyzed} />
              </div>
              {projects.length ? (
                <label className="mt-3 block">
                  <FieldLabel label="切换项目" />
                  <select
                    className="field h-10"
                    value={activeProject?.normalizedQuery || ""}
                    onChange={(event) => {
                      const project = projects.find((item) => item.normalizedQuery === event.target.value);
                      if (!project) return;
                      setQuery(project.query);
                      void loadContentPool(project.query);
                    }}
                  >
                    {projects.map((item) => (
                      <option key={item.normalizedQuery} value={item.normalizedQuery}>
                        {item.query} · {item.totalItems}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <ExecutionConsole entries={executionLogs} onRefresh={loadExecutionLogs} onClear={clearExecutionLogs} />
          </aside>

          <section className="content-desk-pane content-desk-pool glass-strong ops-panel thin-scrollbar">
            <div className="content-desk-toolbar">
              <div className="content-desk-filter-grid">
                <label className="review-filter-field">
                  <span><Filter className="h-3.5 w-3.5" />状态</span>
                  <select className="field h-10" value={poolStatusFilter} onChange={(event) => setPoolStatusFilter(event.target.value as PoolStatusFilter)}>
                    {poolStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="review-filter-field">
                  <span><Database className="h-3.5 w-3.5" />平台</span>
                  <select className="field h-10" value={poolPlatformFilter} onChange={(event) => setPoolPlatformFilter(event.target.value as PoolPlatformFilter)}>
                    {poolPlatformOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="review-filter-field">
                  <span><BarChart3 className="h-3.5 w-3.5" />排序</span>
                  <select className="field h-10" value={poolSort} onChange={(event) => setPoolSort(event.target.value as PoolSortMode)}>
                    {poolSortOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <BatchActionBar
                selectedCount={selectedContentItemIds.length}
                totalCount={visibleSources.length}
                busy={Boolean(busy)}
                title="内容池批量管理"
                onSelectVisible={selectVisibleContentItems}
                onClear={clearContentItemSelection}
                actions={[
                  { label: "补全本地素材", onClick: () => cacheSelectedContentItemMedia() },
                  { label: "二次创作", onClick: startPoolSecondaryCreation },
                  { label: "标记已分析", onClick: () => updateSelectedContentItemStatus("analyzed") },
                  { label: "标记已审查", onClick: () => updateSelectedContentItemStatus("approved") },
                  { label: "删除已选", danger: true, onClick: deleteSelectedContentItems },
                ]}
              />
            </div>

            <div className="content-desk-list thin-scrollbar">
              {visibleSources.length ? (
                visibleSources.map((item) => (
                  <article key={item.id} className={`content-desk-source-card ${selectedSource?.id === item.id ? "content-desk-source-card-active" : ""}`}>
                    <label className={`selection-toggle ${selectedContentItemIds.includes(item.id) ? "selection-toggle-active" : ""}`} aria-label="选择内容池样本">
                      <input className="sr-only" type="checkbox" checked={selectedContentItemIds.includes(item.id)} onChange={() => toggleContentItemSelection(item.id)} />
                      <Check className={`h-3.5 w-3.5 ${selectedContentItemIds.includes(item.id) ? "text-[var(--mint)]" : "text-white/30"}`} />
                      <span>{selectedContentItemIds.includes(item.id) ? "已选" : "选择"}</span>
                    </label>
                    <button className="w-full text-left" type="button" onClick={() => setSelectedSourceId(item.id)}>
                      <div className="flex gap-3">
                        <SourceThumb item={item} />
                        <div className="min-w-0 flex-1 pr-16">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="rounded-[6px] bg-white/10 px-2 py-1 text-[11px] text-white/70">{getPlatformLabel(item.platform)}</span>
                            <span className="text-[11px] text-[var(--mint)]">{item.hotScore || calculateQualityScore(item)} 分</span>
                          </div>
                          <p className="line-clamp-2 text-sm font-semibold text-white">{item.title || item.contentText || "未命名内容"}</p>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/52">{item.contentText}</p>
                          <TagChipRow tags={getContentTags(item)} status={item.contentTagging?.status} compact />
                          <MediaCacheMiniBadge item={item} />
                          <div className="mt-2 grid gap-1 text-[10px] text-white/42">
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <CloudDownload className="h-3 w-3 shrink-0" />
                              <span className="truncate">抓取 {formatSourceTime(getCrawlTime(item))}</span>
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-white/45">
                            <span>{getPrimaryReachMetric(item).label} {formatNumber(getPrimaryReachMetric(item).value || 0)}</span>
                            <span>{formatPoolStatus(item.poolStatus)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                    <button className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cyan)]" type="button" onClick={() => openSourcePreview(item)}>
                      <Maximize2 className="h-3.5 w-3.5" />
                      预览内容
                    </button>
                  </article>
                ))
              ) : (
                <EmptyState title={sources.length ? "当前筛选无样本" : "暂无样本"} icon={<Search className="h-5 w-5" />} />
              )}
            </div>
          </section>

          <aside className="content-desk-pane content-desk-detail glass ops-panel thin-scrollbar">
            {selectedSource ? (
              <div className="mx-auto max-w-3xl">
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Metric label={getPrimaryReachMetric(selectedSource).label} value={getPrimaryReachMetric(selectedSource).value} />
                  <Metric label="点赞" value={selectedSource.metrics.likes || 0} />
                  <Metric label="收藏" value={selectedSource.metrics.collects || 0} />
                  <Metric label="评论" value={selectedSource.metrics.comments || 0} />
                  <Metric label="转发" value={selectedSource.metrics.shares || 0} />
                  <Metric label="爆款指数" value={`${selectedSource.hotScore || calculateQualityScore(selectedSource)}分`} />
                </div>
                <div className="content-cluster">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-white/10">
                      <Camera className="h-5 w-5 text-[var(--cyan)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{selectedSource.authorName || "未知作者"}</p>
                      <p className="truncate text-xs text-white/45">{formatMediaType(selectedSource.mediaType)} · 互动率 {formatRate(calculateEngagementRate(selectedSource))}</p>
                    </div>
                  </div>
                  <TaggingOverview item={selectedSource} />
                  <MediaCacheStatusCard
                    item={selectedSource}
                    busy={busy === "batch"}
                    onCache={() => cacheSelectedContentItemMedia([selectedSource.id])}
                    onForceVideoRefresh={() => cacheSelectedContentItemMedia([selectedSource.id], { forceVideoRefresh: true })}
                  />
                  <button className="group w-full rounded-[8px] border border-transparent p-3 text-left transition hover:border-white/10 hover:bg-white/[0.035]" type="button" onClick={() => openSourcePreview(selectedSource)}>
                    <h2 className="text-xl font-black leading-tight text-white sm:text-2xl">{selectedSource.title || "无标题"}</h2>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/70">{selectedSource.contentText}</p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cyan)] opacity-80">
                      <Maximize2 className="h-3.5 w-3.5" />
                      点击预览全文
                    </span>
                  </button>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedSource.sourceUrl ? (
                      <a className="soft-button inline-flex h-9 items-center gap-2 px-3 text-xs" href={selectedSource.sourceUrl} target="_blank" rel="noreferrer">
                        <FileText className="h-3.5 w-3.5" />
                        原文链接
                      </a>
                    ) : null}
                    {getDisplayVideoUrl(selectedSource) ? (
                      <a className="soft-button inline-flex h-9 items-center gap-2 px-3 text-xs" href={getDisplayVideoUrl(selectedSource)} target="_blank" rel="noreferrer">
                        <Play className="h-3.5 w-3.5" />
                        {selectedSource.downloadedVideoUrl ? "缓存视频" : "视频链接"}
                      </a>
                    ) : null}
                  </div>
                  {getDisplayVideoUrl(selectedSource) ? (
                    <div className="mt-5 overflow-hidden rounded-[8px] border border-white/10 bg-black/20">
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/62">
                          <Video className="h-3.5 w-3.5 text-[var(--cyan)]" />
                          视频预览
                        </span>
                        <span className="text-[11px] text-white/42">{selectedSource.downloadedVideoUrl ? "已缓存" : "远程链接"}</span>
                      </div>
                      <video className="aspect-video w-full bg-black object-contain" controls preload="metadata" src={getDisplayVideoUrl(selectedSource)} />
                    </div>
                  ) : null}
                  {selectedSourceFrames.length && !selectedSourceImagesAreFrameFallback ? (
                    <div className="mt-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="inline-flex items-center gap-2 text-xs font-semibold text-white/62">
                          <Camera className="h-3.5 w-3.5 text-[var(--amber)]" />
                          视频高光帧
                        </p>
                        <span className="status-badge text-[11px] text-white/45">共 {selectedSourceFrames.length} 帧</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {selectedSourceFrames.map((frame, index) => (
                          <button
                            key={`${frame.url}-${index}`}
                            className="media-tile preview-ratio group"
                            type="button"
                            onClick={() => openImageGallery(selectedSourceFrameUrls, index, `高光帧 ${index + 1}`, frame.reason)}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" referrerPolicy="no-referrer" src={toDisplayImageSrc(frame.url)} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-white/62">{selectedSourceImagesAreFrameFallback ? "视频帧预览" : "图片预览"}</p>
                    {selectedSourceVisualImages.length ? <span className="status-badge text-[11px] text-white/45">共 {selectedSourceVisualImages.length} 张</span> : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(selectedSourceVisualImages.length ? selectedSourceVisualImages : [0, 1, 2]).map((item, index) => (
                      <button
                        key={typeof item === "string" ? item : index}
                        className="media-tile preview-ratio group"
                        type="button"
                        onClick={() =>
                          typeof item === "string"
                            ? openImageGallery(selectedSourceVisualImages, index, `${selectedSourceImagesAreFrameFallback ? "视频帧" : "样本图片"} ${index + 1}`, selectedSource.title || selectedSource.contentText)
                            : undefined
                        }
                      >
                        {typeof item === "string" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" referrerPolicy="no-referrer" src={toDisplayImageSrc(item)} />
                        ) : (
                          <div className="grid h-full place-items-center text-xs text-white/35">素材位 {index + 1}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <SourceManagementCard
                  form={sourceEdit}
                  visualAssets={sourceEditVisualAssets}
                  manualForm={manualSource}
                  platform={platform}
                  busy={busy === "source"}
                  onFormChange={(patch) =>
                    selectedSource
                      ? setSourceEditState((current) => ({
                          sourceId: selectedSource.id,
                          form: {
                            ...(current.sourceId === selectedSource.id ? current.form : makeSourceEditForm(selectedSource)),
                            ...patch,
                          },
                        }))
                      : undefined
                  }
                  onManualFormChange={(patch) => setManualSource((current) => ({ ...current, ...patch }))}
                  onSave={saveSourceEdits}
                  onDelete={deleteSelectedSource}
                  onCreateManual={createManualSourceItem}
                />

                <ProductionPlanCard item={selectedSource} />
                <PoolSecondaryCard
                  selectedCount={selectedContentItems.length}
                  busy={busy === "secondary"}
                  latestRun={latestPoolRun}
                  settings={workspaceSettings}
                  generateImages={poolGenerateImages}
                  useComfyUiKlein={poolUseComfyUiKlein}
                  directOriginalReference={poolDirectOriginalReference}
                  includeSourceVideo={poolIncludeSourceVideo}
                  enableVideoTranscription={poolEnableVideoTranscription}
                  onGenerateImagesChange={setPoolGenerateImages}
                  onUseComfyUiKleinChange={setPoolUseComfyUiKlein}
                  onDirectOriginalReferenceChange={setPoolDirectOriginalReference}
                  onIncludeSourceVideoChange={setPoolIncludeSourceVideo}
                  onEnableVideoTranscriptionChange={setPoolEnableVideoTranscription}
                  onStart={startPoolSecondaryCreation}
                />
              </div>
            ) : (
              <EmptyState title="选择样本后管理内容" icon={<Wand2 className="h-5 w-5" />} />
            )}
          </aside>
        </section>
          </>
        ) : (
          <section className="content-desk-material-workspace">
            <MaterialLibraryWorkspace
              materialPath={materialPath}
              materials={materials}
              materialLibrary={materialLibrary}
              activeFolder={activeMaterialFolder}
              activeFolderAssets={materialFolderAssets}
              activeFolderNameDraft={activeFolderNameDraft}
              newFolderName={newMaterialFolderName}
              assetPath={materialAssetPath}
              assetName={materialAssetName}
              assetTags={materialAssetTags}
              busy={busy === "materials" || busy === "materialLibrary"}
              onMaterialPathChange={setMaterialPath}
              onScanMaterials={scanMaterials}
              onSelectFolder={setActiveMaterialFolderId}
              onNewFolderNameChange={setNewMaterialFolderName}
              onCreateFolder={createMaterialFolderFromForm}
              onFolderNameDraftChange={(name) =>
                activeMaterialFolder ? setActiveFolderNameDraftState({ folderId: activeMaterialFolder.id, name }) : undefined
              }
              onSaveFolder={saveActiveMaterialFolder}
              onDeleteFolder={deleteActiveMaterialFolder}
              onAssetPathChange={setMaterialAssetPath}
              onAssetNameChange={setMaterialAssetName}
              onAssetTagsChange={setMaterialAssetTags}
              onCreateAsset={createMaterialAssetFromPath}
              onUpdateAsset={updateMaterialAssetFromDraft}
              onDeleteAsset={deleteMaterialAssetFromLibrary}
              onImportScanned={importScannedMaterialsToLibrary}
              onPreviewAsset={(asset) => openImageGallery([asset.path], 0, asset.name, asset.path)}
            />
          </section>
        )}

        <footer className="flex min-h-10 flex-wrap items-center justify-between gap-3 text-xs text-white/45">
          <span>{message || (deskView === "materials" ? "素材库索引不会删除电脑上的原始文件。" : "内容池二次创作会生成待审草稿，不自动写飞书。")}</span>
          <span>{config ? `TikHub ${config.tikhubConfigured ? "已配置" : "未配置"} · GPT ${config.openaiConfigured ? "已配置" : "未配置"}` : "配置读取中"}</span>
        </footer>
      </div>
      <PreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onNavigate={(nextIndex) =>
          setPreview((current) => {
            if (!current?.imageUrls?.length) return current;
            const normalizedIndex = (nextIndex + current.imageUrls.length) % current.imageUrls.length;
            return { ...current, imageIndex: normalizedIndex };
          })
        }
      />
    </main>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="panel-title-icon grid h-7 w-7 place-items-center rounded-[8px]">{icon}</span>
      <h2 className="truncate text-sm font-black text-white">{title}</h2>
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <span className="mb-1 block text-xs font-semibold text-white/62">{label}</span>;
}

function CheckRow({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
      <input className="mt-1 h-4 w-4 accent-[var(--mint)]" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="metric-card">
      <p className="text-[11px] text-white/45">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{formatMetricValue(value)}</p>
    </div>
  );
}

function PoolMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="pool-metric">
      <p className="text-[10px] text-white/42">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function MaterialLibraryWorkspace({
  materialPath,
  materials,
  materialLibrary,
  activeFolder,
  activeFolderAssets,
  activeFolderNameDraft,
  newFolderName,
  assetPath,
  assetName,
  assetTags,
  busy,
  onMaterialPathChange,
  onScanMaterials,
  onSelectFolder,
  onNewFolderNameChange,
  onCreateFolder,
  onFolderNameDraftChange,
  onSaveFolder,
  onDeleteFolder,
  onAssetPathChange,
  onAssetNameChange,
  onAssetTagsChange,
  onCreateAsset,
  onUpdateAsset,
  onDeleteAsset,
  onImportScanned,
  onPreviewAsset,
}: {
  materialPath: string;
  materials: MaterialAsset[];
  materialLibrary: MaterialLibrarySnapshot;
  activeFolder?: MaterialFolder;
  activeFolderAssets: MaterialLibraryAsset[];
  activeFolderNameDraft: string;
  newFolderName: string;
  assetPath: string;
  assetName: string;
  assetTags: string;
  busy: boolean;
  onMaterialPathChange: (value: string) => void;
  onScanMaterials: () => void;
  onSelectFolder: (folderId: string) => void;
  onNewFolderNameChange: (value: string) => void;
  onCreateFolder: () => void;
  onFolderNameDraftChange: (value: string) => void;
  onSaveFolder: () => void;
  onDeleteFolder: () => void;
  onAssetPathChange: (value: string) => void;
  onAssetNameChange: (value: string) => void;
  onAssetTagsChange: (value: string) => void;
  onCreateAsset: () => void;
  onUpdateAsset: (asset: MaterialLibraryAsset, draft: MaterialAssetDraft) => void;
  onDeleteAsset: (asset: MaterialLibraryAsset) => void;
  onImportScanned: () => void;
  onPreviewAsset: (asset: MaterialLibraryAsset) => void;
}) {
  return (
    <>
      <aside className="glass ops-panel content-desk-pane thin-scrollbar rounded-[8px] p-4">
        <PanelTitle icon={<FolderOpen className="h-4 w-4" />} title="素材文件夹" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PoolMetric label="文件夹" value={materialLibrary.folders.length} />
          <PoolMetric label="资产" value={materialLibrary.assets.length} />
        </div>
        <div className="mt-4 flex gap-2">
          <input className="field h-10" placeholder="新建文件夹" value={newFolderName} onChange={(event) => onNewFolderNameChange(event.target.value)} />
          <button className="soft-button grid h-10 w-10 shrink-0 place-items-center" type="button" onClick={onCreateFolder} disabled={busy} aria-label="新建素材文件夹">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          </button>
        </div>
        <div className="thin-scrollbar mt-4 space-y-2 overflow-y-auto">
          {materialLibrary.folders.map((folder) => (
            <button
              key={folder.id}
              className={`source-card w-full rounded-[8px] border p-3 text-left ${
                activeFolder?.id === folder.id ? "source-card-selected border-[var(--mint)]/70 bg-white/12" : "border-white/10 bg-white/[0.045]"
              }`}
              type="button"
              onClick={() => onSelectFolder(folder.id)}
            >
              <p className="truncate text-sm font-black text-white">{folder.name}</p>
              <p className="mt-1 text-[11px] text-white/42">{materialLibrary.assets.filter((asset) => asset.folderId === folder.id).length} 个资产</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="glass-strong ops-panel content-desk-pane thin-scrollbar rounded-[8px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle icon={<Database className="h-4 w-4" />} title={activeFolder?.name || "素材库"} />
          <span className="status-badge text-[11px] text-white/55">{activeFolderAssets.length} 个资产</span>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <div className="content-cluster">
            <PanelTitle icon={<Settings className="h-4 w-4" />} title="当前文件夹" />
            <div className="mt-3">
              <FieldLabel label="文件夹名称" />
              <input className="field" value={activeFolderNameDraft} onChange={(event) => onFolderNameDraftChange(event.target.value)} disabled={!activeFolder || activeFolder.id === "root"} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button className="soft-button h-10" type="button" onClick={onSaveFolder} disabled={busy || !activeFolder || activeFolder.id === "root"}>保存</button>
              <button className="soft-button h-10 text-[var(--rose)]" type="button" onClick={onDeleteFolder} disabled={busy || !activeFolder || activeFolder.id === "root"}>删除</button>
            </div>
          </div>

          <div className="content-cluster">
            <PanelTitle icon={<UploadCloud className="h-4 w-4" />} title="新增素材" />
            <div className="mt-3">
              <FieldLabel label="本地文件路径" />
              <input className="field" placeholder="C:\\素材\\车型资料.pdf" value={assetPath} onChange={(event) => onAssetPathChange(event.target.value)} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label><FieldLabel label="显示名称" /><input className="field" value={assetName} onChange={(event) => onAssetNameChange(event.target.value)} /></label>
              <label><FieldLabel label="标签" /><input className="field" value={assetTags} onChange={(event) => onAssetTagsChange(event.target.value)} /></label>
            </div>
            <button className="primary-button mt-3 flex h-10 w-full items-center justify-center gap-2" type="button" onClick={onCreateAsset} disabled={busy || !activeFolder}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              加入素材库
            </button>
          </div>
        </div>

        <div className="content-cluster mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1"><FieldLabel label="扫描本地图片文件夹" /><input className="field" placeholder="C:\\素材\\产品图" value={materialPath} onChange={(event) => onMaterialPathChange(event.target.value)} /></label>
            <button className="soft-button h-10 px-3 text-xs" type="button" onClick={onScanMaterials} disabled={busy}>扫描</button>
            <button className="soft-button h-10 px-3 text-xs" type="button" onClick={onImportScanned} disabled={busy || !materials.length || !activeFolder}>导入 {materials.length || ""}</button>
          </div>
          {materials.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {materials.slice(0, 8).map((asset) => (
                <div key={asset.id} className="asset-pill"><p className="truncate text-xs font-black text-white">{asset.name}</p><p className="mt-1 truncate text-[10px] text-white/42">{asset.path}</p></div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {activeFolderAssets.length ? (
            activeFolderAssets.map((asset) => <MaterialAssetEditor key={asset.id} asset={asset} busy={busy} onUpdate={onUpdateAsset} onDelete={onDeleteAsset} onPreview={onPreviewAsset} />)
          ) : (
            <EmptyState title="当前文件夹暂无素材" icon={<Lightbulb className="h-5 w-5" />} />
          )}
        </div>
      </section>
    </>
  );
}

function MaterialAssetEditor({
  asset,
  busy,
  onUpdate,
  onDelete,
  onPreview,
}: {
  asset: MaterialLibraryAsset;
  busy: boolean;
  onUpdate: (asset: MaterialLibraryAsset, draft: MaterialAssetDraft) => void;
  onDelete: (asset: MaterialLibraryAsset) => void;
  onPreview: (asset: MaterialLibraryAsset) => void;
}) {
  const [draft, setDraft] = useState<MaterialAssetDraft>({ name: asset.name, tags: asset.tags.join(", ") });
  const canPreview = asset.kind === "image" && isPreviewableImageAssetPath(asset.path);

  return (
    <article className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase text-[var(--cyan)]">{formatMaterialKind(asset.kind)} · {asset.extension || "file"}</p><p className="mt-1 truncate text-xs text-white/42">{asset.path}</p></div>
        <button className="soft-button grid h-8 w-8 shrink-0 place-items-center" type="button" onClick={() => onDelete(asset)} disabled={busy} aria-label="删除素材资产"><Trash2 className="h-3.5 w-3.5 text-[var(--rose)]" /></button>
      </div>
      <div className="mt-3 grid gap-2">
        <input className="field h-10 text-xs" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        <input className="field h-10 text-xs" value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button className="soft-button h-9 text-xs" type="button" onClick={() => onUpdate(asset, draft)} disabled={busy}>保存</button>
        <button className="soft-button h-9 text-xs" type="button" onClick={() => onPreview(asset)} disabled={!canPreview}>预览</button>
      </div>
    </article>
  );
}

function TaskProgressCard({ progress }: { progress: TaskProgressSnapshot }) {
  return (
    <div className={`task-progress task-progress-${progress.status} mt-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-white">{progress.title}</p>
          <p className="mt-1 truncate text-[11px] text-white/50">{progress.label}</p>
        </div>
        <span className="text-xs font-black tabular-nums text-white">{progress.value}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[var(--mint)] transition-all" style={{ width: `${progress.value}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-5 text-white/52">{progress.detail}</p>
    </div>
  );
}

function EmptyState({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="empty-state">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-[8px] border border-white/10 bg-white/[0.06] text-white/45">{icon}</div>
        <p className="mt-3 text-sm font-semibold text-white/60">{title}</p>
      </div>
    </div>
  );
}

function SourceThumb({ item }: { item: NormalizedSourceItem }) {
  const frameCount = item.videoFrames?.length || 0;
  const imageUrl = getDisplayImages(item)[0] || item.videoFrames?.[0]?.url;
  const hasVideo = Boolean(getDisplayVideoUrl(item));
  return (
    <div className="source-thumb shrink-0">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" src={toDisplayImageSrc(imageUrl)} />
      ) : (
        <div className="grid h-full w-full place-items-center bg-white/[0.05] text-white/35">{hasVideo ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div>
      )}
      {hasVideo ? (
        <span className="source-thumb-play absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-[6px] bg-black/55 text-white">
          <Play className="h-3 w-3 fill-current" />
        </span>
      ) : null}
      {frameCount ? (
        <span className="absolute left-1 top-1 inline-flex h-5 items-center gap-1 rounded-[6px] bg-black/55 px-1.5 text-[10px] font-black text-white">
          <Camera className="h-3 w-3" />
          {frameCount}
        </span>
      ) : null}
    </div>
  );
}

function BatchActionBar({
  selectedCount,
  totalCount,
  busy,
  title,
  actions,
  onSelectVisible,
  onClear,
}: {
  selectedCount: number;
  totalCount: number;
  busy: boolean;
  title: string;
  actions: Array<{ label: string; danger?: boolean; onClick: () => void }>;
  onSelectVisible: () => void;
  onClear: () => void;
}) {
  const hasSelection = selectedCount > 0;
  return (
    <div className={`batch-action-bar ${hasSelection ? "batch-action-bar-active" : ""}`} aria-live="polite">
      <div className="min-w-0">
        <p className="truncate text-xs font-black text-white">{title}</p>
        <p className="mt-1 text-[11px] text-white/45">
          已选 {selectedCount} / 当前 {totalCount}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        <button className="soft-button h-9 px-3 text-xs" type="button" onClick={onSelectVisible} disabled={busy || !totalCount}>
          全选当前
        </button>
        <button className="soft-button h-9 px-3 text-xs" type="button" onClick={onClear} disabled={busy || !hasSelection}>
          清空
        </button>
        {actions.map((action) => (
          <button
            key={action.label}
            className={`soft-button h-9 px-3 text-xs ${action.danger ? "text-[var(--rose)]" : ""}`}
            type="button"
            onClick={action.onClick}
            disabled={busy || !hasSelection}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagChipRow({ tags, status, compact = false }: { tags: ContentTag[]; status?: string; compact?: boolean }) {
  if (!tags.length && !status) return null;
  return (
    <div className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap gap-1.5`}>
      {tags.map((tag) => (
        <span key={tag} className="status-badge text-[10px] text-[var(--mint)]">{tag}</span>
      ))}
      {!tags.length && status ? <span className="status-badge text-[10px] text-white/45">{formatTaggingStatus(status)}</span> : null}
    </div>
  );
}

function TaggingOverview({ item }: { item: NormalizedSourceItem }) {
  const tags = getContentTags(item);
  const visualAssets = getVisualTagAssets(item);
  return (
    <div className="mt-3 rounded-[8px] border border-white/10 bg-white/[0.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black text-white">AI 标签</p>
        <div className="flex flex-wrap gap-1.5">
          <span className="status-badge text-[10px] text-white/52">{formatTaggingStatus(item.contentTagging?.status)}</span>
          <span className="status-badge text-[10px] text-white/52">视觉 {visualAssets.length}/9</span>
        </div>
      </div>
      <TagChipRow tags={tags} />
      {visualAssets.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visualAssets.slice(0, 9).map((asset) => (
            <span key={asset.id} className="status-badge text-[10px] text-white/58">
              {asset.index + 1}. {asset.tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MediaCacheMiniBadge({ item }: { item: NormalizedSourceItem }) {
  const status = getMediaCacheStatus(item);
  if (status.status === "none") return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className={`status-badge text-[10px] ${getMediaCacheStatusClass(status.status)}`}>{formatMediaCacheState(status.status)}</span>
      <span className="status-badge text-[10px] text-white/45">缓存 {status.localImages}/{status.imageTotal} 图</span>
      {status.frameCount ? <span className="status-badge text-[10px] text-white/45">帧 {status.frameCount}</span> : null}
    </div>
  );
}

function MediaCacheStatusCard({
  item,
  busy,
  onCache,
  onForceVideoRefresh,
}: {
  item: NormalizedSourceItem;
  busy: boolean;
  onCache: () => void;
  onForceVideoRefresh: () => void;
}) {
  const status = getMediaCacheStatus(item);
  const localCoverage = status.imageTotal ? Math.round((status.localImages / status.imageTotal) * 100) : status.localVideo ? 100 : 0;
  const canRefreshVideo = Boolean(item.videoUrl || item.downloadedVideoUrl || item.mediaType === "video" || item.mediaType === "mixed");
  return (
    <div className="media-cache-card mt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={<CloudDownload className="h-4 w-4" />} title="本地素材缓存" />
        <span className={`status-badge text-[11px] ${getMediaCacheStatusClass(status.status)}`}>{formatMediaCacheState(status.status)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PoolMetric label="缓存图片" value={`${status.localImages}/${status.imageTotal}`} />
        <PoolMetric label="远程兜底" value={status.remoteImages} />
        <PoolMetric label="缓存视频" value={status.localVideo ? "已缓存" : status.videoPresent ? "未缓存" : "无视频"} />
        <PoolMetric label="关键帧" value={status.frameCount} />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[var(--mint)] transition-all" style={{ width: `${Math.min(localCoverage, 100)}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-5 text-white/45">本地素材优先用于预览、打标和二次创作。</p>
        <button className="soft-button h-9 px-3 text-xs" type="button" onClick={onCache} disabled={busy}>
          {busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="mr-1 inline h-3.5 w-3.5" />}
          补全当前素材
        </button>
      </div>
      {canRefreshVideo ? (
        <div className="mt-2 flex justify-end">
          <button className="soft-button h-9 px-3 text-xs" type="button" onClick={onForceVideoRefresh} disabled={busy}>
            {busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="mr-1 inline h-3.5 w-3.5" />}
            重新下载高清视频
          </button>
        </div>
      ) : null}
      {status.errors.length ? <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[var(--amber)]">最近错误：{status.errors.join("；")}</p> : null}
    </div>
  );
}

function SourceManagementCard({
  form,
  visualAssets,
  manualForm,
  platform,
  busy,
  onFormChange,
  onManualFormChange,
  onSave,
  onDelete,
  onCreateManual,
}: {
  form: SourceEditForm;
  visualAssets: EditableVisualAsset[];
  manualForm: ManualSourceForm;
  platform: Platform;
  busy: boolean;
  onFormChange: (patch: Partial<SourceEditForm>) => void;
  onManualFormChange: (patch: Partial<ManualSourceForm>) => void;
  onSave: () => void;
  onDelete: () => void;
  onCreateManual: () => void;
}) {
  const metricFields: Array<{ key: keyof SourceEditForm; label: string }> = [
    { key: "views", label: "浏览" },
    { key: "reads", label: "阅读" },
    { key: "plays", label: "播放" },
    { key: "likes", label: "点赞" },
    { key: "collects", label: "收藏" },
    { key: "comments", label: "评论" },
    { key: "shares", label: "转发" },
  ];

  return (
    <div className="content-cluster mt-4">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle icon={<Tag className="h-4 w-4" />} title="样本编辑" />
        <span className="status-badge text-[11px] text-white/55">增删改</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label>
          <FieldLabel label="标题" />
          <input className="field" value={form.title} onChange={(event) => onFormChange({ title: event.target.value })} />
        </label>
        <label>
          <FieldLabel label="作者" />
          <input className="field" value={form.authorName} onChange={(event) => onFormChange({ authorName: event.target.value })} />
        </label>
        <label>
          <FieldLabel label="内容状态" />
          <select className="field" value={form.poolStatus} onChange={(event) => onFormChange({ poolStatus: event.target.value as SourceUsageStatus })}>
            {poolStatusOptions.filter((option) => option.value !== "all").map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <FieldLabel label="内容形式" />
          <select className="field" value={form.mediaType} onChange={(event) => onFormChange({ mediaType: event.target.value as SourceEditForm["mediaType"] })}>
            <option value="image">图文</option>
            <option value="video">视频</option>
            <option value="mixed">图文+视频</option>
            <option value="text">文字</option>
            <option value="unknown">未知</option>
          </select>
        </label>
      </div>
      <label className="mt-3 block">
        <FieldLabel label="原文链接" />
        <input className="field" value={form.sourceUrl} onChange={(event) => onFormChange({ sourceUrl: event.target.value })} />
      </label>
      <label className="mt-3 block">
        <FieldLabel label="正文全文" />
        <textarea className="field mt-2 min-h-36 resize-none leading-7" value={form.contentText} onChange={(event) => onFormChange({ contentText: event.target.value })} />
      </label>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel label="内容标签" />
          <span className="status-badge text-[10px] text-white/45">最多 4 个</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {contentTagOptions.map((tag) => {
            const active = form.contentTags.includes(tag);
            return (
              <button
                key={tag}
                className={`filter-chip ${active ? "filter-chip-active" : ""}`}
                type="button"
                onClick={() =>
                  onFormChange({
                    contentTags: active
                      ? form.contentTags.filter((item) => item !== tag)
                      : form.contentTags.length >= 4
                        ? form.contentTags
                        : [...form.contentTags, tag],
                  })
                }
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel label="图片 / 关键帧标签" />
          <span className="status-badge text-[10px] text-white/45">前 9 张</span>
        </div>
        <div className="thin-scrollbar mt-2 grid max-h-[300px] gap-3 overflow-y-auto">
          {visualAssets.length ? (
            visualAssets.map((asset, index) => (
              <article key={asset.id} className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
                <div className="grid gap-3 sm:grid-cols-[88px_minmax(0,1fr)]">
                  <div className="media-tile preview-ratio overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" src={toDisplayImageSrc(asset.url)} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-black text-white">{asset.kind === "video_frame" ? "关键帧" : "图片"} {index + 1}</p>
                      <span className="status-badge text-[10px] text-white/45">{asset.kind}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {visualTagOptions.map((tag) => (
                        <button
                          key={tag}
                          className={`filter-chip ${getFormVisualTag(form, asset.id) === tag ? "filter-chip-active" : ""}`}
                          type="button"
                          onClick={() => onFormChange({ visualTags: upsertVisualTag(form.visualTags, asset.id, tag) })}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state min-h-0 p-4 text-xs text-white/50">当前样本没有可编辑图片或关键帧。</div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {metricFields.map((field) => (
          <label key={field.key} className="min-w-0">
            <FieldLabel label={field.label} />
            <input className="field h-10 text-xs" inputMode="numeric" value={String(form[field.key] || "")} onChange={(event) => onFormChange({ [field.key]: event.target.value } as Partial<SourceEditForm>)} />
          </label>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button className="soft-button flex h-10 items-center justify-center gap-2" type="button" onClick={onSave} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          保存样本
        </button>
        <button className="soft-button flex h-10 items-center justify-center gap-2 text-[var(--rose)]" type="button" onClick={onDelete} disabled={busy}>
          <Trash2 className="h-4 w-4" />
          删除样本
        </button>
      </div>

      <div className="section-divider" />
      <PanelTitle icon={<UploadCloud className="h-4 w-4" />} title="手工新增样本" />
      <p className="mt-2 text-[11px] leading-5 text-white/45">新增样本会进入当前内容池项目，平台默认使用 {getPlatformLabel(platform)}。</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label>
          <FieldLabel label="标题" />
          <input className="field" value={manualForm.title} onChange={(event) => onManualFormChange({ title: event.target.value })} />
        </label>
        <label>
          <FieldLabel label="原文链接" />
          <input className="field" value={manualForm.sourceUrl} onChange={(event) => onManualFormChange({ sourceUrl: event.target.value })} />
        </label>
      </div>
      <label className="mt-3 block">
        <FieldLabel label="正文" />
        <textarea className="field mt-2 min-h-28 resize-none" value={manualForm.contentText} onChange={(event) => onManualFormChange({ contentText: event.target.value })} />
      </label>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label>
          <FieldLabel label="图片链接，每行一个" />
          <textarea className="field mt-2 min-h-24 resize-none" value={manualForm.imageUrls} onChange={(event) => onManualFormChange({ imageUrls: event.target.value })} />
        </label>
        <label>
          <FieldLabel label="视频链接" />
          <input className="field" value={manualForm.videoUrl} onChange={(event) => onManualFormChange({ videoUrl: event.target.value })} />
        </label>
      </div>
      <button className="primary-button mt-3 flex h-10 w-full items-center justify-center gap-2" type="button" onClick={onCreateManual} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        新增到内容池
      </button>
    </div>
  );
}

function ProductionPlanCard({ item }: { item: NormalizedSourceItem }) {
  const plan = item.productionPlan;
  if (!plan) return null;
  return (
    <div className="content-cluster mt-4">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle icon={<ClipboardCheck className="h-4 w-4" />} title="生产策略" />
        <span className="status-badge text-[11px] text-white/55">{formatProductionDecision(plan.decision)}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <PoolMetric label="内容方向" value={formatContentDirection(plan.contentDirection)} />
        <PoolMetric label="文案策略" value={formatTextStrategy(plan.textStrategy)} />
        <PoolMetric label="图片策略" value={formatImageStrategy(plan.imageStrategy)} />
      </div>
      <p className="mt-3 text-xs leading-5 text-white/62">{plan.reason}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <AnalysisBlock label="文案 Brief" value={plan.promptGuidance.textBrief} icon={<FileText className="h-3.5 w-3.5" />} />
        <AnalysisBlock label="图片 Brief" value={plan.promptGuidance.imageBrief} icon={<ImageIcon className="h-3.5 w-3.5" />} />
      </div>
    </div>
  );
}

function PoolSecondaryCard({
  selectedCount,
  busy,
  latestRun,
  settings,
  generateImages,
  useComfyUiKlein,
  directOriginalReference,
  includeSourceVideo,
  enableVideoTranscription,
  onGenerateImagesChange,
  onUseComfyUiKleinChange,
  onDirectOriginalReferenceChange,
  onIncludeSourceVideoChange,
  onEnableVideoTranscriptionChange,
  onStart,
}: {
  selectedCount: number;
  busy: boolean;
  latestRun: SimpleRun | null;
  settings: WorkspacePromptSettings | null;
  generateImages: boolean;
  useComfyUiKlein: boolean;
  directOriginalReference: boolean;
  includeSourceVideo: boolean;
  enableVideoTranscription: boolean;
  onGenerateImagesChange: (value: boolean) => void;
  onUseComfyUiKleinChange: (value: boolean) => void;
  onDirectOriginalReferenceChange: (value: boolean) => void;
  onIncludeSourceVideoChange: (value: boolean) => void;
  onEnableVideoTranscriptionChange: (value: boolean) => void;
  onStart: () => void;
}) {
  return (
    <div className="content-cluster mt-4">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle icon={<Wand2 className="h-4 w-4" />} title="内容池二次创作" />
        <span className="status-badge text-[11px] text-[var(--mint)]">Review-first</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/55">从已勾选样本生成待审草稿，默认不写飞书；生成结果进入内容审查台。</p>
      <div className="mt-3 grid gap-2">
        <CheckRow checked={generateImages} disabled={busy} onChange={onGenerateImagesChange}>
          图片生成
        </CheckRow>
        <CheckRow checked={useComfyUiKlein} disabled={busy || !generateImages} onChange={onUseComfyUiKleinChange}>
          启用本地 Klein 模型
        </CheckRow>
        <CheckRow checked={directOriginalReference} disabled={busy || !generateImages} onChange={onDirectOriginalReferenceChange}>
          直接引用原图/关键帧
        </CheckRow>
        <CheckRow checked={includeSourceVideo} disabled={busy} onChange={onIncludeSourceVideoChange}>
          引用源视频素材
        </CheckRow>
        <CheckRow checked={enableVideoTranscription} disabled={busy} onChange={onEnableVideoTranscriptionChange}>
          启用视频音频转文字
        </CheckRow>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="status-badge text-[10px] text-white/52">同步默认策略</span>
        <span className="status-badge text-[10px] text-white/52">{settings?.imageSize || "image size"}</span>
        <span className="status-badge text-[10px] text-white/52">{settings?.imageQuality || "quality"}</span>
      </div>
      <button className="primary-button mt-3 flex h-10 w-full items-center justify-center gap-2" type="button" onClick={onStart} disabled={busy || !selectedCount}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        用已选 {selectedCount} 条二次创作
      </button>
      {latestRun ? (
        <div className="mt-3 rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-black text-white">{latestRun.input.keyword || "内容池二次创作"}</p>
            <span className="status-badge text-[10px] text-white/52">{formatSimpleRunStatus(latestRun.status)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-white/50">{formatSimpleRunSourceLabel(latestRun)} · 生成 {latestRun.posts.length} 条 · 发布 {formatSimplePublishStatus(latestRun.publish?.status)}</p>
          <Link className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cyan)]" href="/review">
            <ClipboardCheck className="h-3.5 w-3.5" />
            去内容审查台
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function AnalysisBlock({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="analysis-block">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/55">{icon}{label}</p>
      <p className="mt-1 text-xs leading-5 text-white/72">{value}</p>
    </div>
  );
}

function ExecutionConsole({ entries, onRefresh, onClear }: { entries: ExecutionLogEntry[]; onRefresh: () => void; onClear: () => void }) {
  const latest = entries.slice(0, 12);
  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle icon={<ShieldCheck className="h-4 w-4" />} title="执行观察" />
        <div className="flex gap-1.5">
          <button className="soft-button grid h-8 w-8 place-items-center" type="button" onClick={onRefresh} aria-label="刷新执行日志">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button className="soft-button grid h-8 w-8 place-items-center" type="button" onClick={onClear} aria-label="清空执行日志">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="execution-console thin-scrollbar mt-3 space-y-2 overflow-y-auto">
        {latest.length ? (
          latest.map((entry) => (
            <article key={entry.id} className="execution-entry">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`execution-status execution-status-${entry.status}`} />
                    <p className="truncate text-xs font-black text-white">{entry.action}</p>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-white/42">{entry.scope}</p>
                </div>
                <span className="shrink-0 rounded-[6px] border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] text-white/52">{entry.status}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/62">{entry.message}</p>
            </article>
          ))
        ) : (
          <div className="empty-state min-h-0 p-4 text-xs leading-5 text-white/50">暂无后台日志。</div>
        )}
      </div>
    </div>
  );
}

function PreviewDialog({ preview, onClose, onNavigate }: { preview: PreviewState; onClose: () => void; onNavigate: (nextIndex: number) => void }) {
  if (!preview) return null;
  const imageUrls = preview.imageUrls || [];
  const imageIndex = Math.min(Math.max(preview.imageIndex || 0, 0), Math.max(imageUrls.length - 1, 0));
  const imageUrl = imageUrls[imageIndex];
  return (
    <div className="preview-backdrop" role="dialog" aria-modal="true">
      <div className="preview-modal">
        <div className="preview-modal-header">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">{preview.title}</p>
            {preview.meta ? <p className="mt-1 truncate text-xs text-white/45">{preview.meta}</p> : null}
          </div>
          <button className="soft-button grid h-9 w-9 place-items-center" type="button" onClick={onClose} aria-label="关闭预览">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="preview-modal-body thin-scrollbar">
          {imageUrl ? (
            <div className="preview-image-stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="max-h-[62vh] w-full object-contain" referrerPolicy="no-referrer" src={toDisplayImageSrc(imageUrl)} />
              {imageUrls.length > 1 ? (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button className="soft-button h-9 px-3 text-xs" type="button" onClick={() => onNavigate(imageIndex - 1)}>上一张</button>
                  <span className="status-badge text-[11px] text-white/52">{imageIndex + 1} / {imageUrls.length}</span>
                  <button className="soft-button h-9 px-3 text-xs" type="button" onClick={() => onNavigate(imageIndex + 1)}>下一张</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {preview.videoUrls?.map((url) => (
            <video key={url} className="mt-3 aspect-video w-full rounded-[8px] bg-black object-contain" controls preload="metadata" src={url} />
          ))}
          {preview.text ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/72">{preview.text}</p> : null}
          {preview.links?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {preview.links.map((url, index) => (
                <a key={`${url}-${index}`} className="soft-button inline-flex h-9 items-center gap-2 px-3 text-xs" href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  链接 {index + 1}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getContentTags(item: NormalizedSourceItem): ContentTag[] {
  return (item.contentTagging?.tags || []).filter((tag): tag is ContentTag => contentTagOptions.includes(tag));
}

function getVisualTagAssets(item: NormalizedSourceItem): SourceVisualTaggingAsset[] {
  return item.visualTagging?.assets || [];
}

function buildEditableVisualAssets(item: NormalizedSourceItem): EditableVisualAsset[] {
  const taggedById = new Map(getVisualTagAssets(item).map((asset) => [asset.id, asset]));
  const frames = selectBestVideoHighlightFrames(item.videoFrames).map((frame, index) => ({
    id: `frame-${index + 1}`,
    index,
    kind: "video_frame" as const,
    url: frame.url,
  }));
  const assets =
    shouldUseVideoFramesAsImagePreview(item) && frames.length
      ? frames
      : getDisplayImages(item).map((url, index) => ({
          id: `image-${index + 1}`,
          index,
          kind: "image" as const,
          url,
        }));
  return assets.slice(0, 9).map((asset) => ({ ...asset, tag: taggedById.get(asset.id)?.tag }));
}

function getFormVisualTag(form: SourceEditForm, assetId: string) {
  return form.visualTags.find((item) => item.id === assetId)?.tag;
}

function upsertVisualTag(tags: SourceEditForm["visualTags"], assetId: string, tag: VisualTag) {
  const exists = tags.some((item) => item.id === assetId);
  if (exists) return tags.map((item) => (item.id === assetId ? { ...item, tag } : item));
  return [...tags, { id: assetId, tag }];
}

function buildVisualTagPatchAssets(item: NormalizedSourceItem, formTags: SourceEditForm["visualTags"]): SourceVisualTaggingAsset[] {
  const tagById = new Map(formTags.map((entry) => [entry.id, entry.tag]));
  return buildEditableVisualAssets(item).reduce<SourceVisualTaggingAsset[]>((assets, asset) => {
    const tag = tagById.get(asset.id);
    if (!tag) return assets;
    assets.push({
      id: asset.id,
      index: asset.index,
      kind: asset.kind,
      url: asset.url,
      tag,
      updatedBy: "user",
      updatedAt: new Date().toISOString(),
    });
    return assets;
  }, []);
}

function makeEmptySourceEditForm(): SourceEditForm {
  return {
    title: "",
    contentText: "",
    authorName: "",
    sourceUrl: "",
    contentTags: [],
    visualTags: [],
    poolStatus: "new",
    mediaType: "unknown",
    views: "",
    reads: "",
    plays: "",
    likes: "",
    collects: "",
    comments: "",
    shares: "",
  };
}

function makeSourceEditForm(item: NormalizedSourceItem): SourceEditForm {
  return {
    title: item.title || "",
    contentText: item.contentText || "",
    authorName: item.authorName || "",
    sourceUrl: item.sourceUrl || "",
    contentTags: getContentTags(item),
    visualTags: getVisualTagAssets(item).map((asset) => ({ id: asset.id, tag: asset.tag })),
    poolStatus: item.poolStatus || "new",
    mediaType: item.mediaType || "unknown",
    views: formatEditableMetric(item.metrics.views),
    reads: formatEditableMetric(item.metrics.reads),
    plays: formatEditableMetric(item.metrics.plays),
    likes: formatEditableMetric(item.metrics.likes),
    collects: formatEditableMetric(item.metrics.collects),
    comments: formatEditableMetric(item.metrics.comments),
    shares: formatEditableMetric(item.metrics.shares),
  };
}

function parseMetricForm(form: SourceEditForm): NormalizedSourceItem["metrics"] {
  return {
    views: parseOptionalNumber(form.views),
    reads: parseOptionalNumber(form.reads),
    plays: parseOptionalNumber(form.plays),
    likes: parseOptionalNumber(form.likes),
    collects: parseOptionalNumber(form.collects),
    comments: parseOptionalNumber(form.comments),
    shares: parseOptionalNumber(form.shares),
  };
}

function formatEditableMetric(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function splitTags(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function buildProjectStats(project: ContentProject | null) {
  return {
    total: project?.totalItems || 0,
    analyzed: project?.analyzedItems || 0,
    rewritten: (project?.rewrittenItems || 0) + (project?.approvedItems || 0) + (project?.publishedItems || 0),
  };
}

function sortSources(items: NormalizedSourceItem[], sortMode: PoolSortMode) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareSources(a.item, b.item, sortMode) || a.index - b.index)
    .map(({ item }) => item);
}

function compareSources(a: NormalizedSourceItem, b: NormalizedSourceItem, sortMode: PoolSortMode) {
  switch (sortMode) {
    case "published_desc":
      return compareSourceTimes(a.publishedAt, b.publishedAt, "desc") || compareHotScore(b, a);
    case "published_asc":
      return compareSourceTimes(a.publishedAt, b.publishedAt, "asc") || compareHotScore(b, a);
    case "crawled_desc":
      return compareSourceTimes(getCrawlTime(a), getCrawlTime(b), "desc") || compareHotScore(b, a);
    case "crawled_asc":
      return compareSourceTimes(getCrawlTime(a), getCrawlTime(b), "asc") || compareHotScore(b, a);
    case "engagement_desc":
      return calculateEngagementRate(b) - calculateEngagementRate(a) || compareHotScore(b, a);
    case "hot_desc":
    default:
      return compareHotScore(b, a);
  }
}

function compareHotScore(a: NormalizedSourceItem, b: NormalizedSourceItem) {
  return (a.hotScore || calculateQualityScore(a)) - (b.hotScore || calculateQualityScore(b));
}

function compareSourceTimes(aValue: string | undefined, bValue: string | undefined, direction: "asc" | "desc") {
  const aTime = getSourceTimeMs(aValue);
  const bTime = getSourceTimeMs(bValue);
  if (!aTime && !bTime) return 0;
  if (!aTime) return 1;
  if (!bTime) return -1;
  return direction === "desc" ? bTime - aTime : aTime - bTime;
}

function getSourceTimeMs(value?: string) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function getCrawlTime(item: NormalizedSourceItem) {
  return item.lastSeenAt || item.crawledAt || item.firstSeenAt;
}

function getPrimaryReachMetric(item: NormalizedSourceItem) {
  if (item.metrics.plays) return { label: "播放", value: item.metrics.plays };
  if (item.metrics.views) return { label: "浏览", value: item.metrics.views };
  if (item.metrics.reads) return { label: "阅读", value: item.metrics.reads };
  return { label: "曝光", value: 0 };
}

function getDisplayImages(item: NormalizedSourceItem) {
  if (shouldUseVideoFramesAsImagePreview(item)) {
    const frames = selectBestVideoHighlightFrames(item.videoFrames).map((frame) => frame.url);
    if (frames.length) return frames;
  }
  return mergeDownloadedAndRemoteImages(item.downloadedImages, item.images).slice(0, 12);
}

function getDisplayVideoUrl(item: NormalizedSourceItem) {
  return item.downloadedVideoUrl || item.videoUrl;
}

function shouldUseVideoFramesAsImagePreview(item: NormalizedSourceItem) {
  return Boolean((item.mediaType === "video" || item.mediaType === "mixed" || item.videoUrl || item.downloadedVideoUrl) && item.videoFrames?.length);
}

function sameStringList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function toDisplayImageSrc(url?: string) {
  if (!url) return "";
  if (url.startsWith("/media/") || url.startsWith("/generated/")) return appendQueryParam(url, "v", localMediaPreviewVersion);
  if (/^https?:\/\//i.test(url)) return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  if (isAbsoluteLocalPath(url)) return `/api/materials/preview?path=${encodeURIComponent(url)}`;
  return url;
}

function isAbsoluteLocalPath(url: string) {
  return /^[A-Za-z]:[\\/]/.test(url) || url.startsWith("\\\\") || url.startsWith("/");
}

function isPreviewableImageAssetPath(url: string) {
  return /\.(?:png|jpe?g|webp|gif|bmp|avif)$/i.test(url) || isAbsoluteLocalPath(url);
}

function formatMaterialKind(value: MaterialLibraryAsset["kind"]) {
  const labels: Record<MaterialLibraryAsset["kind"], string> = {
    image: "图片",
    document: "文档",
    other: "其他",
  };
  return labels[value];
}

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function getMediaCacheStatus(item: NormalizedSourceItem) {
  if (item.mediaCache) return item.mediaCache;
  const imageTotal = item.images.length;
  const localImages = item.downloadedImages?.length || 0;
  const videoPresent = Boolean(item.videoUrl || item.downloadedVideoUrl || item.mediaType === "video" || item.mediaType === "mixed");
  const localVideo = Boolean(item.downloadedVideoUrl);
  const frameCount = item.videoFrames?.length || 0;
  const errors = item.downloadErrors || [];
  const status =
    !imageTotal && !videoPresent
      ? "none"
      : errors.length
        ? "failed"
        : (imageTotal && localImages < imageTotal) || (videoPresent && !localVideo && !frameCount)
          ? "partial"
          : "local_complete";
  return { status, imageTotal, localImages, remoteImages: Math.max(imageTotal - localImages, 0), videoPresent, localVideo, frameCount, errorCount: errors.length, errors };
}

function calculateQualityScore(item: NormalizedSourceItem) {
  const reach = item.metrics.plays || item.metrics.views || item.metrics.reads || 0;
  const engagement = (item.metrics.likes || 0) + (item.metrics.collects || 0) * 5 + (item.metrics.comments || 0) * 4 + (item.metrics.shares || 0) * 6;
  return Math.min(100, Math.round(Math.log10(Math.max(reach, 1)) * 12 + Math.log10(Math.max(engagement, 1)) * 18 + (item.images.length || item.videoFrames?.length ? 8 : 2)));
}

function calculateEngagementRate(item: NormalizedSourceItem) {
  const reach = item.metrics.plays || item.metrics.views || item.metrics.reads || 0;
  if (!reach) return 0;
  return ((item.metrics.likes || 0) + (item.metrics.collects || 0) + (item.metrics.comments || 0) + (item.metrics.shares || 0)) / reach;
}

function formatRate(value: number) {
  return `${(value * 100).toFixed(value > 0.1 ? 0 : 1)}%`;
}

function formatNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatMetricValue(value?: number | string) {
  if (value === undefined || value === null || value === "") return "--";
  return typeof value === "number" ? formatNumber(value) : value;
}

function formatShortTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatSourceTime(value?: string, fallback?: string) {
  if (fallback) return fallback;
  return formatShortTime(value);
}

function formatPoolStatus(value?: SourceUsageStatus) {
  const labels: Record<SourceUsageStatus, string> = {
    new: "未使用",
    analyzed: "已分析",
    rewritten: "已仿写",
    approved: "已审查",
    published: "已发布",
  };
  return labels[value || "new"];
}

function formatMediaType(value: NormalizedSourceItem["mediaType"]) {
  if (value === "video") return "视频";
  if (value === "image") return "图文";
  if (value === "mixed") return "混合";
  if (value === "text") return "文字";
  return "未知";
}

function formatTaggingStatus(value?: string) {
  if (value === "success") return "已打标";
  if (value === "failed") return "打标失败";
  if (value === "skipped") return "未打标";
  if (value === "pending") return "打标中";
  return "未打标";
}

function formatLinkImportStatus(value: LinkImportResultStatus) {
  const labels: Record<LinkImportResultStatus, string> = {
    imported: "成功",
    filtered: "过滤",
    duplicate: "重复",
    unsupported: "不支持",
    failed: "失败",
  };
  return labels[value];
}

function formatContentDirection(value: ProductionPlan["contentDirection"]) {
  const labels: Record<ProductionPlan["contentDirection"], string> = {
    industry: "行业",
    competitor: "竞品",
    xpeng: "小鹏",
    unknown: "待确认",
  };
  return labels[value];
}

function formatProductionDecision(value: ProductionPlan["decision"]) {
  const labels: Record<ProductionPlan["decision"], string> = {
    adopt: "可制作",
    observe_only: "仅观察",
    needs_review: "待确认",
  };
  return labels[value];
}

function formatTextStrategy(value: ProductionPlan["textStrategy"]) {
  const labels: Record<ProductionPlan["textStrategy"], string> = {
    source_rewrite: "洗稿重写",
    xpeng_original_from_materials: "车型资料原创",
    creative_reframe_with_xpeng: "竞品转小鹏表达",
    video_extract_rewrite: "视频要点重构",
    not_adopt: "不采用",
  };
  return labels[value];
}

function formatImageStrategy(value: ProductionPlan["imageStrategy"]) {
  const labels: Record<ProductionPlan["imageStrategy"], string> = {
    use_source_image: "原图引用",
    redesign_source_image: "原图洗图",
    redesign_source_or_xpeng_assets: "原图/小鹏素材重构",
    creative_analysis_rebuild_with_xpeng_assets: "创意拆解重构",
    video_keyframe_reference: "关键帧参考",
    none: "无图片任务",
    not_adopt: "不采用",
  };
  return labels[value];
}

function formatMediaCacheState(value: ReturnType<typeof getMediaCacheStatus>["status"]) {
  if (value === "local_complete") return "本地完整";
  if (value === "partial") return "部分缓存";
  if (value === "remote_only") return "远程兜底";
  if (value === "failed") return "缓存异常";
  return "未缓存";
}

function getMediaCacheStatusClass(value: ReturnType<typeof getMediaCacheStatus>["status"]) {
  if (value === "local_complete") return "text-[var(--mint)]";
  if (value === "failed") return "text-[var(--rose)]";
  if (value === "partial") return "text-[var(--amber)]";
  return "text-white/45";
}

function getPlatformLabel(value: Platform) {
  return platforms.find((item) => item.value === value)?.label || value;
}

function formatSimpleRunStatus(value: SimpleRun["status"]) {
  if (value === "queued") return "排队中";
  if (value === "running") return "运行中";
  if (value === "completed") return "已完成";
  if (value === "partial") return "部分完成";
  return "失败";
}

function formatSimplePublishStatus(value?: NonNullable<SimpleRun["publish"]>["status"]) {
  if (value === "queued") return "已排队";
  if (value === "running") return "写入中";
  if (value === "published") return "已写入";
  if (value === "attachment_failed") return "素材失败";
  if (value === "needs_config") return "待配置";
  if (value === "failed") return "失败";
  return "已跳过";
}

function formatSimpleRunSourceLabel(run: SimpleRun) {
  if (run.input.sourceMode === "pool") return `内容池 ${run.input.sourceItemIds?.length || run.input.targetCount} 条`;
  if (run.input.sourceMode === "links") return `链接 ${run.input.links?.length || run.input.targetCount} 条`;
  if (run.input.sourceMode === "feishu") return `飞书 ${run.input.feishuTaskNumbers?.length || run.input.targetCount} 条`;
  return run.input.keyword || "简单任务";
}
