"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import {
  Check,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  KeyRound,
  Lightbulb,
  Loader2,
  LogIn,
  LogOut,
  Maximize2,
  Moon,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  UploadCloud,
  User,
  Users,
  Wand2,
  X,
} from "lucide-react";
import {
  defaultCarExteriorWashPrompt,
  defaultImageStrategyPrompts,
  defaultImageWashPrompt,
  defaultPeopleWithCarWashPrompt,
} from "@/lib/creation-controls";
import { defaultDistributionCheckPrompt } from "@/lib/distribution-check-prompt";
import { defaultImageGenerationSize, imageGenerationSizeOptions, isImageGenerationSize, normalizeImageGenerationSize } from "@/lib/image-size-options";
import { getStoredTheme, setStoredTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";
import {
  defaultSimpleRunMediaSettings,
  type ConfigStatus,
  type CrawlPlatform,
  type ImageStrategyPrompts,
  type MaterialFolder,
  type MaterialLibraryAsset,
  type MaterialLibrarySnapshot,
  type SimpleRun,
  type SimpleRunMediaSettings,
  type SourceLinkPlatform,
  type VisualTag,
  type WorkspaceAccount,
  type WorkspacePromptSettings,
} from "@/lib/types";

type SimpleSourceMode = "keyword" | "links" | "feishu" | "viral" | "original";
type LinkImportPlatform = SourceLinkPlatform | "auto";

type AccountSessionResponse = {
  authMode?: "accounts" | "whitelist";
  hasAdminAccount?: boolean;
  whitelistConfigured?: boolean;
  adminConfigured?: boolean;
  setupPasswordConfigured?: boolean;
  account?: WorkspaceAccount | null;
  accounts?: WorkspaceAccount[];
  error?: string;
};

type PreviewState =
  | {
      title: string;
      imageUrls: string[];
      imageIndex: number;
      selectedImageUrls: string[];
    }
  | null;

type ViralMaterialCandidate = {
  id: string;
  path: string;
  name: string;
  folderId: string;
  sourceLabel: string;
};

type ViralMaterialFolderCandidate = {
  id: string;
  name: string;
  imageCount: number;
  selectedCount: number;
  paths: string[];
};

const defaultTextInstruction = "保留“热点观点”角度，换成品牌自己的素材和观点，避免复述原文表达。";
const maxSimpleImageTasksPerPost = 9;

const defaultPlatformCrawlSettings: NonNullable<WorkspacePromptSettings["platformCrawlSettings"]> = {
  wechat_channels: { sort: "relevance" },
  xiaohongshu: { sort: "popularity_descending", noteType: 0 },
  douyin: { sort: "0", contentType: "0" },
  weibo: { sort: "hot", searchType: "hot", includeType: "all", timeScope: "" },
};

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

const themeOptions: Array<{ value: ThemeMode; label: string; icon: ReactNode }> = [
  { value: "professional", label: "专业浅色", icon: <Sun className="h-3.5 w-3.5" /> },
  { value: "editorial", label: "编辑室", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { value: "creator", label: "创作深色", icon: <Moon className="h-3.5 w-3.5" /> },
];

const crawlPlatforms: Array<{ value: CrawlPlatform; label: string; accent: string }> = [
  { value: "wechat_channels", label: "微信视频号", accent: "bg-cyan-300" },
  { value: "xiaohongshu", label: "小红书", accent: "bg-rose-300" },
  { value: "douyin", label: "抖音", accent: "bg-white" },
  { value: "weibo", label: "微博", accent: "bg-amber-300" },
];

const linkImportPlatforms: Array<{ value: SourceLinkPlatform; label: string }> = [
  ...crawlPlatforms.map(({ value, label }) => ({ value, label })),
  { value: "xiaopeng_bbs", label: "小鹏社区" },
  { value: "dongchedi", label: "懂车帝" },
];

const imageStrategyPromptOptions: Array<{
  key: keyof ImageStrategyPrompts;
  tag: VisualTag;
  title: string;
  defaultPrompt: string;
}> = [
  { key: "carExterior", tag: "汽车外观", title: "汽车外观 / 车型美图", defaultPrompt: defaultCarExteriorWashPrompt },
  { key: "textImage", tag: "带文字图", title: "带文字图", defaultPrompt: defaultImageWashPrompt },
  { key: "peopleWithCar", tag: "人车美图", title: "人车美图", defaultPrompt: defaultPeopleWithCarWashPrompt },
];

export default function Home() {
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, () => "professional" as ThemeMode);
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
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspacePromptSettings>(defaultWorkspaceSettings);
  const [simpleSourceMode, setSimpleSourceMode] = useState<SimpleSourceMode>("keyword");
  const [simpleKeyword, setSimpleKeyword] = useState("");
  const [simpleTargetCount, setSimpleTargetCount] = useState(20);
  const [simplePlatforms, setSimplePlatforms] = useState<CrawlPlatform[]>(crawlPlatforms.map((item) => item.value));
  const [simpleLinkPlatform, setSimpleLinkPlatform] = useState<LinkImportPlatform>("auto");
  const [simpleLinkText, setSimpleLinkText] = useState("");
  const [cookie, setCookie] = useState("");
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
  const [materialLibrary, setMaterialLibrary] = useState<MaterialLibrarySnapshot>({ folders: [], assets: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"settings" | "simpleRun" | null>(null);
  const [terminatingSimpleRunId, setTerminatingSimpleRunId] = useState("");
  const [preview, setPreview] = useState<PreviewState>(null);

  const activeSimpleRun = useMemo(
    () => simpleRuns.find((run) => run.id === activeSimpleRunId) || simpleRuns[0] || null,
    [activeSimpleRunId, simpleRuns],
  );
  const simpleLinkCount = useMemo(() => splitLines(simpleLinkText).length, [simpleLinkText]);
  const simpleFeishuTaskCount = useMemo(() => splitFeishuTaskNumbers(simpleFeishuTaskText).length, [simpleFeishuTaskText]);
  const materialLibraryAssetPaths = useMemo(() => materialLibrary.assets.map((asset) => asset.path).filter(Boolean), [materialLibrary.assets]);
  const viralMaterialCandidates = useMemo(() => buildViralMaterialCandidates(materialLibrary.assets, materialLibrary.folders), [materialLibrary.assets, materialLibrary.folders]);
  const viralMaterialFolders = useMemo(
    () => buildViralMaterialFolders(materialLibrary.folders, materialLibrary.assets, simpleViralMaterialPaths),
    [materialLibrary.assets, materialLibrary.folders, simpleViralMaterialPaths],
  );
  const activeSimpleViralMaterialFolderId = useMemo(() => {
    if (viralMaterialFolders.some((folder) => folder.id === simpleViralMaterialFolderId)) return simpleViralMaterialFolderId;
    return findMatchingViralMaterialFolderId(viralMaterialFolders, simpleKeyword) || viralMaterialFolders[0]?.id || "";
  }, [simpleKeyword, simpleViralMaterialFolderId, viralMaterialFolders]);
  const displayedViralMaterialCandidates = useMemo(
    () => viralMaterialCandidates.filter((asset) => !activeSimpleViralMaterialFolderId || asset.folderId === activeSimpleViralMaterialFolderId),
    [activeSimpleViralMaterialFolderId, viralMaterialCandidates],
  );
  const visibleViralMaterialPathSet = useMemo(() => new Set(displayedViralMaterialCandidates.map((asset) => asset.path)), [displayedViralMaterialCandidates]);
  const selectedSimpleViralMaterialPaths = useMemo(
    () => simpleViralMaterialPaths.filter((path) => visibleViralMaterialPathSet.has(path)),
    [simpleViralMaterialPaths, visibleViralMaterialPathSet],
  );

  useEffect(() => {
    void loadAccountSession();
    fetch("/api/config").then((res) => res.json()).then(setConfig).catch(() => setMessage("配置状态读取失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!currentAccount) return;
    void Promise.all([loadWorkspaceSettings(), loadSimpleRuns(), loadMaterialLibrary()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id]);

  useEffect(() => {
    if (!currentAccount || !simpleRuns.some(isSimpleRunLive)) return;
    const timer = window.setInterval(() => void loadSimpleRuns(activeSimpleRunId), 3000);
    return () => window.clearInterval(timer);
  }, [currentAccount, simpleRuns, activeSimpleRunId]);

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
      if (data.account) await loadWorkspaceAccounts();
      else if (data.authMode === "whitelist" && !data.whitelistConfigured) setAccountMessage("Whitelist access is not configured. Set WORKSPACE_ALLOWED_USERS first.");
      else if (data.authMode === "whitelist" && !data.hasAdminAccount) {
        setAccountMessage(data.adminConfigured && data.setupPasswordConfigured ? "Initialize the first administrator account from the whitelist." : "Set WORKSPACE_ADMIN_USERS and WORKSPACE_ACCESS_PASSWORD before initializing the first administrator.");
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
      // The active session remains authoritative when the auxiliary account list fails.
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
            ? { username: accountUsername, password: accountPassword, setupPassword: accountSetupPassword, role: "admin" }
            : { username: accountUsername, password: accountPassword },
        ),
      });
      const data = (await res.json()) as AccountSessionResponse;
      if (!res.ok || !data.account) throw new Error(data.error || "Workspace account sign-in failed");
      setAccountSessionState(data);
      setCurrentAccount(data.account);
      setAccountUsername("");
      setAccountPassword("");
      setAccountSetupPassword("");
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
      setSimpleRuns([]);
      setActiveSimpleRunId("");
      setMaterialLibrary({ folders: [], assets: [] });
      setAccountBusy(false);
    }
  }

  async function loadWorkspaceSettings() {
    try {
      const res = await fetch("/api/workspace/settings");
      const data = (await res.json()) as { settings?: WorkspacePromptSettings; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error || "默认策略读取失败");
      setWorkspaceSettings(data.settings);
      applySimpleRunMediaSettings(data.settings.simpleRunMediaSettings);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "默认策略读取失败");
    }
  }

  async function loadSimpleRuns(preferredRunId?: string) {
    try {
      const res = await fetch("/api/simple/runs");
      const data = (await res.json()) as { runs?: SimpleRun[]; error?: string };
      if (!res.ok) throw new Error(data.error || "精简任务读取失败");
      const runs = data.runs || [];
      setSimpleRuns(runs);
      setActiveSimpleRunId((current) =>
        preferredRunId && runs.some((run) => run.id === preferredRunId)
          ? preferredRunId
          : runs.some((run) => run.id === current)
            ? current
            : runs[0]?.id || "",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "精简任务读取失败");
    }
  }

  async function loadMaterialLibrary() {
    try {
      const res = await fetch("/api/materials/library");
      const data = (await res.json()) as MaterialLibrarySnapshot & { error?: string };
      if (!res.ok) throw new Error(data.error || "素材库读取失败");
      setMaterialLibrary({ folders: data.folders || [], assets: data.assets || [] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "素材库读取失败");
    }
  }

  function applySimpleRunMediaSettings(mediaSettings: SimpleRunMediaSettings) {
    setSimpleGenerateImages(mediaSettings.generateImages);
    setSimpleUseComfyUiKlein(mediaSettings.useComfyUiKlein);
    setSimpleDirectOriginalReference(mediaSettings.directOriginalReference);
    setSimpleIncludeSourceVideo(mediaSettings.includeSourceVideo);
    setSimpleEnableVideoTranscription(mediaSettings.enableVideoTranscription);
  }

  function updateSimpleRunMediaSettingsDraft(patch: Partial<SimpleRunMediaSettings>) {
    const simpleRunMediaSettings = { ...defaultSimpleRunMediaSettings, ...workspaceSettings.simpleRunMediaSettings, ...patch };
    applySimpleRunMediaSettings(simpleRunMediaSettings);
    setWorkspaceSettings((current) => ({ ...current, simpleRunMediaSettings }));
  }

  function updateWorkspaceSettingsDraft(patch: Partial<WorkspacePromptSettings>) {
    setWorkspaceSettings((current) => ({ ...current, ...patch }));
  }

  async function saveWorkspaceSettingsPatch(patch: Partial<WorkspacePromptSettings>) {
    const nextSettings = { ...workspaceSettings, ...patch, updatedAt: new Date().toISOString() };
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
      applySimpleRunMediaSettings(data.settings.simpleRunMediaSettings);
      setMessage("精简版默认生产策略已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "默认策略保存失败");
    } finally {
      setBusy(null);
    }
  }

  function changeSimpleSourceMode(value: SimpleSourceMode) {
    setSimpleSourceMode(value);
    if (value === "links") setSimpleTargetCount(Math.max(1, Math.min(splitLines(simpleLinkText).length || 20, 500)));
    if (value === "feishu") setSimpleTargetCount(Math.max(1, Math.min(splitFeishuTaskNumbers(simpleFeishuTaskText).length || 20, 500)));
    if (value === "viral" || value === "original") setSimpleTargetCount(1);
  }

  function updateSimpleKeyword(value: string) {
    setSimpleKeyword(value);
    setSimpleViralMaterialFolderId(findMatchingViralMaterialFolderId(viralMaterialFolders, value));
  }

  function updateSimpleLinkText(value: string) {
    setSimpleLinkText(value);
    if (simpleSourceMode === "links") setSimpleTargetCount(Math.max(1, Math.min(splitLines(value).length || 1, 500)));
  }

  function updateSimpleFeishuTaskText(value: string) {
    setSimpleFeishuTaskText(value);
    if (simpleSourceMode === "feishu") setSimpleTargetCount(Math.max(1, Math.min(splitFeishuTaskNumbers(value).length || 1, 500)));
  }

  function toggleSimplePlatform(value: CrawlPlatform) {
    setSimplePlatforms((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  function onToggleViralMaterialPath(path: string) {
    setSimpleViralMaterialPaths((current) => {
      if (current.includes(path)) return current.filter((item) => item !== path);
      return current.length >= maxSimpleImageTasksPerPost ? current : [...current, path];
    });
  }

  function onToggleViralMaterialFolder(folderId: string) {
    const folder = viralMaterialFolders.find((item) => item.id === folderId);
    if (!folder) return;
    setSimpleViralMaterialFolderId(folderId);
    setSimpleViralMaterialPaths((current) => {
      const allSelected = folder.paths.every((path) => current.includes(path));
      const withoutFolder = current.filter((path) => !folder.paths.includes(path));
      return allSelected ? withoutFolder : [...withoutFolder, ...folder.paths.slice(0, maxSimpleImageTasksPerPost)];
    });
  }

  function previewViralMaterialPath(path: string) {
    const imageUrls = displayedViralMaterialCandidates.map((asset) => asset.path);
    setPreview({
      title: displayedViralMaterialCandidates.find((asset) => asset.path === path)?.name || "素材预览",
      imageUrls,
      imageIndex: Math.max(0, imageUrls.indexOf(path)),
      selectedImageUrls: selectedSimpleViralMaterialPaths,
    });
  }

  async function startSimpleRun() {
    const sourceMode = simpleSourceMode;
    const links = splitLines(simpleLinkText);
    const feishuTaskNumbers = splitFeishuTaskNumbers(simpleFeishuTaskText);
    const keyword = simpleKeyword.trim();
    const viralUrl = simpleViralUrl.trim();
    const originalPrompt = simpleOriginalPrompt.trim();
    if (sourceMode !== "feishu" && !keyword) return setMessage("请先输入关键词");
    if (sourceMode === "keyword" && !simplePlatforms.length) return setMessage("请至少选择一个采集平台");
    if (sourceMode === "links" && !links.length) return setMessage("请先粘贴需要导入的链接");
    if (sourceMode === "feishu" && !feishuTaskNumbers.length) return setMessage("请先输入飞书任务编号");
    if (sourceMode === "viral" && !viralUrl) return setMessage("请先输入爆款图文链接");
    if (sourceMode === "viral" && simpleGenerateImages && simpleViralImitateImages && !selectedSimpleViralMaterialPaths.length) return setMessage("请选择至少 1 张车型图用于图片模仿");
    if (sourceMode === "original" && !originalPrompt) return setMessage("请先输入原创选题、提问或要求");
    if (sourceMode === "original" && simpleOriginalUseWebSearch && config?.openaiTextEndpoint !== "responses") return setMessage("当前文本接口不支持原创联网搜索");

    const textInstruction = workspaceSettings.textInstruction.trim();
    if (!textInstruction) return setMessage("请填写文字内容提示词");
    const missingImageStrategyPrompt = simpleGenerateImages ? getMissingImageStrategyPrompt(workspaceSettings) : "";
    if (missingImageStrategyPrompt) return setMessage(`请填写${missingImageStrategyPrompt}提示词`);
    const normalizedImageSize = simpleGenerateImages ? normalizeImageSizeInput(workspaceSettings.imageSize) : defaultImageGenerationSize;
    if (simpleGenerateImages && !normalizedImageSize) return setMessage("请输入有效的 GPT 图片尺寸");

    const simpleRunMediaSettings: SimpleRunMediaSettings = {
      generateImages: simpleGenerateImages,
      useComfyUiKlein: simpleUseComfyUiKlein,
      directOriginalReference: simpleDirectOriginalReference,
      includeSourceVideo: simpleIncludeSourceVideo,
      enableVideoTranscription: simpleEnableVideoTranscription,
    };
    const imageStrategyPrompts = trimImageStrategyPrompts(workspaceSettings.imageStrategyPrompts);
    const settingsForRun: WorkspacePromptSettings = {
      ...workspaceSettings,
      textInstruction,
      imageStrategyPrompts,
      imageWashPrompt: imageStrategyPrompts.textImage,
      imageSize: normalizedImageSize,
      simpleRunMediaSettings,
      updatedAt: new Date().toISOString(),
    };
    setWorkspaceSettings(settingsForRun);
    setBusy("simpleRun");
    setMessage("");
    try {
      const res = await fetch("/api/simple/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMode,
          keyword: sourceMode === "feishu" ? "飞书导入" : keyword,
          targetCount: sourceMode === "feishu" ? Math.min(simpleTargetCount, feishuTaskNumbers.length) : sourceMode === "viral" || sourceMode === "original" ? 1 : sourceMode === "links" ? Math.min(simpleTargetCount, links.length) : simpleTargetCount,
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
          materialPaths: materialLibraryAssetPaths,
          settings: settingsForRun,
        }),
      });
      const data = (await res.json()) as { run?: SimpleRun; error?: string };
      if (!res.ok || !data.run) throw new Error(data.error || "精简版自动任务失败");
      setSimpleRuns((current) => [data.run!, ...current.filter((run) => run.id !== data.run!.id)]);
      setActiveSimpleRunId(data.run.id);
      setMessage(isSimpleRunLive(data.run) ? "精简版任务已提交，请查看底部进度。" : buildSimpleRunMessage(data.run));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "精简版自动任务失败");
    } finally {
      setBusy(null);
      await loadSimpleRuns();
    }
  }

  async function terminateSimpleRunFromUi(runId: string) {
    if (!runId || terminatingSimpleRunId) return;
    const run = simpleRuns.find((item) => item.id === runId);
    if (!window.confirm(`确定要强制终止任务“${run?.input.keyword || runId}”吗？`)) return;
    setTerminatingSimpleRunId(runId);
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
      setMessage("已强制终止该任务");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "强制终止任务失败");
    } finally {
      setTerminatingSimpleRunId("");
      await loadSimpleRuns(runId);
    }
  }

  if (accountLoading || !currentAccount) {
    return (
      <main className="app-shell overflow-x-hidden">
        <div className="mx-auto grid min-h-screen w-full max-w-[1680px] place-items-center px-4 text-sm text-white">
          <AccountAccessPanel
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
    <main className="app-shell app-shell-compact overflow-x-hidden">
      <div className="studio-frame mx-auto flex w-full max-w-[1680px] flex-col text-sm text-white">
        <div className="studio-topbar">
          <header className="design-header mb-4 flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="brand-mark grid h-12 w-12 shrink-0 place-items-center rounded-[8px]"><Sparkles className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="header-eyebrow">Social content operations</p>
                <h1 className="truncate text-xl font-black text-white sm:text-2xl">FluxPost Studio</h1>
                <p className="text-xs text-white/55">关键词采集、爆款分析、自动创作、飞书入库的一体化工作台</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <div className="theme-switcher" role="group" aria-label="主题切换">
                {themeOptions.map((option) => (
                  <button key={option.value} className={`theme-option ${theme === option.value ? "theme-option-active" : ""}`} type="button" aria-pressed={theme === option.value} onClick={() => setStoredTheme(option.value)}>
                    {option.icon}<span>{option.label}</span>
                  </button>
                ))}
              </div>
              <AccountMenu account={currentAccount} accounts={workspaceAccounts} open={accountPanelOpen} busy={accountBusy} message={accountMessage} onToggleOpen={() => setAccountPanelOpen((value) => !value)} onRefresh={loadWorkspaceAccounts} onAccountsChanged={loadWorkspaceAccounts} onLogout={logoutWorkspaceAccount} />
              <HeaderLink href="/content" icon={<Database className="h-4 w-4" />} label="采集与内容池" />
              <HeaderLink href="/review" icon={<ExternalLink className="h-4 w-4" />} label="内容审查台" />
              <HeaderLink href="/distribution-check" icon={<ShieldCheck className="h-4 w-4" />} label="是否分发" />
              {currentAccount.role === "admin" ? <HeaderLink href="/config" icon={<Settings className="h-4 w-4" />} label="高级配置" /> : null}
              <ConfigChip label="TikHub" ok={Boolean(config?.tikhubConfigured)} />
              <ConfigChip label={config?.textModel || "GPT"} ok={Boolean(config?.openaiConfigured)} />
              <ConfigChip label="Feishu CLI" ok={Boolean(config?.feishuConfigured)} />
            </div>
          </header>
        </div>

        <div className="studio-body">
          <CompactWorkspace
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
            materialPaths={materialLibraryAssetPaths}
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
        </div>

        <footer className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-xs text-white/45">
          <span>{message || "精简版任务会在后台队列持续执行。"}</span>
          <span>完成草稿可在内容审查台继续处理</span>
        </footer>
      </div>
      <MaterialPreviewDialog preview={preview} onClose={() => setPreview(null)} onNavigate={(index) => setPreview((current) => current ? { ...current, imageIndex: index } : current)} onToggle={(path) => { onToggleViralMaterialPath(path); setPreview((current) => current ? { ...current, selectedImageUrls: current.selectedImageUrls.includes(path) ? current.selectedImageUrls.filter((item) => item !== path) : [...current.selectedImageUrls, path].slice(0, maxSimpleImageTasksPerPost) } : current); }} />
    </main>
  );
}

function CompactWorkspace(props: {
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
  materialPaths: string[];
  settings: WorkspacePromptSettings;
  runs: SimpleRun[];
  activeRun: SimpleRun | null;
  busy: boolean;
  terminatingRunId: string;
  settingsBusy: boolean;
  onSourceModeChange: (value: SimpleSourceMode) => void;
  onKeywordChange: (value: string) => void;
  onTargetCountChange: (value: number) => void;
  onTogglePlatform: (value: CrawlPlatform) => void;
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
  const { sourceMode, keyword, targetCount, selectedPlatforms, linkText, linkPlatform, cookie, videoFrameOriginalReference, useComfyUiKlein, directOriginalReference, includeSourceVideo, enableVideoTranscription, generateImages, writeFeishu, viralImitateImages, viralMaterialFolders, activeViralMaterialFolderId, viralMaterialCandidates, selectedViralMaterialPaths, linkCount, feishuTaskText, feishuTaskCount, viralUrl, originalPrompt, originalUseWebSearch, config, materialPaths, settings, runs, activeRun, busy, terminatingRunId, settingsBusy } = props;
  const sourceDetail = sourceMode === "links" ? `链接 ${linkCount} 条` : sourceMode === "feishu" ? `飞书 ${feishuTaskCount} 条` : sourceMode === "viral" ? "爆款仿写 1 条" : sourceMode === "original" ? "原创 1 条" : `平台 ${selectedPlatforms.length} 个`;
  const canStart = sourceMode === "feishu" ? feishuTaskCount > 0 : sourceMode === "links" ? Boolean(keyword.trim()) && linkCount > 0 : sourceMode === "viral" ? Boolean(keyword.trim() && viralUrl.trim()) && (!generateImages || !viralImitateImages || selectedViralMaterialPaths.length > 0) : sourceMode === "original" ? Boolean(keyword.trim() && originalPrompt.trim()) && (!originalUseWebSearch || config?.openaiTextEndpoint === "responses") : Boolean(keyword.trim() && selectedPlatforms.length);

  return (
    <section className="simple-workspace simple-workspace-compact">
      <aside className="glass ops-panel simple-control-panel thin-scrollbar rounded-[8px] p-4">
        <div className="flex items-center justify-between gap-3"><PanelTitle icon={<Sparkles className="h-4 w-4" />} title="一键内容生产" /><span className="status-badge text-[11px] text-[var(--mint)]">Auto</span></div>
        <div className="simple-control-grid mt-5 space-y-4">
          <div className="simple-source-mode-toggle" role="group" aria-label="精简版来源方式">
            {([
              ["keyword", "关键词采集", <Search key="keyword" className="h-3.5 w-3.5" />],
              ["links", "批量导入链接", <UploadCloud key="links" className="h-3.5 w-3.5" />],
              ["feishu", "飞书编号", <FileText key="feishu" className="h-3.5 w-3.5" />],
              ["viral", "爆款仿写", <Sparkles key="viral" className="h-3.5 w-3.5" />],
              ["original", "原创", <Wand2 key="original" className="h-3.5 w-3.5" />],
            ] as Array<[SimpleSourceMode, string, ReactNode]>).map(([value, label, icon]) => (
              <button key={value} className={`soft-button flex h-10 items-center justify-center gap-2 text-xs font-semibold ${sourceMode === value ? "platform-card-active" : ""}`} type="button" aria-pressed={sourceMode === value} onClick={() => props.onSourceModeChange(value)} disabled={busy || settingsBusy}>{icon}{label}</button>
            ))}
          </div>

          {sourceMode !== "feishu" ? <label><FieldLabel label={sourceMode === "original" ? "写入飞书车型 / 关键词" : "关键词 / 内容池项目"} /><input className="field" value={keyword} onChange={(event) => props.onKeywordChange(event.target.value)} disabled={busy || settingsBusy} /></label> : null}
          <label><FieldLabel label={sourceMode === "keyword" ? "抓取数量" : "生产上限"} /><input className="field" type="number" min={1} max={500} value={sourceMode === "viral" || sourceMode === "original" ? 1 : targetCount} onChange={(event) => props.onTargetCountChange(Number(event.target.value))} disabled={sourceMode === "viral" || sourceMode === "original" || busy || settingsBusy} /></label>

          {sourceMode === "keyword" ? (
            <div><FieldLabel label="采集平台" /><div className="grid grid-cols-2 gap-2">{crawlPlatforms.map((item) => <button key={item.value} className={`platform-card soft-button flex h-12 items-center gap-2 px-3 ${selectedPlatforms.includes(item.value) ? "platform-card-active" : ""}`} type="button" onClick={() => props.onTogglePlatform(item.value)} disabled={busy || settingsBusy}><span className={`h-2.5 w-2.5 rounded-full ${item.accent}`} /><span className="truncate text-xs font-semibold">{item.label}</span></button>)}</div></div>
          ) : sourceMode === "links" ? (
            <div className="simple-link-panel"><FieldLabel label={`批量链接 · ${linkCount} 条`} /><textarea className="field simple-link-textarea" value={linkText} onChange={(event) => props.onLinkTextChange(event.target.value)} disabled={busy || settingsBusy} /><select className="field mt-3" value={linkPlatform} onChange={(event) => props.onLinkPlatformChange(event.target.value as LinkImportPlatform)} disabled={busy || settingsBusy}><option value="auto">自动识别</option>{linkImportPlatforms.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{linkPlatform === "dongchedi" ? <textarea className="field mt-3 min-h-16" value={cookie} onChange={(event) => props.onCookieChange(event.target.value)} placeholder="Cookie" /> : null}<CheckRow checked={videoFrameOriginalReference} disabled={busy || settingsBusy} onChange={props.onVideoFrameOriginalReferenceChange}>视频高光帧原图引用</CheckRow></div>
          ) : sourceMode === "feishu" ? (
            <div className="simple-link-panel"><FieldLabel label={`飞书任务编号 · ${feishuTaskCount} 条`} /><textarea className="field simple-link-textarea" value={feishuTaskText} onChange={(event) => props.onFeishuTaskTextChange(event.target.value)} disabled={busy || settingsBusy} /></div>
          ) : sourceMode === "viral" ? (
            <div className="simple-link-panel"><FieldLabel label="爆款图文链接" /><input className="field" value={viralUrl} onChange={(event) => props.onViralUrlChange(event.target.value)} disabled={busy || settingsBusy} /><CheckRow checked={viralImitateImages} disabled={busy || settingsBusy || !generateImages} onChange={props.onViralImitateImagesChange}>使用素材库图片进行图片模仿</CheckRow>{viralImitateImages && generateImages ? <ViralMaterialPicker folders={viralMaterialFolders} activeFolderId={activeViralMaterialFolderId} candidates={viralMaterialCandidates} selectedPaths={selectedViralMaterialPaths} disabled={busy || settingsBusy} onToggleFolder={props.onToggleViralMaterialFolder} onTogglePath={props.onToggleViralMaterialPath} onPreview={props.onPreviewViralMaterial} onClear={props.onClearViralMaterialPaths} /> : null}</div>
          ) : (
            <div className="simple-link-panel"><FieldLabel label="原创选题、提问或要求" /><textarea className="field simple-link-textarea" value={originalPrompt} onChange={(event) => props.onOriginalPromptChange(event.target.value)} disabled={busy || settingsBusy} /><CheckRow checked={originalUseWebSearch} disabled={busy || settingsBusy || config?.openaiTextEndpoint !== "responses"} onChange={props.onOriginalUseWebSearchChange}>联网搜索</CheckRow></div>
          )}

          <div className="grid gap-2">
            <CheckRow checked={generateImages} disabled={busy || settingsBusy} onChange={props.onGenerateImagesChange}>图片生成</CheckRow>
            {sourceMode !== "viral" && sourceMode !== "original" ? <><CheckRow checked={useComfyUiKlein} disabled={busy || settingsBusy} onChange={props.onUseComfyUiKleinChange}>启用本地 Klein 模型</CheckRow><CheckRow checked={directOriginalReference} disabled={busy || settingsBusy} onChange={props.onDirectOriginalReferenceChange}>直接引用原图</CheckRow><CheckRow checked={includeSourceVideo} disabled={busy || settingsBusy} onChange={props.onIncludeSourceVideoChange}>引用源视频素材</CheckRow><CheckRow checked={enableVideoTranscription} disabled={busy || settingsBusy} onChange={props.onEnableVideoTranscriptionChange}>启用视频音频转文字</CheckRow></> : null}
          </div>

          <label className="simple-write-feishu-row"><input className="mt-1 h-4 w-4 accent-[var(--mint)]" type="checkbox" checked={writeFeishu} onChange={(event) => props.onWriteFeishuChange(event.target.checked)} disabled={busy || settingsBusy} /><span><span className="block text-xs font-black text-white">写入飞书</span><span className="mt-1 block text-[11px] text-white/50">{writeFeishu ? "生成后自动审查并排队写入。" : "只生成本地草稿。"}</span></span></label>

          <div className="simple-policy-preview"><div className="flex items-center justify-between gap-3"><PanelTitle icon={<Lightbulb className="h-4 w-4" />} title="提示词与图片策略" /><span className="status-badge text-[10px] text-[var(--mint)]">可自定义</span></div><div className="simple-prompt-stack mt-3"><label><FieldLabel label="文字内容提示词" /><textarea className="field simple-prompt-textarea" aria-label="精简版文字内容提示词" value={settings.textInstruction} onChange={(event) => props.onSettingsChange({ textInstruction: event.target.value })} disabled={busy || settingsBusy} /></label><ImageStrategyPromptEditor settings={settings} disabled={busy || settingsBusy} onChange={props.onSettingsChange} /><label><FieldLabel label="图片生成尺寸" /><ImageSizeInput className="field" value={settings.imageSize} onChange={(value) => props.onSettingsChange({ imageSize: value })} disabled={busy || settingsBusy} ariaLabel="精简版图片生成尺寸" listId="compact-image-size-presets" /></label></div><div className="mt-3 flex flex-wrap gap-2"><span className="status-badge text-[10px] text-white/52">素材 {materialPaths.length} 个</span><span className="status-badge text-[10px] text-white/52">{settings.imageQuality}</span></div><button className="soft-button mt-3 flex h-10 w-full items-center justify-center gap-2 text-xs" type="button" onClick={props.onSaveSettings} disabled={busy || settingsBusy}>{settingsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}保存当前策略</button></div>

          <button className="primary-button flex h-12 w-full items-center justify-center gap-2" type="button" onClick={props.onStart} disabled={busy || settingsBusy || !canStart}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{busy ? "正在自动执行" : writeFeishu ? "开始生产并写入飞书" : "开始生产待审查内容"}</button>
        </div>
      </aside>
      <SimpleOverallProgressBar runs={runs} activeRun={activeRun} busy={busy} terminatingRunId={terminatingRunId} sourceDetail={sourceDetail} targetCount={targetCount} onTerminateRun={props.onTerminateRun} onSelectRun={props.onSelectRun} />
    </section>
  );
}

function ViralMaterialPicker({ folders, activeFolderId, candidates, selectedPaths, disabled, onToggleFolder, onTogglePath, onPreview, onClear }: { folders: ViralMaterialFolderCandidate[]; activeFolderId: string; candidates: ViralMaterialCandidate[]; selectedPaths: string[]; disabled: boolean; onToggleFolder: (id: string) => void; onTogglePath: (path: string) => void; onPreview: (path: string) => void; onClear: () => void }) {
  return <div className="mt-3"><div className="flex items-center justify-between gap-2"><FieldLabel label={`车型素材 ${selectedPaths.length}/${maxSimpleImageTasksPerPost}`} /><button className="soft-button h-8 px-2 text-[10px]" type="button" onClick={onClear} disabled={disabled || !selectedPaths.length}>清空</button></div><div className="grid grid-cols-2 gap-2">{folders.map((folder) => <button key={folder.id} className={`soft-button h-10 px-2 text-xs ${activeFolderId === folder.id ? "platform-card-active" : ""}`} type="button" onClick={() => onToggleFolder(folder.id)} disabled={disabled}><FolderOpen className="mr-1 inline h-3.5 w-3.5" />{folder.name} {folder.selectedCount}/{folder.imageCount}</button>)}</div><div className="thin-scrollbar mt-3 max-h-56 space-y-2 overflow-y-auto">{candidates.length ? candidates.map((asset) => { const selected = selectedPaths.includes(asset.path); return <div key={asset.id} className={`flex items-center gap-2 rounded-[8px] border p-2 ${selected ? "border-[var(--mint)] bg-[var(--mint)]/10" : "border-white/10 bg-white/[0.035]"}`}><button className="min-w-0 flex-1 text-left" type="button" onClick={() => onTogglePath(asset.path)} disabled={disabled}><span className="flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5" /><span className="truncate text-xs font-black">{asset.name}</span></span></button><button className="soft-button grid h-8 w-8 place-items-center" type="button" onClick={() => onPreview(asset.path)} aria-label="预览车型图"><Maximize2 className="h-3.5 w-3.5" /></button></div>; }) : <div className="empty-state min-h-0 p-4 text-xs text-white/50">暂无可选图片，请到内容台的素材库导入。</div>}</div></div>;
}

function SimpleOverallProgressBar({ runs, activeRun, busy, terminatingRunId, sourceDetail, targetCount, onTerminateRun, onSelectRun }: { runs: SimpleRun[]; activeRun: SimpleRun | null; busy: boolean; terminatingRunId: string; sourceDetail: string; targetCount: number; onTerminateRun: (runId: string) => void; onSelectRun: (runId: string) => void }) {
  const progressRuns = buildSimpleOverallProgressRuns(runs, activeRun);
  const singleRun = progressRuns[0] || activeRun;
  const isMultiRun = progressRuns.length > 1;
  const summaries = progressRuns.map((run) => buildSimpleOverallProgressSummary(run, false, sourceDetail, run.input.targetCount));
  const summary = isMultiRun ? { title: `${progressRuns.length} 个任务进度`, label: summaries.some((item) => item.tone === "running") ? "队列正在执行" : "最近任务", detail: summaries[0]?.detail || sourceDetail, value: summaries.length ? Math.round(summaries.reduce((sum, item) => sum + item.value, 0) / summaries.length) : 0, tone: summaries.some((item) => item.tone === "error") ? "error" : summaries.some((item) => item.tone === "running") ? "running" : "success", crawled: summaries.reduce((sum, item) => sum + item.crawled, 0), produced: summaries.reduce((sum, item) => sum + item.produced, 0), published: summaries.reduce((sum, item) => sum + item.published, 0) } : buildSimpleOverallProgressSummary(singleRun, busy, sourceDetail, targetCount);
  return <section className={`simple-overall-progress glass-strong simple-overall-progress-${summary.tone} ${isMultiRun ? "simple-overall-progress-multi" : ""}`} aria-label="精简版整体进度"><div className="simple-overall-progress-head"><div className="flex min-w-0 items-center gap-3"><span className="simple-overall-progress-icon">{summary.tone === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : summary.tone === "error" ? <X className="h-4 w-4" /> : summary.tone === "success" ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span><div className="min-w-0"><p className="truncate text-sm font-black text-white">{summary.title}</p><p className="mt-1 truncate text-[11px] text-white/52">{summary.label}</p></div></div><div className="simple-overall-side">{!isMultiRun && singleRun && canForceTerminateSimpleRun(singleRun) ? <button className="simple-force-terminate-button" type="button" onClick={() => onTerminateRun(singleRun.id)} disabled={terminatingRunId === singleRun.id}><X className="h-3.5 w-3.5" />强制终止</button> : null}<div className="simple-overall-metrics"><span><strong>{summary.crawled}</strong><em>抓取</em></span><span><strong>{summary.produced}</strong><em>生成</em></span><span><strong>{summary.published}</strong><em>发布</em></span></div></div></div>{isMultiRun ? <div className="simple-overall-run-list thin-scrollbar">{progressRuns.map((run) => { const item = buildSimpleOverallProgressSummary(run, false, sourceDetail, run.input.targetCount); return <article key={run.id} className={`simple-overall-run-row ${run.id === activeRun?.id ? "simple-overall-run-row-active" : ""}`}><button className="simple-overall-run-select" type="button" onClick={() => onSelectRun(run.id)}><span className="simple-overall-run-heading"><span className="simple-overall-run-title">{run.input.keyword || run.id}</span><span className={`status-badge text-[10px] ${getSimpleRunStatusClass(run.status)}`}>{formatSimpleRunStatus(run.status)}</span></span><span className="simple-overall-run-track"><span style={{ width: `${item.value}%` }} /></span></button><span className="simple-overall-run-percent">{item.value}%</span>{canForceTerminateSimpleRun(run) ? <button className="simple-overall-run-stop" type="button" onClick={() => onTerminateRun(run.id)} aria-label={`强制终止 ${run.input.keyword || run.id}`}><X className="h-3.5 w-3.5" /></button> : null}</article>; })}</div> : null}<div className="simple-overall-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.value}><span style={{ width: `${summary.value}%` }} /></div><div className="simple-overall-progress-foot"><span className="truncate">{summary.detail}</span><span className="font-black">{summary.value}%</span></div></section>;
}

function ImageStrategyPromptEditor({ settings, disabled, onChange }: { settings: WorkspacePromptSettings; disabled: boolean; onChange: (patch: Partial<WorkspacePromptSettings>) => void }) {
  return <div className="image-strategy-editor-compact"><FieldLabel label="图片标签策略" /><div className="image-strategy-prompt-grid mt-2">{imageStrategyPromptOptions.map((option) => <label key={option.key} className="simple-prompt-block"><span className="mb-2 block text-[11px] font-black text-white/60">{option.title}</span><textarea className="field simple-prompt-textarea-tall" value={settings.imageStrategyPrompts[option.key]} onChange={(event) => onChange({ imageStrategyPrompts: { ...settings.imageStrategyPrompts, [option.key]: event.target.value }, imageWashPrompt: option.key === "textImage" ? event.target.value : settings.imageWashPrompt })} disabled={disabled} /><button className="prompt-reset-button mt-2" type="button" onClick={() => onChange({ imageStrategyPrompts: { ...settings.imageStrategyPrompts, [option.key]: option.defaultPrompt }, imageWashPrompt: option.key === "textImage" ? option.defaultPrompt : settings.imageWashPrompt })} disabled={disabled}>使用默认</button></label>)}</div></div>;
}

function ImageSizeInput({ value, onChange, disabled, className, ariaLabel, listId }: { value: string; onChange: (value: string) => void; disabled?: boolean; className?: string; ariaLabel: string; listId: string }) {
  return <><input className={className} value={value} list={listId} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)} disabled={disabled} /><datalist id={listId}>{imageGenerationSizeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist></>;
}

function AccountAccessPanel({ loading, busy, bootstrapRequired, username, password, setupPassword, message, onUsernameChange, onPasswordChange, onSetupPasswordChange, onSubmit }: { loading: boolean; busy: boolean; bootstrapRequired: boolean; username: string; password: string; setupPassword: string; message: string; onUsernameChange: (value: string) => void; onPasswordChange: (value: string) => void; onSetupPasswordChange: (value: string) => void; onSubmit: () => void }) {
  return <section className="account-access-shell"><form className="glass account-access-panel rounded-[8px] p-5" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><div className="flex items-center justify-between gap-3"><PanelTitle icon={<KeyRound className="h-4 w-4" />} title={bootstrapRequired ? "初始化管理员" : "账号登录"} /><span className="status-badge text-[11px] text-[var(--mint)]">{bootstrapRequired ? "Admin" : "Session"}</span></div><div className="mt-5 grid gap-3"><label><FieldLabel label="账号" /><input className="field" value={username} autoComplete="username" disabled={loading || busy} onChange={(event) => onUsernameChange(event.target.value)} /></label><label><FieldLabel label="密码" /><input className="field" type="password" value={password} autoComplete={bootstrapRequired ? "new-password" : "current-password"} disabled={loading || busy} onChange={(event) => onPasswordChange(event.target.value)} /></label>{bootstrapRequired ? <label><FieldLabel label="初始化密钥" /><input className="field" type="password" value={setupPassword} disabled={loading || busy} onChange={(event) => onSetupPasswordChange(event.target.value)} /></label> : null}</div><button className="primary-button mt-5 flex w-full items-center justify-center gap-2" type="submit" disabled={loading || busy}>{loading || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}{bootstrapRequired ? "创建管理员并进入" : "进入工作台"}</button>{message ? <p className="mt-3 text-xs text-white/58">{message}</p> : null}</form></section>;
}

function AccountMenu({ account, accounts, open, busy, message, onToggleOpen, onRefresh, onAccountsChanged, onLogout }: { account: WorkspaceAccount; accounts: WorkspaceAccount[]; open: boolean; busy: boolean; message: string; onToggleOpen: () => void; onRefresh: () => void; onAccountsChanged: () => Promise<void> | void; onLogout: () => void }) {
  const [manageUsername, setManageUsername] = useState("");
  const [manageDisplayName, setManageDisplayName] = useState("");
  const [managePassword, setManagePassword] = useState("");
  const [manageRole, setManageRole] = useState<"operator" | "admin">("operator");
  const [manageMessage, setManageMessage] = useState("");
  const [manageBusy, setManageBusy] = useState(false);
  const isAdmin = account.role === "admin";
  async function submitManagedAccount(event: FormEvent) { event.preventDefault(); if (!isAdmin || manageBusy) return; const username = manageUsername.trim().toLowerCase(); const existing = accounts.find((item) => item.username === username); if (!username) return setManageMessage("请输入白名单用户名。"); if (!managePassword && !existing?.passwordSet) return setManageMessage("新账号需要设置密码。"); setManageBusy(true); try { const res = await fetch("/api/accounts", { method: existing?.passwordSet ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: existing?.passwordSet ? existing.id : undefined, username, displayName: manageDisplayName, password: managePassword || undefined, role: manageRole, status: "active" }) }); const data = (await res.json()) as AccountSessionResponse; if (!res.ok) throw new Error(data.error || "账号保存失败"); setManagePassword(""); setManageMessage("账号已保存。"); await onAccountsChanged(); } catch (error) { setManageMessage(error instanceof Error ? error.message : "账号保存失败"); } finally { setManageBusy(false); } }
  async function toggleManagedAccount(item: WorkspaceAccount) { if (!isAdmin || manageBusy || item.id === account.id || !item.passwordSet) return; setManageBusy(true); try { const res = await fetch("/api/accounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: item.status === "active" ? "disabled" : "active" }) }); const data = (await res.json()) as AccountSessionResponse; if (!res.ok) throw new Error(data.error || "账号状态更新失败"); await onAccountsChanged(); } catch (error) { setManageMessage(error instanceof Error ? error.message : "账号状态更新失败"); } finally { setManageBusy(false); } }
  return <div className="account-menu"><button className="account-chip" type="button" onClick={onToggleOpen} aria-expanded={open}><User className="h-3.5 w-3.5" /><span className="truncate">{account.displayName || account.username}</span><span className="account-role">{account.role}</span></button>{open ? <div className="account-popover glass rounded-[8px] p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-black text-white">{account.displayName || account.username}</p><p className="truncate text-[11px] text-white/52">{account.username}</p></div><button className="icon-button" type="button" onClick={onRefresh} title="刷新账号"><RefreshCw className="h-4 w-4" /></button></div><div className="mt-4"><div className="flex items-center gap-2 text-[11px] font-bold uppercase text-white/45"><Users className="h-3.5 w-3.5" />Accounts</div><div className="account-list thin-scrollbar">{accounts.map((item) => <div className="account-list-row account-list-row-managed" key={item.id}><span className="truncate">{item.displayName || item.username}</span><span>{item.username === account.username ? "current" : `${item.role}/${item.status}`}</span>{isAdmin && item.id !== account.id ? <button className="soft-button account-row-action" type="button" onClick={() => toggleManagedAccount(item)} disabled={manageBusy || !item.passwordSet}>{item.status === "active" ? "停用" : "启用"}</button> : null}</div>)}</div></div>{isAdmin ? <form className="account-admin-form mt-4 grid gap-2" onSubmit={submitManagedAccount}><input className="field field-compact" value={manageUsername} onChange={(event) => setManageUsername(event.target.value)} placeholder="白名单用户名" /><input className="field field-compact" value={manageDisplayName} onChange={(event) => setManageDisplayName(event.target.value)} placeholder="显示名" /><input className="field field-compact" type="password" value={managePassword} onChange={(event) => setManagePassword(event.target.value)} placeholder="新密码" /><select className="field field-compact" value={manageRole} onChange={(event) => setManageRole(event.target.value as "operator" | "admin")}><option value="operator">成员</option><option value="admin">管理员</option></select><button className="soft-button h-9 text-xs" type="submit" disabled={manageBusy}>{manageBusy ? "处理中..." : "保存账号"}</button></form> : null}{manageMessage || message ? <p className="mt-3 text-[11px] text-white/52">{manageMessage || message}</p> : null}<button className="soft-button mt-3 flex h-9 w-full items-center justify-center gap-2 text-xs" type="button" onClick={onLogout} disabled={busy || manageBusy}><LogOut className="h-3.5 w-3.5" />退出账号</button></div> : null}</div>;
}

function MaterialPreviewDialog({ preview, onClose, onNavigate, onToggle }: { preview: PreviewState; onClose: () => void; onNavigate: (index: number) => void; onToggle: (path: string) => void }) {
  if (!preview) return null;
  const index = Math.min(Math.max(preview.imageIndex, 0), Math.max(preview.imageUrls.length - 1, 0));
  const path = preview.imageUrls[index];
  return <div className="preview-backdrop" role="dialog" aria-modal="true"><div className="preview-modal"><div className="preview-modal-header"><p className="truncate text-sm font-black text-white">{preview.title}</p><button className="soft-button grid h-9 w-9 place-items-center" type="button" onClick={onClose} aria-label="关闭预览"><X className="h-4 w-4" /></button></div><div className="preview-modal-body thin-scrollbar">{path ? <><div className="preview-image-stage"><Image alt="" className="max-h-[62vh] w-full object-contain" src={toDisplayImageSrc(path)} width={1600} height={900} unoptimized /></div><div className="mt-3 flex items-center justify-center gap-2"><button className="soft-button h-9 px-3 text-xs" type="button" onClick={() => onNavigate((index - 1 + preview.imageUrls.length) % preview.imageUrls.length)}>上一张</button><button className={`soft-button h-9 px-3 text-xs ${preview.selectedImageUrls.includes(path) ? "platform-card-active" : ""}`} type="button" onClick={() => onToggle(path)}>{preview.selectedImageUrls.includes(path) ? "已选择" : "选择"}</button><button className="soft-button h-9 px-3 text-xs" type="button" onClick={() => onNavigate((index + 1) % preview.imageUrls.length)}>下一张</button></div></> : null}</div></div></div>;
}

function HeaderLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) { return <Link className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" href={href}>{icon}{label}</Link>; }
function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) { return <div className="flex min-w-0 items-center gap-2"><span className="panel-title-icon grid h-7 w-7 place-items-center rounded-[8px]">{icon}</span><h2 className="truncate text-sm font-black text-white">{title}</h2></div>; }
function FieldLabel({ label }: { label: string }) { return <span className="mb-1 block text-xs font-semibold text-white/62">{label}</span>; }
function ConfigChip({ label, ok }: { label: string; ok: boolean }) { return <span className={`config-chip ${ok ? "config-chip-ok" : ""}`}><span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[var(--success)]" : "bg-white/30"}`} />{label}</span>; }
function CheckRow({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void; children: ReactNode }) { return <label className="mt-3 flex items-start gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 text-xs text-white/62"><input className="mt-0.5 h-4 w-4 accent-[var(--mint)]" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span>{children}</span></label>; }

function buildViralMaterialCandidates(assets: MaterialLibraryAsset[], folders: MaterialFolder[]) {
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));
  return assets.filter((asset) => asset.kind === "image" || isImageMaterialPath(asset.path, asset.extension)).map<ViralMaterialCandidate>((asset) => ({ id: asset.id, path: asset.path, name: asset.name || getPathFileName(asset.path), folderId: asset.folderId, sourceLabel: folderNames.get(asset.folderId) || "素材库" }));
}

function buildViralMaterialFolders(folders: MaterialFolder[], assets: MaterialLibraryAsset[], selectedPaths: string[]) {
  return folders.map<ViralMaterialFolderCandidate>((folder) => { const paths = assets.filter((asset) => asset.folderId === folder.id && (asset.kind === "image" || isImageMaterialPath(asset.path, asset.extension))).map((asset) => asset.path); return { id: folder.id, name: folder.name, imageCount: paths.length, selectedCount: paths.filter((path) => selectedPaths.includes(path)).length, paths }; }).filter((folder) => folder.imageCount > 0);
}

function findMatchingViralMaterialFolderId(folders: ViralMaterialFolderCandidate[], keyword: string) { const normalized = keyword.trim().toLowerCase(); if (!normalized) return folders[0]?.id || ""; return folders.find((folder) => folder.name.trim().toLowerCase() === normalized)?.id || folders.find((folder) => normalized.includes(folder.name.trim().toLowerCase()) || folder.name.trim().toLowerCase().includes(normalized))?.id || folders[0]?.id || ""; }
function isImageMaterialPath(path: string, extension?: string) { return /\.(?:png|jpe?g|webp|gif|bmp|avif)$/i.test(path) || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"].includes((extension || "").toLowerCase()); }
function getPathFileName(path: string) { return path.split(/[\\/]/).filter(Boolean).pop() || path; }
function splitLines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
function splitFeishuTaskNumbers(value: string) { return Array.from(new Set(value.split(/[\s,，;；\n]+/).map((item) => item.trim()).filter(Boolean))); }
function trimImageStrategyPrompts(prompts: ImageStrategyPrompts): ImageStrategyPrompts { return { carExterior: prompts.carExterior.trim(), textImage: prompts.textImage.trim(), peopleWithCar: prompts.peopleWithCar.trim() }; }
function getMissingImageStrategyPrompt(settings: WorkspacePromptSettings) { return imageStrategyPromptOptions.find((option) => !settings.imageStrategyPrompts[option.key].trim())?.title || ""; }
function normalizeImageSizeInput(value: string) { const trimmed = value.trim(); if (isImageGenerationSize(trimmed)) return normalizeImageGenerationSize(trimmed); return ""; }
function isSimpleRunLive(run: SimpleRun) { return run.status === "queued" || run.status === "running"; }
function canForceTerminateSimpleRun(run: SimpleRun | null | undefined) { return Boolean(run && isSimpleRunLive(run)); }
function buildSimpleOverallProgressRuns(runs: SimpleRun[], activeRun: SimpleRun | null) { const liveRuns = runs.filter(isSimpleRunLive); if (liveRuns.length) return liveRuns.slice(0, 8); return activeRun ? [activeRun] : runs.slice(0, 1); }
function buildSimpleOverallProgressSummary(run: SimpleRun | null | undefined, busy: boolean, sourceDetail: string, targetCount: number) { if (!run) return { title: "整体进度", label: busy ? "正在提交任务" : "等待任务发起", detail: `${sourceDetail} · 目标 ${targetCount} 条`, value: busy ? 8 : 0, tone: busy ? "running" : "idle", crawled: 0, produced: 0, published: 0 }; const stages = run.stages || []; const total = stages.reduce((sum, stage) => sum + stage.total, 0); const finished = stages.reduce((sum, stage) => sum + stage.completed + stage.failed + stage.skipped, 0); const value = run.status === "completed" ? 100 : run.status === "failed" ? 100 : total ? Math.max(4, Math.min(98, Math.round((finished / total) * 100))) : 8; return { title: run.input.keyword || "自动任务", label: formatSimpleRunStatus(run.status), detail: stages.find((stage) => stage.status === "running")?.message || stages.find((stage) => stage.status === "queued")?.message || buildSimpleRunMessage(run), value, tone: run.status === "failed" ? "error" : isSimpleRunLive(run) ? "running" : "success", crawled: run.platformResults.reduce((sum, item) => sum + item.crawled, 0), produced: run.posts.length, published: run.posts.filter((post) => post.status === "published").length }; }
function buildSimpleRunMessage(run: SimpleRun) { const crawled = run.platformResults.reduce((sum, item) => sum + item.crawled, 0); return `任务完成：抓取 ${crawled} 条，生成 ${run.posts.length} 条`; }
function formatSimpleRunStatus(value: SimpleRun["status"]) { return { queued: "排队中", running: "执行中", completed: "已完成", partial: "部分完成", failed: "失败" }[value]; }
function getSimpleRunStatusClass(value: SimpleRun["status"]) { return value === "completed" ? "text-[var(--mint)]" : value === "failed" ? "text-[var(--rose)]" : value === "running" ? "text-[var(--cyan)]" : "text-[var(--amber)]"; }
function isAbsoluteLocalPath(url: string) { return /^[A-Za-z]:[\\/]/.test(url) || url.startsWith("\\\\") || url.startsWith("/"); }
function toDisplayImageSrc(url: string) { if (/^https?:\/\//i.test(url)) return `/api/media/proxy?url=${encodeURIComponent(url)}`; if (isAbsoluteLocalPath(url) && !url.startsWith("/media/") && !url.startsWith("/generated/")) return `/api/materials/preview?path=${encodeURIComponent(url)}`; return url; }
