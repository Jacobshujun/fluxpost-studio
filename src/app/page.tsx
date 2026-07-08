"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode, type TouchEvent } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bot,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
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
  Target,
  Terminal,
  Trash2,
  UploadCloud,
  User,
  Users,
  Video,
  Wand2,
  X,
} from "lucide-react";
import {
  buildDefaultImageTasks,
  defaultCarExteriorWashPrompt,
  defaultImageStrategyPrompts,
  defaultImageWashPrompt,
  defaultPeopleWithCarWashPrompt,
  imageReferenceSizeInstruction,
} from "@/lib/creation-controls";
import { defaultDistributionCheckPrompt } from "@/lib/distribution-check-prompt";
import { defaultImageGenerationSize, imageGenerationSizeOptions, isImageGenerationSize, normalizeImageGenerationSize } from "@/lib/image-size-options";
import { mergeDownloadedAndRemoteImages } from "@/lib/media-url-filter";
import { getStoredTheme, setStoredTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";
import { selectBestVideoHighlightFrames } from "@/lib/video-frame-policy";
import {
  defaultSimpleRunMediaSettings,
  type BatchProductionJob,
  type ContentTag,
  type ContentDirection,
  type ConfigStatus,
  type ContentProject,
  type CrawlPlatform,
  type FeishuPublishJob,
  type FeishuPostPublishState,
  type GeneratedPost,
  type ImageGenerationQuality,
  type ImageStrategyPrompts,
  type ImageProductionStrategy,
  type MaterialAsset,
  type MaterialFolder,
  type MaterialLibraryAsset,
  type MaterialLibrarySnapshot,
  type NormalizedSourceItem,
  type Platform,
  type ProductionDecision,
  type ProductionPlan,
  type ProductionTask,
  type SimpleRun,
  type SimpleRunMediaSettings,
  type SourceImageTask,
  type SourceLinkPlatform,
  type TextProductionStrategy,
  type VisualTag,
  type WorkspaceAccount,
  type WorkspacePromptSettings,
} from "@/lib/types";

type PreviewState =
  | {
      kind: "source" | "draft" | "image";
      title: string;
      text?: string;
      imageUrl?: string;
      imageUrls?: string[];
      videoUrls?: string[];
      imageIndex?: number;
      meta?: string;
      links?: string[];
      selection?: {
        selectedImageUrls: string[];
        maxSelected: number;
        onToggleImage: (url: string) => void;
      };
    }
  | null;

type PoolPlatformFilter = Platform | "all";
type LinkImportPlatform = SourceLinkPlatform | "auto";
type PoolSortMode =
  | "hot_desc"
  | "published_desc"
  | "published_asc"
  | "crawled_desc"
  | "crawled_asc"
  | "engagement_desc"
  | "likes_desc"
  | "collects_desc";
type ProductionQueueFilter = "all" | "ready" | "no_draft" | "has_draft" | "approved" | "published";
type ActiveModule = "production" | "materials";
type WorkspaceMode = "compact" | "simple" | "advanced";
type SimpleWorkspaceVariant = "standard" | "compact";
type SimpleSourceMode = "keyword" | "links" | "feishu" | "viral" | "original";
type TaskProgressStatus = "running" | "success" | "error";

type AccountSessionResponse = {
  authMode?: "accounts" | "whitelist";
  hasAccounts?: boolean;
  hasAdminAccount?: boolean;
  accountCount?: number;
  activeAccountCount?: number;
  whitelistConfigured?: boolean;
  adminConfigured?: boolean;
  setupPasswordConfigured?: boolean;
  account?: WorkspaceAccount | null;
  accounts?: WorkspaceAccount[];
  error?: string;
};

type TaskProgressSnapshot = {
  title: string;
  label: string;
  detail: string;
  value: number;
  status: TaskProgressStatus;
  total?: number;
  completed?: number;
};

type PublishStatusSnapshot = {
  postId: string;
  status: "running" | "success" | "warning" | "error";
  title: string;
  detail: string;
  progress: number;
  notification?: string;
  jobId?: string;
  queueStatus?: FeishuPublishJob["status"];
};

type FeishuPublishResponse = {
  status?: "queued" | "running" | "published" | "attachment_failed" | "needs_config" | "skipped" | "failed" | string;
  jobId?: string;
  queueStatus?: FeishuPublishJob["status"];
  job?: FeishuPublishJob;
  payloadPath?: string;
  message?: string;
  error?: string;
  attachmentUploads?: Array<{ fileCount?: number }>;
  attachmentFailures?: Array<{ postId?: string; recordId?: string; fileCount?: number; error?: string }>;
  recordMappings?: Array<{ postId?: string; recordId?: string; created?: boolean }>;
  postStates?: Array<{ postId: string; feishu: FeishuPostPublishState }>;
  notification?: {
    status?: "sent" | "skipped" | "failed";
    recipientType?: "chat" | "user";
    message?: string;
  };
};

type FeishuVehicleOptionsResponse = {
  options?: string[];
  fieldName?: string;
  message?: string;
  error?: string;
};

type MaterialAssetDraft = {
  name: string;
  tags: string;
};

type ViralMaterialCandidate = {
  id: string;
  path: string;
  name: string;
  sourceLabel: string;
  folderId?: string;
};

type ViralMaterialFolderCandidate = {
  id: string;
  name: string;
  imageCount: number;
  selectedCount: number;
  paths: string[];
};

const themeOptions: Array<{ value: ThemeMode; label: string; icon: ReactNode }> = [
  { value: "professional", label: "专业浅色", icon: <Sun className="h-3.5 w-3.5" /> },
  { value: "editorial", label: "编辑室", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { value: "creator", label: "创作深色", icon: <Moon className="h-3.5 w-3.5" /> },
];

const moduleOptions: Array<{ value: ActiveModule; label: string; description: string; icon: ReactNode }> = [
  { value: "production", label: "内容生产", description: "逐条策略、草稿审查、再次生成", icon: <Bot className="h-4 w-4" /> },
  { value: "materials", label: "素材管理", description: "车型资料、图片库、文件夹管理", icon: <FolderOpen className="h-4 w-4" /> },
];

const platforms: Array<{ value: Platform; label: string; accent: string }> = [
  { value: "wechat_channels", label: "微信视频号", accent: "bg-cyan-300" },
  { value: "xiaohongshu", label: "小红书", accent: "bg-rose-300" },
  { value: "douyin", label: "抖音", accent: "bg-white" },
  { value: "weibo", label: "微博", accent: "bg-amber-300" },
  { value: "feishu", label: "飞书", accent: "bg-emerald-300" },
  { value: "original", label: "原创", accent: "bg-violet-300" },
];

const crawlPlatforms = platforms.filter(
  (item): item is { value: CrawlPlatform; label: string; accent: string } =>
    item.value === "wechat_channels" || item.value === "xiaohongshu" || item.value === "douyin" || item.value === "weibo",
);
const maxSimpleImageTasksPerPost = 9;

const linkImportPlatforms: Array<{ value: SourceLinkPlatform; label: string; accent: string }> = [
  ...crawlPlatforms,
  { value: "xiaopeng_bbs", label: "小鹏社区", accent: "bg-sky-300" },
  { value: "dongchedi", label: "\u61c2\u8f66\u5e1d", accent: "bg-lime-300" },
];

const defaultPlatformCrawlSettings: NonNullable<WorkspacePromptSettings["platformCrawlSettings"]> = {
  wechat_channels: { sort: "relevance" },
  xiaohongshu: { sort: "popularity_descending", noteType: 0 },
  douyin: { sort: "0", contentType: "0" },
  weibo: { sort: "hot", searchType: "hot", includeType: "all", timeScope: "" },
};

const poolPlatformOptions: Array<{ label: string; value: PoolPlatformFilter }> = [
  { label: "全部平台", value: "all" },
  ...platforms.map((item) => ({ label: item.label, value: item.value })),
  { label: "小鹏社区", value: "xiaopeng_bbs" },
  { label: "\u61c2\u8f66\u5e1d", value: "dongchedi" },
];

const poolSortOptions: Array<{ label: string; value: PoolSortMode }> = [
  { label: "爆款指数高到低", value: "hot_desc" },
  { label: "发布时间新到旧", value: "published_desc" },
  { label: "发布时间旧到新", value: "published_asc" },
  { label: "最近抓取优先", value: "crawled_desc" },
  { label: "最早抓取优先", value: "crawled_asc" },
  { label: "互动率高到低", value: "engagement_desc" },
  { label: "点赞高到低", value: "likes_desc" },
  { label: "收藏高到低", value: "collects_desc" },
];

const productionQueueOptions: Array<{ label: string; value: ProductionQueueFilter }> = [
  { label: "全部来源", value: "all" },
  { label: "可制作", value: "ready" },
  { label: "未出草稿", value: "no_draft" },
  { label: "已有草稿", value: "has_draft" },
  { label: "已审查", value: "approved" },
  { label: "已发布", value: "published" },
];

const localMediaPreviewVersion = "20260605-image-format-v2";

const imageQualityOptions: Array<{ label: string; value: ImageGenerationQuality }> = [
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
];

const defaultTextInstruction = "保留“热点观点”角度，换成品牌自己的素材和观点，避免复述原文表达。";

const defaultWorkspaceSettings: WorkspacePromptSettings = {
  textInstruction: defaultTextInstruction,
  imageWashPrompt: defaultImageWashPrompt,
  imageStrategyPrompts: defaultImageStrategyPrompts,
  distributionCheckPrompt: defaultDistributionCheckPrompt,
  imageSize: defaultImageGenerationSize,
  imageQuality: "medium",
  platformCrawlSettings: defaultPlatformCrawlSettings,
  simpleRunMediaSettings: defaultSimpleRunMediaSettings,
  updatedAt: new Date(0).toISOString(),
};

const imageStrategyPromptOptions: Array<{
  key: keyof ImageStrategyPrompts;
  tag: VisualTag;
  title: string;
  strategy: string;
  defaultPrompt: string;
}> = [
  {
    key: "carExterior",
    tag: "汽车外观",
    title: "汽车外观 / 车型美图",
    strategy: "洗图：外观图更换背景；车型美图指无人物的纯车外观主体图",
    defaultPrompt: defaultCarExteriorWashPrompt,
  },
  {
    key: "textImage",
    tag: "带文字图",
    title: "带文字图",
    strategy: "洗图：根据图上信息重新设计整张图片",
    defaultPrompt: defaultImageWashPrompt,
  },
  {
    key: "peopleWithCar",
    tag: "人车美图",
    title: "人车美图",
    strategy: "洗图：更换背景和人物",
    defaultPrompt: defaultPeopleWithCarWashPrompt,
  },
];

export default function Home() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [currentAccount, setCurrentAccount] = useState<WorkspaceAccount | null>(null);
  const [workspaceAccounts, setWorkspaceAccounts] = useState<WorkspaceAccount[]>([]);
  const [accountSessionState, setAccountSessionState] = useState<AccountSessionResponse>({});
  const [accountUsername, setAccountUsername] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountSetupPassword, setAccountSetupPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, () => "professional" as ThemeMode);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("compact");
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspacePromptSettings>(defaultWorkspaceSettings);
  const [simpleSourceMode, setSimpleSourceMode] = useState<SimpleSourceMode>("keyword");
  const [simpleKeyword, setSimpleKeyword] = useState("");
  const [simpleTargetCount, setSimpleTargetCount] = useState(20);
  const [simplePlatforms, setSimplePlatforms] = useState<CrawlPlatform[]>(crawlPlatforms.map((item) => item.value));
  const [simpleLinkPlatform, setSimpleLinkPlatform] = useState<LinkImportPlatform>("auto");
  const [simpleLinkText, setSimpleLinkText] = useState("");
  const [simpleVideoFrameOriginalReference, setSimpleVideoFrameOriginalReference] = useState(true);
  const [simpleUseComfyUiKlein, setSimpleUseComfyUiKlein] = useState(defaultSimpleRunMediaSettings.useComfyUiKlein);
  const [simpleDirectOriginalReference, setSimpleDirectOriginalReference] = useState(defaultSimpleRunMediaSettings.directOriginalReference);
  const [simpleIncludeSourceVideo, setSimpleIncludeSourceVideo] = useState(defaultSimpleRunMediaSettings.includeSourceVideo);
  const [simpleEnableVideoTranscription, setSimpleEnableVideoTranscription] = useState(defaultSimpleRunMediaSettings.enableVideoTranscription);
  const [simpleGenerateImages, setSimpleGenerateImages] = useState(defaultSimpleRunMediaSettings.generateImages);
  const [simpleWriteFeishu, setSimpleWriteFeishu] = useState(false);
  const [simpleViralImitateImages, setSimpleViralImitateImages] = useState(false);
  const [simpleViralMaterialPaths, setSimpleViralMaterialPaths] = useState<string[]>([]);
  const [simpleViralMaterialFolderId, setSimpleViralMaterialFolderId] = useState("");
  const [simpleFeishuTaskText, setSimpleFeishuTaskText] = useState("");
  const [simpleViralUrl, setSimpleViralUrl] = useState("");
  const [simpleOriginalPrompt, setSimpleOriginalPrompt] = useState("");
  const [simpleOriginalUseWebSearch, setSimpleOriginalUseWebSearch] = useState(false);
  const [simpleRuns, setSimpleRuns] = useState<SimpleRun[]>([]);
  const [activeSimpleRunId, setActiveSimpleRunId] = useState("");
  const [activeModule, setActiveModule] = useState<ActiveModule>("production");
  const [cookie, setCookie] = useState("");
  const [materialPath, setMaterialPath] = useState("");
  const [materials, setMaterials] = useState<MaterialAsset[]>([]);
  const [materialLibrary, setMaterialLibrary] = useState<MaterialLibrarySnapshot>({ folders: [], assets: [] });
  const [activeMaterialFolderId, setActiveMaterialFolderId] = useState("root");
  const [newMaterialFolderName, setNewMaterialFolderName] = useState("");
  const [materialAssetPath, setMaterialAssetPath] = useState("");
  const [materialAssetName, setMaterialAssetName] = useState("");
  const [materialAssetTags, setMaterialAssetTags] = useState("");
  const [activeFolderNameDraftState, setActiveFolderNameDraftState] = useState({ folderId: "", name: "" });
  const [sources, setSources] = useState<NormalizedSourceItem[]>([]);
  const [activeProject, setActiveProject] = useState<ContentProject | null>(null);
  const [productionQueueFilter, setProductionQueueFilter] = useState<ProductionQueueFilter>("ready");
  const [productionPlatformFilter, setProductionPlatformFilter] = useState<PoolPlatformFilter>("all");
  const [productionSort, setProductionSort] = useState<PoolSortMode>("hot_desc");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [selectedBatchSourceIds, setSelectedBatchSourceIds] = useState<string[]>([]);
  const [batchJobs, setBatchJobs] = useState<BatchProductionJob[]>([]);
  const [activeBatchJob, setActiveBatchJob] = useState<BatchProductionJob | null>(null);
  const [post, setPost] = useState<GeneratedPost | null>(null);
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [feishuVehicleOptions, setFeishuVehicleOptions] = useState<string[]>([]);
  const [feishuVehicleFieldName, setFeishuVehicleFieldName] = useState("车型");
  const [feishuVehicleOptionsMessage, setFeishuVehicleOptionsMessage] = useState("");
  const [selectedGeneratedPostId, setSelectedGeneratedPostId] = useState("");
  const [selectedGeneratedPostIds, setSelectedGeneratedPostIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState(defaultTextInstruction);
  const [strategyDraft, setStrategyDraft] = useState<ProductionPlan | null>(null);
  const [strategyDraftSourceId, setStrategyDraftSourceId] = useState("");
  const [imageTasks, setImageTasks] = useState<SourceImageTask[]>([]);
  const [imageTaskSourceId, setImageTaskSourceId] = useState("");
  const [imageSize, setImageSize] = useState<string>(defaultImageGenerationSize);
  const [imageQuality, setImageQuality] = useState<ImageGenerationQuality>("medium");
  const [generateImages, setGenerateImages] = useState(true);
  const [imageUseComfyUiKleinOverride, setImageUseComfyUiKleinOverride] = useState<boolean | null>(null);
  const [imageDirectOriginalReference, setImageDirectOriginalReference] = useState(false);
  const [includeSourceVideo, setIncludeSourceVideo] = useState(false);
  const [reviewPrompt, setReviewPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [busy, setBusy] = useState<
    | "crawl"
    | "materials"
    | "materialLibrary"
    | "source"
    | "contentBatch"
    | "generate"
    | "batch"
    | "review"
    | "image"
    | "post"
    | "postBatch"
    | "regenerate"
    | "publish"
    | "settings"
    | "simpleRun"
    | null
  >(null);
  const [terminatingSimpleRunId, setTerminatingSimpleRunId] = useState("");
  const [generateProgress, setGenerateProgress] = useState<TaskProgressSnapshot | null>(null);
  const [batchProgress, setBatchProgress] = useState<TaskProgressSnapshot | null>(null);
  const [publishStatus, setPublishStatus] = useState<PublishStatusSnapshot | null>(null);

  const draftCountBySourceId = useMemo(
    () =>
      generatedPosts.reduce<Record<string, number>>((result, item) => {
        result[item.sourceItemId] = (result[item.sourceItemId] || 0) + 1;
        return result;
      }, {}),
    [generatedPosts],
  );
  const productionSources = useMemo(
    () => {
      const filtered = sources.filter((item) => {
        const platformMatched = productionPlatformFilter === "all" || item.platform === productionPlatformFilter;
        const queueMatched = matchesProductionQueueFilter(item, productionQueueFilter, draftCountBySourceId[item.id] || 0);
        return platformMatched && queueMatched;
      });
      return sortSources(filtered, productionSort);
    },
    [draftCountBySourceId, productionPlatformFilter, productionQueueFilter, productionSort, sources],
  );
  const activeSourceList = productionSources;
  const selectedSource = useMemo(
    () => activeSourceList.find((item) => item.id === selectedSourceId) || activeSourceList[0],
    [activeSourceList, selectedSourceId],
  );
  const selectedBatchSources = useMemo(
    () => productionSources.filter((item) => selectedBatchSourceIds.includes(item.id)),
    [productionSources, selectedBatchSourceIds],
  );
  const selectedGeneratedPosts = useMemo(
    () => generatedPosts.filter((item) => selectedGeneratedPostIds.includes(item.id)),
    [generatedPosts, selectedGeneratedPostIds],
  );
  const activeSimpleRun = useMemo(
    () => simpleRuns.find((run) => run.id === activeSimpleRunId) || simpleRuns[0] || null,
    [activeSimpleRunId, simpleRuns],
  );
  const comfyUiKleinAvailable = Boolean(config?.comfyUiKleinConfigured);
  const imageUseComfyUiKlein = imageUseComfyUiKleinOverride ?? comfyUiKleinAvailable;
  const useComfyUiKleinTasks = comfyUiKleinAvailable && imageUseComfyUiKlein;
  const simpleLinkCount = useMemo(() => splitLines(simpleLinkText).length, [simpleLinkText]);
  const simpleFeishuTaskCount = useMemo(() => splitFeishuTaskNumbers(simpleFeishuTaskText).length, [simpleFeishuTaskText]);

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
  const defaultStrategyDraft = useMemo(
    () => (selectedSource ? cloneProductionPlan(selectedSource.productionPlan || makeFallbackProductionPlan(selectedSource)) : null),
    [selectedSource],
  );
  const activeStrategyDraft = strategyDraftSourceId === selectedSource?.id ? strategyDraft : defaultStrategyDraft;
  const defaultImageTasks = useMemo(
    () =>
      selectedSource
        ? buildDefaultImageTasks(selectedSource, workspaceSettings.imageStrategyPrompts, {
            useComfyUiKlein: useComfyUiKleinTasks,
            directOriginalReference: imageDirectOriginalReference,
          })
        : [],
    [imageDirectOriginalReference, selectedSource, useComfyUiKleinTasks, workspaceSettings.imageStrategyPrompts],
  );
  const activeImageTasks = imageTaskSourceId === selectedSource?.id ? imageTasks : defaultImageTasks;
  const selectedSourceCanGenerate = activeStrategyDraft?.decision !== "observe_only";
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
  const materialLibraryAssetPaths = useMemo(() => materialLibrary.assets.map((asset) => asset.path), [materialLibrary.assets]);
  const productionMaterialPaths = useMemo(
    () => Array.from(new Set([...materials.map((asset) => asset.path), ...materialLibraryAssetPaths].filter(Boolean))),
    [materialLibraryAssetPaths, materials],
  );
  const viralMaterialCandidates = useMemo(() => buildViralMaterialCandidates(materials, materialLibrary.assets, materialLibrary.folders), [materials, materialLibrary.assets, materialLibrary.folders]);
  const viralMaterialFolders = useMemo(
    () => buildViralMaterialFolders(materialLibrary.folders, materialLibrary.assets, simpleViralMaterialPaths),
    [materialLibrary.assets, materialLibrary.folders, simpleViralMaterialPaths],
  );
  const activeSimpleViralMaterialFolderId = useMemo(() => {
    if (viralMaterialFolders.some((folder) => folder.id === simpleViralMaterialFolderId)) return simpleViralMaterialFolderId;
    return findMatchingViralMaterialFolderId(viralMaterialFolders, simpleKeyword) || viralMaterialFolders[0]?.id || "";
  }, [simpleKeyword, simpleViralMaterialFolderId, viralMaterialFolders]);
  const displayedViralMaterialCandidates = useMemo(
    () => (activeSimpleViralMaterialFolderId ? viralMaterialCandidates.filter((asset) => asset.folderId === activeSimpleViralMaterialFolderId) : viralMaterialCandidates),
    [activeSimpleViralMaterialFolderId, viralMaterialCandidates],
  );
  const viralMaterialCandidatePathSet = useMemo(() => new Set(displayedViralMaterialCandidates.map((asset) => asset.path)), [displayedViralMaterialCandidates]);
  const selectedSimpleViralMaterialPaths = useMemo(
    () => simpleViralMaterialPaths.filter((path) => viralMaterialCandidatePathSet.has(path)),
    [simpleViralMaterialPaths, viralMaterialCandidatePathSet],
  );

  useEffect(() => {
    void loadAccountSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then(setConfig)
      .catch(() => setMessage("配置状态读取失败"));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!currentAccount) return;
    loadContentPool();
    loadWorkspaceSettings();
    loadSimpleRuns();
    loadBatchProductionJobs();
    loadGeneratedPosts();
    loadMaterialLibrary();
    loadFeishuVehicleOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id]);

  useEffect(() => {
    if (!currentAccount) return;
    if (!simpleRuns.some(isSimpleRunLive)) return;
    const timer = window.setInterval(() => {
      void loadSimpleRuns(activeSimpleRunId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [currentAccount, simpleRuns, activeSimpleRunId]);

  useEffect(() => {
    if (!currentAccount) return;
    if (!activeSimpleRun || isSimpleRunLive(activeSimpleRun)) return;
    if (!activeSimpleRun.platformResults.length && !activeSimpleRun.posts.length) return;
    void loadContentPool(getSimpleRunPrimaryProjectQuery(activeSimpleRun));
    void loadGeneratedPosts(activeSimpleRun.posts[0]?.postId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSimpleRun?.id, activeSimpleRun?.status]);

  useEffect(() => {
    if (!currentAccount) return;
    if (!publishStatus?.jobId || !isFeishuPublishQueueLive(publishStatus.queueStatus)) return;
    const poll = () => {
      void pollFeishuPublishJob(publishStatus.jobId || "");
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishStatus?.jobId, publishStatus?.queueStatus]);

  useEffect(() => {
    if (!preview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview]);

  async function loadAccountSession() {
    setAccountLoading(true);
    try {
      const res = await fetch("/api/accounts/session");
      const data = (await res.json()) as AccountSessionResponse;
      if (!res.ok) throw new Error(data.error || "Workspace account session failed");
      setAccountSessionState(data);
      setCurrentAccount(data.account || null);
      if (data.account) {
        await loadWorkspaceAccounts();
      } else {
        setWorkspaceAccounts([]);
        if (data.authMode === "whitelist" && !data.whitelistConfigured) {
          setAccountMessage("Whitelist access is not configured. Set WORKSPACE_ALLOWED_USERS first.");
        } else if (data.authMode === "whitelist" && !data.hasAdminAccount) {
          setAccountMessage(
            data.adminConfigured && data.setupPasswordConfigured
              ? "Initialize the first administrator account from the whitelist."
              : "Set WORKSPACE_ADMIN_USERS and WORKSPACE_ACCESS_PASSWORD before initializing the first administrator.",
          );
        }
      }
    } catch (error) {
      setCurrentAccount(null);
      setAccountMessage(error instanceof Error ? error.message : "Workspace account session failed");
    } finally {
      setAccountLoading(false);
    }
  }

  async function loadWorkspaceAccounts() {
    try {
      const res = await fetch("/api/accounts");
      const data = (await res.json()) as AccountSessionResponse;
      if (res.ok) setWorkspaceAccounts(data.accounts || []);
    } catch {
      // Account list is auxiliary; the active session still controls access.
    }
  }

  async function submitAccountAccess() {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountMessage("");
    try {
      const bootstrapRequired = !accountSessionState.hasAdminAccount;
      const res = await fetch(bootstrapRequired ? "/api/accounts" : "/api/accounts/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          bootstrapRequired
            ? {
                username: accountUsername,
                password: accountPassword,
                setupPassword: accountSetupPassword,
                role: "admin",
              }
            : {
                username: accountUsername,
                password: accountPassword,
              },
        ),
      });
      const data = (await res.json()) as AccountSessionResponse;
      if (!res.ok || !data.account) throw new Error(data.error || "Workspace account sign-in failed");
      setAccountSessionState(data);
      setCurrentAccount(data.account);
      setAccountUsername("");
      setAccountPassword("");
      setAccountSetupPassword("");
      setAccountMessage(bootstrapRequired ? "Administrator initialized." : "Signed in.");
      await loadWorkspaceAccounts();
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Workspace account sign-in failed");
    } finally {
      setAccountBusy(false);
    }
  }

  async function logoutWorkspaceAccount() {
    setAccountBusy(true);
    try {
      await fetch("/api/accounts/session", { method: "DELETE" });
    } finally {
      setCurrentAccount(null);
      setWorkspaceAccounts([]);
      setAccountPanelOpen(false);
      setAccountPassword("");
      setAccountSetupPassword("");
      setAccountMessage("Signed out.");
      clearWorkspaceRuntimeState();
      setAccountBusy(false);
    }
  }

  function clearWorkspaceRuntimeState() {
    setSimpleRuns([]);
    setActiveSimpleRunId("");
    setSources([]);
    setActiveProject(null);
    setBatchJobs([]);
    setActiveBatchJob(null);
    setGeneratedPosts([]);
    setSelectedGeneratedPostId("");
    setSelectedGeneratedPostIds([]);
    setPublishStatus(null);
  }

  async function loadContentPool(nextQuery = "") {
    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      const res = await fetch(`/api/content-pool?${params.toString()}`);
      const data = (await res.json()) as { activeProject?: ContentProject; error?: string };
      if (!res.ok) throw new Error(data.error || "内容池读取失败");
      const nextProject = data.activeProject || null;
      setActiveProject(nextProject);
      if (nextProject?.items?.length) {
        setSources(nextProject.items);
        setSelectedSourceId((current) => (nextProject.items.some((item) => item.id === current) ? current : nextProject.items[0].id));
        setSelectedBatchSourceIds((current) => current.filter((id) => nextProject.items.some((item) => item.id === id)));
      } else {
        setSources([]);
        setSelectedSourceId("");
        setSelectedBatchSourceIds([]);
      }
    } catch {
      // 内容池读取失败不阻断主流程。
    }
  }

  async function loadWorkspaceSettings() {
    try {
      const res = await fetch("/api/workspace/settings");
      const data = (await res.json()) as { settings?: WorkspacePromptSettings; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error || "默认策略读取失败");
      setWorkspaceSettings(data.settings);
      setInstruction(data.settings.textInstruction);
      setImageSize(data.settings.imageSize);
      setImageQuality(data.settings.imageQuality);
      applySimpleRunMediaSettings(data.settings.simpleRunMediaSettings);
    } catch {
      // 默认策略读取失败时保留客户端默认值，不阻断主工作台渲染。
    }
  }

  async function loadFeishuVehicleOptions() {
    try {
      const res = await fetch("/api/publish/feishu/vehicle-options");
      const data = (await res.json()) as FeishuVehicleOptionsResponse;
      if (!res.ok) throw new Error(data.error || "Feishu vehicle options failed");
      setFeishuVehicleOptions(data.options || []);
      setFeishuVehicleFieldName(data.fieldName || "车型");
      setFeishuVehicleOptionsMessage(data.message || "");
    } catch (error) {
      setFeishuVehicleOptions([]);
      setFeishuVehicleOptionsMessage(error instanceof Error ? error.message : "Feishu vehicle options failed");
    }
  }

  async function loadSimpleRuns(preferredRunId?: string) {
    try {
      const res = await fetch("/api/simple/runs");
      const data = (await res.json()) as { runs?: SimpleRun[]; error?: string };
      if (!res.ok) throw new Error(data.error || "简单版任务读取失败");
      const runs = data.runs || [];
      setSimpleRuns(runs);
      setActiveSimpleRunId((current) =>
        preferredRunId && runs.some((run) => run.id === preferredRunId)
          ? preferredRunId
          : runs.some((run) => run.id === current)
            ? current
            : runs[0]?.id || "",
      );
    } catch {
      // 历史简单任务不是主流程渲染前置条件。
    }
  }

  async function pollFeishuPublishJob(jobId: string) {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/publish/feishu?jobId=${encodeURIComponent(jobId)}`);
      const data = (await res.json()) as FeishuPublishResponse;
      if (!res.ok) throw new Error(data.error || "Feishu publish job polling failed");
      const postsForStatus = data.job?.posts?.length ? data.job.posts : post ? [post] : [];
      setPublishStatus((current) =>
        current?.jobId === jobId ? buildPublishStatus(postsForStatus, data, current.postId) : current,
      );

      if (data.job && !isFeishuPublishQueueLive(data.job.status)) {
        const currentPost = post && data.job.postIds.includes(post.id) ? data.job.posts.find((item) => item.id === post.id) : undefined;
        if (currentPost) setPost(currentPost);
        setMessage(buildPublishMessage(data));
        await loadContentPool();
        await loadGeneratedPosts(currentPost?.id || data.job.postIds[0] || selectedGeneratedPostId);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Feishu publish job polling failed";
      setPublishStatus((current) =>
        current?.jobId === jobId
          ? {
              ...current,
              status: "error",
              title: "飞书写入状态读取失败",
              detail,
              progress: 100,
              queueStatus: "failed",
            }
          : current,
      );
    }
  }

  function updateWorkspaceSettingsDraft(patch: Partial<WorkspacePromptSettings>) {
    setWorkspaceSettings((current) => ({ ...current, ...patch }));
    if (typeof patch.textInstruction === "string") setInstruction(patch.textInstruction);
    if (typeof patch.imageSize === "string") setImageSize(patch.imageSize);
    if (patch.imageQuality) setImageQuality(patch.imageQuality);
    if (patch.simpleRunMediaSettings) applySimpleRunMediaSettings(patch.simpleRunMediaSettings);
  }

  function applySimpleRunMediaSettings(mediaSettings: SimpleRunMediaSettings) {
    setSimpleGenerateImages(mediaSettings.generateImages);
    setSimpleUseComfyUiKlein(mediaSettings.useComfyUiKlein);
    setSimpleDirectOriginalReference(mediaSettings.directOriginalReference);
    setSimpleIncludeSourceVideo(mediaSettings.includeSourceVideo);
    setSimpleEnableVideoTranscription(mediaSettings.enableVideoTranscription);
  }

  function updateSimpleRunMediaSettingsDraft(patch: Partial<SimpleRunMediaSettings>) {
    const simpleRunMediaSettings = {
      ...defaultSimpleRunMediaSettings,
      ...workspaceSettings.simpleRunMediaSettings,
      ...patch,
    };
    applySimpleRunMediaSettings(simpleRunMediaSettings);
    setWorkspaceSettings((current) => ({
      ...current,
      simpleRunMediaSettings: {
        ...defaultSimpleRunMediaSettings,
        ...current.simpleRunMediaSettings,
        ...patch,
      },
    }));
  }

  async function saveWorkspaceSettingsPatch(patch: Partial<WorkspacePromptSettings>) {
    const nextSettings = {
      ...workspaceSettings,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setWorkspaceSettings(nextSettings);
    if (typeof patch.textInstruction === "string") setInstruction(patch.textInstruction);
    if (typeof patch.imageSize === "string") setImageSize(patch.imageSize);
    if (patch.imageQuality) setImageQuality(patch.imageQuality);
    setBusy("settings");
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings),
      });
      const data = (await res.json()) as { settings?: WorkspacePromptSettings; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error || "默认策略保存失败");
      setWorkspaceSettings(data.settings);
      setInstruction(data.settings.textInstruction);
      setImageSize(data.settings.imageSize);
      setImageQuality(data.settings.imageQuality);
      setMessage("默认生产策略已保存，简单版会自动使用这组策略");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "默认策略保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function loadBatchProductionJobs() {
    try {
      const res = await fetch("/api/production/batches");
      const data = (await res.json()) as { jobs?: BatchProductionJob[] };
      if (res.ok) {
        const jobs = data.jobs || [];
        setBatchJobs(jobs);
        setActiveBatchJob((current) => (current ? jobs.find((item) => item.id === current.id) || jobs[0] || null : jobs[0] || null));
      }
    } catch {
      // 批量任务历史读取失败不阻断主流程。
    }
  }

  async function loadGeneratedPosts(preferredPostId?: string) {
    try {
      const res = await fetch("/api/production/posts");
      const data = (await res.json()) as { posts?: GeneratedPost[]; error?: string };
      if (!res.ok) throw new Error(data.error || "草稿库读取失败");
      const posts = data.posts || [];
      const nextSelectedId =
        preferredPostId && posts.some((item) => item.id === preferredPostId)
          ? preferredPostId
          : posts.some((item) => item.id === selectedGeneratedPostId)
            ? selectedGeneratedPostId
            : posts[0]?.id || "";
      setGeneratedPosts(posts);
      setSelectedGeneratedPostIds((current) => current.filter((id) => posts.some((item) => item.id === id)));
      setSelectedGeneratedPostId(nextSelectedId);
      setPost((currentPost) => {
        if (preferredPostId) return posts.find((item) => item.id === preferredPostId) || currentPost;
        if (currentPost && posts.some((item) => item.id === currentPost.id)) return currentPost;
        return posts.find((item) => item.id === nextSelectedId) || null;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "草稿库读取失败");
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
  }function toggleSimplePlatform(value: CrawlPlatform) {
    setSimplePlatforms((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  function changeSimpleSourceMode(value: SimpleSourceMode) {
    setSimpleSourceMode(value);
    if (value === "links") {
      const linkCount = splitLines(simpleLinkText).length;
      if (linkCount) setSimpleTargetCount(Math.min(linkCount, 500));
    }
    if (value === "feishu") {
      const taskCount = splitFeishuTaskNumbers(simpleFeishuTaskText).length;
      if (taskCount) setSimpleTargetCount(Math.min(taskCount, 500));
    }
    if (value === "viral" || value === "original") {
      setSimpleTargetCount(1);
    }
  }

  function updateSimpleKeyword(value: string) {
    setSimpleKeyword(value);
    const matchingFolderId = findMatchingViralMaterialFolderId(viralMaterialFolders, value);
    setSimpleViralMaterialFolderId(matchingFolderId);
  }

  function updateSimpleLinkText(value: string) {
    setSimpleLinkText(value);
    if (simpleSourceMode === "links") {
      const linkCount = splitLines(value).length;
      if (linkCount) setSimpleTargetCount(Math.min(linkCount, 500));
    }
  }

  function updateSimpleFeishuTaskText(value: string) {
    setSimpleFeishuTaskText(value);
    if (simpleSourceMode === "feishu") {
      const taskCount = splitFeishuTaskNumbers(value).length;
      if (taskCount) setSimpleTargetCount(Math.min(taskCount, 500));
    }
  }

  function onToggleViralMaterialPath(path: string) {
    setSimpleViralMaterialPaths((current) => {
      if (current.includes(path)) return current.filter((item) => item !== path);
      if (current.length >= maxSimpleImageTasksPerPost) return current;
      return [...current, path];
    });
  }

  function toggleViralMaterialPathFromPreview(path: string) {
    onToggleViralMaterialPath(path);
    setPreview((current) => {
      if (!current?.selection) return current;
      const selectedImageUrls = current.selection.selectedImageUrls;
      const isSelected = selectedImageUrls.includes(path);
      if (!isSelected && selectedImageUrls.length >= current.selection.maxSelected) return current;
      return {
        ...current,
        selection: {
          ...current.selection,
          selectedImageUrls: isSelected ? selectedImageUrls.filter((item) => item !== path) : [...selectedImageUrls, path],
        },
      };
    });
  }

  function onToggleViralMaterialFolder(folderId: string) {
    const folder = viralMaterialFolders.find((item) => item.id === folderId);
    if (!folder) return;
    setSimpleViralMaterialFolderId(folderId);
    setSimpleViralMaterialPaths((current) => {
      const folderPathSet = new Set(folder.paths);
      const selectedFolderCount = folder.paths.filter((path) => current.includes(path)).length;
      if (selectedFolderCount > 0 && current.length >= maxSimpleImageTasksPerPost) {
        return current.filter((path) => !folderPathSet.has(path));
      }
      if (folder.paths.length && folder.paths.every((path) => current.includes(path))) {
        return current.filter((path) => !folderPathSet.has(path));
      }
      const next = [...current];
      for (const path of folder.paths) {
        if (next.includes(path)) continue;
        if (next.length >= maxSimpleImageTasksPerPost) break;
        next.push(path);
      }
      return next;
    });
  }

  function previewViralMaterialPath(path: string) {
    const imageUrls = displayedViralMaterialCandidates.map((asset) => asset.path);
    const index = Math.max(0, imageUrls.indexOf(path));
    const candidate = displayedViralMaterialCandidates.find((asset) => asset.path === path);
    openImageGallery(imageUrls, index, candidate?.name || "车型图预览", candidate?.sourceLabel || path, {
      selectedImageUrls: selectedSimpleViralMaterialPaths,
      maxSelected: maxSimpleImageTasksPerPost,
      onToggleImage: toggleViralMaterialPathFromPreview,
    });
  }

  async function startSimpleRun() {
    const keyword = simpleKeyword.trim();
    const sourceMode = simpleSourceMode;
    const links = splitLines(simpleLinkText);
    const feishuTaskNumbers = splitFeishuTaskNumbers(simpleFeishuTaskText);
    const viralUrl = simpleViralUrl.trim();
    const originalPrompt = simpleOriginalPrompt.trim();
    if (sourceMode !== "feishu" && !keyword) {
      setMessage(
        sourceMode === "links"
          ? "请先输入归属关键词 / 内容池项目"
          : sourceMode === "original"
            ? "请先输入写入飞书车型的关键词"
            : "请先输入关键词",
      );
      return;
    }
    if (sourceMode === "keyword" && !simplePlatforms.length) {
      setMessage("请至少选择一个采集平台");
      return;
    }
    if (sourceMode === "links" && !links.length) {
      setMessage("请先粘贴需要导入的一行一个链接");
      return;
    }
    if (sourceMode === "feishu" && !feishuTaskNumbers.length) {
      setMessage("请先输入飞书任务编号");
      return;
    }
    if (sourceMode === "viral" && !viralUrl) {
      setMessage("请先输入爆款图文链接");
      return;
    }
    if (sourceMode === "viral" && simpleGenerateImages && simpleViralImitateImages && !selectedSimpleViralMaterialPaths.length) {
      setMessage("请选择至少 1 张车型图用于图片模仿");
      return;
    }
    if (sourceMode === "original" && !originalPrompt) {
      setMessage("请先输入原创选题、提问或要求");
      return;
    }
    if (sourceMode === "original" && simpleOriginalUseWebSearch && config?.openaiTextEndpoint !== "responses") {
      setMessage("当前文本接口不支持原创联网搜索；请关闭联网搜索，或配置 OPENAI_TEXT_ENDPOINT=responses 后重试。");
      return;
    }
    const textInstruction = workspaceSettings.textInstruction.trim();
    if (!textInstruction) {
      setMessage("请填写文字内容提示词，或恢复默认提示词");
      return;
    }
    const missingImageStrategyPrompt = simpleGenerateImages ? getMissingImageStrategyPrompt(workspaceSettings) : "";
    if (missingImageStrategyPrompt) {
      setMessage(`请填写${missingImageStrategyPrompt}提示词，或恢复默认提示词`);
      return;
    }
    const normalizedImageSize = simpleGenerateImages ? normalizeImageSizeInput(workspaceSettings.imageSize) : defaultImageGenerationSize;
    if (simpleGenerateImages && !normalizedImageSize) {
      setMessage("请输入 auto 或 64-8192 范围内的 GPT 图片尺寸，例如 1200x1600");
      return;
    }

    const syncedWorkspaceSettings = workspaceSettings;
    const simpleRunMediaSettings: SimpleRunMediaSettings = {
      generateImages: simpleGenerateImages,
      useComfyUiKlein: simpleUseComfyUiKlein,
      directOriginalReference: simpleDirectOriginalReference,
      includeSourceVideo: simpleIncludeSourceVideo,
      enableVideoTranscription: simpleEnableVideoTranscription,
    };
    const imageStrategyPrompts = trimImageStrategyPrompts(syncedWorkspaceSettings.imageStrategyPrompts);
    const settingsForRun: WorkspacePromptSettings = {
      ...syncedWorkspaceSettings,
      textInstruction,
      imageStrategyPrompts,
      imageWashPrompt: imageStrategyPrompts.textImage,
      imageSize: normalizedImageSize,
      simpleRunMediaSettings,
      updatedAt: new Date().toISOString(),
    };
    setWorkspaceSettings(settingsForRun);
    setInstruction(settingsForRun.textInstruction);
    setImageSize(settingsForRun.imageSize);
    setImageQuality(settingsForRun.imageQuality);
    setBusy("simpleRun");
    setMessage("");
    try {
      const res = await fetch("/api/simple/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMode,
          keyword: sourceMode === "feishu" ? "飞书导入" : keyword,
          targetCount:
            sourceMode === "feishu"
              ? Math.min(simpleTargetCount, feishuTaskNumbers.length)
              : sourceMode === "viral" || sourceMode === "original"
                ? Math.min(simpleTargetCount, 1)
              : sourceMode === "links"
                ? Math.min(simpleTargetCount, links.length)
                : simpleTargetCount,
          platforms: sourceMode === "keyword" ? simplePlatforms : [],
          links: sourceMode === "links" ? links : undefined,
          linkPlatform: sourceMode === "links" ? simpleLinkPlatform : undefined,
          cookie: sourceMode === "links" && simpleLinkPlatform === "dongchedi" ? cookie : undefined,
          videoFrameOriginalReference: sourceMode === "links" ? simpleVideoFrameOriginalReference : undefined,
          useComfyUiKlein: simpleUseComfyUiKlein,
          directOriginalReference: sourceMode === "viral" || sourceMode === "original" ? undefined : simpleDirectOriginalReference,
          includeSourceVideo: simpleIncludeSourceVideo,
          enableVideoTranscription: simpleEnableVideoTranscription,
          generateImages: simpleGenerateImages,
          writeFeishu: simpleWriteFeishu,
          feishuTaskNumbers: sourceMode === "feishu" ? feishuTaskNumbers : undefined,
          viralUrl: sourceMode === "viral" ? viralUrl : undefined,
          viralImitateImages: sourceMode === "viral" ? simpleViralImitateImages : undefined,
          viralMaterialPaths: sourceMode === "viral" && simpleGenerateImages && simpleViralImitateImages ? selectedSimpleViralMaterialPaths : undefined,
          originalPrompt: sourceMode === "original" ? originalPrompt : undefined,
          originalUseWebSearch: sourceMode === "original" ? simpleOriginalUseWebSearch : undefined,
          materialPaths: productionMaterialPaths,
          settings: settingsForRun,
        }),
      });
      const data = (await res.json()) as { run?: SimpleRun; error?: string };
      if (!res.ok || !data.run) throw new Error(data.error || "简单版自动任务失败");
      setSimpleRuns((current) => [data.run!, ...current.filter((run) => run.id !== data.run!.id)]);
      setActiveSimpleRunId(data.run.id);
      const nextProjectQuery = getSimpleRunPrimaryProjectQuery(data.run);
      await loadContentPool(nextProjectQuery);
      await loadGeneratedPosts(data.run.posts[0]?.postId);
      setMessage(isSimpleRunLive(data.run) ? "简单版任务已提交，后端正在自动执行，请看任务进度。" : buildSimpleRunMessage(data.run));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "简单版自动任务失败");
    } finally {
      setBusy(null);
      await loadSimpleRuns();
    }
  }

  async function terminateSimpleRunFromUi(runId: string) {
    if (!runId || terminatingSimpleRunId) return;
    const run = simpleRuns.find((item) => item.id === runId);
    const label = run?.input.keyword || runId;
    if (!window.confirm(`确定要强制终止任务“${label}”吗？这会关闭本地队列状态，并允许后续任务继续执行。`)) return;

    setTerminatingSimpleRunId(runId);
    setMessage("");
    try {
      const res = await fetch("/api/simple/runs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = (await res.json()) as { run?: SimpleRun; error?: string };
      if (!res.ok || !data.run) throw new Error(data.error || "强制终止任务失败");
      setSimpleRuns((current) => [data.run!, ...current.filter((item) => item.id !== data.run!.id)]);
      setActiveSimpleRunId(data.run.id);
      setMessage("已强制终止该任务，可以发起新的任务。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "强制终止任务失败");
    } finally {
      setTerminatingSimpleRunId("");
      await loadSimpleRuns(runId);
    }
  }async function scanMaterials() {
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
      setMessage(`已索引素材：${data.assets?.length || 0} 张图片`);
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
    if (!window.confirm(`确认删除素材索引「${asset.name}」？原始本地文件不会被删除。`)) return;
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

  async function saveCurrentGeneratedPost() {
    if (!post) return;
    setBusy("post");
    setMessage("");
    try {
      const res = await fetch("/api/production/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: post.id,
          patch: {
            title: post.title,
            body: post.body,
            imagePrompt: post.imagePrompt,
            imageUrls: post.imageUrls,
            videoUrls: post.videoUrls,
            imageTasks: post.imageTasks,
            status: post.status,
          },
        }),
      });
      const data = (await res.json()) as { post?: GeneratedPost; error?: string };
      if (!res.ok || !data.post) throw new Error(data.error || "草稿保存失败");
      setPost(data.post);
      await loadGeneratedPosts(data.post.id);
      setMessage("草稿已保存到生产库");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "草稿保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteCurrentGeneratedPost() {
    if (!post) return;
    if (!window.confirm("确认删除当前生产草稿？")) return;
    setBusy("post");
    setMessage("");
    try {
      const res = await fetch(`/api/production/posts?id=${encodeURIComponent(post.id)}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "草稿删除失败");
      const nextPost = generatedPosts.find((item) => item.id !== post.id) || null;
      setPost(nextPost);
      setSelectedGeneratedPostId(nextPost?.id || "");
      await loadGeneratedPosts();
      setMessage("草稿已删除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "草稿删除失败");
    } finally {
      setBusy(null);
    }
  }

  async function updateSelectedGeneratedPostStatus(status: GeneratedPost["status"]) {
    if (!selectedGeneratedPostIds.length) {
      setMessage("请先勾选要批量管理的生成稿");
      return;
    }
    setBusy("postBatch");
    setMessage("");
    try {
      const res = await fetch("/api/production/posts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", ids: selectedGeneratedPostIds, status }),
      });
      const data = (await res.json()) as { posts?: GeneratedPost[]; updatedCount?: number; notFoundIds?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || "生成稿批量状态更新失败");
      const preferredPostId = post && selectedGeneratedPostIds.includes(post.id) ? post.id : selectedGeneratedPostId;
      clearGeneratedPostSelection();
      await loadGeneratedPosts(preferredPostId);
      if (status === "approved" || status === "published") await loadContentPool();
      setMessage(`生成稿批量更新完成：${data.updatedCount || 0} 条，未命中 ${data.notFoundIds?.length || 0} 条`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成稿批量状态更新失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelectedGeneratedPosts() {
    if (!selectedGeneratedPostIds.length) {
      setMessage("请先勾选要删除的生成稿");
      return;
    }
    if (!window.confirm(`确认删除已选 ${selectedGeneratedPostIds.length} 条生成稿？该操作不可撤销。`)) return;
    setBusy("postBatch");
    setMessage("");
    try {
      const deletingIds = selectedGeneratedPostIds;
      const nextPost = generatedPosts.find((item) => !deletingIds.includes(item.id)) || null;
      const res = await fetch("/api/production/posts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: deletingIds }),
      });
      const data = (await res.json()) as { deletedCount?: number; notFoundIds?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || "生成稿批量删除失败");
      clearGeneratedPostSelection();
      setPost(nextPost);
      setSelectedGeneratedPostId(nextPost?.id || "");
      await loadGeneratedPosts(nextPost?.id);
      setMessage(`生成稿批量删除完成：${data.deletedCount || 0} 条，未命中 ${data.notFoundIds?.length || 0} 条`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成稿批量删除失败");
    } finally {
      setBusy(null);
    }
  }

  async function regenerateCurrentPost() {
    if (!post) return;
    const normalizedImageSize = generateImages ? normalizeImageSizeInput(imageSize) : defaultImageGenerationSize;
    if (generateImages && !normalizedImageSize) {
      setMessage("请输入 auto 或 64-8192 范围内的 GPT 图片尺寸，例如 1200x1600");
      return;
    }
    setBusy("regenerate");
    setMessage("");
    try {
      const res = await fetch("/api/production/posts/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post,
          source: selectedSource?.id === post.sourceItemId ? selectedSource : undefined,
          materialPaths: productionMaterialPaths,
          instruction,
          productionPlanOverride: selectedSource?.id === post.sourceItemId ? activeStrategyDraft : post.productionPlanOverride,
          imageTasks: selectedSource?.id === post.sourceItemId ? activeImageTasks : post.imageTasks,
          generateImages: generateImages,
          imageSize: normalizedImageSize,
          imageQuality,
        }),
      });
      const data = (await res.json()) as { post?: GeneratedPost; error?: string };
      if (!res.ok || !data.post) throw new Error(data.error || "再次生成失败");
      setPost(data.post);
      setSelectedGeneratedPostId(data.post.id);
      await loadGeneratedPosts(data.post.id);
      setMessage(`已生成 V${data.post.version || 1} 草稿`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "再次生成失败");
    } finally {
      setBusy(null);
    }
  }

  async function generateDraft() {
    if (!selectedSource) {
      setMessage("请先选择一条爆款内容");
      return;
    }
    if (!selectedSourceCanGenerate) {
      setMessage("该内容被制作策略标记为仅观察，不进入自动生成流程");
      return;
    }
    const normalizedImageSize = generateImages ? normalizeImageSizeInput(imageSize) : defaultImageGenerationSize;
    if (generateImages && !normalizedImageSize) {
      setMessage("请输入 auto 或 64-8192 范围内的 GPT 图片尺寸，例如 1200x1600");
      return;
    }
    setBusy("generate");
    setMessage("");
    const selectedImageTaskCount = activeImageTasks.filter((task) => task.selected).length;
    const generateDraftHasImageTasks = generateImages && selectedImageTaskCount > 0;
    setGenerateProgress({
      title: "单条生产进度",
      label: generateDraftHasImageTasks ? "正在生成图文草稿" : "正在生成文字草稿",
      detail: formatDraftGenerationProgressDetail(
        selectedSource.title || selectedSource.contentText || selectedSource.id,
        selectedImageTaskCount,
        generateImages,
        normalizedImageSize,
        imageQuality,
      ),
      value: 36,
      status: "running",
      total: selectedImageTaskCount || 1,
      completed: 0,
    });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: selectedSource,
          materialPaths: productionMaterialPaths,
          instruction,
          productionPlanOverride: activeStrategyDraft || selectedSource.productionPlan,
          imageTasks: activeImageTasks,
          includeSourceVideo: includeSourceVideo,
          generateImages: generateImages,
          imageSize: normalizedImageSize,
          imageQuality,
        }),
      });
      const data = (await res.json()) as { post?: GeneratedPost; error?: string };
      if (!res.ok || !data.post) throw new Error(data.error || "生成失败");
      const generatedMediaCount = countPostMedia(data.post);
      setGenerateProgress({
        title: "单条生产进度",
        label: "正在同步草稿与内容池",
        detail: formatDraftSyncProgressDetail(generatedMediaCount, generateImages, selectedImageTaskCount),
        value: 84,
        status: "running",
        total: selectedImageTaskCount || generatedMediaCount || 1,
        completed: generatedMediaCount,
      });
      setPost(data.post);
      setSelectedGeneratedPostId(data.post.id);
      await loadContentPool();
      await loadGeneratedPosts(data.post.id);
      setGenerateProgress({
        title: "单条生产进度",
        label: generatedMediaCount ? "图文草稿已生成" : "文字草稿已生成",
        detail: formatDraftDoneProgressDetail(generatedMediaCount, generateImages, selectedImageTaskCount),
        value: 100,
        status: "success",
        total: selectedImageTaskCount || generatedMediaCount || 1,
        completed: generatedMediaCount || 1,
      });
      setMessage(formatDraftDoneMessage(generatedMediaCount, generateImages, selectedImageTaskCount));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "生成失败";
      setGenerateProgress({
        title: "单条生产进度",
        label: "单条生产失败",
        detail: errorMessage,
        value: 100,
        status: "error",
        total: selectedImageTaskCount || 1,
        completed: 0,
      });
      setMessage(errorMessage);
    } finally {
      setBusy(null);
    }
  }

  async function startBatchProduction() {
    if (!selectedBatchSourceIds.length) {
      setMessage("请先在生产队列勾选要批量制作的来源");
      return;
    }
    setBusy("batch");
    setMessage("");
    const totalBatchTasks = selectedBatchSourceIds.length;
    setBatchProgress({
      title: "批量生产进度",
      label: "正在创建批量任务",
      detail: `已选择 ${totalBatchTasks} 条来源，后端将逐条生成图文草稿`,
      value: 24,
      status: "running",
      total: totalBatchTasks,
      completed: 0,
    });
    try {
      const res = await fetch("/api/production/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${activeProject?.query || selectedBatchSources[0]?.title || "??"} ????`,
          sourceItemIds: selectedBatchSourceIds,
          materialPaths: productionMaterialPaths,
          instruction,
          includeSourceVideo: includeSourceVideo,
        }),
      });
      const data = (await res.json()) as { job?: BatchProductionJob; error?: string };
      if (!res.ok || !data.job) throw new Error(data.error || "批量制作失败");
      const finishedBatchTasks = data.job.completedTasks + data.job.failedTasks + data.job.skippedTasks;
      setBatchProgress({
        title: "批量生产进度",
        label: "正在同步批量结果",
        detail: `后端已返回真实统计：完成 ${data.job.completedTasks}，失败 ${data.job.failedTasks}，跳过 ${data.job.skippedTasks}`,
        value: 88,
        status: "running",
        total: data.job.totalTasks || totalBatchTasks,
        completed: finishedBatchTasks,
      });
      setActiveBatchJob(data.job);
      setBatchJobs((current) => [data.job!, ...current.filter((item) => item.id !== data.job!.id)]);
      const firstPost = data.job.tasks.find((task) => task.post)?.post;
      if (firstPost) setPost(firstPost);
      await loadContentPool();
      await loadBatchProductionJobs();
      await loadGeneratedPosts(firstPost?.id);
      setBatchProgress({
        title: "批量生产进度",
        label: "批量生产完成",
        detail: `成功 ${data.job.completedTasks} 条，失败 ${data.job.failedTasks} 条，跳过 ${data.job.skippedTasks} 条`,
        value: 100,
        status: data.job.failedTasks > 0 ? "error" : "success",
        total: data.job.totalTasks || totalBatchTasks,
        completed: finishedBatchTasks,
      });
      setMessage(`批量制作完成：成功 ${data.job.completedTasks} 条，失败 ${data.job.failedTasks} 条，跳过 ${data.job.skippedTasks} 条`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "批量制作失败";
      setBatchProgress({
        title: "批量生产进度",
        label: "批量生产失败",
        detail: errorMessage,
        value: 100,
        status: "error",
        total: totalBatchTasks,
        completed: 0,
      });
      setMessage(errorMessage);
    } finally {
      setBusy(null);
    }
  }

  async function saveReviewPatch(patch: Partial<GeneratedPost>, prompt?: string) {
    if (!post) return;
    setBusy(prompt ? "review" : null);
    setMessage("");
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post,
          manualPatch: patch,
          instruction: prompt,
        }),
      });
      const data = (await res.json()) as { post?: GeneratedPost; error?: string };
      if (!res.ok || !data.post) throw new Error(data.error || "保存失败");
      setPost(data.post);
      setSelectedGeneratedPostId(data.post.id);
      await loadContentPool();
      await loadGeneratedPosts(data.post.id);
      setMessage(data.post.status === "approved" ? "已通过审查" : "已保存修改");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function generateImage() {
    if (!post) return;
    const normalizedImageSize = normalizeImageSizeInput(imageSize);
    if (!normalizedImageSize) {
      setMessage("请输入 auto 或 64-8192 范围内的 GPT 图片尺寸，例如 1200x1600");
      return;
    }
    const generationImageTasks = selectedSource?.id === post.sourceItemId ? activeImageTasks : post.imageTasks || activeImageTasks;
    setBusy("image");
    setMessage("");
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: post.imagePrompt,
          count: 1,
          imageTasks: generationImageTasks,
          size: normalizedImageSize,
          quality: imageQuality,
        }),
      });
      const data = (await res.json()) as { imageUrls?: string[]; status?: string; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "图片生成失败");
      const nextUrls = [...post.imageUrls, ...(data.imageUrls || [])];
      const nextPost = { ...post, imageUrls: nextUrls, imageTasks: generationImageTasks, updatedAt: new Date().toISOString() };
      setPost(nextPost);
      if (data.status === "needs_config") {
        setMessage("OpenAI 图片模型未配置，已保留图片提示词");
      } else {
        await saveReviewPatch({ imageUrls: nextUrls, imageTasks: generationImageTasks });
        await loadGeneratedPosts(nextPost.id);
        setMessage(`图片已生成：${data.imageUrls?.length || 0} 张，${normalizedImageSize} / ${imageQuality}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片生成失败");
    } finally {
      setBusy(null);
    }
  }

  async function publishToFeishu() {
    if (!post) return;
    setBusy("publish");
    setMessage("");
    setPublishStatus({
      postId: post.id,
      status: "running",
      title: "正在写入飞书",
      detail: `正在提交「${post.title || "未命名图文"}」，${countPostMedia(post)} 个素材将写入动态素材字段。`,
      progress: 38,
      notification: "写入成功后会按配置发送飞书通知。",
    });
    try {
      const saveRes = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post,
          manualPatch: {
            title: post.title,
            body: post.body,
            imagePrompt: post.imagePrompt,
            imageUrls: post.imageUrls,
            videoUrls: post.videoUrls,
            imageTasks: post.imageTasks,
            feishuVehicle: post.feishuVehicle,
            status: "approved",
          },
        }),
      });
      const saveData = (await saveRes.json()) as { post?: GeneratedPost; error?: string };
      if (!saveRes.ok || !saveData.post) throw new Error(saveData.error || "淇濆瓨澶辫触");
      const posts = [saveData.post];
      const res = await fetch("/api/publish/feishu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts }),
      });
      const data = (await res.json()) as FeishuPublishResponse;
      if (!res.ok) throw new Error(data.error || "写入飞书失败");
      const nextFeishuState = data.postStates?.find((item) => item.postId === posts[0]?.id)?.feishu;
      const nextPost = {
        ...posts[0],
        feishu: nextFeishuState || posts[0].feishu,
        status: data.status === "published" ? ("published" as const) : ("approved" as const),
      };
      setPost(nextPost);
      setSelectedGeneratedPostId(nextPost.id);
      await loadContentPool();
      await loadGeneratedPosts(nextPost.id);
      setPublishStatus(buildPublishStatus(posts, data, nextPost.id));
      setMessage(buildPublishMessage(data));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "写入飞书失败";
      setPublishStatus({
        postId: post.id,
        status: "error",
        title: "飞书写入失败",
        detail,
        progress: 100,
        notification: "请查看右侧执行日志或后端报错详情。",
      });
      setMessage(detail);
    } finally {
      setBusy(null);
    }
  }

  function toggleBatchSource(sourceItemId: string) {
    setSelectedBatchSourceIds((current) =>
      current.includes(sourceItemId) ? current.filter((id) => id !== sourceItemId) : [...current, sourceItemId],
    );
  }

  function selectVisibleBatchSources() {
    setSelectedBatchSourceIds(productionSources.slice(0, 30).map((item) => item.id));
  }

  function clearBatchSources() {
    setSelectedBatchSourceIds([]);
  }

  function toggleGeneratedPostSelection(postId: string) {
    setSelectedGeneratedPostIds((current) =>
      current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId],
    );
  }

  function selectVisibleGeneratedPosts() {
    setSelectedGeneratedPostIds(generatedPosts.slice(0, 100).map((item) => item.id));
  }

  function clearGeneratedPostSelection() {
    setSelectedGeneratedPostIds([]);
  }

  function updateStrategyDraft(patch: Partial<ProductionPlan>) {
    if (!selectedSource) return;
    setStrategyDraftSourceId(selectedSource.id);
    setStrategyDraft({ ...(activeStrategyDraft || makeFallbackProductionPlan(selectedSource)), ...patch });
    if (patch.imageStrategy === "use_source_image") {
      setImageTaskSourceId(selectedSource.id);
      setImageTasks(activeImageTasks.map((task) => ({ ...task, selected: true, mode: "keep" })));
    }
  }

  function updateStrategyGuidance(field: "textBrief" | "imageBrief", value: string) {
    if (!selectedSource) return;
    const base = activeStrategyDraft || makeFallbackProductionPlan(selectedSource);
    setStrategyDraftSourceId(selectedSource.id);
    setStrategyDraft({
      ...base,
      promptGuidance: {
        ...base.promptGuidance,
        [field]: value,
      },
    });
  }

  function toggleImageTask(taskId: string) {
    if (!selectedSource) return;
    setImageTaskSourceId(selectedSource.id);
    setImageTasks(activeImageTasks.map((task) => (task.id === taskId ? { ...task, selected: !task.selected } : task)));
  }

  function updateImageTask(taskId: string, patch: Partial<SourceImageTask>) {
    if (!selectedSource) return;
    setImageTaskSourceId(selectedSource.id);
    setImageTasks(activeImageTasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
  }

  function resetImageTasks() {
    if (!selectedSource) return;
    setImageTaskSourceId(selectedSource.id);
    setImageTasks(buildDefaultImageTasks(selectedSource, workspaceSettings.imageStrategyPrompts, {
      useComfyUiKlein: useComfyUiKleinTasks,
      directOriginalReference: imageDirectOriginalReference,
    }));
  }

  function changeImageUseComfyUiKlein(value: boolean) {
    setImageUseComfyUiKleinOverride(value);
    setImageTaskSourceId("");
  }

  function changeImageDirectOriginalReference(value: boolean) {
    setImageDirectOriginalReference(value);
    setImageTaskSourceId("");
  }

  function openSourcePreview(item: NormalizedSourceItem) {
    setPreview({
      kind: "source",
      title: item.title || "内容预览",
      text: item.contentText || "暂无正文",
      meta: [
        platforms.find((option) => option.value === item.platform)?.label || "",
        item.authorName || "未知作者",
        formatMediaType(item.mediaType),
        `发布 ${formatSourceTime(item.publishedAt, item.publishedLabel)}`,
        `抓取 ${formatSourceTime(getCrawlTime(item))}`,
      ].filter(Boolean).join(" · "),
      links: [item.sourceUrl, getDisplayVideoUrl(item), ...getVideoFrameUrls(item), ...getDisplayImages(item), ...item.mediaUrls].filter(
        (url): url is string => Boolean(url),
      ),
    });
  }

  function openDraftPreview(value: GeneratedPost) {
    const selectedTasks = (value.imageTasks || []).filter((task) => task.selected);
    const videoUrls = postVideoUrls(value);
    setPreview({
      kind: "draft",
      title: value.title || "草稿预览",
      imageUrl: value.imageUrls[0],
      imageUrls: value.imageUrls,
      videoUrls,
      imageIndex: 0,
      text: [
        value.body,
        value.imagePrompt ? `\n\n图片 Prompt：\n${value.imagePrompt}` : "",
        selectedTasks.length
          ? `\n\n图片任务：\n${selectedTasks.map((task, index) => `${index + 1}. ${task.label} · ${formatImageTaskMode(task.mode)} · ${task.prompt}`).join("\n")}`
          : "",
      ].join(""),
      meta: `${platforms.find((option) => option.value === value.platform)?.label || ""} · ${value.status} · ${countPostMedia(value)} 个素材`,
      links: [...value.imageUrls, ...videoUrls, ...selectedTasks.map((task) => task.url)],
    });
  }

  function openImageGallery(imageUrls: string[], imageIndex: number, title: string, meta?: string, selection?: NonNullable<PreviewState>["selection"]) {
    const uniqueImages = Array.from(new Set(imageUrls.filter(Boolean)));
    if (!uniqueImages.length) return;
    setPreview({
      kind: "image",
      title,
      imageUrl: uniqueImages[Math.min(Math.max(imageIndex, 0), uniqueImages.length - 1)],
      imageUrls: uniqueImages,
      imageIndex: Math.min(Math.max(imageIndex, 0), uniqueImages.length - 1),
      meta,
      selection,
    });
  }

  if (!currentAccount) {
    return (
      <main className="app-shell app-shell-auth overflow-x-hidden">
        <div className="studio-frame mx-auto flex w-full max-w-[1680px] flex-col text-sm text-white">
          <header className="design-header mb-4 flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="brand-mark grid h-12 w-12 shrink-0 place-items-center rounded-[8px]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="header-eyebrow">Social content operations</p>
                <h1 className="truncate text-xl font-black text-white sm:text-2xl">FluxPost Studio</h1>
                <p className="text-xs text-white/55">Shared workspace account access</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <div className="theme-switcher" role="group" aria-label="Theme switcher">
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
              <ConfigChip label="TikHub" ok={Boolean(config?.tikhubConfigured)} />
              <ConfigChip label={config?.textModel || "GPT"} ok={Boolean(config?.openaiConfigured)} />
              <ConfigChip label="Feishu CLI" ok={Boolean(config?.feishuConfigured)} />
            </div>
          </header>

          <AccountAccessPanelV2
            loading={accountLoading}
            busy={accountBusy}
            bootstrapRequired={!accountSessionState.hasAdminAccount}
            username={accountUsername}
            password={accountPassword}
            setupPassword={accountSetupPassword}
            message={accountMessage}
            onUsernameChange={setAccountUsername}
            onPasswordChange={setAccountPassword}
            onSetupPasswordChange={setAccountSetupPassword}
            onSubmit={submitAccountAccess}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={`app-shell app-shell-${workspaceMode} overflow-x-hidden`}>
      <div className="studio-frame mx-auto flex w-full max-w-[1680px] flex-col text-sm text-white">
        <div className="studio-topbar">
        <header className="design-header mb-4 flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark grid h-12 w-12 shrink-0 place-items-center rounded-[8px]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="header-eyebrow">Social content operations</p>
              <h1 className="truncate text-xl font-black text-white sm:text-2xl">FluxPost Studio</h1>
              <p className="text-xs text-white/55">关键词采集、爆款分析、逐条仿写、飞书入库的一体化工作台</p>
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
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <AccountMenuV2
              account={currentAccount}
              accounts={workspaceAccounts}
              open={accountPanelOpen}
              busy={accountBusy}
              message={accountMessage}
              onToggleOpen={() => setAccountPanelOpen((value) => !value)}
              onRefresh={loadWorkspaceAccounts}
              onAccountsChanged={loadWorkspaceAccounts}
              onLogout={logoutWorkspaceAccount}
            />
            <Link className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" href="/content">
              <Database className="h-4 w-4" />
              采集与内容池
            </Link>
            <Link className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" href="/review">
              <ExternalLink className="h-4 w-4" />
              内容审查台
            </Link>
            <Link className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" href="/distribution-check">
              <ShieldCheck className="h-4 w-4" />
              是否分发
            </Link>
            <ConfigChip label="TikHub" ok={Boolean(config?.tikhubConfigured)} />
            <ConfigChip label={config?.textModel || "GPT"} ok={Boolean(config?.openaiConfigured)} />
            <ConfigChip label="Feishu CLI" ok={Boolean(config?.feishuConfigured)} />
            <ConfigChip label="飞书导入" ok={Boolean(config?.feishuContentImportConfigured)} />
            <ConfigChip label="分发审核" ok={Boolean(config?.feishuDistributionCheckConfigured)} />
            <ConfigChip label="飞书通知" ok={Boolean(config?.feishuNotifyConfigured)} />
          </div>
        </header>

        <WorkspaceModeSwitcher mode={workspaceMode} onChange={setWorkspaceMode} />

          {workspaceMode === "advanced" ? (
            <div className="advanced-command-dock">
              <StudioCommandBar
                activeProject={activeProject}
                visibleCount={productionSources.length}
                totalCount={sources.length}
                post={post}
              />

              <ModuleSwitcher activeModule={activeModule} onChange={setActiveModule} />
            </div>
          ) : null}
        </div>

        <div className="studio-body">

        {workspaceMode === "compact" || workspaceMode === "simple" ? (
          <SimpleWorkspace
            variant={workspaceMode === "compact" ? "compact" : "standard"}
            sourceMode={simpleSourceMode}
            keyword={simpleKeyword}
            targetCount={simpleTargetCount}
            selectedPlatforms={simplePlatforms}
            linkText={simpleLinkText}
            linkPlatform={simpleLinkPlatform}
            cookie={cookie}
            videoFrameOriginalReference={simpleVideoFrameOriginalReference}
            useComfyUiKlein={simpleUseComfyUiKlein}
            directOriginalReference={simpleDirectOriginalReference}
            includeSourceVideo={simpleIncludeSourceVideo}
            enableVideoTranscription={simpleEnableVideoTranscription}
            generateImages={simpleGenerateImages}
            writeFeishu={simpleWriteFeishu}
            viralImitateImages={simpleViralImitateImages}
            viralMaterialFolders={viralMaterialFolders}
            activeViralMaterialFolderId={activeSimpleViralMaterialFolderId}
            viralMaterialCandidates={displayedViralMaterialCandidates}
            selectedViralMaterialPaths={selectedSimpleViralMaterialPaths}
            linkCount={simpleLinkCount}
            feishuTaskText={simpleFeishuTaskText}
            feishuTaskCount={simpleFeishuTaskCount}
            viralUrl={simpleViralUrl}
            originalPrompt={simpleOriginalPrompt}
            originalUseWebSearch={simpleOriginalUseWebSearch}
            config={config}
            materialPathCount={productionMaterialPaths.length}
            settings={workspaceSettings}
            runs={simpleRuns}
            activeRun={activeSimpleRun}
            busy={busy === "simpleRun"}
            terminatingRunId={terminatingSimpleRunId}
            settingsBusy={busy === "settings"}
            onSourceModeChange={changeSimpleSourceMode}
            onKeywordChange={updateSimpleKeyword}
            onTargetCountChange={setSimpleTargetCount}
            onTogglePlatform={toggleSimplePlatform}
            onLinkTextChange={updateSimpleLinkText}
            onLinkPlatformChange={setSimpleLinkPlatform}
            onCookieChange={setCookie}
            onVideoFrameOriginalReferenceChange={setSimpleVideoFrameOriginalReference}
            onUseComfyUiKleinChange={(value) => updateSimpleRunMediaSettingsDraft({ useComfyUiKlein: value })}
            onDirectOriginalReferenceChange={(value) => updateSimpleRunMediaSettingsDraft({ directOriginalReference: value })}
            onIncludeSourceVideoChange={(value) => updateSimpleRunMediaSettingsDraft({ includeSourceVideo: value })}
            onEnableVideoTranscriptionChange={(value) => updateSimpleRunMediaSettingsDraft({ enableVideoTranscription: value })}
            onGenerateImagesChange={(value) => updateSimpleRunMediaSettingsDraft({ generateImages: value })}
            onWriteFeishuChange={setSimpleWriteFeishu}
            onViralImitateImagesChange={setSimpleViralImitateImages}
            onToggleViralMaterialFolder={onToggleViralMaterialFolder}
            onToggleViralMaterialPath={onToggleViralMaterialPath}
            onPreviewViralMaterial={previewViralMaterialPath}
            onClearViralMaterialPaths={() => setSimpleViralMaterialPaths([])}
            onFeishuTaskTextChange={updateSimpleFeishuTaskText}
            onViralUrlChange={setSimpleViralUrl}
            onOriginalPromptChange={setSimpleOriginalPrompt}
            onOriginalUseWebSearchChange={setSimpleOriginalUseWebSearch}
            onSettingsChange={updateWorkspaceSettingsDraft}
            onSaveSettings={() => saveWorkspaceSettingsPatch(workspaceSettings)}
            onStart={startSimpleRun}
            onTerminateRun={terminateSimpleRunFromUi}
            onSelectRun={setActiveSimpleRunId}
          />
        ) : (
          <>
        {activeModule === "materials" ? (
          <section className="studio-workspace materials-workspace">
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
              onPreviewAsset={(asset) => {
                if (asset.kind === "image") openImageGallery([asset.path], 0, asset.name, asset.path);
              }}
            />
          </section>
        ) : (
          <ProductionWorkspace
            productionSources={productionSources}
            allSources={sources}
            draftCountBySourceId={draftCountBySourceId}
            selectedSource={selectedSource}
            selectedSourceImages={selectedSourceVisualImages}
            selectedSourceImagesAreFrameFallback={selectedSourceImagesAreFrameFallback}
            selectedSourceFrames={selectedSourceFrames}
            selectedSourceFrameUrls={selectedSourceFrameUrls}
            selectedBatchSourceIds={selectedBatchSourceIds}
            selectedBatchSources={selectedBatchSources}
            productionQueueFilter={productionQueueFilter}
            productionPlatformFilter={productionPlatformFilter}
            productionSort={productionSort}
            productionMaterialPaths={productionMaterialPaths}
            materialPath={materialPath}
            post={post}
            generatedPosts={generatedPosts}
            selectedGeneratedPostId={selectedGeneratedPostId}
            selectedGeneratedPostIds={selectedGeneratedPostIds}
            selectedGeneratedPosts={selectedGeneratedPosts}
            activeBatchJob={activeBatchJob}
            batchJobs={batchJobs}
            activeStrategyDraft={activeStrategyDraft}
            activeImageTasks={activeImageTasks}
            selectedSourceCanGenerate={selectedSourceCanGenerate}
            instruction={instruction}
            imageSize={imageSize}
            imageQuality={imageQuality}
            generateImages={generateImages}
            imageUseComfyUiKlein={imageUseComfyUiKlein}
            imageDirectOriginalReference={imageDirectOriginalReference}
            includeSourceVideo={includeSourceVideo}
            workspaceSettings={workspaceSettings}
            generateProgress={generateProgress}
            batchProgress={batchProgress}
            publishStatus={publishStatus}
            feishuVehicleOptions={feishuVehicleOptions}
            feishuVehicleFieldName={feishuVehicleFieldName}
            feishuVehicleOptionsMessage={feishuVehicleOptionsMessage}
            reviewPrompt={reviewPrompt}
            busy={busy}
            onSelectSource={setSelectedSourceId}
            onToggleBatchSource={toggleBatchSource}
            onSelectVisibleBatchSources={selectVisibleBatchSources}
            onClearBatchSources={clearBatchSources}
            onQueueFilterChange={setProductionQueueFilter}
            onPlatformFilterChange={setProductionPlatformFilter}
            onProductionSortChange={setProductionSort}
            onStartBatchProduction={startBatchProduction}
            onOpenSourcePreview={openSourcePreview}
            onOpenImageGallery={openImageGallery}
            onMaterialPathChange={setMaterialPath}
            onScanMaterials={scanMaterials}
            onPlanChange={updateStrategyDraft}
            onGuidanceChange={updateStrategyGuidance}
            onToggleTask={toggleImageTask}
            onTaskChange={updateImageTask}
            onResetTasks={resetImageTasks}
            onInstructionChange={setInstruction}
            onImageSizeChange={setImageSize}
            onImageQualityChange={setImageQuality}
            onGenerateImagesChange={setGenerateImages}
            onImageUseComfyUiKleinChange={changeImageUseComfyUiKlein}
            onImageDirectOriginalReferenceChange={changeImageDirectOriginalReference}
            onIncludeSourceVideoChange={setIncludeSourceVideo}
            onWorkspaceSettingsChange={updateWorkspaceSettingsDraft}
            onSaveWorkspaceSettings={() => saveWorkspaceSettingsPatch(workspaceSettings)}
            onGenerateDraft={generateDraft}
            onSelectPost={(nextPost) => {
              setPost(nextPost);
              setSelectedGeneratedPostId(nextPost.id);
            }}
            onToggleGeneratedPostSelection={toggleGeneratedPostSelection}
            onSelectVisibleGeneratedPosts={selectVisibleGeneratedPosts}
            onClearGeneratedPostSelection={clearGeneratedPostSelection}
            onUpdateSelectedGeneratedPostStatus={updateSelectedGeneratedPostStatus}
            onDeleteSelectedGeneratedPosts={deleteSelectedGeneratedPosts}
            onPreviewPost={openDraftPreview}
            onSavePost={saveCurrentGeneratedPost}
            onDeletePost={deleteCurrentGeneratedPost}
            onRegeneratePost={regenerateCurrentPost}
            onSetPost={setPost}
            onSaveReviewPatch={saveReviewPatch}
            onGenerateImage={generateImage}
            onReviewPromptChange={setReviewPrompt}
            onPublish={publishToFeishu}
          />
        )}
          </>
        )}
        </div>

        <footer className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-xs text-white/45">
          <span>{message || "本地 MVP 已就绪"}</span>
          <span>Feishu CLI payload 会暂存到 data/feishu-outbox</span>
        </footer>
      </div>
      <PreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onNavigate={(nextIndex) =>
          setPreview((current) => {
            if (!current?.imageUrls?.length) return current;
            const normalizedIndex = (nextIndex + current.imageUrls.length) % current.imageUrls.length;
            return {
              ...current,
              imageIndex: normalizedIndex,
              imageUrl: current.imageUrls[normalizedIndex],
            };
          })
        }
      />
    </main>
  );
}

function PreviewDialog({
  preview,
  onClose,
  onNavigate,
}: {
  preview: PreviewState;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!preview?.imageUrls?.length || preview.imageUrls.length < 2) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") onNavigate((preview.imageIndex || 0) - 1);
      if (event.key === "ArrowRight") onNavigate((preview.imageIndex || 0) + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNavigate, preview]);

  if (!preview) return null;
  const links = Array.from(new Set(preview.links || [])).slice(0, 8);
  const galleryImages = preview.imageUrls?.length ? preview.imageUrls : preview.imageUrl ? [preview.imageUrl] : [];
  const galleryVideos = Array.from(new Set(preview.videoUrls || [])).filter(Boolean);
  const currentImageIndex = Math.min(Math.max(preview.imageIndex || 0, 0), Math.max(galleryImages.length - 1, 0));
  const currentImage = galleryImages[currentImageIndex] || preview.imageUrl;
  const canNavigateImages = (preview.kind === "image" || preview.kind === "draft") && galleryImages.length > 1;
  const currentImageSelected = Boolean(preview.selection && currentImage && preview.selection.selectedImageUrls.includes(currentImage));
  const currentImageSelectionDisabled = Boolean(
    preview.selection && currentImage && !currentImageSelected && preview.selection.selectedImageUrls.length >= preview.selection.maxSelected,
  );

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!canNavigateImages || touchStartX.current === null || touchStartY.current === null) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(deltaX) < 46 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    onNavigate(deltaX > 0 ? currentImageIndex - 1 : currentImageIndex + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/68 p-3 backdrop-blur-xl sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="glass-strong flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[8px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3 sm:p-4">
          <div className="min-w-0">
            <PanelTitle
              icon={preview.kind === "image" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              title={preview.title}
            />
            {preview.meta ? <p className="mt-2 truncate text-xs text-white/45">{preview.meta}</p> : null}
          </div>
          <button className="soft-button grid h-9 w-9 shrink-0 place-items-center" type="button" onClick={onClose} aria-label="关闭预览">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="thin-scrollbar overflow-y-auto p-3 sm:p-5">
          {currentImage ? (
            <div
              className={preview.kind === "draft" ? "gallery-stage draft-gallery-stage" : "gallery-stage"}
              onTouchStart={(event) => {
                touchStartX.current = event.touches[0].clientX;
                touchStartY.current = event.touches[0].clientY;
              }}
              onTouchEnd={handleTouchEnd}
            >
              {canNavigateImages ? (
                <button
                  className="gallery-nav gallery-nav-left"
                  type="button"
                  onClick={() => onNavigate(currentImageIndex - 1)}
                  aria-label="上一张图片"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="mx-auto max-h-[72dvh] w-full rounded-[8px] object-contain" referrerPolicy="no-referrer" src={toDisplayImageSrc(currentImage)} />
              {preview.selection && currentImage ? (
                <label
                  className={`gallery-selection-toggle ${currentImageSelected ? "gallery-selection-toggle-active" : ""} ${currentImageSelectionDisabled ? "gallery-selection-toggle-disabled" : ""}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    className="h-4 w-4 accent-[var(--mint)]"
                    type="checkbox"
                    checked={currentImageSelected}
                    disabled={currentImageSelectionDisabled}
                    onChange={() => preview.selection?.onToggleImage(currentImage)}
                  />
                  <span>{currentImageSelected ? "已勾选" : "勾选"}</span>
                </label>
              ) : null}
              {canNavigateImages ? (
                <button
                  className="gallery-nav gallery-nav-right"
                  type="button"
                  onClick={() => onNavigate(currentImageIndex + 1)}
                  aria-label="下一张图片"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              ) : null}
              {canNavigateImages ? (
                <span className="gallery-counter">
                  {currentImageIndex + 1} / {galleryImages.length}
                </span>
              ) : null}
            </div>
          ) : null}
          {galleryVideos.length ? (
            <div className="gallery-video-grid mt-4 grid gap-3 sm:grid-cols-2">
              {galleryVideos.map((url, index) => (
                <div key={`${url}-${index}`} className="gallery-video-tile">
                  <video className="h-full w-full rounded-[8px] bg-black object-contain" src={url} controls preload="metadata" />
                </div>
              ))}
            </div>
          ) : null}
          {preview.text ? (
            <div className="rounded-[8px] border border-white/10 bg-black/25 p-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-white/78 sm:text-base sm:leading-8">{preview.text}</p>
            </div>
          ) : null}
          {canNavigateImages ? (
            <div className="gallery-strip thin-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
              {galleryImages.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  className={`gallery-thumb ${index === currentImageIndex ? "gallery-thumb-active" : ""}`}
                  type="button"
                  onClick={() => onNavigate(index)}
                  aria-label={`查看第 ${index + 1} 张图片`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" src={toDisplayImageSrc(url)} />
                </button>
              ))}
            </div>
          ) : null}
          {links.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {links.map((url, index) => (
                <a
                  key={url}
                  className="soft-button inline-flex h-9 max-w-full items-center gap-2 px-3 text-xs"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">链接 {index + 1}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ModuleSwitcher({ activeModule, onChange }: { activeModule: ActiveModule; onChange: (module: ActiveModule) => void }) {
  return (
    <nav className="module-switcher mb-4 grid gap-2 md:grid-cols-3" aria-label="功能模块">
      {moduleOptions.map((module) => (
        <button
          key={module.value}
          className={`module-tab ${activeModule === module.value ? "module-tab-active" : ""}`}
          type="button"
          aria-pressed={activeModule === module.value}
          onClick={() => onChange(module.value)}
        >
          <span className="module-tab-icon">{module.icon}</span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-black text-white">{module.label}</span>
            <span className="mt-1 block truncate text-[11px] font-semibold text-white/45">{module.description}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}

function AccountAccessPanelV2({
  loading,
  busy,
  bootstrapRequired,
  username,
  password,
  setupPassword,
  message,
  onUsernameChange,
  onPasswordChange,
  onSetupPasswordChange,
  onSubmit,
}: {
  loading: boolean;
  busy: boolean;
  bootstrapRequired: boolean;
  username: string;
  password: string;
  setupPassword: string;
  message: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSetupPasswordChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="account-access-shell">
      <form
        className="glass account-access-panel rounded-[8px] p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <PanelTitle icon={<KeyRound className="h-4 w-4" />} title={bootstrapRequired ? "初始化管理员" : "账号登录"} />
          <span className="status-badge text-[11px] text-[var(--mint)]">{bootstrapRequired ? "Admin" : "Session"}</span>
        </div>

        <div className="mt-5 grid gap-3">
          <label className="space-y-1">
            <span className="field-label">账号</span>
            <input
              className="field"
              value={username}
              autoComplete="username"
              disabled={loading || busy}
              onChange={(event) => onUsernameChange(event.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <label className="space-y-1">
            <span className="field-label">{bootstrapRequired ? "账号密码" : "密码"}</span>
            <input
              className="field"
              type="password"
              value={password}
              autoComplete={bootstrapRequired ? "new-password" : "current-password"}
              disabled={loading || busy}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder={bootstrapRequired ? "设置管理员登录密码" : "输入个人账号密码"}
            />
          </label>
          {bootstrapRequired ? (
            <label className="space-y-1">
              <span className="field-label">初始化密钥</span>
              <input
                className="field"
                type="password"
                value={setupPassword}
                autoComplete="one-time-code"
                disabled={loading || busy}
                onChange={(event) => onSetupPasswordChange(event.target.value)}
                placeholder="WORKSPACE_ACCESS_PASSWORD"
              />
            </label>
          ) : null}
        </div>

        <button className="primary-button mt-5 flex w-full items-center justify-center gap-2" type="submit" disabled={loading || busy}>
          {loading || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {loading ? "读取账号状态" : bootstrapRequired ? "创建管理员并进入" : "进入工作台"}
        </button>
        {message ? <p className="mt-3 text-xs leading-5 text-white/58">{message}</p> : null}
      </form>
    </section>
  );
}

function AccountMenuV2({
  account,
  accounts,
  open,
  busy,
  message,
  onToggleOpen,
  onRefresh,
  onAccountsChanged,
  onLogout,
}: {
  account: WorkspaceAccount;
  accounts: WorkspaceAccount[];
  open: boolean;
  busy: boolean;
  message: string;
  onToggleOpen: () => void;
  onRefresh: () => void;
  onAccountsChanged: () => Promise<void> | void;
  onLogout: () => void;
}) {
  const [manageUsername, setManageUsername] = useState("");
  const [manageDisplayName, setManageDisplayName] = useState("");
  const [managePassword, setManagePassword] = useState("");
  const [manageRole, setManageRole] = useState<"operator" | "admin">("operator");
  const [manageMessage, setManageMessage] = useState("");
  const [manageBusy, setManageBusy] = useState(false);
  const isAdmin = account.role === "admin";

  async function submitManagedAccount(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || manageBusy) return;
    const username = manageUsername.trim().toLowerCase();
    const existing = accounts.find((item) => item.username === username);
    if (!username) {
      setManageMessage("请输入白名单用户名。");
      return;
    }
    if (!managePassword && !existing?.passwordSet) {
      setManageMessage("新账号需要设置密码。");
      return;
    }

    setManageBusy(true);
    setManageMessage("");
    try {
      const res = await fetch("/api/accounts", {
        method: existing?.passwordSet ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existing?.passwordSet ? existing.id : undefined,
          username,
          displayName: manageDisplayName,
          password: managePassword || undefined,
          role: manageRole,
          status: "active",
        }),
      });
      const data = (await res.json()) as AccountSessionResponse;
      if (!res.ok) throw new Error(data.error || "账号保存失败");
      setManagePassword("");
      setManageMessage(existing?.passwordSet ? "账号已更新。" : "账号已创建。");
      await onAccountsChanged();
    } catch (error) {
      setManageMessage(error instanceof Error ? error.message : "账号保存失败");
    } finally {
      setManageBusy(false);
    }
  }

  async function toggleManagedAccount(item: WorkspaceAccount) {
    if (!isAdmin || manageBusy || item.id === account.id || !item.passwordSet) return;
    setManageBusy(true);
    setManageMessage("");
    try {
      const res = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          status: item.status === "active" ? "disabled" : "active",
        }),
      });
      const data = (await res.json()) as AccountSessionResponse;
      if (!res.ok) throw new Error(data.error || "账号状态更新失败");
      await onAccountsChanged();
    } catch (error) {
      setManageMessage(error instanceof Error ? error.message : "账号状态更新失败");
    } finally {
      setManageBusy(false);
    }
  }

  return (
    <div className="account-menu">
      <button className="account-chip" type="button" onClick={onToggleOpen} aria-expanded={open}>
        <User className="h-3.5 w-3.5" />
        <span className="min-w-0 truncate">{account.displayName || account.username}</span>
        <span className="account-role">{account.role}</span>
      </button>
      {open ? (
        <div className="account-popover glass rounded-[8px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-white">{account.displayName || account.username}</p>
              <p className="truncate text-[11px] text-white/52">{account.username}</p>
            </div>
            <button className="icon-button" type="button" onClick={onRefresh} title="刷新账号">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-white/45">
              <Users className="h-3.5 w-3.5" />
              Accounts
            </div>
            <div className="account-list thin-scrollbar">
              {accounts.map((item) => (
                <div className="account-list-row account-list-row-managed" key={item.id}>
                  <span className="min-w-0 truncate">{item.displayName || item.username}</span>
                  <span>{item.username === account.username ? "current" : `${item.role}/${item.status}`}</span>
                  {isAdmin && item.username !== account.username ? (
                    <button
                      className="soft-button account-row-action"
                      type="button"
                      onClick={() => toggleManagedAccount(item)}
                      disabled={manageBusy || !item.passwordSet}
                    >
                      {item.status === "active" ? "停用" : "启用"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {isAdmin ? (
            <form className="account-admin-form mt-4 grid gap-2" onSubmit={submitManagedAccount}>
              <input
                className="field field-compact"
                value={manageUsername}
                onChange={(event) => setManageUsername(event.target.value)}
                placeholder="白名单用户名"
                disabled={manageBusy}
              />
              <input
                className="field field-compact"
                value={manageDisplayName}
                onChange={(event) => setManageDisplayName(event.target.value)}
                placeholder="显示名"
                disabled={manageBusy}
              />
              <input
                className="field field-compact"
                type="password"
                value={managePassword}
                onChange={(event) => setManagePassword(event.target.value)}
                placeholder="新密码 / 留空仅更新角色"
                disabled={manageBusy}
              />
              <select className="field field-compact" value={manageRole} onChange={(event) => setManageRole(event.target.value as "operator" | "admin")} disabled={manageBusy}>
                <option value="operator">成员</option>
                <option value="admin">管理员</option>
              </select>
              <button className="soft-button h-9 text-xs font-semibold" type="submit" disabled={manageBusy}>
                {manageBusy ? "处理中..." : "保存账号"}
              </button>
            </form>
          ) : null}

          {manageMessage || message ? <p className="mt-3 text-[11px] leading-5 text-white/52">{manageMessage || message}</p> : null}
          <button className="soft-button mt-3 flex h-9 w-full items-center justify-center gap-2 text-xs font-semibold" type="button" onClick={onLogout} disabled={busy || manageBusy}>
            <LogOut className="h-3.5 w-3.5" />
            退出账号
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceModeSwitcher({ mode, onChange }: { mode: WorkspaceMode; onChange: (mode: WorkspaceMode) => void }) {
  const options: Array<{ value: WorkspaceMode; label: string; description: string; icon: ReactNode }> = [
    { value: "compact", label: "精简版", description: "只发起任务，底部看总进度", icon: <Radio className="h-4 w-4" /> },
    { value: "simple", label: "简单版", description: "关键词进入，全流程自动完成", icon: <Sparkles className="h-4 w-4" /> },
    { value: "advanced", label: "高级版", description: "采集、生产、素材分模块精细控制", icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <nav className="workspace-mode-switcher mb-4" aria-label="工作模式">
      {options.map((option) => (
        <button
          key={option.value}
          className={`workspace-mode-option ${mode === option.value ? "workspace-mode-option-active" : ""}`}
          type="button"
          aria-pressed={mode === option.value}
          onClick={() => onChange(option.value)}
        >
          <span className="workspace-mode-icon">{option.icon}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black">{option.label}</span>
            <span className="mt-0.5 block truncate text-[11px] font-semibold opacity-60">{option.description}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}

function SimpleWorkspace({
  variant = "standard",
  sourceMode,
  keyword,
  targetCount,
  selectedPlatforms,
  linkText,
  linkPlatform,
  cookie,
  videoFrameOriginalReference,
  useComfyUiKlein,
  directOriginalReference,
  includeSourceVideo,
  enableVideoTranscription,
  generateImages,
  writeFeishu,
  viralImitateImages,
  viralMaterialFolders,
  activeViralMaterialFolderId,
  viralMaterialCandidates,
  selectedViralMaterialPaths,
  linkCount,
  feishuTaskText,
  feishuTaskCount,
  viralUrl,
  originalPrompt,
  originalUseWebSearch,
  config,
  materialPathCount,
  settings,
  runs,
  activeRun,
  busy,
  terminatingRunId,
  settingsBusy,
  onSourceModeChange,
  onKeywordChange,
  onTargetCountChange,
  onTogglePlatform,
  onLinkTextChange,
  onLinkPlatformChange,
  onCookieChange,
  onVideoFrameOriginalReferenceChange,
  onUseComfyUiKleinChange,
  onDirectOriginalReferenceChange,
  onIncludeSourceVideoChange,
  onEnableVideoTranscriptionChange,
  onGenerateImagesChange,
  onWriteFeishuChange,
  onViralImitateImagesChange,
  onToggleViralMaterialFolder,
  onToggleViralMaterialPath,
  onPreviewViralMaterial,
  onClearViralMaterialPaths,
  onFeishuTaskTextChange,
  onViralUrlChange,
  onOriginalPromptChange,
  onOriginalUseWebSearchChange,
  onSettingsChange,
  onSaveSettings,
  onStart,
  onTerminateRun,
  onSelectRun,
}: {
  variant?: SimpleWorkspaceVariant;
  sourceMode: SimpleSourceMode;
  keyword: string;
  targetCount: number;
  selectedPlatforms: CrawlPlatform[];
  linkText: string;
  linkPlatform: LinkImportPlatform;
  cookie: string;
  videoFrameOriginalReference: boolean;
  useComfyUiKlein: boolean;
  directOriginalReference: boolean;
  includeSourceVideo: boolean;
  enableVideoTranscription: boolean;
  generateImages: boolean;
  writeFeishu: boolean;
  viralImitateImages: boolean;
  viralMaterialFolders: ViralMaterialFolderCandidate[];
  activeViralMaterialFolderId: string;
  viralMaterialCandidates: ViralMaterialCandidate[];
  selectedViralMaterialPaths: string[];
  linkCount: number;
  feishuTaskText: string;
  feishuTaskCount: number;
  viralUrl: string;
  originalPrompt: string;
  originalUseWebSearch: boolean;
  config: ConfigStatus | null;
  materialPathCount: number;
  settings: WorkspacePromptSettings;
  runs: SimpleRun[];
  activeRun: SimpleRun | null;
  busy: boolean;
  terminatingRunId: string;
  settingsBusy: boolean;
  onSourceModeChange: (value: SimpleSourceMode) => void;
  onKeywordChange: (value: string) => void;
  onTargetCountChange: (value: number) => void;
  onTogglePlatform: (platform: CrawlPlatform) => void;
  onLinkTextChange: (value: string) => void;
  onLinkPlatformChange: (value: LinkImportPlatform) => void;
  onCookieChange: (value: string) => void;
  onVideoFrameOriginalReferenceChange: (value: boolean) => void;
  onUseComfyUiKleinChange: (value: boolean) => void;
  onDirectOriginalReferenceChange: (value: boolean) => void;
  onIncludeSourceVideoChange: (value: boolean) => void;
  onEnableVideoTranscriptionChange: (value: boolean) => void;
  onGenerateImagesChange: (value: boolean) => void;
  onWriteFeishuChange: (value: boolean) => void;
  onViralImitateImagesChange: (value: boolean) => void;
  onToggleViralMaterialFolder: (folderId: string) => void;
  onToggleViralMaterialPath: (path: string) => void;
  onPreviewViralMaterial: (path: string) => void;
  onClearViralMaterialPaths: () => void;
  onFeishuTaskTextChange: (value: string) => void;
  onViralUrlChange: (value: string) => void;
  onOriginalPromptChange: (value: string) => void;
  onOriginalUseWebSearchChange: (value: boolean) => void;
  onSettingsChange: (patch: Partial<WorkspacePromptSettings>) => void;
  onSaveSettings: () => void;
  onStart: () => void;
  onTerminateRun: (runId: string) => void;
  onSelectRun: (runId: string) => void;
}) {
  const isCompact = variant === "compact";
  const runForSummary = activeRun || runs[0] || null;
  const producedCount = runForSummary?.posts.length || 0;
  const publishedCount = runForSummary?.posts.filter((post) => post.status === "published").length || 0;
  const originalWebSearchAvailable = config?.openaiTextEndpoint === "responses";
  const selectedViralMaterialCount = selectedViralMaterialPaths.length;
  const viralImageSelectionMissing = sourceMode === "viral" && generateImages && viralImitateImages && selectedViralMaterialCount === 0;
  const selectedPlatformLabels = selectedPlatforms
    .map((value) => platforms.find((platform) => platform.value === value)?.label || value)
    .join("、");
  const sourceDetail =
    sourceMode === "feishu"
      ? `飞书 ${feishuTaskCount} 条`
      : sourceMode === "original"
        ? `原创 1 条 · ${keyword || "未填写车型"}`
      : sourceMode === "links"
        ? `链接 ${linkCount} 条`
        : `平台 ${selectedPlatformLabels || "未选择"}`;
  const canStart =
    (sourceMode === "feishu" ? feishuTaskCount > 0 : sourceMode === "original" ? Boolean(originalPrompt.trim()) && Boolean(keyword.trim()) : Boolean(keyword.trim())) &&
    (sourceMode === "feishu" ? true : sourceMode === "original" ? true : sourceMode === "viral" ? Boolean(viralUrl.trim()) : sourceMode === "links" ? linkCount > 0 : selectedPlatforms.length > 0) &&
    !viralImageSelectionMissing &&
    !(sourceMode === "original" && originalUseWebSearch && !originalWebSearchAvailable) &&
    Boolean(settings.textInstruction.trim()) &&
    (!generateImages || !getMissingImageStrategyPrompt(settings));

  return (
    <section className={`simple-workspace ${isCompact ? "simple-workspace-compact" : ""}`}>
      <aside className="glass ops-panel simple-control-panel thin-scrollbar rounded-[8px] p-4">
        <div className="flex items-center justify-between gap-3">
          <PanelTitle icon={<Sparkles className="h-4 w-4" />} title="一键内容生产" />
          <span className="status-badge text-[11px] text-[var(--mint)]">Auto</span>
        </div>

        <div className={`mt-5 space-y-4 ${isCompact ? "simple-control-grid" : ""}`}>
          <div className="simple-source-mode-toggle" role="group" aria-label="简单版来源方式">
            <button
              className={`soft-button flex h-10 items-center justify-center gap-2 text-xs font-semibold ${sourceMode === "keyword" ? "platform-card-active" : ""}`}
              type="button"
              aria-pressed={sourceMode === "keyword"}
              onClick={() => onSourceModeChange("keyword")}
              disabled={busy || settingsBusy}
            >
              <Search className="h-3.5 w-3.5" />
              关键词采集
            </button>
            <button
              className={`soft-button flex h-10 items-center justify-center gap-2 text-xs font-semibold ${sourceMode === "links" ? "platform-card-active" : ""}`}
              type="button"
              aria-pressed={sourceMode === "links"}
              onClick={() => onSourceModeChange("links")}
              disabled={busy || settingsBusy}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              批量导入链接
            </button>
            <button
              className={`soft-button flex h-10 items-center justify-center gap-2 text-xs font-semibold ${sourceMode === "feishu" ? "platform-card-active" : ""}`}
              type="button"
              aria-pressed={sourceMode === "feishu"}
              onClick={() => onSourceModeChange("feishu")}
              disabled={busy || settingsBusy}
            >
              <FileText className="h-3.5 w-3.5" />
              飞书编号
            </button>
            <button
              className={`soft-button flex h-10 items-center justify-center gap-2 text-xs font-semibold ${sourceMode === "viral" ? "platform-card-active" : ""}`}
              type="button"
              aria-pressed={sourceMode === "viral"}
              onClick={() => onSourceModeChange("viral")}
              disabled={busy || settingsBusy}
            >
              <Sparkles className="h-3.5 w-3.5" />
              爆款仿写
            </button>
            <button
              className={`soft-button flex h-10 items-center justify-center gap-2 text-xs font-semibold ${sourceMode === "original" ? "platform-card-active" : ""}`}
              type="button"
              aria-pressed={sourceMode === "original"}
              onClick={() => onSourceModeChange("original")}
              disabled={busy || settingsBusy}
            >
              <Wand2 className="h-3.5 w-3.5" />
              原创
            </button>
          </div>

          {sourceMode === "feishu" ? null : (
          <div>
            <FieldLabel label={sourceMode === "links" ? "归属关键词 / 内容池项目" : sourceMode === "original" ? "写入飞书车型 / 关键词" : "关键词"} />
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                className="field search-field"
                value={keyword}
                onChange={(event) => onKeywordChange(event.target.value)}
                placeholder={sourceMode === "links" ? "例如：小鹏GX 链接导入" : sourceMode === "original" ? "例如：小鹏GX，需要与飞书车型选项一致" : "例如：小鹏GX"}
              />
            </div>
          </div>
          )}

          <div>
            <FieldLabel label={sourceMode === "keyword" ? "抓取数量" : "生产上限"} />
            <input
              className="field mt-2"
              min={1}
              max={sourceMode === "feishu" ? Math.max(1, feishuTaskCount || 1) : sourceMode === "viral" || sourceMode === "original" ? 1 : sourceMode === "links" ? Math.max(1, linkCount || 1) : 500}
              type="number"
              value={sourceMode === "original" ? 1 : targetCount}
              onChange={(event) => onTargetCountChange(Number(event.target.value))}
              disabled={sourceMode === "original" || busy || settingsBusy}
            />
          </div>

          {sourceMode === "original" ? (
            <div className="simple-link-panel">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <FieldLabel label="原创 Prompt" />
                <span className="status-badge text-[10px] text-white/45">1 条</span>
              </div>
              <textarea
                className="field simple-link-textarea"
                value={originalPrompt}
                onChange={(event) => onOriginalPromptChange(event.target.value)}
                placeholder="输入选题、提问或要求，例如：围绕小鹏G6智驾体验，写一篇适合小红书发布的种草图文"
                disabled={busy || settingsBusy}
              />
              <label className="mt-3 flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                <input
                  className="mt-1 h-4 w-4 accent-[var(--mint)]"
                  type="checkbox"
                  checked={originalUseWebSearch}
                  onChange={(event) => onOriginalUseWebSearchChange(event.target.checked)}
                  disabled={busy || settingsBusy || !originalWebSearchAvailable}
                />
                <span className="min-w-0">启用联网搜索</span>
              </label>
              {!originalWebSearchAvailable ? (
                <p className="mt-2 text-[11px] leading-5 text-white/42">需配置 OPENAI_TEXT_ENDPOINT=responses 后启用原创联网搜索。</p>
              ) : null}
            </div>
          ) : sourceMode === "viral" ? (
            <div className="simple-link-panel">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <FieldLabel label="爆款图文链接" />
                <span className="status-badge text-[10px] text-white/45">1 条</span>
              </div>
              <input
                className="field"
                value={viralUrl}
                onChange={(event) => onViralUrlChange(event.target.value)}
                placeholder="粘贴 1 条小红书、抖音、微博、视频号或汽车社区爆款链接"
                disabled={busy || settingsBusy}
              />
              <label className="mt-3 flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                <input
                  className="mt-1 h-4 w-4 accent-[var(--mint)]"
                  type="checkbox"
                  checked={viralImitateImages}
                  onChange={(event) => onViralImitateImagesChange(event.target.checked)}
                  disabled={busy || settingsBusy}
                />
                <span className="min-w-0">模仿爆款图片</span>
              </label>
              {viralImitateImages ? (
                <p className="mt-2 text-[11px] leading-5 text-white/45">
                  按素材顺序使用车型图作为图1，爆款源图作为图2，上传/导入几张就生成几张，最多 9 张。
                </p>
              ) : null}
              {viralImitateImages ? (
                <div className="mt-3 rounded-[8px] border border-white/10 bg-black/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-black text-white/72">车型图选择</p>
                      <p className="mt-1 text-[10px] leading-4 text-white/45">
                        按选中顺序配对：车型图为图1，爆款源图为图2，最多 {maxSimpleImageTasksPerPost} 张。
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="status-badge text-[10px] text-white/45">
                        {selectedViralMaterialCount}/{maxSimpleImageTasksPerPost}
                      </span>
                      <button className="soft-button h-8 px-2 text-[10px]" type="button" onClick={onClearViralMaterialPaths} disabled={busy || settingsBusy || !selectedViralMaterialCount}>
                        清空
                      </button>
                    </div>
                  </div>
                  {viralImageSelectionMissing ? <p className="mt-2 text-[11px] leading-5 text-[var(--amber)]">请选择至少 1 张车型图用于图片模仿</p> : null}
                  {viralMaterialFolders.length ? (
                    <div className="mt-3">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">车型库文件夹</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {viralMaterialFolders.map((folder) => {
                          const selected = folder.selectedCount > 0 && folder.selectedCount === folder.imageCount;
                          const active = folder.id === activeViralMaterialFolderId;
                          const disabled = busy || settingsBusy;
                          return (
                            <button
                              key={folder.id}
                              className={`rounded-[8px] border p-2 text-left transition ${
                                selected || active ? "border-[var(--mint)] bg-[var(--mint)]/10" : "border-white/10 bg-white/[0.035] hover:border-white/20"
                              } ${disabled ? "opacity-55" : ""}`}
                              type="button"
                              onClick={() => onToggleViralMaterialFolder(folder.id)}
                              disabled={disabled}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-[7px] ${selected || active ? "bg-[var(--mint)] text-black" : "bg-white/10 text-white/45"}`}>
                                  <FolderOpen className="h-3.5 w-3.5" />
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black text-white">{folder.name}</p>
                                  <p className="mt-1 text-[10px] text-white/42">
                                    {folder.selectedCount}/{folder.imageCount} images
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div className="thin-scrollbar mt-3 max-h-56 space-y-2 overflow-y-auto">
                    {viralMaterialCandidates.length ? (
                      viralMaterialCandidates.map((asset) => {
                        const selectedIndex = selectedViralMaterialPaths.indexOf(asset.path);
                        const selected = selectedIndex >= 0;
                        const disabled = busy || settingsBusy || (!selected && selectedViralMaterialCount >= maxSimpleImageTasksPerPost);
                        return (
                          <button
                            key={asset.id}
                            className={`w-full rounded-[8px] border p-2 text-left transition ${
                              selected ? "border-[var(--mint)] bg-[var(--mint)]/10" : "border-white/10 bg-white/[0.035] hover:border-white/20"
                            } ${disabled ? "opacity-55" : ""}`}
                            type="button"
                            onClick={() => onToggleViralMaterialPath(asset.path)}
                            disabled={disabled}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-[11px] font-black ${selected ? "bg-[var(--mint)] text-black" : "bg-white/10 text-white/45"}`}>
                                {selected ? selectedIndex + 1 : <ImageIcon className="h-3.5 w-3.5" />}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-black text-white">{asset.name}</p>
                                <p className="mt-1 truncate text-[10px] text-white/42">
                                  {asset.sourceLabel} · {formatCompactPath(asset.path)}
                                </p>
                              </div>
                              <span
                                className="soft-button ml-auto grid h-8 w-8 shrink-0 place-items-center"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onPreviewViralMaterial(asset.path);
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label="预览车型图"
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </span>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="empty-state min-h-0 p-4 text-xs leading-5 text-white/50">暂无可选图片，请先扫描本地素材或在素材库导入车型图。</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : sourceMode === "links" ? (
            <div className="simple-link-panel">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <FieldLabel label="批量链接" />
                <span className="status-badge text-[10px] text-white/45">{linkCount} 条</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                <textarea
                  className="field simple-link-textarea"
                  value={linkText}
                  onChange={(event) => onLinkTextChange(event.target.value)}
                  placeholder="每行一个小红书、抖音、微博或视频号链接"
                  disabled={busy || settingsBusy}
                />
                <div>
                  <FieldLabel label="平台识别" />
                  <select
                    className="field mt-2"
                    value={linkPlatform}
                    onChange={(event) => onLinkPlatformChange(event.target.value as LinkImportPlatform)}
                    disabled={busy || settingsBusy}
                  >
                    <option value="auto">自动识别</option>
                    {linkImportPlatforms.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {linkPlatform === "dongchedi" ? (
                <div className="mt-3">
                  <FieldLabel label="Cookie" />
                  <textarea
                    className="field mt-2 min-h-16 resize-none"
                    value={cookie}
                    onChange={(event) => onCookieChange(event.target.value)}
                    disabled={busy || settingsBusy}
                  />
                </div>
              ) : null}
              <label className="mt-3 flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                <input
                  className="mt-1 h-4 w-4 accent-[var(--mint)]"
                  type="checkbox"
                  checked={videoFrameOriginalReference}
                  onChange={(event) => onVideoFrameOriginalReferenceChange(event.target.checked)}
                  disabled={busy || settingsBusy}
                />
                <span className="min-w-0">视频高光帧原图引用</span>
              </label>
            </div>
          ) : sourceMode === "feishu" ? (
            <div className="simple-link-panel">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <FieldLabel label="飞书任务编号" />
                <span className="status-badge text-[10px] text-white/45">{feishuTaskCount} 条</span>
              </div>
              <textarea
                className="field simple-link-textarea"
                value={feishuTaskText}
                onChange={(event) => onFeishuTaskTextChange(event.target.value)}
                placeholder="每行一个任务编号，也可以用逗号、空格或分号分隔"
                disabled={busy || settingsBusy}
              />
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <FieldLabel label="采集平台" />
                <span className="status-badge text-[10px] text-white/45">{selectedPlatforms.length} 个</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {crawlPlatforms.map((item) => {
                  const active = selectedPlatforms.includes(item.value);
                  return (
                    <button
                      key={item.value}
                      className={`platform-card soft-button flex h-12 items-center gap-2 px-3 ${active ? "platform-card-active" : ""}`}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onTogglePlatform(item.value)}
                      disabled={busy || settingsBusy}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${item.accent}`} />
                      <span className="truncate text-xs font-semibold">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <label className="flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
              <input
                className="mt-1 h-4 w-4 accent-[var(--mint)]"
                type="checkbox"
                checked={generateImages}
                onChange={(event) => onGenerateImagesChange(event.target.checked)}
                disabled={busy || settingsBusy}
              />
              <span className="min-w-0">图片生成</span>
            </label>
          {sourceMode !== "viral" && sourceMode !== "original" ? (
            <>
              <label className="flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                <input
                  className="mt-1 h-4 w-4 accent-[var(--mint)]"
                  type="checkbox"
                  checked={useComfyUiKlein}
                  onChange={(event) => onUseComfyUiKleinChange(event.target.checked)}
                  disabled={busy || settingsBusy}
                />
                <span className="min-w-0">启用本地 Klein 模型</span>
              </label>
              <label className="flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                <input
                  className="mt-1 h-4 w-4 accent-[var(--mint)]"
                  type="checkbox"
                  checked={directOriginalReference}
                  onChange={(event) => onDirectOriginalReferenceChange(event.target.checked)}
                  disabled={busy || settingsBusy}
                />
                <span className="min-w-0">直接引用原图</span>
              </label>
              <label className="flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                <input
                  className="mt-1 h-4 w-4 accent-[var(--mint)]"
                  type="checkbox"
                  checked={includeSourceVideo}
                  onChange={(event) => onIncludeSourceVideoChange(event.target.checked)}
                  disabled={busy || settingsBusy}
                />
                <span className="min-w-0">引用源视频素材</span>
              </label>
              <label className="flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                <input
                  className="mt-1 h-4 w-4 accent-[var(--mint)]"
                  type="checkbox"
                  checked={enableVideoTranscription}
                  onChange={(event) => onEnableVideoTranscriptionChange(event.target.checked)}
                  disabled={busy || settingsBusy}
                />
                <span className="min-w-0">启用视频音频转文字</span>
              </label>
            </>
          ) : null}
          </div>

          <label className="simple-write-feishu-row">
            <input
              className="h-4 w-4 accent-[var(--mint)]"
              type="checkbox"
              checked={writeFeishu}
              onChange={(event) => onWriteFeishuChange(event.target.checked)}
              disabled={busy || settingsBusy}
            />
            <span className="min-w-0">
              <span className="block text-xs font-black text-white">写入飞书</span>
              <span className="mt-1 block text-[11px] leading-5 text-white/50">
                {writeFeishu ? "生成后自动审查通过并排队写入飞书。" : "只生成本地草稿，稍后到内容审查台人工确认。"}
              </span>
            </span>
          </label>

          <div className="simple-policy-preview">
            <div className="flex items-center justify-between gap-3">
              <PanelTitle icon={<Lightbulb className="h-4 w-4" />} title="提示词与图片策略" />
              <span className="status-badge text-[10px] text-[var(--mint)]">可自定义</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/52">默认提示词已填好；你可以直接改成本次任务的口径，也可以保存成高级版和简单版共用的默认策略。</p>

            <div className="simple-prompt-stack">
              <div className="simple-prompt-block">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel label="文字内容提示词" />
                  <button
                    className="prompt-reset-button"
                    type="button"
                    onClick={() => onSettingsChange({ textInstruction: defaultTextInstruction })}
                    disabled={busy || settingsBusy}
                  >
                    使用默认
                  </button>
                </div>
                <textarea
                  className="field simple-prompt-textarea"
                  aria-label="简单版文字内容提示词"
                  value={settings.textInstruction}
                  onChange={(event) => onSettingsChange({ textInstruction: event.target.value })}
                  disabled={busy || settingsBusy}
                />
              </div>

              <ImageStrategyPromptEditor
                settings={settings}
                disabled={busy || settingsBusy}
                compact
                onChange={onSettingsChange}
              />

              <div className="simple-prompt-block">
                <FieldLabel label="图片生成尺寸" />
                <ImageSizeInput
                  className="field mt-2 h-10 text-xs"
                  value={settings.imageSize}
                  onChange={(value) => onSettingsChange({ imageSize: value })}
                  disabled={busy || settingsBusy}
                  ariaLabel="简单版图片生成尺寸"
                  listId="compact-image-size-presets"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="status-badge text-[10px] text-white/52">{settings.imageSize}</span>
              <span className="status-badge text-[10px] text-white/52">{settings.imageQuality}</span>
              <span className="status-badge text-[10px] text-white/52">素材 {materialPathCount} 个</span>
              <span className="status-badge text-[10px] text-white/52">最多 9 张图 / 帧</span>
            </div>

            <button
              className="soft-button mt-3 flex h-10 w-full items-center justify-center gap-2 text-xs font-semibold"
              type="button"
              onClick={onSaveSettings}
              disabled={busy || settingsBusy || !settings.textInstruction.trim() || (generateImages && Boolean(getMissingImageStrategyPrompt(settings)))}
            >
              {settingsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {settingsBusy ? "正在保存提示词" : "保存当前提示词为默认"}
            </button>
          </div>

          <button
            className="primary-button flex h-12 w-full items-center justify-center gap-2"
            type="button"
            onClick={onStart}
            disabled={busy || settingsBusy || !canStart}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : sourceMode === "feishu" ? (
              <FileText className="h-4 w-4" />
            ) : sourceMode === "links" ? (
              <UploadCloud className="h-4 w-4" />
            ) : sourceMode === "original" ? (
              <Wand2 className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {busy
              ? "正在自动执行"
              : sourceMode === "feishu"
                ? writeFeishu ? "导入飞书并一键生产写入" : "导入飞书并生成待审查内容"
                : sourceMode === "links"
                  ? writeFeishu ? "导入链接并一键生产写入" : "导入链接并生成待审查内容"
                  : sourceMode === "original"
                    ? writeFeishu ? "生成原创并写入飞书" : "生成原创待审查"
                    : writeFeishu ? "开始全自动生产并写入飞书" : "开始生产待审查内容"}
          </button>
        </div>

        {!isCompact && busy ? (
          <TaskProgressCard
            className="mt-4"
            progress={{
              title: "简单版自动流程",
              label: "后端正在顺序执行",
              detail: formatSimpleRunPipelineDetail(sourceMode, sourceDetail, writeFeishu, generateImages),
              value: 48,
              status: "running",
              total: targetCount,
              completed: 0,
            }}
          />
        ) : null}
      </aside>

      {isCompact ? (
        <SimpleOverallProgressBar
          runs={runs}
          activeRun={runForSummary}
          busy={busy}
          terminatingRunId={terminatingRunId}
          sourceDetail={sourceDetail}
          targetCount={targetCount}
          onTerminateRun={onTerminateRun}
          onSelectRun={onSelectRun}
        />
      ) : (
        <section className="glass-strong ops-panel simple-run-panel thin-scrollbar rounded-[8px] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <PanelTitle icon={<Terminal className="h-4 w-4" />} title="自动任务执行状态" />
              <p className="mt-2 text-xs leading-5 text-white/52">
                简单版会把采集、AI 打标、图文生成、飞书入库串成一个任务；完成后可在高级版继续复核和二次编辑。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
              <PoolMetric label="抓取" value={runForSummary ? runForSummary.platformResults.reduce((sum, item) => sum + item.crawled, 0) : 0} />
              <PoolMetric label="生成" value={producedCount} />
              <PoolMetric label="发布" value={publishedCount} />
            </div>
          </div>

        {runForSummary ? (
          <div className="mt-5 grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="space-y-4">
              <article className="simple-run-summary">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-white">{runForSummary.input.keyword}</p>
                    <p className="mt-1 text-xs text-white/45">
                      {formatShortTime(runForSummary.createdAt)} · {formatSimpleRunSource(runForSummary)} · {runForSummary.input.targetCount} 条 · {formatSimpleRunStatus(runForSummary.status)}
                    </p>
                  </div>
                  <div className="simple-run-summary-actions">
                    <span className={`status-badge text-[11px] ${getSimpleRunStatusClass(runForSummary.status)}`}>
                      {formatSimpleRunStatus(runForSummary.status)}
                    </span>
                    {canForceTerminateSimpleRun(runForSummary) ? (
                      <button
                        className="simple-force-terminate-button"
                        type="button"
                        onClick={() => onTerminateRun(runForSummary.id)}
                        disabled={terminatingRunId === runForSummary.id}
                      >
                        {terminatingRunId === runForSummary.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        强制终止
                      </button>
                    ) : null}
                  </div>
                </div>

                {runForSummary.viralResult?.pairingNotice ? (
                  <p className="mt-3 rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 text-white/58">
                    {runForSummary.viralResult.pairingNotice}
                  </p>
                ) : null}

                <div className="simple-stage-list mt-4">
                  {runForSummary.stages.map((stage) => (
                    <SimpleRunStageCard key={stage.id} stage={stage} />
                  ))}
                </div>
              </article>

              <article className="content-cluster">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <PanelTitle icon={<Bot className="h-4 w-4" />} title="生成结果" />
                  <span className="status-badge text-[11px] text-white/52">{runForSummary.posts.length} 条图文</span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {runForSummary.posts.length ? (
                    runForSummary.posts.map((post) => (
                      <article key={post.postId} className="simple-post-result">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-black text-white">{post.title || post.postId}</p>
                            <p className="mt-1 text-[11px] text-white/45">
                              {platforms.find((item) => item.value === post.platform)?.label || post.platform} · {post.imageCount} 张图 · {formatReviewStatus(post.status)}
                            </p>
                          </div>
                          <span className="status-badge shrink-0 text-[10px] text-[var(--mint)]">稿</span>
                        </div>
                        <TagChipRow tags={post.contentTags} compact />
                        {post.error ? <p className="mt-2 text-[11px] leading-5 text-[var(--amber)]">{post.error}</p> : null}
                      </article>
                    ))
                  ) : (
                    <EmptyState title="还没有生成结果" icon={<Bot className="h-5 w-5" />} />
                  )}
                </div>
              </article>
            </div>

            <aside className="space-y-4">
              <article className="content-cluster">
                <PanelTitle icon={<BarChart3 className="h-4 w-4" />} title={isSimpleLinkRun(runForSummary) || isSimpleFeishuRun(runForSummary) || isSimplePoolRun(runForSummary) ? "来源结果" : "平台结果"} />
                <div className="mt-3 space-y-2">
                  {runForSummary.platformResults.length ? (
                    runForSummary.platformResults.map((result) => (
                      <div key={result.platform} className="simple-platform-row">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-white">{platforms.find((item) => item.value === result.platform)?.label || result.platform}</p>
                          <p className="mt-1 text-[11px] text-white/42">
                            请求 {result.requested} · 抓取 {result.crawled} · 安全过滤 {result.filteredUnsafe || 0} · 文本标签 {result.taggedContent} · 图片标签 {result.taggedVisual}
                          </p>
                        </div>
                        {result.error ? <span className="status-badge text-[10px] text-[var(--amber)]">异常</span> : <span className="status-badge text-[10px] text-[var(--mint)]">完成</span>}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs leading-5 text-white/45">等待平台结果。</p>
                  )}
                </div>
              </article>

              {runForSummary.linkResults?.length ? (
              <article className="content-cluster">
                <PanelTitle icon={<UploadCloud className="h-4 w-4" />} title="链接结果" />
                <div className="mt-3 space-y-2">
                  {runForSummary.linkResults.slice(0, 10).map((result, index) => (
                    <div key={`${result.url}-${index}`} className="simple-platform-row">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-white">{result.title || result.sourceId || result.url}</p>
                        <p className="mt-1 truncate text-[11px] text-white/42">
                          {result.platform ? platforms.find((item) => item.value === result.platform)?.label || result.platform : "未知平台"} · {result.error || result.url}
                        </p>
                      </div>
                      <span className={`status-badge shrink-0 text-[10px] ${getSimpleLinkStatusClass(result.status)}`}>
                        {formatSimpleLinkStatus(result.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
              ) : null}

              {runForSummary.feishuResults?.length ? (
              <article className="content-cluster">
                <PanelTitle icon={<FileText className="h-4 w-4" />} title="飞书导入结果" />
                <div className="mt-3 space-y-2">
                  {runForSummary.feishuResults.slice(0, 12).map((result, index) => (
                    <div key={`${result.taskNumber}-${index}`} className="simple-platform-row">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-white">{result.title || result.taskNumber}</p>
                        <p className="mt-1 truncate text-[11px] text-white/42">
                          任务 {result.taskNumber}
                          {result.vehicle ? ` · ${result.vehicle}` : ""}
                          {typeof result.materialCount === "number" ? ` · 素材 ${result.materialCount}` : ""}
                          {result.error ? ` · ${result.error}` : ""}
                        </p>
                      </div>
                      <span className={`status-badge shrink-0 text-[10px] ${getSimpleFeishuStatusClass(result.status)}`}>
                        {formatSimpleFeishuStatus(result.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
              ) : null}

              <article className="content-cluster">
                <PanelTitle icon={<UploadCloud className="h-4 w-4" />} title="飞书写入" />
                <p className="mt-3 text-xs leading-6 text-white/62">
                  {runForSummary.publish?.message || "生成完成后会自动提交到飞书多维表格，并把内容标签写入“内容标签”字段。"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`status-badge text-[11px] ${getSimplePublishStatusClass(runForSummary.publish?.status)}`}>
                    {formatSimplePublishStatus(runForSummary.publish?.status)}
                  </span>
                  {runForSummary.publish?.notificationStatus ? (
                    <span className="status-badge text-[11px] text-white/52">通知 {runForSummary.publish.notificationStatus}</span>
                  ) : null}
                </div>
              </article>

              <article className="content-cluster">
                <PanelTitle icon={<Clock3 className="h-4 w-4" />} title="最近任务" />
                <div className="mt-3 space-y-2">
                  {runs.slice(0, 8).map((run) => (
                    <button
                      key={run.id}
                      className={`simple-history-row ${runForSummary.id === run.id ? "simple-history-row-active" : ""}`}
                      type="button"
                      onClick={() => onSelectRun(run.id)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black">{run.input.keyword}</span>
                        <span className="mt-1 block truncate text-[11px] opacity-55">
                          {formatShortTime(run.createdAt)} · {formatSimpleRunSource(run)} · {run.posts.length} 条
                        </span>
                      </span>
                      <span className={`status-badge shrink-0 text-[10px] ${getSimpleRunStatusClass(run.status)}`}>
                        {formatSimpleRunStatus(run.status)}
                      </span>
                    </button>
                  ))}
                </div>
              </article>
            </aside>
          </div>
        ) : (
          <EmptyState title="输入关键词后开始第一条自动任务" icon={<Sparkles className="h-5 w-5" />} />
        )}
        </section>
      )}
    </section>
  );
}

function SimpleOverallProgressBar({
  runs,
  activeRun,
  busy,
  terminatingRunId,
  sourceDetail,
  targetCount,
  onTerminateRun,
  onSelectRun,
}: {
  runs: SimpleRun[];
  activeRun: SimpleRun | null;
  busy: boolean;
  terminatingRunId: string;
  sourceDetail: string;
  targetCount: number;
  onTerminateRun: (runId: string) => void;
  onSelectRun: (runId: string) => void;
}) {
  const progressRuns = buildSimpleOverallProgressRuns(runs, activeRun);
  const singleRun = progressRuns[0] || activeRun;
  const isMultiRun = progressRuns.length > 1;
  const summary = isMultiRun
    ? buildSimpleOverallProgressSummaryForRuns(progressRuns)
    : buildSimpleOverallProgressSummary(singleRun, busy, sourceDetail, targetCount);
  const toneClass = `simple-overall-progress-${summary.tone}`;
  const showTerminate = !isMultiRun && canForceTerminateSimpleRun(singleRun);

  return (
    <section className={`simple-overall-progress glass-strong ${toneClass} ${isMultiRun ? "simple-overall-progress-multi" : ""}`} aria-label="简单版整体进度">
      <div className="simple-overall-progress-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="simple-overall-progress-icon">
            {summary.tone === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : summary.tone === "error" ? (
              <X className="h-4 w-4" />
            ) : summary.tone === "success" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Clock3 className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">{summary.title}</p>
            <p className="mt-1 truncate text-[11px] font-semibold text-white/52">{summary.label}</p>
          </div>
        </div>

        <div className="simple-overall-side">
          {showTerminate && singleRun ? (
            <button
              className="simple-force-terminate-button simple-force-terminate-button-compact"
              type="button"
              onClick={() => onTerminateRun(singleRun.id)}
              disabled={terminatingRunId === singleRun.id}
            >
              {terminatingRunId === singleRun.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              强制终止
            </button>
          ) : null}
          <div className="simple-overall-metrics" aria-label="任务结果概览">
            <span>
              <strong>{summary.crawled}</strong>
              <em>抓取</em>
            </span>
            <span>
              <strong>{summary.produced}</strong>
              <em>生成</em>
            </span>
            <span>
              <strong>{summary.published}</strong>
              <em>发布</em>
            </span>
          </div>
        </div>
      </div>

      {isMultiRun ? (
        <div className="simple-overall-run-list thin-scrollbar" aria-label="简单版多任务进度">
          {progressRuns.map((progressRun) => {
            const runSummary = buildSimpleOverallProgressSummary(progressRun, false, sourceDetail, progressRun.input.targetCount);
            const isActive = progressRun.id === activeRun?.id;
            const rowCanTerminate = canForceTerminateSimpleRun(progressRun);
            return (
              <article key={progressRun.id} className={`simple-overall-run-row ${isActive ? "simple-overall-run-row-active" : ""}`}>
                <button
                  className="simple-overall-run-select"
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSelectRun(progressRun.id)}
                >
                  <span className="simple-overall-run-heading">
                    <span className="simple-overall-run-title">{progressRun.input.keyword || progressRun.id}</span>
                    <span className={`status-badge shrink-0 text-[10px] ${getSimpleRunStatusClass(progressRun.status)}`}>
                      {formatSimpleRunStatus(progressRun.status)}
                    </span>
                  </span>
                  <span className="simple-overall-run-meta">
                    {formatSimpleRunSource(progressRun)} · {runSummary.label}
                  </span>
                  <span className="simple-overall-run-track" aria-hidden="true">
                    <span style={{ width: `${runSummary.value}%` }} />
                  </span>
                </button>
                <span className="simple-overall-run-percent">{runSummary.value}%</span>
                {rowCanTerminate ? (
                  <button
                    className="simple-overall-run-stop"
                    type="button"
                    title="强制终止"
                    aria-label={`强制终止 ${progressRun.input.keyword || progressRun.id}`}
                    onClick={() => onTerminateRun(progressRun.id)}
                    disabled={terminatingRunId === progressRun.id}
                  >
                    {terminatingRunId === progressRun.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <div
        className="simple-overall-track"
        role="progressbar"
        aria-label="整体进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.value}
      >
        <span style={{ width: `${summary.value}%` }} />
      </div>

      <div className="simple-overall-progress-foot">
        <span className="min-w-0 truncate">{summary.detail}</span>
        <span className="shrink-0 font-black tabular-nums">{summary.value}%</span>
      </div>
    </section>
  );
}

function SimpleRunStageCard({ stage }: { stage: SimpleRun["stages"][number] }) {
  const finished = stage.completed + stage.failed + stage.skipped;
  const value = stage.total ? Math.round((finished / stage.total) * 100) : stage.status === "queued" ? 0 : 100;
  const statusClass = getSimpleStageStatusClass(stage.status);

  return (
    <div className="simple-stage-card">
      <div className="simple-stage-card-heading">
        <p className="text-sm font-black text-white">{stage.title}</p>
        <p className={`mt-1 text-[11px] font-semibold ${statusClass}`}>{formatSimpleStageStatus(stage.status)}</p>
      </div>
      <div className="simple-stage-card-track">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${stage.status === "error" ? "bg-[var(--rose)]" : stage.status === "warning" ? "bg-[var(--amber)]" : "bg-[var(--mint)]"}`} style={{ width: `${clampProgressValue(value)}%` }} />
        </div>
        <p className="simple-stage-card-message">{stage.message || `${finished}/${stage.total || 0}`}</p>
      </div>
      <span className="simple-stage-card-percent">{clampProgressValue(value)}%</span>
    </div>
  );
}

function ImageStrategyPromptEditor({
  settings,
  disabled,
  compact = false,
  onChange,
}: {
  settings: WorkspacePromptSettings;
  disabled: boolean;
  compact?: boolean;
  onChange: (patch: Partial<WorkspacePromptSettings>) => void;
}) {
  const prompts = {
    ...defaultImageStrategyPrompts,
    ...settings.imageStrategyPrompts,
  };

  function updatePrompt(key: keyof ImageStrategyPrompts, value: string) {
    const nextPrompts = {
      ...prompts,
      [key]: value,
    };
    onChange({
      imageStrategyPrompts: nextPrompts,
      imageWashPrompt: nextPrompts.textImage,
    });
  }

  return (
    <div className={`image-strategy-editor ${compact ? "image-strategy-editor-compact" : ""}`}>
      <div className="image-strategy-rule-card">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="status-badge text-[10px] text-[var(--mint)]">APP / 应用界面</span>
          <span className="status-badge text-[10px] text-[var(--mint)]">内饰空间</span>
          <span className="status-badge text-[10px] text-white/52">原图引用</span>
          <span className="status-badge text-[10px] text-white/52">不调用图片模型</span>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-white/52">{imageReferenceSizeInstruction}</p>
      </div>

      <div className="image-strategy-prompt-grid">
        {imageStrategyPromptOptions.map((option) => (
          <div key={option.key} className="simple-prompt-block image-strategy-prompt-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <FieldLabel label={`${option.title}提示词`} />
                <p className="mt-1 text-[11px] leading-5 text-white/45">{option.strategy}</p>
              </div>
              <button
                className="prompt-reset-button"
                type="button"
                onClick={() => updatePrompt(option.key, option.defaultPrompt)}
                disabled={disabled}
              >
                使用默认
              </button>
            </div>
            <textarea
              className="field simple-prompt-textarea simple-prompt-textarea-tall"
              aria-label={`${option.title}图片处理提示词`}
              value={prompts[option.key]}
              onChange={(event) => updatePrompt(option.key, event.target.value)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkspaceDefaultsPanel({
  settings,
  busy,
  onChange,
  onSave,
}: {
  settings: WorkspacePromptSettings;
  busy: boolean;
  onChange: (patch: Partial<WorkspacePromptSettings>) => void;
  onSave: () => void;
}) {
  return (
    <div className="content-cluster">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PanelTitle icon={<Lightbulb className="h-4 w-4" />} title="默认生产策略" />
        <span className="status-badge text-[11px] text-white/52">同步简单版</span>
      </div>
      <div className="mt-3">
        <FieldLabel label="简单版默认文案提示词" />
        <textarea
          className="field mt-2 min-h-24 resize-none"
          value={settings.textInstruction}
          onChange={(event) => onChange({ textInstruction: event.target.value })}
        />
      </div>
      <ImageStrategyPromptEditor settings={settings} disabled={busy} onChange={onChange} />
      <div className="production-setting-grid mt-3">
        <div className="production-setting-summary">
          <p className="text-[11px] font-semibold text-white/58">图片策略</p>
          <p className="mt-1 text-[11px] leading-5 text-white/42">简单版会根据 GPT 图片标签自动选择原图引用或对应洗图提示词。</p>
        </div>
        <ImageSizeInput value={settings.imageSize} onChange={(value) => onChange({ imageSize: value })} listId="workspace-image-size-presets" />
        <select
          className="field h-10 text-xs"
          value={settings.imageQuality}
          onChange={(event) => onChange({ imageQuality: event.target.value as ImageGenerationQuality })}
        >
          {imageQualityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button className="soft-button mt-3 flex h-10 w-full items-center justify-center gap-2 text-xs font-semibold" type="button" onClick={onSave} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        保存为简单版默认策略
      </button>
    </div>
  );
}

function ImageSizeInput({
  value,
  onChange,
  disabled,
  ariaLabel = "图片尺寸",
  listId,
  className = "field h-10 text-xs",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  listId: string;
  className?: string;
}) {
  return (
    <>
      <input
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        placeholder="1024x1536"
        list={listId}
        inputMode="text"
      />
      <datalist id={listId}>
        {imageGenerationSizeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </datalist>
    </>
  );
}

function ProductionWorkspace({
  productionSources,
  allSources,
  draftCountBySourceId,
  selectedSource,
  selectedSourceImages,
  selectedSourceImagesAreFrameFallback,
  selectedSourceFrames,
  selectedSourceFrameUrls,
  selectedBatchSourceIds,
  selectedBatchSources,
  productionQueueFilter,
  productionPlatformFilter,
  productionSort,
  productionMaterialPaths,
  materialPath,
  post,
  generatedPosts,
  selectedGeneratedPostId,
  selectedGeneratedPostIds,
  selectedGeneratedPosts,
  activeBatchJob,
  batchJobs,
  activeStrategyDraft,
  activeImageTasks,
  selectedSourceCanGenerate,
  instruction,
  imageSize,
  imageQuality,
  generateImages,
  imageUseComfyUiKlein,
  imageDirectOriginalReference,
  includeSourceVideo,
  workspaceSettings,
  generateProgress,
  batchProgress,
  publishStatus,
  feishuVehicleOptions,
  feishuVehicleFieldName,
  feishuVehicleOptionsMessage,
  reviewPrompt,
  busy,
  onSelectSource,
  onToggleBatchSource,
  onSelectVisibleBatchSources,
  onClearBatchSources,
  onQueueFilterChange,
  onPlatformFilterChange,
  onProductionSortChange,
  onStartBatchProduction,
  onOpenSourcePreview,
  onOpenImageGallery,
  onMaterialPathChange,
  onScanMaterials,
  onPlanChange,
  onGuidanceChange,
  onToggleTask,
  onTaskChange,
  onResetTasks,
  onInstructionChange,
  onImageSizeChange,
  onImageQualityChange,
  onGenerateImagesChange,
  onImageUseComfyUiKleinChange,
  onImageDirectOriginalReferenceChange,
  onIncludeSourceVideoChange,
  onWorkspaceSettingsChange,
  onSaveWorkspaceSettings,
  onGenerateDraft,
  onSelectPost,
  onToggleGeneratedPostSelection,
  onSelectVisibleGeneratedPosts,
  onClearGeneratedPostSelection,
  onUpdateSelectedGeneratedPostStatus,
  onDeleteSelectedGeneratedPosts,
  onPreviewPost,
  onSavePost,
  onDeletePost,
  onRegeneratePost,
  onSetPost,
  onSaveReviewPatch,
  onGenerateImage,
  onReviewPromptChange,
  onPublish,
}: {
  productionSources: NormalizedSourceItem[];
  allSources: NormalizedSourceItem[];
  draftCountBySourceId: Record<string, number>;
  selectedSource?: NormalizedSourceItem;
  selectedSourceImages: string[];
  selectedSourceImagesAreFrameFallback: boolean;
  selectedSourceFrames: NonNullable<NormalizedSourceItem["videoFrames"]>;
  selectedSourceFrameUrls: string[];
  selectedBatchSourceIds: string[];
  selectedBatchSources: NormalizedSourceItem[];
  productionQueueFilter: ProductionQueueFilter;
  productionPlatformFilter: PoolPlatformFilter;
  productionSort: PoolSortMode;
  productionMaterialPaths: string[];
  materialPath: string;
  post: GeneratedPost | null;
  generatedPosts: GeneratedPost[];
  selectedGeneratedPostId: string;
  selectedGeneratedPostIds: string[];
  selectedGeneratedPosts: GeneratedPost[];
  activeBatchJob: BatchProductionJob | null;
  batchJobs: BatchProductionJob[];
  activeStrategyDraft: ProductionPlan | null;
  activeImageTasks: SourceImageTask[];
  selectedSourceCanGenerate: boolean;
  instruction: string;
  imageSize: string;
  imageQuality: ImageGenerationQuality;
  generateImages: boolean;
  imageUseComfyUiKlein: boolean;
  imageDirectOriginalReference: boolean;
  includeSourceVideo: boolean;
  workspaceSettings: WorkspacePromptSettings;
  generateProgress: TaskProgressSnapshot | null;
  batchProgress: TaskProgressSnapshot | null;
  publishStatus: PublishStatusSnapshot | null;
  feishuVehicleOptions: string[];
  feishuVehicleFieldName: string;
  feishuVehicleOptionsMessage: string;
  reviewPrompt: string;
  busy: string | null;
  onSelectSource: (sourceItemId: string) => void;
  onToggleBatchSource: (sourceItemId: string) => void;
  onSelectVisibleBatchSources: () => void;
  onClearBatchSources: () => void;
  onQueueFilterChange: (value: ProductionQueueFilter) => void;
  onPlatformFilterChange: (value: PoolPlatformFilter) => void;
  onProductionSortChange: (value: PoolSortMode) => void;
  onStartBatchProduction: () => void;
  onOpenSourcePreview: (item: NormalizedSourceItem) => void;
  onOpenImageGallery: (imageUrls: string[], imageIndex: number, title: string, meta?: string) => void;
  onMaterialPathChange: (value: string) => void;
  onScanMaterials: () => void;
  onPlanChange: (patch: Partial<ProductionPlan>) => void;
  onGuidanceChange: (field: "textBrief" | "imageBrief", value: string) => void;
  onToggleTask: (taskId: string) => void;
  onTaskChange: (taskId: string, patch: Partial<SourceImageTask>) => void;
  onResetTasks: () => void;
  onInstructionChange: (value: string) => void;
  onImageSizeChange: (value: string) => void;
  onImageQualityChange: (value: ImageGenerationQuality) => void;
  onGenerateImagesChange: (value: boolean) => void;
  onImageUseComfyUiKleinChange: (value: boolean) => void;
  onImageDirectOriginalReferenceChange: (value: boolean) => void;
  onIncludeSourceVideoChange: (value: boolean) => void;
  onWorkspaceSettingsChange: (patch: Partial<WorkspacePromptSettings>) => void;
  onSaveWorkspaceSettings: () => void;
  onGenerateDraft: () => void;
  onSelectPost: (post: GeneratedPost) => void;
  onToggleGeneratedPostSelection: (postId: string) => void;
  onSelectVisibleGeneratedPosts: () => void;
  onClearGeneratedPostSelection: () => void;
  onUpdateSelectedGeneratedPostStatus: (status: GeneratedPost["status"]) => void;
  onDeleteSelectedGeneratedPosts: () => void;
  onPreviewPost: (post: GeneratedPost) => void;
  onSavePost: () => void;
  onDeletePost: () => void;
  onRegeneratePost: () => void;
  onSetPost: (post: GeneratedPost) => void;
  onSaveReviewPatch: (patch: Partial<GeneratedPost>, prompt?: string) => Promise<void>;
  onGenerateImage: () => void;
  onReviewPromptChange: (value: string) => void;
  onPublish: () => void;
}) {
  return (
    <section className="studio-workspace production-workspace">
      <aside className="glass ops-panel studio-pane thin-scrollbar rounded-[8px] p-3 sm:p-4">
        <PanelTitle icon={<Bot className="h-4 w-4" />} title="生产队列" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PoolMetric label="队列来源" value={productionSources.length} />
          <PoolMetric label="已选生产" value={selectedBatchSources.length} />
          <PoolMetric label="草稿总数" value={generatedPosts.length} />
          <PoolMetric label="素材路径" value={productionMaterialPaths.length} />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {productionQueueOptions.map((option) => (
            <FilterChip
              key={option.value}
              active={productionQueueFilter === option.value}
              onClick={() => onQueueFilterChange(option.value)}
            >
              {option.label} {countSourcesByProductionQueue(allSources, option.value, draftCountBySourceId)}
            </FilterChip>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <FieldLabel label="生产平台" />
            <select className="field h-10" value={productionPlatformFilter} onChange={(event) => onPlatformFilterChange(event.target.value as PoolPlatformFilter)}>
              {poolPlatformOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel label="队列排序" />
            <select className="field h-10" value={productionSort} onChange={(event) => onProductionSortChange(event.target.value as PoolSortMode)}>
              {poolSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="soft-button h-9 px-3 text-xs" type="button" onClick={onSelectVisibleBatchSources}>
            选择当前队列
          </button>
          <button className="soft-button h-9 px-3 text-xs" type="button" onClick={onClearBatchSources}>
            清空选择
          </button>
          <button
            className="primary-button h-9 px-3 text-xs"
            type="button"
            onClick={onStartBatchProduction}
            disabled={Boolean(busy) || !selectedBatchSourceIds.length}
          >
            {busy === "batch" ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <Bot className="mr-1 inline h-3.5 w-3.5" />}
            批量生成 {selectedBatchSources.length || ""}
          </button>
        </div>
        {batchProgress ? <TaskProgressCard className="mt-3" progress={batchProgress} /> : null}

        <div className="section-divider" />

        <WorkspaceDefaultsPanel
          settings={workspaceSettings}
          busy={busy === "settings"}
          onChange={(patch) => {
            onWorkspaceSettingsChange(patch);
            if (typeof patch.textInstruction === "string") onInstructionChange(patch.textInstruction);
            if (typeof patch.imageSize === "string") onImageSizeChange(patch.imageSize);
            if (patch.imageQuality) onImageQualityChange(patch.imageQuality);
          }}
          onSave={onSaveWorkspaceSettings}
        />

        <div className="section-divider" />

        <PanelTitle icon={<FolderOpen className="h-4 w-4" />} title="生产素材" />
        <div className="mt-4 space-y-3">
          <input className="field" placeholder="C:\素材\产品图" value={materialPath} onChange={(event) => onMaterialPathChange(event.target.value)} />
          <button className="soft-button flex h-10 w-full items-center justify-center gap-2" type="button" onClick={onScanMaterials} disabled={Boolean(busy)}>
            {busy === "materials" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            扫描临时素材
          </button>
          <p className="text-[11px] leading-5 text-white/45">生成时会合并临时扫描素材和素材库资产，共 {productionMaterialPaths.length} 个路径。</p>
        </div>

        <div className="section-divider" />

        <PanelTitle icon={<Layers3 className="h-4 w-4" />} title="待制作来源" />
        <div className="thin-scrollbar mt-4 max-h-[48dvh] space-y-2 overflow-y-auto">
          {productionSources.length ? (
            productionSources.map((item) => (
              <article
                key={item.id}
                className={`source-card rounded-[8px] border p-3 ${
                  selectedSource?.id === item.id ? "source-card-selected border-[var(--mint)]/70 bg-white/12" : "border-white/10 bg-white/[0.045]"
                }`}
              >
                <label className={`selection-toggle ${selectedBatchSourceIds.includes(item.id) ? "selection-toggle-active" : ""}`} aria-label="选择生产来源">
                  <input className="sr-only" type="checkbox" checked={selectedBatchSourceIds.includes(item.id)} onChange={() => onToggleBatchSource(item.id)} />
                  <Check className={`h-3.5 w-3.5 ${selectedBatchSourceIds.includes(item.id) ? "text-[var(--mint)]" : "text-white/30"}`} />
                  <span>{selectedBatchSourceIds.includes(item.id) ? "已选" : "选择"}</span>
                </label>
                <button className="w-full text-left" type="button" onClick={() => onSelectSource(item.id)}>
                  <div className="flex gap-3">
                    <SourceThumb item={item} />
                    <div className="min-w-0 flex-1 pr-16">
                      <p className="line-clamp-2 text-sm font-black text-white">{item.title || item.contentText || "未命名样本"}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/52">{item.contentText}</p>
                      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-white/45">
                        <span>{platforms.find((option) => option.value === item.platform)?.label}</span>
                        <span>草稿 {draftCountBySourceId[item.id] || 0}</span>
                        <span>{item.hotScore || calculateQualityScore(item)} 分</span>
                      </div>
                    </div>
                  </div>
                </button>
                <button className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cyan)]" type="button" onClick={() => onOpenSourcePreview(item)}>
                  <Maximize2 className="h-3.5 w-3.5" />
                  预览来源
                </button>
              </article>
            ))
          ) : (
            <EmptyState title="当前生产队列为空" icon={<Search className="h-5 w-5" />} />
          )}
        </div>
      </aside>

      <section className="glass-strong ops-panel studio-samples thin-scrollbar rounded-[8px] p-3 sm:p-4">
        {selectedSource ? (
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <PanelTitle icon={<Wand2 className="h-4 w-4" />} title="逐条生产工作台" />
              <div className="flex flex-wrap gap-1.5">
                <span className="status-badge text-[11px] text-white/55">{formatMediaType(selectedSource.mediaType)}</span>
                <span className="status-badge text-[11px] text-[var(--mint)]">{formatContentDirection(activeStrategyDraft?.contentDirection || "unknown")}</span>
              </div>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Metric label={getPrimaryReachMetric(selectedSource).label} value={getPrimaryReachMetric(selectedSource).value} />
              <Metric label="点赞" value={selectedSource.metrics.likes} />
              <Metric label="收藏" value={selectedSource.metrics.collects} />
              <Metric label="评论" value={selectedSource.metrics.comments} />
              <Metric label="转发" value={selectedSource.metrics.shares} />
              <Metric label="热度" value={`${selectedSource.hotScore || calculateQualityScore(selectedSource)}分`} />
            </div>

            <div className="content-cluster">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-white/10">
                  <Camera className="h-5 w-5 text-[var(--cyan)]" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{selectedSource.authorName || "未知作者"}</p>
                  <p className="truncate text-xs text-white/45">
                    发布 {formatSourceTime(selectedSource.publishedAt, selectedSource.publishedLabel)} · 互动率 {formatRate(calculateEngagementRate(selectedSource))}
                  </p>
                </div>
              </div>
              <button
                className="group w-full rounded-[8px] border border-transparent p-3 text-left transition hover:border-white/10 hover:bg-white/[0.035]"
                type="button"
                onClick={() => onOpenSourcePreview(selectedSource)}
              >
                <h2 className="text-xl font-black leading-tight text-white sm:text-2xl">{selectedSource.title || "无标题"}</h2>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/70">{selectedSource.contentText}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cyan)] opacity-80">
                  <Maximize2 className="h-3.5 w-3.5" />
                  预览来源全文
                </span>
              </button>
              {selectedSourceFrames.length && !selectedSourceImagesAreFrameFallback ? (
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-2 text-xs font-semibold text-white/62">
                      <Camera className="h-3.5 w-3.5 text-[var(--amber)]" />
                      视频高光帧
                    </p>
                    <span className="status-badge text-[11px] text-white/45">共 {selectedSourceFrames.length} 帧</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {selectedSourceFrames.map((frame, index) => (
                      <button
                        key={`${frame.url}-${index}`}
                        className="media-tile preview-ratio group"
                        type="button"
                        aria-label={`预览视频高光帧 ${index + 1}`}
                        onClick={() =>
                          onOpenImageGallery(
                            selectedSourceFrameUrls,
                            index,
                            `高光帧 ${index + 1}`,
                            `${formatFrameType(frame.type)} · ${formatFrameTimestamp(frame.timestamp)} · ${frame.reason}`,
                          )
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" referrerPolicy="no-referrer" src={toDisplayImageSrc(frame.url)} />
                        <span className="absolute left-2 top-2 rounded-[6px] bg-black/55 px-2 py-1 text-[10px] font-black text-white">
                          {formatFrameTimestamp(frame.timestamp)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-white/62">{selectedSourceImagesAreFrameFallback ? "来源视频帧" : "来源图片"}</p>
                {selectedSourceImages.length ? <span className="status-badge text-[11px] text-white/45">共 {selectedSourceImages.length} 张</span> : null}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {(selectedSourceImages.length ? selectedSourceImages : [0, 1, 2]).map((item, index) => (
                  <button
                    key={typeof item === "string" ? item : index}
                    className="media-tile preview-ratio group"
                    type="button"
                    aria-label={typeof item === "string" ? `预览${selectedSourceImagesAreFrameFallback ? "来源视频帧" : "来源图片"} ${index + 1}` : `素材位 ${index + 1}`}
                    onClick={() =>
                      typeof item === "string"
                        ? onOpenImageGallery(
                            selectedSourceImages,
                            index,
                            `${selectedSourceImagesAreFrameFallback ? "来源视频帧" : "来源图片"} ${index + 1}`,
                            selectedSource.title || selectedSource.contentText,
                          )
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

            <AnalysisCard item={selectedSource} />
            <ProductionPlanCard item={selectedSource} />
            <CreationControlCard
              plan={activeStrategyDraft}
  imageTasks={activeImageTasks}
  useComfyUiKlein={imageUseComfyUiKlein}
  directOriginalReference={imageDirectOriginalReference}
              onPlanChange={onPlanChange}
              onGuidanceChange={onGuidanceChange}
              onToggleTask={onToggleTask}
              onTaskChange={onTaskChange}
              onResetTasks={onResetTasks}
              onUseComfyUiKleinChange={onImageUseComfyUiKleinChange}
              onDirectOriginalReferenceChange={onImageDirectOriginalReferenceChange}
              onPreviewImage={(_url, index) => onOpenImageGallery(activeImageTasks.map((task) => task.url), index, `待处理图片 ${index + 1}`)}
            />

            <div className="content-cluster mt-4">
              <FieldLabel label="生产要求" />
              <textarea className="field mt-2 min-h-24 resize-none" value={instruction} onChange={(event) => onInstructionChange(event.target.value)} />
              <div className="mt-3">
                <FieldLabel label="图片生成" />
                <label className="mt-2 flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                  <input
                    className="mt-1 h-4 w-4 accent-[var(--mint)]"
                    type="checkbox"
                    checked={generateImages}
                    onChange={(event) => onGenerateImagesChange(event.target.checked)}
                    disabled={Boolean(busy)}
                  />
                  <span className="min-w-0">开启后自动生成配图；关闭时只生成文字草稿。</span>
                </label>
              </div>
              <label className="mt-2 flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
                <input
                  className="mt-1 h-4 w-4 accent-[var(--mint)]"
                  type="checkbox"
                  checked={includeSourceVideo}
                  onChange={(event) => onIncludeSourceVideoChange(event.target.checked)}
                  disabled={Boolean(busy)}
                />
                <span className="min-w-0">引用源视频素材</span>
              </label>
              <div className="production-setting-grid mt-3">
                <div className="production-setting-summary">
                  <p className="text-[11px] font-semibold text-white/55">生成草稿时自动处理配图</p>
                  <p className="mt-1 text-[11px] leading-5 text-white/42">将按上方已勾选图片逐张生成，输出后可直接预览完整图文。</p>
                </div>
                <label className="min-w-0">
                  <span className="sr-only">图片尺寸</span>
                  <ImageSizeInput value={imageSize} onChange={onImageSizeChange} disabled={!generateImages} listId="draft-image-size-presets" />
                </label>
                <select className="field h-10 text-xs" value={imageQuality} onChange={(event) => onImageQualityChange(event.target.value as ImageGenerationQuality)} disabled={!generateImages}>
                  {imageQualityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="primary-button mt-3 flex h-11 w-full items-center justify-center gap-2"
                type="button"
                onClick={onGenerateDraft}
                disabled={Boolean(busy) || !selectedSource || !selectedSourceCanGenerate}
              >
                {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                {generateImages ? "生成图文草稿" : "生成文字草稿"}
              </button>
              {generateProgress ? <TaskProgressCard className="mt-3" progress={generateProgress} /> : null}
            </div>
          </div>
        ) : (
          <EmptyState title="选择来源样本后开始生产" icon={<Wand2 className="h-5 w-5" />} />
        )}
      </section>

      <aside className="glass ops-panel studio-pane thin-scrollbar rounded-[8px] p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <PanelTitle icon={<ShieldCheck className="h-4 w-4" />} title="审查台" />
          <span className="status-badge text-[11px] text-white/55">{post?.status || "empty"}</span>
        </div>

        <GeneratedPostLibraryCard
          posts={generatedPosts}
          selectedPostId={selectedGeneratedPostId}
          selectedPostIds={selectedGeneratedPostIds}
          selectedPosts={selectedGeneratedPosts}
          currentPost={post}
          busy={busy === "post" || busy === "regenerate" || busy === "postBatch"}
          onSelectPost={onSelectPost}
          onTogglePostSelection={onToggleGeneratedPostSelection}
          onSelectVisiblePosts={onSelectVisibleGeneratedPosts}
          onClearPostSelection={onClearGeneratedPostSelection}
          onUpdateSelectedPostStatus={onUpdateSelectedGeneratedPostStatus}
          onDeleteSelectedPosts={onDeleteSelectedGeneratedPosts}
          onPreviewPost={onPreviewPost}
          onSavePost={onSavePost}
          onDeletePost={onDeletePost}
          onRegeneratePost={onRegeneratePost}
        />

        <BatchProductionStatusCard job={activeBatchJob} jobCount={batchJobs.length} onSelectPost={onSelectPost} onPreviewPost={onPreviewPost} />

        {post ? (
          <div className="mt-4 space-y-4">
            <ReviewPackageCard
              post={post}
              busy={busy}
              publishStatus={publishStatus?.postId === post.id ? publishStatus : null}
              onApprove={() => onSaveReviewPatch({ title: post.title, body: post.body, imagePrompt: post.imagePrompt, feishuVehicle: post.feishuVehicle, status: "approved" })}
              onOpenImageGallery={onOpenImageGallery}
              onPreviewPost={onPreviewPost}
              onPublish={onPublish}
            />
            <div>
              <FieldLabel label="标题" />
              <input className="field mt-2" value={post.title} onChange={(event) => onSetPost({ ...post, title: event.target.value })} />
            </div>
            <div>
              <FieldLabel label="正文" />
              <textarea className="field mt-2 min-h-56 resize-none leading-7" value={post.body} onChange={(event) => onSetPost({ ...post, body: event.target.value })} />
            </div>
            <div>
              <FieldLabel label="图片 Prompt" />
              <textarea className="field mt-2 min-h-28 resize-none" value={post.imagePrompt} onChange={(event) => onSetPost({ ...post, imagePrompt: event.target.value })} />
            </div>
            <div>
              <FieldLabel label={`写入飞书${feishuVehicleFieldName}`} />
              <select
                className="field mt-2 h-10"
                value={post.feishuVehicle || post.taskKeyword || ""}
                onChange={(event) => onSetPost({ ...post, feishuVehicle: event.target.value })}
              >
                <option value="">未选择</option>
                {feishuVehicleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {feishuVehicleOptionsMessage ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">{feishuVehicleOptionsMessage}</p> : null}
            </div>
            <button
              className="soft-button flex h-10 w-full items-center justify-center gap-2"
              type="button"
              onClick={() => onSaveReviewPatch({ title: post.title, body: post.body, imagePrompt: post.imagePrompt, feishuVehicle: post.feishuVehicle })}
              disabled={Boolean(busy)}
            >
              <Check className="h-4 w-4" />
              保存
            </button>
            <div className="production-setting-grid">
              <button className="soft-button flex h-10 items-center justify-center gap-2" type="button" onClick={onGenerateImage} disabled={Boolean(busy)}>
                {busy === "image" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                重新生成图
              </button>
              <ImageSizeInput value={imageSize} onChange={onImageSizeChange} listId="review-image-size-presets" />
              <select className="field h-10 text-xs" value={imageQuality} onChange={(event) => onImageQualityChange(event.target.value as ImageGenerationQuality)}>
                {imageQualityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel label="Prompt 修改" />
              <textarea className="field mt-2 min-h-24 resize-none" value={reviewPrompt} onChange={(event) => onReviewPromptChange(event.target.value)} />
              <button
                className="soft-button mt-2 flex h-10 w-full items-center justify-center gap-2"
                type="button"
                onClick={() => {
                  onSaveReviewPatch({ title: post.title, body: post.body, imagePrompt: post.imagePrompt, feishuVehicle: post.feishuVehicle }, reviewPrompt);
                  onReviewPromptChange("");
                }}
                disabled={Boolean(busy) || !reviewPrompt.trim()}
              >
                {busy === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                AI 修改
              </button>
            </div>
            <div className="content-cluster">
              <p className="mb-2 text-xs font-semibold text-white/70">AI 备注</p>
              <div className="space-y-2">
                {(post.aiNotes.length ? post.aiNotes : ["暂无备注"]).map((note) => (
                  <p key={note} className="text-xs leading-5 text-white/52">
                    {note}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="生成草稿后审查" icon={<Settings className="h-5 w-5" />} />
        )}
      </aside>
    </section>
  );
}

function ReviewPackageCard({
  post,
  busy,
  publishStatus,
  onApprove,
  onOpenImageGallery,
  onPreviewPost,
  onPublish,
}: {
  post: GeneratedPost;
  busy: string | null;
  publishStatus: PublishStatusSnapshot | null;
  onApprove: () => void;
  onOpenImageGallery: (imageUrls: string[], imageIndex: number, title: string, meta?: string) => void;
  onPreviewPost: (post: GeneratedPost) => void;
  onPublish: () => void;
}) {
  const platformLabel = platforms.find((option) => option.value === post.platform)?.label || post.platform;
  const videoUrls = postVideoUrls(post);
  const mediaCount = countPostMedia(post);
  const checklist = [
    { label: "标题", active: Boolean(post.title.trim()) },
    { label: "正文", active: Boolean(post.body.trim()) },
    { label: "配图", active: mediaCount > 0 },
  ];

  return (
    <section className="review-package" aria-label="最终图文审核包">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelTitle icon={<ClipboardCheck className="h-4 w-4" />} title="最终审核包" />
        <span className={`status-badge text-[11px] ${post.status === "approved" || post.status === "published" ? "text-[var(--mint)]" : "text-white/55"}`}>
          {formatReviewStatus(post.status)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="status-badge text-[11px] text-white/55">{platformLabel}</span>
        <span className="status-badge text-[11px] text-white/55">{mediaCount} 个素材</span>
        <span className="status-badge text-[11px] text-white/55">版本 {post.version || 1}</span>
        <span className="status-badge text-[11px] text-white/55">更新 {formatShortTime(post.updatedAt)}</span>
      </div>

      <div className="review-package-body">
        <div className="review-media-board">
          {post.imageUrls.slice(0, 6).map((imageUrl, index) => (
            <button
              key={`${imageUrl}-${index}`}
              className={`review-media-tile group ${index === 0 ? "review-media-primary" : ""}`}
              type="button"
              aria-label={`预览最终配图 ${index + 1}`}
              onClick={() => onOpenImageGallery(post.imageUrls, index, `最终配图 ${index + 1}`, post.title)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`最终配图 ${index + 1}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" referrerPolicy="no-referrer" src={toDisplayImageSrc(imageUrl)} />
              {index === 5 && post.imageUrls.length > 6 ? (
                <span className="review-media-more">+{post.imageUrls.length - 6}</span>
              ) : null}
            </button>
          ))}
          {videoUrls.map((videoUrl, index) => (
            <div
              key={`${videoUrl}-${index}`}
              className={`review-media-tile review-video-tile ${!post.imageUrls.length && index === 0 ? "review-media-primary" : ""}`}
            >
              <video className="h-full w-full bg-black object-cover" src={videoUrl} controls preload="metadata" />
              <span className="review-media-kind">
                <Video className="h-3 w-3" />
                视频 {index + 1}
              </span>
            </div>
          ))}
          {!mediaCount ? (
            <div className="review-media-empty">
              <ImageIcon className="h-6 w-6 text-white/35" />
              <span>暂无最终素材</span>
            </div>
          ) : null}
        </div>

        <article className="review-copy-card">
          <h3 className="break-words text-lg font-black leading-snug text-white">{post.title || "未填写标题"}</h3>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-white/72">{post.body || "未填写正文"}</p>
        </article>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {checklist.map((item) => (
          <span key={item.label} className={`status-badge text-[11px] ${item.active ? "text-[var(--mint)]" : "text-[var(--amber)]"}`}>
            <Check className="mr-1 h-3 w-3" />
            {item.active ? "已就绪" : "待补充"} {item.label}
          </span>
        ))}
      </div>

      <div className="review-package-actions">
        <button className="soft-button flex h-11 items-center justify-center gap-2 text-xs font-semibold" type="button" onClick={() => onPreviewPost(post)}>
          <Maximize2 className="h-4 w-4" />
          大图预览
        </button>
        <button className="soft-button flex h-11 items-center justify-center gap-2 text-xs font-semibold" type="button" onClick={onApprove} disabled={Boolean(busy)}>
          <ShieldCheck className="h-4 w-4 text-[var(--mint)]" />
          审查通过
        </button>
        <button className="primary-button flex h-11 items-center justify-center gap-2 text-xs font-semibold" type="button" onClick={onPublish} disabled={Boolean(busy)}>
          {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy === "publish" ? "正在写入飞书" : "写入飞书"}
        </button>
      </div>

      {publishStatus ? (
        <div className={`publish-status publish-status-${publishStatus.status}`} role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {publishStatus.status === "running" ? (
                <Loader2 className="h-4 w-4 flex-none animate-spin" />
              ) : publishStatus.status === "error" ? (
                <X className="h-4 w-4 flex-none" />
              ) : publishStatus.status === "warning" ? (
                <Clock3 className="h-4 w-4 flex-none" />
              ) : (
                <Check className="h-4 w-4 flex-none" />
              )}
              <p className="truncate text-xs font-black">{publishStatus.title}</p>
            </div>
            <span className="text-[11px] font-black tabular-nums">{publishStatus.progress}%</span>
          </div>
          <div className="publish-status-track mt-2">
            <span style={{ width: `${publishStatus.progress}%` }} />
          </div>
          <p className="mt-2 text-xs leading-5">{publishStatus.detail}</p>
          {publishStatus.notification ? <p className="mt-1 text-[11px] leading-5 opacity-80">{publishStatus.notification}</p> : null}
        </div>
      ) : null}

      {post.status === "approved" ? <div className="approval-banner mt-3">已进入待发布队列，可写入飞书多维表格。</div> : null}
      {post.status === "published" ? <div className="approval-banner mt-3">已发布到飞书，请在目标多维表格中复核附件和正文。</div> : null}
    </section>
  );
}

function TagChipRow({ tags, status, compact = false }: { tags: ContentTag[]; status?: string; compact?: boolean }) {
  if (!tags.length && !status) return null;
  return (
    <div className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap gap-1.5`}>
      {tags.map((tag) => (
        <span key={tag} className="status-badge text-[10px] text-[var(--mint)]">
          {tag}
        </span>
      ))}
      {!tags.length && status ? (
        <span className="status-badge text-[10px] text-white/45">
          {formatTaggingStatus(status)}
        </span>
      ) : null}
    </div>
  );
}

function GeneratedPostLibraryCard({
  posts,
  selectedPostId,
  selectedPostIds,
  selectedPosts,
  currentPost,
  busy,
  onSelectPost,
  onTogglePostSelection,
  onSelectVisiblePosts,
  onClearPostSelection,
  onUpdateSelectedPostStatus,
  onDeleteSelectedPosts,
  onPreviewPost,
  onSavePost,
  onDeletePost,
  onRegeneratePost,
}: {
  posts: GeneratedPost[];
  selectedPostId: string;
  selectedPostIds: string[];
  selectedPosts: GeneratedPost[];
  currentPost: GeneratedPost | null;
  busy: boolean;
  onSelectPost: (post: GeneratedPost) => void;
  onTogglePostSelection: (postId: string) => void;
  onSelectVisiblePosts: () => void;
  onClearPostSelection: () => void;
  onUpdateSelectedPostStatus: (status: GeneratedPost["status"]) => void;
  onDeleteSelectedPosts: () => void;
  onPreviewPost: (post: GeneratedPost) => void;
  onSavePost: () => void;
  onDeletePost: () => void;
  onRegeneratePost: () => void;
}) {
  return (
    <div className="content-cluster mt-4">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle icon={<ClipboardCheck className="h-4 w-4" />} title="生产草稿库" />
        <span className="status-badge text-[11px] text-white/55">{posts.length} 条</span>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <button className="soft-button h-9 text-xs" type="button" onClick={onSavePost} disabled={busy || !currentPost}>
            保存当前
          </button>
          <button className="soft-button h-9 text-xs" type="button" onClick={onRegeneratePost} disabled={busy || !currentPost}>
            {busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 inline h-3.5 w-3.5" />}
            再生成
          </button>
          <button className="soft-button h-9 text-xs text-[var(--rose)]" type="button" onClick={onDeletePost} disabled={busy || !currentPost}>
            删除
          </button>
        </div>
        <BatchActionBar
          selectedCount={selectedPosts.length}
          totalCount={posts.length}
          busy={busy}
          title="生成稿批量管理"
          onSelectVisible={onSelectVisiblePosts}
          onClear={onClearPostSelection}
          actions={[
            { label: "设为草稿", onClick: () => onUpdateSelectedPostStatus("draft") },
            { label: "批量审批", onClick: () => onUpdateSelectedPostStatus("approved") },
            { label: "标记发布", onClick: () => onUpdateSelectedPostStatus("published") },
            { label: "删除已选", danger: true, onClick: onDeleteSelectedPosts },
          ]}
        />
        <div className="thin-scrollbar max-h-56 space-y-2 overflow-y-auto">
          {posts.length ? (
            posts.slice(0, 30).map((item) => (
              <article
                key={item.id}
                className={`source-card rounded-[8px] border p-3 ${
                  selectedPostId === item.id ? "border-[var(--mint)]/70 bg-white/12" : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <label className={`selection-toggle ${selectedPostIds.includes(item.id) ? "selection-toggle-active" : ""}`} aria-label="选择生成稿">
                  <input
                    className="sr-only"
                    type="checkbox"
                    checked={selectedPostIds.includes(item.id)}
                    onChange={() => onTogglePostSelection(item.id)}
                  />
                  <Check className={`h-3.5 w-3.5 ${selectedPostIds.includes(item.id) ? "text-[var(--mint)]" : "text-white/30"}`} />
                  <span>{selectedPostIds.includes(item.id) ? "已选" : "选择"}</span>
                </label>
                <button className="w-full text-left" type="button" onClick={() => onSelectPost(item)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 pr-16">
                      <p className="line-clamp-2 text-xs font-black text-white">{item.title || "未命名草稿"}</p>
                      <p className="mt-1 text-[10px] text-white/42">
                        V{item.version || 1} · {formatReviewStatus(item.status)} · {formatShortTime(item.updatedAt)}
                      </p>
                    </div>
                    <span className="status-badge shrink-0 text-[10px] text-white/45">{countPostMedia(item)} 素材</span>
                  </div>
                </button>
                <button className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--cyan)]" type="button" onClick={() => onPreviewPost(item)}>
                  <Maximize2 className="h-3 w-3" />
                  预览
                </button>
              </article>
            ))
          ) : (
            <div className="empty-state min-h-0 p-4 text-xs text-white/50">暂无持久草稿，生成后会自动进入这里。</div>
          )}
        </div>
      </div>
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
            {busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}
            {action.label}
          </button>
        ))}
      </div>
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
      <aside className="glass ops-panel studio-pane thin-scrollbar rounded-[8px] p-3 sm:p-4">
        <PanelTitle icon={<FolderOpen className="h-4 w-4" />} title="素材文件夹" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PoolMetric label="文件夹" value={materialLibrary.folders.length} />
          <PoolMetric label="资产" value={materialLibrary.assets.length} />
        </div>

        <div className="mt-4 flex gap-2">
          <input className="field h-10" placeholder="新建文件夹" value={newFolderName} onChange={(event) => onNewFolderNameChange(event.target.value)} />
          <button className="soft-button grid h-10 w-10 shrink-0 place-items-center" type="button" onClick={onCreateFolder} disabled={busy} aria-label="新建素材文件夹">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          </button>
        </div>

        <div className="thin-scrollbar mt-4 max-h-[48dvh] space-y-2 overflow-y-auto">
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
              <p className="mt-1 text-[11px] text-white/42">
                {materialLibrary.assets.filter((asset) => asset.folderId === folder.id).length} 个资产
              </p>
            </button>
          ))}
        </div>
      </aside>

      <section className="glass-strong ops-panel studio-samples thin-scrollbar rounded-[8px] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PanelTitle icon={<Database className="h-4 w-4" />} title={activeFolder ? activeFolder.name : "素材库"} />
          <span className="status-badge text-[11px] text-white/55">PDF / DOCX / 图片路径</span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="content-cluster">
            <PanelTitle icon={<Settings className="h-4 w-4" />} title="当前文件夹" />
            <div className="mt-3">
              <FieldLabel label="文件夹名称" />
              <input
                className="field"
                value={activeFolderNameDraft}
                onChange={(event) => onFolderNameDraftChange(event.target.value)}
                disabled={!activeFolder || activeFolder.id === "root"}
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button className="soft-button h-10" type="button" onClick={onSaveFolder} disabled={busy || !activeFolder || activeFolder.id === "root"}>
                保存文件夹
              </button>
              <button className="soft-button h-10 text-[var(--rose)]" type="button" onClick={onDeleteFolder} disabled={busy || !activeFolder || activeFolder.id === "root"}>
                删除文件夹
              </button>
            </div>
          </div>

          <div className="content-cluster">
            <PanelTitle icon={<UploadCloud className="h-4 w-4" />} title="新增素材资产" />
            <div className="mt-3">
              <FieldLabel label="本地文件路径" />
              <input className="field" placeholder="C:\素材\车型资料.pdf" value={assetPath} onChange={(event) => onAssetPathChange(event.target.value)} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel label="显示名称" />
                <input className="field" value={assetName} onChange={(event) => onAssetNameChange(event.target.value)} />
              </div>
              <div>
                <FieldLabel label="标签，逗号分隔" />
                <input className="field" value={assetTags} onChange={(event) => onAssetTagsChange(event.target.value)} />
              </div>
            </div>
            <button className="primary-button mt-3 flex h-10 w-full items-center justify-center gap-2" type="button" onClick={onCreateAsset} disabled={busy || !activeFolder}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              加入素材库
            </button>
          </div>
        </div>

        <div className="content-cluster mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <FieldLabel label="扫描本地图片文件夹" />
              <input className="field" placeholder="C:\素材\产品图" value={materialPath} onChange={(event) => onMaterialPathChange(event.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="soft-button h-10 px-3 text-xs" type="button" onClick={onScanMaterials} disabled={busy}>
                扫描
              </button>
              <button className="soft-button h-10 px-3 text-xs" type="button" onClick={onImportScanned} disabled={busy || !materials.length || !activeFolder}>
                导入 {materials.length || ""}
              </button>
            </div>
          </div>
          {materials.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {materials.slice(0, 8).map((asset) => (
                <div key={asset.id} className="asset-pill">
                  <p className="truncate text-xs font-black text-white">{asset.name}</p>
                  <p className="mt-1 truncate text-[10px] text-white/42">{asset.path}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <PanelTitle icon={<ImageIcon className="h-4 w-4" />} title="当前文件夹资产" />
            <span className="status-badge text-[11px] text-white/45">{activeFolderAssets.length} 个</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {activeFolderAssets.length ? (
              activeFolderAssets.map((asset) => (
                <MaterialAssetEditor
                  key={asset.id}
                  asset={asset}
                  busy={busy}
                  onUpdate={onUpdateAsset}
                  onDelete={onDeleteAsset}
                  onPreview={onPreviewAsset}
                />
              ))
            ) : (
              <div className="empty-state xl:col-span-2">
                <div>
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-[8px] border border-white/10 bg-white/[0.06] text-white/45">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white/60">当前文件夹暂无素材</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="glass ops-panel studio-pane thin-scrollbar rounded-[8px] p-3 sm:p-4">
        <PanelTitle icon={<Lightbulb className="h-4 w-4" />} title="素材规范" />
        <div className="mt-4 space-y-3 text-xs leading-6 text-white/55">
          <p>车型资料建议使用清晰名称，例如 XPENG_G7_车型资料.pdf 或 G6_配置参数.docx。</p>
          <p>图片素材建议按车型、场景、颜色建立文件夹，后续生成会读取素材库中保存的本地路径。</p>
          <p>删除素材资产只删除索引，不删除电脑上的原始文件。</p>
        </div>
        <div className="section-divider" />
        <div className="grid grid-cols-2 gap-2">
          <PoolMetric label="图片" value={materialLibrary.assets.filter((asset) => asset.kind === "image").length} />
          <PoolMetric label="文档" value={materialLibrary.assets.filter((asset) => asset.kind === "document").length} />
        </div>
      </aside>
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
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-[var(--cyan)]">{formatMaterialKind(asset.kind)} · {asset.extension || "file"}</p>
          <p className="mt-1 truncate text-xs text-white/42">{asset.path}</p>
        </div>
        <button className="soft-button grid h-8 w-8 shrink-0 place-items-center" type="button" onClick={() => onDelete(asset)} disabled={busy} aria-label="删除素材资产">
          <Trash2 className="h-3.5 w-3.5 text-[var(--rose)]" />
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        <input className="field h-10 text-xs" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        <input className="field h-10 text-xs" value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button className="soft-button h-9 text-xs" type="button" onClick={() => onUpdate(asset, draft)} disabled={busy}>
          保存
        </button>
        <button className="soft-button h-9 text-xs" type="button" onClick={() => onPreview(asset)} disabled={!canPreview}>
          预览
        </button>
      </div>
    </article>
  );
}

function TaskProgressCard({ progress, className = "" }: { progress: TaskProgressSnapshot; className?: string }) {
  const value = clampProgressValue(progress.value);
  const progressColor =
    progress.status === "success" ? "bg-[var(--mint)]" : progress.status === "error" ? "bg-[var(--rose)]" : "bg-[var(--cyan)]";
  const statusClass = progress.status === "success" ? "text-[var(--mint)]" : progress.status === "error" ? "text-[var(--rose)]" : "text-[var(--cyan)]";
  const countText =
    typeof progress.total === "number"
      ? `${Math.min(progress.completed || 0, progress.total)}/${progress.total}`
      : `${value}%`;

  return (
    <div className={`min-w-0 rounded-[8px] bg-white/[0.035] px-3 py-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-white/[0.08] ${statusClass}`}>
            {progress.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : progress.status === "success" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-white">{progress.title}</p>
            <p className={`mt-0.5 truncate text-[11px] font-semibold ${statusClass}`}>{progress.label}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black text-white tabular-nums">{value}%</p>
          <p className="text-[10px] text-white/42 tabular-nums">{countText}</p>
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label={progress.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className={`h-full rounded-full ${progressColor} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/48">{progress.detail}</p>
    </div>
  );
}

function clampProgressValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

type SimpleOverallProgressTone = "idle" | "running" | "success" | "warning" | "error";

function buildSimpleOverallProgressRuns(runs: SimpleRun[], activeRun: SimpleRun | null) {
  const liveRuns = runs.filter(isSimpleRunLive);
  const candidates = liveRuns.length ? liveRuns : activeRun ? [activeRun] : runs.slice(0, 1);
  const seen = new Set<string>();
  return candidates
    .filter((run) => {
      if (seen.has(run.id)) return false;
      seen.add(run.id);
      return true;
    })
    .slice(0, 8);
}

function buildSimpleOverallProgressSummaryForRuns(runs: SimpleRun[]) {
  const summaries = runs.map((run) => buildSimpleOverallProgressSummary(run, false, "", run.input.targetCount));
  const runningCount = runs.filter((run) => run.status === "running").length;
  const queuedCount = runs.filter((run) => run.status === "queued").length;
  const completedCount = runs.filter((run) => run.status === "completed").length;
  const failedCount = runs.filter((run) => run.status === "failed").length;
  const firstLiveRun = runs.find(isSimpleRunLive) || runs[0];
  const firstLiveSummary = summaries[runs.findIndex((run) => run.id === firstLiveRun.id)] || summaries[0];
  const value = summaries.length
    ? clampProgressValue(summaries.reduce((sum, summary) => sum + summary.value, 0) / summaries.length)
    : 0;
  const tone: SimpleOverallProgressTone = summaries.some((summary) => summary.tone === "error")
    ? "error"
    : runningCount || queuedCount
      ? "running"
      : summaries.some((summary) => summary.tone === "warning")
        ? "warning"
        : completedCount === runs.length
          ? "success"
          : "idle";

  return {
    title: `${runs.length} 个任务进度`,
    label: [`执行中 ${runningCount}`, `排队 ${queuedCount}`, failedCount ? `失败 ${failedCount}` : "", completedCount ? `完成 ${completedCount}` : ""]
      .filter(Boolean)
      .join(" · "),
    detail: firstLiveRun ? `${firstLiveRun.input.keyword || firstLiveRun.id} · ${firstLiveSummary.label}` : "等待任务发起",
    value,
    tone,
    crawled: summaries.reduce((sum, summary) => sum + summary.crawled, 0),
    produced: summaries.reduce((sum, summary) => sum + summary.produced, 0),
    published: summaries.reduce((sum, summary) => sum + summary.published, 0),
  };
}

function formatSimpleRunPipelineDetail(sourceMode: SimpleSourceMode, sourceDetail: string, writeFeishu = true, generateImages = true) {
  const publishStep = writeFeishu ? "写入飞书" : "进入内容审查台";
  const generateStep = generateImages ? "生成图文" : "生成文字";
  if (sourceMode === "original") return `${sourceDetail} · 原创准备、原创策划、${generateStep}、${publishStep}会依次完成。`;
  if (sourceMode === "links" || sourceMode === "feishu" || sourceMode === "viral") return `${sourceDetail} · 导入、打标、${generateStep}、${publishStep}会依次完成。`;
  return `${sourceDetail} · 采集、打标、${generateStep}、${publishStep}会依次完成。`;
}

function buildSimpleOverallProgressSummary(run: SimpleRun | null, busy: boolean, sourceDetail: string, targetCount: number) {
  if (!run) {
    return {
      title: "整体进度",
      label: busy ? "正在提交任务" : "等待任务发起",
      detail: busy
        ? `${sourceDetail} · 目标 ${targetCount} 条 · 正在创建全自动任务。`
        : `${sourceDetail} · 目标 ${targetCount} 条 · 填写后开始全自动生产。`,
      value: busy ? 8 : 0,
      tone: busy ? ("running" as const) : ("idle" as const),
      crawled: 0,
      produced: 0,
      published: 0,
    };
  }

  const crawled = run.platformResults.reduce((sum, item) => sum + item.crawled, 0);
  const produced = run.posts.length;
  const published = run.posts.filter((post) => post.status === "published").length;
  const stageValues = run.stages.map(getSimpleStageProgressValue);
  const calculatedValue = stageValues.length ? stageValues.reduce((sum, value) => sum + value, 0) / stageValues.length : 0;
  const isTerminal = run.status === "completed" || run.status === "partial";
  const value = clampProgressValue(isTerminal ? 100 : calculatedValue);
  const activeStage =
    run.stages.find((stage) => stage.status === "running") ||
    run.stages.find((stage) => stage.status === "error") ||
    run.stages.find((stage) => stage.status === "warning") ||
    (isSimpleRunLive(run) ? run.stages.find((stage) => stage.status === "queued") : undefined);
  const stageLabel = activeStage ? `${activeStage.title} · ${formatSimpleStageStatus(activeStage.status)}` : formatSimpleRunStatus(run.status);
  const detail =
    activeStage?.message ||
    run.publish?.message ||
    run.errors[0] ||
    `${formatSimpleRunCollectionAction(run)} ${crawled}/${run.input.targetCount} 条 · 生成 ${produced} 条 · 飞书 ${formatSimplePublishStatus(run.publish?.status)}`;

  return {
    title: run.input.keyword || "整体进度",
    label: stageLabel,
    detail,
    value,
    tone: getSimpleOverallProgressTone(run),
    crawled,
    produced,
    published,
  };
}

function getSimpleStageProgressValue(stage: SimpleRun["stages"][number]) {
  const finished = stage.completed + stage.failed + stage.skipped;
  if (stage.total > 0) return clampProgressValue((finished / stage.total) * 100);
  if (stage.status === "queued") return 0;
  if (stage.status === "running") return 35;
  return 100;
}

function getSimpleOverallProgressTone(run: SimpleRun): SimpleOverallProgressTone {
  if (run.status === "failed" || run.stages.some((stage) => stage.status === "error")) return "error";
  if (isSimpleRunLive(run)) return "running";
  if (run.status === "partial" || run.stages.some((stage) => stage.status === "warning")) return "warning";
  if (run.status === "completed") return "success";
  return "idle";
}
function StudioCommandBar({
  activeProject,
  visibleCount,
  totalCount,
  post,
}: {
  activeProject: ContentProject | null;
  visibleCount: number;
  totalCount: number;
  post: GeneratedPost | null;
}) {
  const steps = [
    {
      icon: <Database className="h-4 w-4" />,
      label: "?????",
      value: activeProject ? `${activeProject.query} ? ${totalCount} ?` : "?????",
      active: Boolean(activeProject),
    },
    {
      icon: <BarChart3 className="h-4 w-4" />,
      label: "????",
      value: visibleCount ? `${visibleCount} ?????` : "??????",
      active: visibleCount > 0,
    },
    {
      icon: <ClipboardCheck className="h-4 w-4" />,
      label: "????",
      value: post ? formatReviewStatus(post.status) : "?????",
      active: Boolean(post),
    },
    {
      icon: <UploadCloud className="h-4 w-4" />,
      label: "????",
      value: post?.status === "published" ? "???" : "?????",
      active: post?.status === "published",
    },
  ];

  return (
    <section className="command-bar mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((step, index) => (
        <div key={step.label} className={`command-step ${step.active ? "command-step-active" : ""}`}>
          <span className="command-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="command-icon">{step.icon}</span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-white/45">{step.label}</p>
            <p className="mt-1 truncate text-sm font-black text-white">{step.value}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
function BatchProductionStatusCard({
  job,
  jobCount,
  onSelectPost,
  onPreviewPost,
}: {
  job: BatchProductionJob | null;
  jobCount: number;
  onSelectPost: (post: GeneratedPost) => void;
  onPreviewPost: (post: GeneratedPost) => void;
}) {
  if (!job) {
    return (
      <div className="content-cluster mt-4">
        <PanelTitle icon={<Bot className="h-4 w-4" />} title="批量制作队列" />
        <p className="mt-3 text-xs leading-5 text-white/52">尚未创建批量任务。勾选生产队列来源后，可在工作台启动逐条批量生成。</p>
      </div>
    );
  }

  const latestTasks = job.tasks.slice(0, 8);
  const progressValue = job.totalTasks ? Math.round(((job.completedTasks + job.failedTasks + job.skippedTasks) / job.totalTasks) * 100) : 0;

  return (
    <div className="content-cluster mt-4">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle icon={<Bot className="h-4 w-4" />} title="批量制作队列" />
        <span className={`status-badge text-[11px] ${job.status === "completed" ? "text-[var(--mint)]" : job.status === "failed" ? "text-[var(--rose)]" : "text-white/55"}`}>
          {formatBatchStatus(job.status)}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/62">{job.title}</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <PoolMetric label="任务" value={job.totalTasks} />
        <PoolMetric label="完成" value={job.completedTasks} />
        <PoolMetric label="失败" value={job.failedTasks} />
        <PoolMetric label="跳过" value={job.skippedTasks} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-white/48">
        <span>真实任务进度</span>
        <span className="font-black text-white tabular-nums">{progressValue}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[var(--mint)] transition-all" style={{ width: `${progressValue}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-white/45">
        <span className="status-badge text-[11px] text-white/45">历史 {jobCount} 批</span>
        <span className="status-badge text-[11px] text-white/45">素材 {job.materialPaths.length} 个</span>
      </div>
      <div className="thin-scrollbar mt-3 max-h-72 space-y-2 overflow-y-auto">
        {latestTasks.map((task) => (
          <BatchTaskRow key={task.id} task={task} onSelectPost={onSelectPost} onPreviewPost={onPreviewPost} />
        ))}
      </div>
    </div>
  );
}

function BatchTaskRow({
  task,
  onSelectPost,
  onPreviewPost,
}: {
  task: ProductionTask;
  onSelectPost: (post: GeneratedPost) => void;
  onPreviewPost: (post: GeneratedPost) => void;
}) {
  return (
    <article className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-xs font-black text-white">{task.sourceTitle || task.sourceItemId}</p>
          <p className="mt-1 text-[10px] text-white/42">
            {platforms.find((option) => option.value === task.platform)?.label || task.platform} · {formatContentDirection(task.contentDirection)}
          </p>
        </div>
        <span className={`status-badge shrink-0 text-[10px] ${getTaskStatusClass(task.status)}`}>
          {formatTaskStatus(task.status)}
        </span>
      </div>
      {task.error ? <p className="mt-2 text-[11px] leading-5 text-[var(--amber)]">{task.error}</p> : null}
      {task.post ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="soft-button h-8 text-[11px]" type="button" onClick={() => onSelectPost(task.post!)}>
            进入审查
          </button>
          <button className="soft-button h-8 text-[11px]" type="button" onClick={() => onPreviewPost(task.post!)}>
            预览草稿
          </button>
        </div>
      ) : null}
    </article>
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
        <div className="grid h-full w-full place-items-center bg-white/[0.05] text-white/35">
          {hasVideo ? <Video className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>
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

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="panel-title-icon grid h-7 w-7 place-items-center rounded-[8px]">
        {icon}
      </span>
      <h2 className="truncate text-sm font-black text-white">{title}</h2>
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <label className="mb-1 block text-xs font-semibold text-white/62">{label}</label>;
}

function ConfigChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`config-chip ${ok ? "config-chip-ok" : ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[var(--success)]" : "bg-white/30"}`} />
      {label}
    </span>
  );
}

function FilterChip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={`filter-chip ${active ? "filter-chip-active" : ""}`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
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

function AnalysisCard({ item }: { item: NormalizedSourceItem }) {
  const analysis = item.analysis;
  if (!analysis) return null;

  return (
    <div className="analysis-card mt-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle icon={<Lightbulb className="h-4 w-4" />} title="爆款分析卡" />
        <span className="status-badge text-[11px] text-white/55">
          {formatPoolStatus(item.poolStatus)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AnalysisBlock label="标题钩子" value={analysis.hook} />
        <AnalysisBlock label="选题角度" value={analysis.angle} />
        <AnalysisBlock label="内容结构" value={analysis.structure} />
        <AnalysisBlock label="情绪驱动" value={analysis.emotion} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <AnalysisBlock label="仿写方向" value={analysis.rewriteDirection} icon={<Target className="h-3.5 w-3.5" />} />
        <AnalysisBlock label="图片建议" value={analysis.visualSuggestion} icon={<ImageIcon className="h-3.5 w-3.5" />} />
      </div>
      <div className="analysis-block mt-3">
        <p className="text-[11px] font-semibold text-white/55">风险点</p>
        <p className="mt-1 text-xs leading-5 text-white/70">{analysis.risk}</p>
      </div>
      {analysis.keywords.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {analysis.keywords.map((keyword) => (
            <span key={keyword} className="status-badge text-[11px] text-white/62">
              {keyword}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductionPlanCard({ item }: { item: NormalizedSourceItem }) {
  const plan = item.productionPlan;
  if (!plan) return null;

  const requirements = [
    { label: "车型资料", active: plan.materialRequirements.vehicleDocs },
    { label: "车型图片", active: plan.materialRequirements.vehicleImages },
    { label: "原图", active: plan.materialRequirements.sourceImages },
    { label: "视频关键帧", active: plan.materialRequirements.videoKeyframes },
    { label: "视频要点", active: plan.materialRequirements.videoPublicPoints },
  ];

  return (
    <div className="content-cluster mt-4">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle icon={<ClipboardCheck className="h-4 w-4" />} title="批量制作策略" />
        <span className="status-badge text-[11px] text-white/55">
          {formatProductionDecision(plan.decision)}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <PoolMetric label="内容方向" value={formatContentDirection(plan.contentDirection)} />
        <PoolMetric label="文案策略" value={formatTextStrategy(plan.textStrategy)} />
        <PoolMetric label="图片策略" value={formatImageStrategy(plan.imageStrategy)} />
      </div>
      <p className="mt-3 text-xs leading-5 text-white/62">{plan.reason}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {requirements.map((requirement) => (
          <span key={requirement.label} className={`status-badge text-[11px] ${requirement.active ? "text-[var(--mint)]" : "text-white/38"}`}>
            {requirement.active ? "需要" : "不用"} {requirement.label}
          </span>
        ))}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <AnalysisBlock label="文案 Brief" value={plan.promptGuidance.textBrief} icon={<FileText className="h-3.5 w-3.5" />} />
        <AnalysisBlock label="图片 Brief" value={plan.promptGuidance.imageBrief} icon={<ImageIcon className="h-3.5 w-3.5" />} />
      </div>
      {plan.riskFlags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.riskFlags.map((risk) => (
            <span key={risk} className="status-badge text-[11px] text-[var(--amber)]">
              {formatRiskFlag(risk)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CreationControlCard({
  plan,
  imageTasks,
  useComfyUiKlein,
  directOriginalReference,
  onPlanChange,
  onGuidanceChange,
  onToggleTask,
  onTaskChange,
  onResetTasks,
  onUseComfyUiKleinChange,
  onDirectOriginalReferenceChange,
  onPreviewImage,
}: {
  plan: ProductionPlan | null;
  imageTasks: SourceImageTask[];
  useComfyUiKlein: boolean;
  directOriginalReference: boolean;
  onPlanChange: (patch: Partial<ProductionPlan>) => void;
  onGuidanceChange: (field: "textBrief" | "imageBrief", value: string) => void;
  onToggleTask: (taskId: string) => void;
  onTaskChange: (taskId: string, patch: Partial<SourceImageTask>) => void;
  onResetTasks: () => void;
  onUseComfyUiKleinChange: (value: boolean) => void;
  onDirectOriginalReferenceChange: (value: boolean) => void;
  onPreviewImage: (url: string, index: number) => void;
}) {
  const selectedCount = imageTasks.filter((task) => task.selected).length;
  if (!plan) return null;

  return (
    <div className="content-cluster mt-4">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle icon={<Settings className="h-4 w-4" />} title="内容创作控制台" />
        <span className="status-badge text-[11px] text-[var(--mint)]">已选 {selectedCount} 图</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <FieldLabel label="内容方向" />
          <select
            className="field h-10"
            value={plan.contentDirection}
            onChange={(event) => onPlanChange({ contentDirection: event.target.value as ContentDirection })}
          >
            <option value="industry">行业</option>
            <option value="competitor">竞品</option>
            <option value="xpeng">小鹏</option>
            <option value="unknown">待确认</option>
          </select>
        </div>
        <div>
          <FieldLabel label="制作决策" />
          <select
            className="field h-10"
            value={plan.decision}
            onChange={(event) => onPlanChange({ decision: event.target.value as ProductionDecision })}
          >
            <option value="adopt">可制作</option>
            <option value="needs_review">待确认</option>
            <option value="observe_only">仅观察</option>
          </select>
        </div>
        <div>
          <FieldLabel label="文案策略" />
          <select
            className="field h-10"
            value={plan.textStrategy}
            onChange={(event) => onPlanChange({ textStrategy: event.target.value as TextProductionStrategy })}
          >
            <option value="source_rewrite">洗稿重写</option>
            <option value="xpeng_original_from_materials">车型资料原创</option>
            <option value="creative_reframe_with_xpeng">竞品转小鹏表达</option>
            <option value="video_extract_rewrite">视频要点重构</option>
            <option value="not_adopt">不采用</option>
          </select>
        </div>
        <div>
          <FieldLabel label="图片策略" />
          <select
            className="field h-10"
            value={plan.imageStrategy}
            onChange={(event) => onPlanChange({ imageStrategy: event.target.value as ImageProductionStrategy })}
          >
            <option value="use_source_image">原图引用</option>
            <option value="redesign_source_image">原图洗图</option>
            <option value="redesign_source_or_xpeng_assets">原图/小鹏素材重构</option>
            <option value="creative_analysis_rebuild_with_xpeng_assets">创意拆解重构</option>
            <option value="video_keyframe_reference">关键帧参考</option>
            <option value="none">无图片任务</option>
            <option value="not_adopt">不采用</option>
          </select>
        </div>
      </div>

      <div className="mt-3">
        <FieldLabel label="文案策略说明" />
        <textarea
          className="field mt-2 min-h-20 resize-none"
          value={plan.promptGuidance.textBrief}
          onChange={(event) => onGuidanceChange("textBrief", event.target.value)}
        />
      </div>
      <div className="mt-3">
        <FieldLabel label="图片策略说明" />
        <textarea
          className="field mt-2 min-h-20 resize-none"
          value={plan.promptGuidance.imageBrief}
          onChange={(event) => onGuidanceChange("imageBrief", event.target.value)}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-white/62">图片/关键帧处理选择</p>
        <button className="soft-button h-8 px-3 text-[11px]" type="button" onClick={onResetTasks}>
          恢复默认洗图
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-white/45">默认每张图都进入洗图；选择保持原图会直接使用原图，不调用图片模型。</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
          <input
            className="mt-1 h-4 w-4 accent-[var(--mint)]"
            type="checkbox"
            checked={useComfyUiKlein}
            onChange={(event) => onUseComfyUiKleinChange(event.target.checked)}
          />
          <span className="min-w-0">启用本地 Klein 模型</span>
        </label>
        <label className="flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-white/62">
          <input
            className="mt-1 h-4 w-4 accent-[var(--mint)]"
            type="checkbox"
            checked={directOriginalReference}
            onChange={(event) => onDirectOriginalReferenceChange(event.target.checked)}
          />
          <span className="min-w-0">直接引用原图</span>
        </label>
      </div>

      <div className="thin-scrollbar mt-3 grid max-h-[440px] gap-3 overflow-y-auto">
        {imageTasks.length ? (
          imageTasks.map((task, index) => (
            <article key={task.id} className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
              <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
                <button className="media-tile preview-ratio group" type="button" onClick={() => onPreviewImage(task.url, index)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" referrerPolicy="no-referrer" src={toDisplayImageSrc(task.url)} />
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-black text-white">
                      <input type="checkbox" checked={task.selected} onChange={() => onToggleTask(task.id)} />
                      {task.label}
                    </label>
                    <span className="status-badge text-[10px] text-white/45">{task.kind === "video_frame" ? "关键帧" : "原图"}</span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[128px_minmax(0,1fr)]">
                    <select
                      className="field h-9 text-xs"
                      value={task.mode}
                      onChange={(event) => onTaskChange(task.id, { mode: event.target.value as SourceImageTask["mode"] })}
                    >
                      <option value="wash">洗图</option>
                      <option value="reconstruct">重构</option>
                      <option value="keep">保持原图</option>
                    </select>
                    <input
                      className="field h-9 text-xs"
                      value={task.prompt}
                      onChange={(event) => onTaskChange(task.id, { prompt: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state min-h-0 p-4 text-xs text-white/50">当前内容没有可处理图片或视频关键帧。</div>
        )}
      </div>
    </div>
  );
}

function AnalysisBlock({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="analysis-block">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/55">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xs leading-5 text-white/72">{value}</p>
    </div>
  );
}

function EmptyState({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="empty-state">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-[8px] border border-white/10 bg-white/[0.06] text-white/45">
          {icon}
        </div>
        <p className="mt-3 text-sm font-semibold text-white/60">{title}</p>
      </div>
    </div>
  );
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitFeishuTaskNumbers(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\r\n,，;；\t ]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function splitTags(value: string) {
  return value
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildViralMaterialCandidates(materials: MaterialAsset[], libraryAssets: MaterialLibraryAsset[], folders: MaterialFolder[]): ViralMaterialCandidate[] {
  const seen = new Set<string>();
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));
  const candidates: ViralMaterialCandidate[] = [];
  const addCandidate = (candidate: ViralMaterialCandidate) => {
    if (!candidate.path || seen.has(candidate.path)) return;
    seen.add(candidate.path);
    candidates.push(candidate);
  };

  libraryAssets.forEach((asset) => {
    if (asset.kind !== "image" && !isImageMaterialPath(asset.path, asset.extension)) return;
    addCandidate({
      id: `library:${asset.id}`,
      path: asset.path,
      name: asset.name || getPathFileName(asset.path),
      sourceLabel: folderNames.get(asset.folderId) || "素材库",
      folderId: asset.folderId,
    });
  });

  materials.forEach((asset) => {
    if (!isImageMaterialPath(asset.path, asset.extension)) return;
    addCandidate({
      id: `scan:${asset.path}`,
      path: asset.path,
      name: asset.name || getPathFileName(asset.path),
      sourceLabel: "扫描素材",
    });
  });

  return candidates;
}

function buildViralMaterialFolders(
  folders: MaterialFolder[],
  libraryAssets: MaterialLibraryAsset[],
  selectedPaths: string[],
): ViralMaterialFolderCandidate[] {
  const selectedPathSet = new Set(selectedPaths);
  return folders
    .map((folder) => {
      const paths = libraryAssets
        .filter((asset) => asset.folderId === folder.id)
        .filter((asset) => asset.kind === "image" || isImageMaterialPath(asset.path, asset.extension))
        .map((asset) => asset.path)
        .filter(Boolean);
      return {
        id: folder.id,
        name: folder.name,
        imageCount: paths.length,
        selectedCount: paths.filter((path) => selectedPathSet.has(path)).length,
        paths,
      };
    })
    .filter((folder) => folder.imageCount > 0);
}

function findMatchingViralMaterialFolderId(folders: ViralMaterialFolderCandidate[], keyword: string) {
  const normalizedKeyword = normalizeMaterialFolderMatchText(keyword);
  if (!normalizedKeyword) return "";
  const exact = folders.find((folder) => normalizeMaterialFolderMatchText(folder.name) === normalizedKeyword);
  if (exact) return exact.id;
  const partial = folders.find((folder) => {
    const normalizedName = normalizeMaterialFolderMatchText(folder.name);
    return normalizedName.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedName);
  });
  return partial?.id || "";
}

function normalizeMaterialFolderMatchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function isImageMaterialPath(path: string, extension?: string) {
  const ext = (extension || path.split(/[\\/]/).pop()?.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext);
}

function getPathFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function formatCompactPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : path;
}

function formatMaterialKind(value: MaterialLibraryAsset["kind"]) {
  const labels: Record<MaterialLibraryAsset["kind"], string> = {
    image: "图片",
    document: "文档",
    other: "其他",
  };
  return labels[value];
}

function formatNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function cloneProductionPlan(plan: ProductionPlan): ProductionPlan {
  return {
    ...plan,
    materialRequirements: { ...plan.materialRequirements },
    promptGuidance: { ...plan.promptGuidance },
    workflow: [...plan.workflow],
    riskFlags: [...plan.riskFlags],
  };
}

function makeFallbackProductionPlan(item: NormalizedSourceItem): ProductionPlan {
  const hasVideo = Boolean(item.videoUrl || item.downloadedVideoUrl || item.videoFrames?.length || item.mediaType === "video");
  const hasImage = Boolean(item.images.length || item.downloadedImages?.length);
  return {
    contentDirection: "unknown",
    decision: "needs_review",
    reason: "系统未生成默认策略，当前使用人工可编辑兜底策略。",
    textStrategy: hasVideo ? "video_extract_rewrite" : "source_rewrite",
    imageStrategy: hasVideo ? "video_keyframe_reference" : hasImage ? "redesign_source_image" : "none",
    materialRequirements: {
      vehicleDocs: false,
      vehicleImages: false,
      sourceImages: hasImage,
      videoKeyframes: hasVideo,
      videoPublicPoints: hasVideo,
    },
    promptGuidance: {
      textBrief: "请先确认内容方向，再按用户选择生成原创图文。",
      imageBrief: defaultImageWashPrompt,
    },
    workflow: ["人工确认策略", "生成草稿", "进入审查"],
    riskFlags: ["direction_needs_review"],
  };
}

function countSourcesByProductionQueue(
  items: NormalizedSourceItem[],
  filter: ProductionQueueFilter,
  draftCountBySourceId: Record<string, number>,
) {
  return items.filter((item) => matchesProductionQueueFilter(item, filter, draftCountBySourceId[item.id] || 0)).length;
}

function matchesProductionQueueFilter(item: NormalizedSourceItem, filter: ProductionQueueFilter, draftCount: number) {
  const status = item.poolStatus || "new";
  if (filter === "all") return true;
  if (filter === "ready") return status !== "published" && item.productionPlan?.decision !== "observe_only";
  if (filter === "no_draft") return draftCount === 0;
  if (filter === "has_draft") return draftCount > 0;
  return status === filter;
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
    case "likes_desc":
      return (b.metrics.likes || 0) - (a.metrics.likes || 0) || compareHotScore(b, a);
    case "collects_desc":
      return (b.metrics.collects || 0) - (a.metrics.collects || 0) || compareHotScore(b, a);
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

function getCrawlTime(item: NormalizedSourceItem) {
  return item.lastSeenAt || item.crawledAt || item.firstSeenAt;
}

function formatPoolStatus(value: NormalizedSourceItem["poolStatus"]) {
  const labels = {
    new: "未使用",
    analyzed: "已分析",
    rewritten: "已仿写",
    approved: "已审查",
    published: "已发布",
  };
  return labels[value || "new"];
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

function formatRiskFlag(value: string) {
  const labels: Record<string, string> = {
    competitor_video_blocked: "竞品视频不采用",
    direction_needs_review: "方向待确认",
    competitor_material_rebuild_required: "需用小鹏素材重构",
  };
  return labels[value] || value;
}

function formatTaggingStatus(value?: string) {
  if (value === "success") return "已打标";
  if (value === "failed") return "打标失败";
  if (value === "skipped") return "未打标";
  if (value === "pending") return "打标中";
  return "未打标";
}

function formatImageTaskMode(value: SourceImageTask["mode"]) {
  if (value === "wash") return "洗图";
  if (value === "reconstruct") return "重构";
  return "保持原图";
}

function trimImageStrategyPrompts(prompts: ImageStrategyPrompts): ImageStrategyPrompts {
  return {
    carExterior: prompts.carExterior.trim(),
    textImage: prompts.textImage.trim(),
    peopleWithCar: prompts.peopleWithCar.trim(),
  };
}

function getMissingImageStrategyPrompt(settings: WorkspacePromptSettings) {
  const prompts = {
    ...defaultImageStrategyPrompts,
    ...settings.imageStrategyPrompts,
  };
  const missing = imageStrategyPromptOptions.find((option) => !prompts[option.key].trim());
  return missing?.title || "";
}

function formatDraftGenerationProgressDetail(sourceLabel: string, selectedImageTaskCount: number, generateImages: boolean, imageSize: string, imageQuality: ImageGenerationQuality) {
  if (!generateImages) return `${sourceLabel} · 图片生成已关闭 · 只生成文字`;
  if (!selectedImageTaskCount) return `${sourceLabel} · 未选择图片任务 · 只生成文字`;
  return `${sourceLabel} · ${selectedImageTaskCount} 个配图任务 · ${imageSize} · ${imageQuality}`;
}

function formatDraftSyncProgressDetail(imageCount: number, generateImages: boolean, selectedImageTaskCount: number) {
  if (imageCount > 0) return `已生成 ${imageCount} 张配图，正在写入草稿库`;
  if (!generateImages) return "图片生成已关闭，正在写入文字草稿";
  if (!selectedImageTaskCount) return "未选择图片任务，正在写入文字草稿";
  return "未返回配图，正在写入文字草稿";
}

function formatDraftDoneProgressDetail(imageCount: number, generateImages: boolean, selectedImageTaskCount: number) {
  if (imageCount > 0) return `已生成 ${imageCount} 张配图，可进入审查`;
  if (!generateImages) return "文字草稿已生成，图片生成已关闭";
  if (!selectedImageTaskCount) return "文字草稿已生成，未选择图片任务";
  return "文字草稿已生成，图片未返回结果";
}

function formatDraftDoneMessage(imageCount: number, generateImages: boolean, selectedImageTaskCount: number) {
  if (imageCount > 0) return `完整图文已生成：${imageCount} 张图，进入审查`;
  if (!generateImages) return "文字草稿已生成；图片生成已关闭";
  if (!selectedImageTaskCount) return "文字草稿已生成；未选择图片任务";
  return "文字草稿已生成；图片生成未返回结果，请在审查台重试生成图";
}

function normalizeImageSizeInput(value: string) {
  const normalized = normalizeImageGenerationSize(value);
  return isImageGenerationSize(value) ? normalized : "";
}

function formatSourceTime(value?: string, fallback?: string) {
  const time = getSourceTimeMs(value);
  if (!time) return fallback || "未知";
  const date = new Date(time + 8 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function getSourceTimeMs(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatMetricValue(value?: number | string) {
  if (typeof value === "string") return value;
  return formatNumber(value || 0);
}

function formatReviewStatus(value: GeneratedPost["status"]) {
  const labels: Record<GeneratedPost["status"], string> = {
    draft: "草稿生成",
    editing: "正在编辑",
    approved: "审查通过",
    published: "已发布",
  };
  return labels[value];
}

function buildSimpleRunMessage(run: SimpleRun) {
  const crawledCount = run.platformResults.reduce((sum, result) => sum + result.crawled, 0);
  const publishLabel = formatSimplePublishStatus(run.publish?.status);
  return `简单版任务完成：${formatSimpleRunCollectionAction(run)} ${crawledCount} 条，生成 ${run.posts.length} 条，飞书 ${publishLabel}`;
}

function isSimpleRunLive(run: SimpleRun) {
  return (
    run.status === "queued" ||
    run.status === "running" ||
    run.publish?.status === "queued" ||
    run.publish?.status === "running" ||
    run.stages.some((stage) => stage.status === "running")
  );
}

function isFeishuPublishQueueLive(status?: FeishuPublishJob["status"]) {
  return status === "queued" || status === "running";
}

function isSimpleRunForceTerminated(run: SimpleRun) {
  return run.errors.some((error) => error.includes("强制终止") || /force terminated/i.test(error));
}

function canForceTerminateSimpleRun(run: SimpleRun | null) {
  if (!run || isSimpleRunForceTerminated(run)) return false;
  return run.status === "queued" || run.status === "running" || run.status === "failed" || run.stages.some((stage) => stage.status === "running");
}

function isSimpleLinkRun(run: SimpleRun) {
  return run.input.sourceMode === "links";
}

function isSimpleFeishuRun(run: SimpleRun) {
  return run.input.sourceMode === "feishu";
}

function isSimpleOriginalRun(run: SimpleRun) {
  return run.input.sourceMode === "original";
}

function isSimplePoolRun(run: SimpleRun) {
  return run.input.sourceMode === "pool";
}

function formatSimpleRunSource(run: SimpleRun) {
  if (isSimpleFeishuRun(run)) return `飞书 ${run.input.feishuTaskNumbers?.length || run.feishuResults?.length || 0} 条`;
  if (isSimpleOriginalRun(run)) return "原创 1 条";
  if (isSimplePoolRun(run)) return `内容池 ${run.input.sourceItemIds?.length || run.input.targetCount} 条`;
  if (!isSimpleLinkRun(run)) return `${run.input.platforms.length} 平台`;
  return `链接 ${run.input.links?.length || run.linkResults?.length || 0} 条`;
}

function formatSimpleRunCollectionAction(run: SimpleRun) {
  if (isSimpleLinkRun(run) || isSimpleFeishuRun(run)) return "导入";
  if (isSimplePoolRun(run)) return "取样";
  return "采集";
}

function getSimpleRunPrimaryProjectQuery(run: SimpleRun) {
  if (isSimpleFeishuRun(run)) {
    const vehicle = run.feishuResults?.find((result) => result.status === "imported" && result.vehicle?.trim())?.vehicle?.trim();
    if (vehicle) return vehicle;
  }
  return run.input.keyword;
}

function formatSimpleRunStatus(value: SimpleRun["status"]) {
  const labels: Record<SimpleRun["status"], string> = {
    queued: "排队中",
    running: "执行中",
    completed: "已完成",
    partial: "部分完成",
    failed: "失败",
  };
  return labels[value];
}

function formatSimpleLinkStatus(value: NonNullable<SimpleRun["linkResults"]>[number]["status"]) {
  const labels: Record<NonNullable<SimpleRun["linkResults"]>[number]["status"], string> = {
    imported: "成功",
    filtered: "过滤",
    duplicate: "重复",
    unsupported: "不支持",
    failed: "失败",
  };
  return labels[value];
}

function getSimpleLinkStatusClass(value: NonNullable<SimpleRun["linkResults"]>[number]["status"]) {
  if (value === "imported") return "text-[var(--mint)]";
  if (value === "filtered" || value === "duplicate") return "text-[var(--amber)]";
  return "text-[var(--rose-bright)]";
}

function formatSimpleFeishuStatus(value: NonNullable<SimpleRun["feishuResults"]>[number]["status"]) {
  const labels: Record<NonNullable<SimpleRun["feishuResults"]>[number]["status"], string> = {
    imported: "成功",
    not_found: "未找到",
    failed: "失败",
  };
  return labels[value];
}

function getSimpleFeishuStatusClass(value: NonNullable<SimpleRun["feishuResults"]>[number]["status"]) {
  if (value === "imported") return "text-[var(--mint)]";
  if (value === "not_found") return "text-[var(--amber)]";
  return "text-[var(--rose-bright)]";
}

function getSimpleRunStatusClass(value: SimpleRun["status"]) {
  if (value === "completed") return "text-[var(--mint)]";
  if (value === "partial") return "text-[var(--amber)]";
  if (value === "failed") return "text-[var(--rose)]";
  if (value === "running") return "text-[var(--cyan)]";
  return "text-white/45";
}

function formatSimpleStageStatus(value: SimpleRun["stages"][number]["status"]) {
  const labels: Record<SimpleRun["stages"][number]["status"], string> = {
    queued: "等待",
    running: "执行中",
    success: "完成",
    warning: "部分完成",
    error: "失败",
    skipped: "跳过",
  };
  return labels[value];
}

function getSimpleStageStatusClass(value: SimpleRun["stages"][number]["status"]) {
  if (value === "success") return "text-[var(--mint)]";
  if (value === "warning" || value === "skipped") return "text-[var(--amber)]";
  if (value === "error") return "text-[var(--rose)]";
  if (value === "running") return "text-[var(--cyan)]";
  return "text-white/45";
}

function formatSimplePublishStatus(value?: NonNullable<SimpleRun["publish"]>["status"]) {
  if (value === "queued") return "排队中";
  if (value === "running") return "写入中";
  if (value === "attachment_failed") return "附件未完成";
  if (value === "published") return "已写入";
  if (value === "needs_config") return "待配置";
  if (value === "failed") return "失败";
  if (value === "skipped") return "已跳过";
  return "未开始";
}

function getSimplePublishStatusClass(value?: NonNullable<SimpleRun["publish"]>["status"]) {
  if (value === "published") return "text-[var(--mint)]";
  if (value === "queued" || value === "running") return "text-[var(--cyan)]";
  if (value === "attachment_failed" || value === "needs_config" || value === "skipped") return "text-[var(--amber)]";
  if (value === "failed") return "text-[var(--rose)]";
  return "text-white/45";
}

function buildPublishStatus(posts: GeneratedPost[], data: FeishuPublishResponse, fallbackPostId?: string): PublishStatusSnapshot {
  const notification = formatPublishNotification(data.notification);
  const uploadedCount = (data.attachmentUploads || []).reduce((total, item) => total + (item.fileCount || 0), 0);
  const sourceMediaCount = posts.reduce((total, item) => total + countPostMedia(item), 0);
  const mediaCount = uploadedCount || sourceMediaCount;
  const postId = fallbackPostId || posts[0]?.id || data.job?.postIds[0] || "";
  const jobId = data.jobId || data.job?.id;
  const queueStatus = data.queueStatus || data.job?.status;

  if (data.status === "queued" || queueStatus === "queued") {
    return {
      postId,
      status: "warning",
      title: "已进入 Feishu 写入队列",
      detail: data.message || `Feishu job ${jobId || ""} 正在等待同用户写入队列。`,
      progress: 55,
      notification,
      jobId,
      queueStatus: queueStatus || "queued",
    };
  }

  if (data.status === "running" || queueStatus === "running") {
    return {
      postId,
      status: "running",
      title: "Feishu CLI 正在写入",
      detail: data.message || `Feishu job ${jobId || ""} 已开始写入多维表格。`,
      progress: 70,
      notification,
      jobId,
      queueStatus: queueStatus || "running",
    };
  }

  if (data.status !== "published") {
    return {
      postId,
      status: data.status === "failed" ? "error" : "warning",
      title: "飞书未完成真实写入",
      detail: data.message || `发布流程返回 ${data.status || "unknown"}，请先检查 Feishu CLI 和 Base 配置。`,
      progress: 100,
      notification,
      jobId,
      queueStatus,
    };
  }

  return {
    postId,
    status: data.notification?.status === "failed" ? "warning" : "success",
    title: data.notification?.status === "failed" ? "飞书写入完成，通知失败" : "飞书写入完成",
    detail: `已写入 ${posts.length} 条记录，${mediaCount} 个素材已处理。`,
    progress: 100,
    notification,
    jobId,
    queueStatus,
  };
}

function buildPublishMessage(data: FeishuPublishResponse) {
  if (data.status === "queued" || data.queueStatus === "queued") return data.message || "飞书写入任务已进入队列。";
  if (data.status === "running" || data.queueStatus === "running") return data.message || "Feishu CLI 正在写入。";
  if (data.status !== "published") return data.message || `飞书流程返回 ${data.status || "unknown"}`;
  const notification = formatPublishNotification(data.notification);
  return notification ? `飞书写入完成，${notification}` : `飞书写入完成：${data.payloadPath || ""}`;
}

function formatPublishNotification(notification?: FeishuPublishResponse["notification"]) {
  if (!notification) return "通知：未触发。";
  if (notification.status === "sent") return "通知：已发送到飞书。";
  if (notification.status === "skipped") return "通知：未配置接收人，已跳过。";
  if (notification.status === "failed") return `通知：发送失败，${notification.message || "请检查机器人消息权限和接收人配置。"}`;
  return "通知：状态未知。";
}

function formatBatchStatus(value: BatchProductionJob["status"]) {
  const labels: Record<BatchProductionJob["status"], string> = {
    queued: "排队中",
    running: "执行中",
    completed: "已完成",
    partial: "部分完成",
    failed: "失败",
  };
  return labels[value];
}

function formatTaskStatus(value: ProductionTask["status"]) {
  const labels: Record<ProductionTask["status"], string> = {
    queued: "等待",
    running: "生成中",
    completed: "完成",
    failed: "失败",
    skipped: "跳过",
  };
  return labels[value];
}

function getTaskStatusClass(value: ProductionTask["status"]) {
  if (value === "completed") return "text-[var(--mint)]";
  if (value === "failed") return "text-[var(--rose)]";
  if (value === "skipped") return "text-[var(--amber)]";
  if (value === "running") return "text-[var(--cyan)]";
  return "text-white/45";
}

function getPrimaryReachMetric(item: NormalizedSourceItem) {
  if (item.platform === "douyin" || item.platform === "wechat_channels") {
    return { label: "播放", value: item.metrics.plays || item.metrics.views };
  }
  if (item.platform === "xiaohongshu") {
    return { label: "阅读", value: item.metrics.reads || item.metrics.views };
  }
  return { label: "浏览", value: item.metrics.views || item.metrics.reads };
}

function getDisplayImages(item: NormalizedSourceItem) {
  const frameUrls = getVideoFrameUrls(item);
  if (frameUrls.length && shouldUseVideoFramesAsImagePreview(item)) {
    return frameUrls;
  }
  return mergeDownloadedAndRemoteImages(item.downloadedImages, item.images, { preferDownloaded: true });
}

function toDisplayImageSrc(url?: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  if (url.startsWith("/media/") || url.startsWith("/generated/")) return appendQueryParam(url, "v", localMediaPreviewVersion);
  if (isAbsoluteLocalPath(url)) return `/api/materials/preview?path=${encodeURIComponent(url)}`;
  return url;
}

function postVideoUrls(post: GeneratedPost) {
  return Array.isArray(post.videoUrls) ? post.videoUrls.filter(Boolean) : [];
}

function countPostMedia(post: GeneratedPost) {
  return post.imageUrls.length + postVideoUrls(post).length;
}

function isPreviewableImageAssetPath(url: string) {
  return /^https?:\/\//i.test(url) || url.startsWith("/") || isAbsoluteLocalPath(url);
}

function isAbsoluteLocalPath(url: string) {
  return /^[a-zA-Z]:[\\/]/.test(url) || url.startsWith("\\\\");
}

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function getVideoFrameUrls(item: NormalizedSourceItem) {
  return selectBestVideoHighlightFrames(item.videoFrames).map((frame) => frame.url);
}

function shouldUseVideoFramesAsImagePreview(item: NormalizedSourceItem) {
  return Boolean(
    item.videoFrames?.length &&
      (item.mediaType === "video" || item.mediaType === "mixed" || item.videoUrl || item.downloadedVideoUrl),
  );
}

function sameStringList(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getDisplayVideoUrl(item: NormalizedSourceItem) {
  return item.downloadedVideoUrl || item.videoUrl;
}

function formatFrameTimestamp(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "关键帧";
  if (value < 60) return `${value.toFixed(value % 1 === 0 ? 0 : 1)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatFrameType(value: string) {
  const labels: Record<string, string> = {
    cover: "封面帧",
    interval: "间隔帧",
    scene_change: "转场帧",
    highlight: "高光帧",
  };
  return labels[value] || "关键帧";
}

function calculateEngagementRate(item: NormalizedSourceItem) {
  const reach = getPrimaryReachMetric(item).value || item.metrics.views || 0;
  if (!reach) return 0;
  const engagement =
    (item.metrics.likes || 0) + (item.metrics.collects || 0) + (item.metrics.comments || 0) + (item.metrics.shares || 0);
  return engagement / reach;
}

function calculateQualityScore(item: NormalizedSourceItem) {
  const reach = getPrimaryReachMetric(item).value || 0;
  const engagementRate = calculateEngagementRate(item);
  const collectWeight = (item.metrics.collects || 0) / Math.max(reach, 1);
  const commentWeight = (item.metrics.comments || 0) / Math.max(reach, 1);
  const reachScore = Math.min(Math.log10(Math.max(reach, 1)) * 12, 45);
  const engagementScore = Math.min(engagementRate * 420, 40);
  const qualitySignals = Math.min((collectWeight * 700 + commentWeight * 500), 15);
  return Math.round(Math.min(reachScore + engagementScore + qualitySignals, 100));
}

function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function formatMediaType(value: NormalizedSourceItem["mediaType"]) {
  const labels: Record<NonNullable<NormalizedSourceItem["mediaType"]>, string> = {
    video: "视频",
    image: "图文",
    text: "文字",
    mixed: "图文+视频",
    unknown: "未知类型",
  };
  return labels[value || "unknown"];
}
