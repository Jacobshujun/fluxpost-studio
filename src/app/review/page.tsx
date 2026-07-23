"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ChangeEvent, ClipboardEvent, DragEvent, ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Filter,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Maximize2,
  Moon,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  Upload,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import { toRemoteImagePreviewSrc } from "@/lib/media-preview";
import { getStoredTheme, setStoredTheme, subscribeTheme, type ThemeMode } from "@/lib/theme";
import type { FeishuPostPublishState, FeishuPublishJob, GeneratedPost, Platform } from "@/lib/types";

type ReviewFilter = GeneratedPost["status"] | "all" | "ready";
type ReviewTimeFilter = "all" | "today" | "7d" | "30d";
type BusyState = "load" | "save" | "approve" | "review" | "batch" | "publish" | null;

type FeishuPublishResponse = {
  status?: "queued" | "running" | "published" | "attachment_failed" | "needs_config" | "skipped" | "failed" | string;
  jobId?: string;
  queueStatus?: FeishuPublishJob["status"];
  queueAhead?: number;
  activeJobId?: string;
  job?: FeishuPublishJob;
  payloadPath?: string;
  message?: string;
  error?: string;
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

type ImageGenerationResponse = {
  status?: string;
  imageUrls?: string[];
  message?: string;
  error?: string;
};

type ReviewImageUploadResponse = {
  imageUrl?: string;
  bytes?: number;
  mimeType?: string;
  error?: string;
};

type PublishSnapshot = {
  jobId?: string;
  postIds: string[];
  status: "running" | "success" | "warning" | "error";
  title: string;
  detail: string;
  progress: number;
  queueStatus?: FeishuPublishJob["status"];
  notification?: string;
};

type PreviewState = {
  post: GeneratedPost;
  index: number;
  kind?: "image" | "video";
} | null;

const localMediaPreviewVersion = "20260605-image-format-v2";

const reviewFilters: Array<{ value: ReviewFilter; label: string }> = [
  { value: "ready", label: "待发布" },
  { value: "draft", label: "草稿" },
  { value: "editing", label: "编辑中" },
  { value: "approved", label: "已审查" },
  { value: "published", label: "已发布" },
  { value: "all", label: "全部" },
];

const reviewTimeFilters: Array<{ value: ReviewTimeFilter; label: string }> = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

const themeOptions: Array<{ value: ThemeMode; label: string; icon: ReactNode }> = [
  { value: "professional", label: "专业浅色", icon: <Sun className="h-3.5 w-3.5" /> },
  { value: "editorial", label: "编辑室", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { value: "creator", label: "创作深色", icon: <Moon className="h-3.5 w-3.5" /> },
];

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  weibo: "微博",
  wechat_channels: "视频号",
  xiaopeng_bbs: "小鹏社区",
  dongchedi: "\u61c2\u8f66\u5e1d",
  feishu: "飞书",
  original: "原创",
};

export default function ReviewPage() {
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<GeneratedPost | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>("ready");
  const [timeFilter, setTimeFilter] = useState<ReviewTimeFilter>("all");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [reviewPrompt, setReviewPrompt] = useState("");
  const [imagePromptByIndex, setImagePromptByIndex] = useState<Record<string, string>>({});
  const [imageBusyKey, setImageBusyKey] = useState("");
  const [imageUploadPanelOpen, setImageUploadPanelOpen] = useState(false);
  const [busy, setBusy] = useState<BusyState>("load");
  const [message, setMessage] = useState("");
  const [publish, setPublish] = useState<PublishSnapshot | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [feishuVehicleOptions, setFeishuVehicleOptions] = useState<string[]>([]);
  const [feishuVehicleFieldName, setFeishuVehicleFieldName] = useState("车型");
  const [feishuVehicleOptionsMessage, setFeishuVehicleOptionsMessage] = useState("");
  const theme = useSyncExternalStore(subscribeTheme, getStoredTheme, () => "professional" as ThemeMode);

  const selectedPosts = useMemo(() => posts.filter((post) => selectedPostIds.includes(post.id)), [posts, selectedPostIds]);
  const filteredPosts = useMemo(
    () => filterPosts(posts, { statusFilter: filter, timeFilter, keywordFilter, authorFilter, platformFilter }),
    [posts, filter, timeFilter, keywordFilter, authorFilter, platformFilter],
  );
  const summary = useMemo(() => buildSummary(posts), [posts]);
  const authorOptions = useMemo(() => buildAuthorOptions(posts), [posts]);
  const platformOptions = useMemo(() => buildPlatformOptions(posts), [posts]);

  const loadPosts = useCallback(async (preferredPostId?: string) => {
    setBusy((current) => current || "load");
    try {
      const res = await fetch("/api/production/posts");
      const data = (await res.json()) as { posts?: GeneratedPost[]; error?: string };
      if (!res.ok) throw new Error(data.error || "加载生成稿失败");
      const nextPosts = data.posts || [];
      const nextSelectedId =
        preferredPostId && nextPosts.some((post) => post.id === preferredPostId)
          ? preferredPostId
          : selectedPostId && nextPosts.some((post) => post.id === selectedPostId)
            ? selectedPostId
            : nextPosts[0]?.id || "";
      setPosts(nextPosts);
      setSelectedPostId(nextSelectedId);
      setSelectedPostIds((current) => current.filter((id) => nextPosts.some((post) => post.id === id)));
      setDraft(nextPosts.find((post) => post.id === nextSelectedId) || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载生成稿失败");
    } finally {
      setBusy(null);
    }
  }, [selectedPostId]);

  const pollPublishJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/publish/feishu?jobId=${encodeURIComponent(jobId)}`);
      const data = (await res.json()) as FeishuPublishResponse;
      if (!res.ok) throw new Error(data.error || "飞书任务轮询失败");
      const sourcePosts = data.job?.posts?.length ? data.job.posts : selectedPosts.length ? selectedPosts : draft ? [draft] : [];
      setPublish(buildPublishSnapshot(sourcePosts, data));
      if (data.job && !isFeishuPublishQueueLive(data.job.status)) {
        await loadPosts(sourcePosts[0]?.id || selectedPostId);
      }
    } catch (error) {
      setPublish((current) =>
        current
          ? {
              ...current,
              status: "error",
              title: "飞书任务轮询失败",
              detail: error instanceof Error ? error.message : "飞书任务轮询失败",
              progress: 100,
            }
          : null,
      );
    }
  }, [draft, loadPosts, selectedPostId, selectedPosts]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    async function loadFeishuVehicleOptions() {
      try {
        const res = await fetch("/api/publish/feishu/vehicle-options");
        const data = (await res.json()) as FeishuVehicleOptionsResponse;
        if (!res.ok) throw new Error(data.error || "Failed to load Feishu vehicle options");
        setFeishuVehicleOptions(data.options || []);
        setFeishuVehicleFieldName(data.fieldName || "车型");
        setFeishuVehicleOptionsMessage(data.message || "");
      } catch (error) {
        setFeishuVehicleOptions([]);
        setFeishuVehicleOptionsMessage(error instanceof Error ? error.message : "Failed to load Feishu vehicle options");
      }
    }
    void loadFeishuVehicleOptions();
  }, []);

  useEffect(() => {
    if (!publish?.jobId || !isFeishuPublishQueueLive(publish.queueStatus)) return;
    const timer = window.setInterval(() => {
      void pollPublishJob(publish.jobId || "");
    }, 2500);
    return () => window.clearInterval(timer);
  }, [pollPublishJob, publish?.jobId, publish?.queueStatus]);

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
      if (event.key === "ArrowLeft") setPreview((current) => navigatePreview(current, -1));
      if (event.key === "ArrowRight") setPreview((current) => navigatePreview(current, 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview]);

  function selectPost(post: GeneratedPost) {
    setSelectedPostId(post.id);
    setDraft(post);
    setImageBusyKey("");
    setImageUploadPanelOpen(false);
    setMessage("");
  }

  function toggleSelection(postId: string) {
    setSelectedPostIds((current) => (current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]));
  }

  function selectVisible() {
    setSelectedPostIds(filteredPosts.slice(0, 200).map((post) => post.id));
  }

  function mergeSavedPost(savedPost: GeneratedPost, preferredPostId?: string) {
    const nextPosts = upsertReviewPost(posts, savedPost);
    const nextSelectedId =
      preferredPostId && nextPosts.some((post) => post.id === preferredPostId)
        ? preferredPostId
        : nextPosts.some((post) => post.id === savedPost.id)
          ? savedPost.id
          : nextPosts[0]?.id || "";
    setPosts(nextPosts);
    setSelectedPostId(nextSelectedId);
    setSelectedPostIds((current) => current.filter((id) => nextPosts.some((post) => post.id === id)));
    setDraft(nextPosts.find((post) => post.id === nextSelectedId) || null);
  }

  async function saveDraft(patch?: Partial<GeneratedPost>, instruction?: string, options?: { nextPostId?: string; busyState?: BusyState }) {
    if (!draft) return;
    setBusy(options?.busyState || (instruction ? "review" : "save"));
    setMessage("");
    try {
      const manualPatch = {
        title: draft.title,
        body: draft.body,
        imagePrompt: draft.imagePrompt,
        imageUrls: draft.imageUrls,
        videoUrls: draft.videoUrls,
        imageTasks: draft.imageTasks,
        feishuVehicle: draft.feishuVehicle,
        ...patch,
      };
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post: draft, manualPatch, instruction }),
      });
      const data = (await res.json()) as { post?: GeneratedPost; error?: string };
      if (!res.ok || !data.post) throw new Error(data.error || "保存审查修改失败");
      const nextSelectedId = options?.nextPostId || data.post.id;
      mergeSavedPost(data.post, nextSelectedId);
      setMessage(data.post.status === "approved" ? "已通过审查" : "已保存修改");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存审查修改失败");
    } finally {
      setBusy(null);
    }
  }

  async function approveDraft() {
    if (!draft) return;
    const nextPostId = findNextUnreviewedPostId(posts, draft.id);
    await saveDraft({ status: "approved" }, undefined, { nextPostId, busyState: "approve" });
  }

  function moveDraftImage(index: number, delta: -1 | 1) {
    if (!draft) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= draft.imageUrls.length) return;
    const imageUrls = [...draft.imageUrls];
    [imageUrls[index], imageUrls[nextIndex]] = [imageUrls[nextIndex], imageUrls[index]];
    setDraft({ ...draft, imageUrls });
    setImagePromptByIndex((current) => moveImagePromptValues(current, draft, index, nextIndex));
  }

  function removeDraftImage(index: number) {
    if (!draft || !draft.imageUrls[index]) return;
    const imageUrls = draft.imageUrls.filter((_, currentIndex) => currentIndex !== index);
    const nextDraft = { ...draft, imageUrls };
    setDraft(nextDraft);
    setImagePromptByIndex((current) => removeImagePromptValue(current, draft, index));
    setPreview((current) => {
      if (!current || current.post.id !== draft.id || current.kind === "video") return current;
      if (!imageUrls.length) return null;
      return { post: nextDraft, index: Math.min(current.index, imageUrls.length - 1), kind: "image" };
    });
  }

  function removeDraftVideo(index: number) {
    if (!draft || !postVideoUrls(draft)[index]) return;
    const videoUrls = postVideoUrls(draft).filter((_, currentIndex) => currentIndex !== index);
    const nextDraft = { ...draft, videoUrls };
    setDraft(nextDraft);
    setPreview((current) => {
      if (!current || current.post.id !== draft.id || current.kind !== "video") return current;
      if (!videoUrls.length) return null;
      return { post: nextDraft, index: Math.min(current.index, videoUrls.length - 1), kind: "video" };
    });
  }

  function replaceDraftImage(index: number, imageUrl: string, nextMessage: string) {
    if (!draft || !draft.imageUrls[index]) return;
    const postId = draft.id;
    setDraft((currentDraft) => {
      if (!currentDraft || currentDraft.id !== postId || !currentDraft.imageUrls[index]) return currentDraft;
      const imageUrls = [...currentDraft.imageUrls];
      imageUrls[index] = imageUrl;
      const nextDraft = { ...currentDraft, imageUrls };
      setPreview((current) => {
        if (!current || current.post.id !== postId || current.kind === "video") return current;
        return { post: nextDraft, index: Math.min(current.index, imageUrls.length - 1), kind: "image" };
      });
      return nextDraft;
    });
    setMessage(nextMessage);
  }

  function appendDraftImage(imageUrl: string, nextMessage: string) {
    if (!draft) return;
    const postId = draft.id;
    setDraft((currentDraft) => {
      if (!currentDraft || currentDraft.id !== postId) return currentDraft;
      const imageUrls = [...currentDraft.imageUrls, imageUrl];
      const nextDraft = { ...currentDraft, imageUrls };
      setPreview((current) => (current && current.post.id === postId && current.kind !== "video" ? { post: nextDraft, index: current.index, kind: "image" } : current));
      return nextDraft;
    });
    setMessage(nextMessage);
  }

  async function regenerateDraftImage(index: number) {
    if (!draft || !draft.imageUrls[index]) return;
    const prompt = resolveDraftImagePrompt(draft, imagePromptByIndex, index).trim();
    if (!prompt) {
      setMessage(`第 ${index + 1} 张图片缺少 Prompt`);
      return;
    }
    setImageBusyKey(`regenerate:${index}`);
    setMessage("");
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, count: 1 }),
      });
      const data = (await res.json()) as ImageGenerationResponse;
      const imageUrl = data.imageUrls?.[0];
      if (!res.ok || !imageUrl) throw new Error(data.error || data.message || "图片模型没有返回新图");
      replaceDraftImage(index, imageUrl, `第 ${index + 1} 张图片已重新生成，保存后生效`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片重新生成失败");
    } finally {
      setImageBusyKey("");
    }
  }

  async function uploadDraftImageAddition(file: File) {
    if (!draft) return;
    const uploadImageIndex = getPersistedPostImageCount(posts, draft.id, draft.imageUrls.length);
    const displayImageIndex = draft.imageUrls.length;
    setImageBusyKey("upload:add");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("postId", draft.id);
      form.append("imageIndex", String(uploadImageIndex));
      form.append("mode", "append");
      const res = await fetch("/api/review/images", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as ReviewImageUploadResponse;
      if (!res.ok || !data.imageUrl) throw new Error(data.error || "图片上传失败");
      appendDraftImage(data.imageUrl, `第 ${displayImageIndex + 1} 张图片已新增，保存后生效`);
      setImageUploadPanelOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片新增失败");
    } finally {
      setImageBusyKey("");
    }
  }

  async function uploadDraftImageReplacement(file: File, index: number) {
    if (!draft || !draft.imageUrls[index]) return;
    setImageBusyKey(`upload:${index}`);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("postId", draft.id);
      form.append("imageIndex", String(index));
      const res = await fetch("/api/review/images", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as ReviewImageUploadResponse;
      if (!res.ok || !data.imageUrl) throw new Error(data.error || "图片上传失败");
      replaceDraftImage(index, data.imageUrl, `第 ${index + 1} 张图片已替换，保存后生效`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片替换失败");
    } finally {
      setImageBusyKey("");
    }
  }

  function handleDraftImageFileChange(event: ChangeEvent<HTMLInputElement>, index: number) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void uploadDraftImageReplacement(file, index);
  }

  function handleDraftImageAddFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void uploadDraftImageAddition(file);
  }

  function handleDraftImagePaste(event: ClipboardEvent<HTMLElement>, index: number) {
    const file = getClipboardImageFile(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    void uploadDraftImageReplacement(file, index);
  }

  function handleDraftImageAddPaste(event: ClipboardEvent<HTMLElement>) {
    const file = getClipboardImageFile(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    if (busy || imageBusyKey) return;
    void uploadDraftImageAddition(file);
  }

  function handleDraftImageAddDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || imageBusyKey) return;
    const file = getDataTransferImageFile(event.dataTransfer);
    if (!file) return;
    void uploadDraftImageAddition(file);
  }

  async function batchSetStatus(status: GeneratedPost["status"]) {
    if (!selectedPostIds.length) return;
    setBusy("batch");
    setMessage("");
    try {
      const res = await fetch("/api/production/posts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", ids: selectedPostIds, status }),
      });
      const data = (await res.json()) as { updatedCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "批量更新失败");
      await loadPosts(selectedPostId);
      setMessage(`已更新 ${data.updatedCount || 0} 条生成稿`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量更新失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelected() {
    if (!selectedPostIds.length || !window.confirm(`确认删除已选 ${selectedPostIds.length} 条生成稿？该操作不可撤销。`)) return;
    setBusy("batch");
    setMessage("");
    try {
      const res = await fetch("/api/production/posts/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: selectedPostIds }),
      });
      const data = (await res.json()) as { deletedCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "批量删除失败");
      setSelectedPostIds([]);
      await loadPosts();
      setMessage(`已删除 ${data.deletedCount || 0} 条生成稿`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量删除失败");
    } finally {
      setBusy(null);
    }
  }

  async function publishSelected() {
    let postsToPublish = selectedPosts.length ? selectedPosts : draft ? [draft] : [];
    if (!postsToPublish.length) return;
    setBusy("publish");
    setMessage("");
    setPublish({
      postIds: postsToPublish.map((post) => post.id),
      status: "running",
      title: "正在提交飞书写入队列",
      detail: `准备写入 ${postsToPublish.length} 条内容，素材共 ${countPostMedia(postsToPublish)} 个。`,
      progress: 32,
      notification: "完成后会按当前配置发送飞书通知。",
    });
    try {
      if (draft && postsToPublish.some((post) => post.id === draft.id)) {
        const savedDraft = await saveDraftForPublish(draft);
        postsToPublish = postsToPublish.map((post) => (post.id === savedDraft.id ? savedDraft : post));
      }
      const payloadPosts = postsToPublish.map((post) => (post.status === "approved" ? post : { ...post, status: "approved" as const }));
      const res = await fetch("/api/publish/feishu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: payloadPosts }),
      });
      const data = (await res.json()) as FeishuPublishResponse;
      if (!res.ok) throw new Error(data.error || "写入飞书失败");
      setPublish(buildPublishSnapshot(payloadPosts, data));
      await loadPosts(payloadPosts[0]?.id);
      setMessage(buildPublishMessage(data));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "写入飞书失败";
      setPublish({
        postIds: postsToPublish.map((post) => post.id),
        status: "error",
        title: "飞书写入失败",
        detail,
        progress: 100,
      });
      setMessage(detail);
    } finally {
      setBusy(null);
    }
  }

  async function saveDraftForPublish(value: GeneratedPost) {
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post: value,
        manualPatch: {
          title: value.title,
          body: value.body,
          imagePrompt: value.imagePrompt,
          imageUrls: value.imageUrls,
          videoUrls: value.videoUrls,
          imageTasks: value.imageTasks,
          feishuVehicle: value.feishuVehicle,
          status: "approved",
        },
      }),
    });
    const data = (await res.json()) as { post?: GeneratedPost; error?: string };
    if (!res.ok || !data.post) throw new Error(data.error || "Failed to save Feishu vehicle before publish");
    setDraft(data.post);
    setSelectedPostId(data.post.id);
    return data.post;
  }

  return (
    <main className="app-shell review-shell overflow-x-hidden">
      <div className="review-frame mx-auto flex w-full max-w-[1880px] flex-col gap-3 text-sm">
        <header className="review-header glass-strong ops-panel">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark grid h-12 w-12 shrink-0 place-items-center rounded-[8px]">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="header-eyebrow">Review operations</p>
              <h1 className="truncate text-xl font-black sm:text-2xl">内容审查台</h1>
              <p className="truncate text-xs text-[var(--text-muted)]">集中审稿、批量审批、批量写入飞书</p>
            </div>
          </div>
          <div className="review-header-actions">
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
              返回工作台
            </Link>
            <button className="soft-button inline-flex h-10 items-center justify-center gap-2 px-3 text-xs font-black" type="button" onClick={() => loadPosts(selectedPostId)} disabled={Boolean(busy)}>
              {busy === "load" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </button>
          </div>
        </header>

        <section className="review-metrics">
          <Metric label="全部生成稿" value={summary.total} />
          <Metric label="待发布" value={summary.ready} />
          <Metric label="已审查" value={summary.approved} />
          <Metric label="已发布" value={summary.published} />
          <Metric label="已选" value={selectedPostIds.length} />
        </section>

        <section className="review-workspace">
          <aside className="review-sidebar glass ops-panel">
            <div className="review-filter-stack">
              <div className="review-search">
                <Search className="h-4 w-4" />
                <input className="field search-field h-10" value={keywordFilter} onChange={(event) => setKeywordFilter(event.target.value)} placeholder="关键字：标题、正文、车型" />
              </div>
              <div className="review-filter-grid">
                <label className="review-filter-field">
                  <span><CalendarClock className="h-3.5 w-3.5" />时间</span>
                  <select className="field h-10" value={timeFilter} onChange={(event) => setTimeFilter(event.target.value as ReviewTimeFilter)}>
                    {reviewTimeFilters.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="review-filter-field">
                  <span><UserRound className="h-3.5 w-3.5" />内容作者</span>
                  <select className="field h-10" value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)}>
                    <option value="">全部作者</option>
                    {authorOptions.map((author) => (
                      <option key={author} value={author}>{author}</option>
                    ))}
                  </select>
                </label>
                <label className="review-filter-field">
                  <span><Filter className="h-3.5 w-3.5" />采集平台</span>
                  <select className="field h-10" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value as Platform | "all")}>
                    <option value="all">全部平台</option>
                    {platformOptions.map((item) => (
                      <option key={item} value={item}>{platformLabels[item] || item}</option>
                    ))}
                  </select>
                </label>
                <label className="review-filter-field">
                  <span><Tag className="h-3.5 w-3.5" />状态</span>
                  <select className="field h-10" value={filter} onChange={(event) => setFilter(event.target.value as ReviewFilter)}>
                    {reviewFilters.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {reviewFilters.map((item) => (
                <button key={item.value} className={`filter-chip ${filter === item.value ? "filter-chip-active" : ""}`} type="button" onClick={() => setFilter(item.value)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="batch-action-bar mt-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-black">批量审查</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">已选 {selectedPostIds.length} / 当前 {filteredPosts.length}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button className="soft-button h-9 px-3 text-xs" type="button" onClick={selectVisible} disabled={Boolean(busy) || !filteredPosts.length}>
                  全选当前
                </button>
                <button className="soft-button h-9 px-3 text-xs" type="button" onClick={() => setSelectedPostIds([])} disabled={Boolean(busy) || !selectedPostIds.length}>
                  清空
                </button>
              </div>
            </div>
            <div className="review-list thin-scrollbar">
              {filteredPosts.length ? (
                filteredPosts.map((post) => (
                  <article key={post.id} className={`review-list-card ${selectedPostId === post.id ? "review-list-card-active" : ""}`}>
                    <label className={`selection-toggle ${selectedPostIds.includes(post.id) ? "selection-toggle-active" : ""}`} aria-label="选择生成稿">
                      <input className="sr-only" type="checkbox" checked={selectedPostIds.includes(post.id)} onChange={() => toggleSelection(post.id)} />
                      <Check className={`h-3.5 w-3.5 ${selectedPostIds.includes(post.id) ? "text-[var(--mint)]" : "text-[var(--text-muted)]"}`} />
                      <span>{selectedPostIds.includes(post.id) ? "已选" : "选择"}</span>
                    </label>
                    <button className="w-full text-left" type="button" onClick={() => selectPost(post)}>
                      <div className="flex gap-3 pr-16">
                        <PostThumb post={post} />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-black">{post.title || "未命名生成稿"}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{post.body || post.imagePrompt}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <StatusBadge status={post.status} />
                            <span className="status-badge text-[10px] text-[var(--text-muted)]">{platformLabels[post.platform] || post.platform}</span>
                            <span className="status-badge text-[10px] text-[var(--text-muted)]">{countPostMedia([post])} 素材</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty-state min-h-0 p-4 text-xs text-[var(--text-muted)]">当前筛选没有生成稿</div>
              )}
            </div>
          </aside>

          <section className="review-main glass-strong ops-panel thin-scrollbar">
            {draft ? (
              <>
                <div className="review-main-title">
                  <div className="min-w-0">
                    <p className="header-eyebrow">Selected package</p>
                    <h2 className="truncate text-xl font-black">{draft.title || "未命名生成稿"}</h2>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge status={draft.status} />
                    <span className="status-badge text-[11px] text-[var(--text-muted)]">V{draft.version || 1}</span>
                    <span className="status-badge text-[11px] text-[var(--text-muted)]">{formatShortTime(draft.updatedAt)}</span>
                  </div>
                </div>

                <div className="review-editor-grid">
                  <div className="review-gallery">
                    {draft.imageUrls.length ? (
                      <>
                        {draft.imageUrls.map((url, index) => (
                        <div
                          key={`${url}-${index}`}
                          className={`review-gallery-tile ${index === 0 ? "review-gallery-tile-primary" : ""}`}
                          tabIndex={0}
                          onPaste={(event) => handleDraftImagePaste(event, index)}
                        >
                          <button className="review-gallery-preview" type="button" onClick={() => setPreview({ post: draft, index, kind: "image" })}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img alt={`最终配图 ${index + 1}`} src={toDisplayImageSrc(url)} referrerPolicy="no-referrer" />
                            <span className="review-gallery-index">{index + 1}</span>
                          </button>
                          <div className="review-gallery-tools" aria-label={`配图 ${index + 1} 操作`}>
                            <button className="review-gallery-tool" type="button" onClick={() => moveDraftImage(index, -1)} disabled={index === 0 || Boolean(busy)} aria-label="上移配图">
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button className="review-gallery-tool" type="button" onClick={() => moveDraftImage(index, 1)} disabled={index === draft.imageUrls.length - 1 || Boolean(busy)} aria-label="下移配图">
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button className="review-gallery-tool review-gallery-tool-danger" type="button" onClick={() => removeDraftImage(index)} disabled={Boolean(busy)} aria-label="删除配图">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="review-image-editor">
                            <textarea
                              className="field review-image-prompt"
                              value={resolveDraftImagePrompt(draft, imagePromptByIndex, index)}
                              onChange={(event) =>
                                setImagePromptByIndex((current) => ({
                                  ...current,
                                  [imagePromptKey(draft.id, index)]: event.target.value,
                                }))
                              }
                              onPaste={(event) => handleDraftImagePaste(event, index)}
                              placeholder={`第 ${index + 1} 张图片 Prompt`}
                            />
                            <div className="review-image-actions">
                              <button
                                className="review-gallery-tool"
                                type="button"
                                onClick={() => regenerateDraftImage(index)}
                                disabled={Boolean(busy) || Boolean(imageBusyKey)}
                                aria-label={`重新生成第 ${index + 1} 张配图`}
                                title="重新生成"
                              >
                                {imageBusyKey === `regenerate:${index}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                              </button>
                              <label
                                className={`review-gallery-tool ${Boolean(busy) || Boolean(imageBusyKey) ? "review-gallery-tool-disabled" : ""}`}
                                aria-label={`上传替换第 ${index + 1} 张配图`}
                                title="上传替换"
                              >
                                {imageBusyKey === `upload:${index}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                <input
                                  className="review-file-input"
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                                  disabled={Boolean(busy) || Boolean(imageBusyKey)}
                                  onChange={(event) => handleDraftImageFileChange(event, index)}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                        ))}
                        <ReviewImageAddTile busy={Boolean(busy) || Boolean(imageBusyKey)} isUploading={imageBusyKey === "upload:add"} onOpen={() => setImageUploadPanelOpen(true)} />
                      </>
                    ) : (
                      <ReviewImageAddTile empty busy={Boolean(busy) || Boolean(imageBusyKey)} isUploading={imageBusyKey === "upload:add"} onOpen={() => setImageUploadPanelOpen(true)} />
                    )}
                    {postVideoUrls(draft).map((url, index) => (
                      <div key={`${url}-${index}`} className="review-gallery-tile review-video-tile" tabIndex={0}>
                        <button className="review-gallery-preview" type="button" onClick={() => setPreview({ post: draft, index, kind: "video" })}>
                          <video src={url} controls preload="metadata" />
                          <span className="review-gallery-index">V{index + 1}</span>
                        </button>
                        <div className="review-gallery-tools" aria-label={`瑙嗛 ${index + 1} 鎿嶄綔`}>
                          <button className="review-gallery-tool review-gallery-tool-danger" type="button" onClick={() => removeDraftVideo(index)} disabled={Boolean(busy)} aria-label="鍒犻櫎瑙嗛">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="review-editor-fields">
                    <label>
                      <FieldLabel label="标题" />
                      <input className="field mt-2 text-base font-black" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                    </label>
                    <label>
                      <FieldLabel label="正文" />
                      <textarea className="field review-body-editor mt-2" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
                    </label>
                    <label>
                      <FieldLabel label={`写入飞书${feishuVehicleFieldName}`} />
                      <select
                        className="field mt-2 h-10"
                        value={draft.feishuVehicle ?? draft.taskKeyword ?? ""}
                        onChange={(event) => setDraft({ ...draft, feishuVehicle: event.target.value })}
                      >
                        <option value="">未选择</option>
                        {feishuVehicleOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {feishuVehicleOptionsMessage ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">{feishuVehicleOptionsMessage}</p> : null}
                    </label>
                  </div>
                </div>

                <div className="review-action-strip">
                  <button className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-xs font-black" type="button" onClick={() => setPreview({ post: draft, index: 0, kind: draft.imageUrls.length ? "image" : "video" })} disabled={!countPostMedia([draft])}>
                    <Maximize2 className="h-4 w-4" />
                    大图预览
                  </button>
                  <button className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-xs font-black" type="button" onClick={() => saveDraft()} disabled={Boolean(busy)}>
                    {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    保存修改
                  </button>
                  <button className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-xs font-black" type="button" onClick={approveDraft} disabled={Boolean(busy)}>
                    {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 text-[var(--mint)]" />}
                    审查通过
                  </button>
                  <button className="primary-button inline-flex h-11 items-center justify-center gap-2 px-4 text-xs font-black" type="button" onClick={publishSelected} disabled={Boolean(busy)}>
                    {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {selectedPosts.length > 1 ? `写入飞书 ${selectedPosts.length}` : "写入飞书"}
                  </button>
                </div>

                <div className="review-ai-box">
                  <FieldLabel label="Prompt 修改" />
                  <textarea className="field mt-2 min-h-24 resize-y" value={reviewPrompt} onChange={(event) => setReviewPrompt(event.target.value)} />
                  <button
                    className="soft-button mt-2 inline-flex h-10 items-center justify-center gap-2 px-4 text-xs font-black"
                    type="button"
                    onClick={() => {
                      void saveDraft(undefined, reviewPrompt.trim());
                      setReviewPrompt("");
                    }}
                    disabled={Boolean(busy) || !reviewPrompt.trim()}
                  >
                    {busy === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    AI 修改
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Sparkles className="h-6 w-6" />
                <span>选择一条生成稿开始审查</span>
              </div>
            )}
          </section>

          <aside className="review-publish-panel glass ops-panel">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="header-eyebrow">Batch publish</p>
                <h2 className="truncate text-base font-black">批量操作</h2>
              </div>
              <span className="status-badge text-[11px] text-[var(--text-muted)]">{selectedPostIds.length} 已选</span>
            </div>

            <div className="mt-4 grid gap-2">
              <button className="soft-button flex h-11 items-center justify-center gap-2 text-xs font-black" type="button" onClick={() => batchSetStatus("approved")} disabled={Boolean(busy) || !selectedPostIds.length}>
                <ShieldCheck className="h-4 w-4" />
                批量审查通过
              </button>
              <button className="primary-button flex h-11 items-center justify-center gap-2 text-xs font-black" type="button" onClick={publishSelected} disabled={Boolean(busy) || (!selectedPostIds.length && !draft)}>
                {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                批量写入飞书
              </button>
              <button className="soft-button flex h-11 items-center justify-center gap-2 text-xs font-black text-[var(--rose)]" type="button" onClick={deleteSelected} disabled={Boolean(busy) || !selectedPostIds.length}>
                <Trash2 className="h-4 w-4" />
                删除所选
              </button>
            </div>

            {message ? <div className="approval-banner mt-4">{message}</div> : null}
            {publish ? <PublishStatusCard publish={publish} /> : null}

            <div className="content-cluster mt-4">
              <p className="mb-2 text-xs font-black">当前选择</p>
              <div className="space-y-2">
                {(selectedPosts.length ? selectedPosts : draft ? [draft] : []).slice(0, 10).map((post) => (
                  <div key={post.id} className="review-selected-row">
                    <span className="truncate">{post.title || "未命名生成稿"}</span>
                    <span className="status-badge max-w-[8rem] truncate text-[11px] text-[var(--text-muted)]">
                      {post.feishuVehicle || post.taskKeyword || "未选择"}
                    </span>
                    <StatusBadge status={post.status} />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>

      <ReviewImageUploadPanel
        open={imageUploadPanelOpen}
        busy={Boolean(busy) || Boolean(imageBusyKey)}
        isUploading={imageBusyKey === "upload:add"}
        onClose={() => setImageUploadPanelOpen(false)}
        onChange={handleDraftImageAddFileChange}
        onPaste={handleDraftImageAddPaste}
        onDrop={handleDraftImageAddDrop}
      />

      {preview ? (
        <PreviewDialog
          preview={preview}
          imageBusyKey={imageBusyKey}
          busy={Boolean(busy)}
          onClose={() => setPreview(null)}
          onNavigate={(delta) => setPreview((current) => navigatePreview(current, delta))}
          onRemove={(kind, index) => (kind === "video" ? removeDraftVideo(index) : removeDraftImage(index))}
          onRegenerate={(index) => void regenerateDraftImage(index)}
        />
      ) : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="review-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <span className="text-xs font-black text-[var(--text-muted)]">{label}</span>;
}

function ReviewImageAddTile({
  empty,
  busy,
  isUploading,
  onOpen,
}: {
  empty?: boolean;
  busy: boolean;
  isUploading: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className={`review-gallery-add ${empty ? "review-gallery-empty" : ""} ${busy ? "review-gallery-tool-disabled" : ""}`}
      type="button"
      aria-label="新增配图"
      title="新增配图"
      disabled={busy}
      onClick={onOpen}
    >
      {isUploading ? <Loader2 className={empty ? "h-7 w-7 animate-spin" : "h-5 w-5 animate-spin"} /> : <ImagePlus className={empty ? "h-7 w-7" : "h-5 w-5"} />}
      <span>新增图片</span>
      <small>本地、粘贴或拖拽</small>
    </button>
  );
}

function ReviewImageUploadPanel({
  open,
  busy,
  isUploading,
  onClose,
  onChange,
  onPaste,
  onDrop,
}: {
  open: boolean;
  busy: boolean;
  isUploading: boolean;
  onClose: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  if (!open) return null;

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? "none" : "copy";
  };

  return (
    <div className="review-upload-backdrop" role="dialog" aria-modal="true" aria-labelledby="review-image-upload-title">
      <div className="review-upload-panel">
        <div className="review-upload-header">
          <div className="min-w-0">
            <p className="header-eyebrow">Image import</p>
            <h3 id="review-image-upload-title">新增图片</h3>
          </div>
          <button className="review-upload-close" type="button" onClick={onClose} disabled={isUploading} aria-label="关闭上传面板">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="review-upload-options">
          <label className={`review-upload-option ${busy ? "review-gallery-tool-disabled" : ""}`}>
            <Upload className="h-5 w-5" />
            <span>本地导入</span>
            <small>选择 PNG、JPG、WebP、GIF 或 AVIF</small>
            <input className="review-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={busy} onChange={(event) => onChange(event)} />
          </label>

          <div className="review-upload-option" tabIndex={0} onPaste={onPaste} onDragOver={handleDragOver} onDrop={onDrop}>
            <ClipboardCheck className="h-5 w-5" />
            <span>粘贴板导入</span>
            <small>点击这里后，Ctrl+V 粘贴图片</small>
          </div>

          <div className="review-upload-dropzone" tabIndex={0} onPaste={onPaste} onDragOver={handleDragOver} onDrop={onDrop}>
            {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
            <span>拖拽导入</span>
            <small>把本地图片拖到这里即可添加</small>
          </div>
        </div>

        <div className="review-upload-footer">
          <button className="soft-button h-10 px-4 text-xs font-black" type="button" onClick={onClose} disabled={isUploading}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function PostThumb({ post }: { post: GeneratedPost }) {
  const image = post.imageUrls[0];
  return (
    <div className="review-post-thumb">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={toDisplayImageSrc(image)} referrerPolicy="no-referrer" />
      ) : (
        <ImageIcon className="h-5 w-5" />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: GeneratedPost["status"] }) {
  const tone =
    status === "published"
      ? "text-[var(--success)]"
      : status === "approved"
        ? "text-[var(--mint)]"
        : status === "editing"
          ? "text-[var(--amber)]"
          : "text-[var(--text-muted)]";
  return <span className={`status-badge text-[10px] ${tone}`}>{formatReviewStatus(status)}</span>;
}

function PublishStatusCard({ publish }: { publish: PublishSnapshot }) {
  const icon =
    publish.status === "running" ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : publish.status === "error" ? (
      <X className="h-4 w-4" />
    ) : publish.status === "warning" ? (
      <Clock3 className="h-4 w-4" />
    ) : (
      <Check className="h-4 w-4" />
    );
  return (
    <div className={`publish-status publish-status-${publish.status}`} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <p className="truncate text-xs font-black">{publish.title}</p>
        </div>
        <span className="text-[11px] font-black tabular-nums">{publish.progress}%</span>
      </div>
      <div className="publish-status-track mt-2">
        <span style={{ width: `${publish.progress}%` }} />
      </div>
      <p className="mt-2 text-xs leading-5">{publish.detail}</p>
      {publish.jobId ? <p className="mt-1 truncate text-[11px] opacity-80">Job {publish.jobId}</p> : null}
      {publish.notification ? <p className="mt-1 text-[11px] leading-5 opacity-80">{publish.notification}</p> : null}
    </div>
  );
}

function PreviewDialog({
  preview,
  imageBusyKey,
  busy,
  onClose,
  onNavigate,
  onRemove,
  onRegenerate,
}: {
  preview: PreviewState;
  imageBusyKey: string;
  busy: boolean;
  onClose: () => void;
  onNavigate: (delta: number) => void;
  onRemove: (kind: "image" | "video", index: number) => void;
  onRegenerate: (index: number) => void;
}) {
  if (!preview) return null;
  const kind = preview.kind || "image";
  const media = kind === "video" ? postVideoUrls(preview.post) : preview.post.imageUrls;
  const index = Math.min(Math.max(preview.index, 0), Math.max(media.length - 1, 0));
  const url = media[index];
  const disableImageAction = busy || Boolean(imageBusyKey);
  return (
    <div className="review-preview-backdrop" role="dialog" aria-modal="true">
      <div className="review-preview-panel">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{preview.post.title || "最终配图"}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {index + 1} / {media.length}
            </p>
          </div>
          <button className="soft-button h-10 px-3 text-xs" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="review-preview-stage">
          {kind === "video" && url ? (
            <video src={url} controls preload="metadata" />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={toDisplayImageSrc(url)} referrerPolicy="no-referrer" />
          ) : null}
        </div>
        <div className="review-preview-actions">
          {media.length > 1 ? (
            <>
              <button className="soft-button h-10 text-xs" type="button" onClick={() => onNavigate(-1)}>
                上一张
              </button>
              <button className="soft-button h-10 text-xs" type="button" onClick={() => onNavigate(1)}>
                下一张
              </button>
            </>
          ) : null}
          {kind === "image" ? (
            <button className="soft-button h-10 text-xs" type="button" onClick={() => onRegenerate(index)} disabled={disableImageAction || !url}>
              {imageBusyKey === `regenerate:${index}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Prompt 生成
            </button>
          ) : null}
          <button className="soft-button h-10 text-xs text-[var(--rose)]" type="button" onClick={() => onRemove(kind, index)} disabled={disableImageAction || !url}>
            <Trash2 className="h-3.5 w-3.5" />
            {kind === "video" ? "删除视频" : "删除图片"}
          </button>
        </div>
      </div>
    </div>
  );
}

function filterPosts(
  posts: GeneratedPost[],
  filters: {
    statusFilter: ReviewFilter;
    timeFilter: ReviewTimeFilter;
    keywordFilter: string;
    authorFilter: string;
    platformFilter: Platform | "all";
  },
) {
  const trimmed = filters.keywordFilter.trim().toLowerCase();
  const author = filters.authorFilter.trim();
  return posts.filter((post) => {
    const matchesFilter =
      filters.statusFilter === "all" ||
      (filters.statusFilter === "ready" ? post.status === "approved" || post.status === "editing" || post.status === "draft" : post.status === filters.statusFilter);
    if (!matchesFilter) return false;
    if (!matchesTimeFilter(post, filters.timeFilter)) return false;
    if (filters.platformFilter !== "all" && post.platform !== filters.platformFilter) return false;
    if (author && getPostAuthor(post) !== author) return false;
    if (!trimmed) return true;
    return `${post.title}\n${post.body}\n${post.imagePrompt}\n${post.taskKeyword || ""}\n${post.feishuVehicle || ""}`.toLowerCase().includes(trimmed);
  });
}

function matchesTimeFilter(post: GeneratedPost, filter: ReviewTimeFilter) {
  if (filter === "all") return true;
  const value = Date.parse(post.updatedAt || post.createdAt || "");
  if (!Number.isFinite(value)) return false;
  const now = Date.now();
  if (filter === "today") return new Date(value).toDateString() === new Date(now).toDateString();
  const days = filter === "7d" ? 7 : 30;
  return now - value <= days * 24 * 60 * 60 * 1000;
}

function getPostAuthor(post: GeneratedPost) {
  return post.ownerDisplayName?.trim() || post.ownerUserId?.trim() || "未标记作者";
}

function buildAuthorOptions(posts: GeneratedPost[]) {
  return Array.from(new Set(posts.map(getPostAuthor))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function buildPlatformOptions(posts: GeneratedPost[]) {
  return Array.from(new Set(posts.map((post) => post.platform))).sort((a, b) => (platformLabels[a] || a).localeCompare(platformLabels[b] || b, "zh-CN"));
}

function findNextUnreviewedPostId(posts: GeneratedPost[], currentPostId: string) {
  const candidates = posts.filter((post) => post.id !== currentPostId && post.status !== "approved" && post.status !== "published");
  if (!candidates.length) return undefined;
  const currentIndex = posts.findIndex((post) => post.id === currentPostId);
  return candidates.find((post) => posts.findIndex((item) => item.id === post.id) > currentIndex)?.id || candidates[0]?.id;
}

function upsertReviewPost(posts: GeneratedPost[], savedPost: GeneratedPost) {
  const found = posts.some((post) => post.id === savedPost.id);
  const nextPosts = found ? posts.map((post) => (post.id === savedPost.id ? savedPost : post)) : [savedPost, ...posts];
  return nextPosts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getPersistedPostImageCount(posts: GeneratedPost[], postId: string, fallbackCount: number) {
  return posts.find((post) => post.id === postId)?.imageUrls.length ?? fallbackCount;
}

function buildSummary(posts: GeneratedPost[]) {
  return {
    total: posts.length,
    ready: posts.filter((post) => post.status !== "published").length,
    approved: posts.filter((post) => post.status === "approved").length,
    published: posts.filter((post) => post.status === "published").length,
  };
}

function buildPublishSnapshot(posts: GeneratedPost[], data: FeishuPublishResponse): PublishSnapshot {
  const job = data.job;
  const jobId = data.jobId || job?.id;
  const queueStatus = data.queueStatus || job?.status;
  const status = data.status || (queueStatus === "completed" ? "published" : queueStatus);
  const notification = formatPublishNotification(data.notification);

  if (status === "queued" || queueStatus === "queued") {
    return {
      jobId,
      queueStatus: queueStatus || "queued",
      postIds: posts.map((post) => post.id),
      status: "warning",
      title: "已进入飞书写入队列",
      detail:
        data.message ||
        (data.queueAhead
          ? `前方还有 ${data.queueAhead} 个同用户任务${data.activeJobId ? `，当前任务 ${data.activeJobId}` : ""}。`
          : `已进入飞书写入队列，共 ${posts.length} 条内容。`),
      progress: 55,
      notification,
    };
  }

  if (status === "running" || queueStatus === "running") {
    return {
      jobId,
      queueStatus: queueStatus || "running",
      postIds: posts.map((post) => post.id),
      status: "running",
      title: "Feishu CLI 正在写入",
      detail: data.message || `正在写入 ${posts.length} 条内容。`,
      progress: 72,
      notification,
    };
  }

  if (status !== "published") {
    return {
      jobId,
      queueStatus,
      postIds: posts.map((post) => post.id),
      status: status === "failed" ? "error" : "warning",
      title: "飞书写入未完全完成",
      detail: data.message || `发布流程返回 ${status || "unknown"}。`,
      progress: 100,
      notification,
    };
  }

  return {
    jobId,
    queueStatus,
    postIds: posts.map((post) => post.id),
    status: data.notification?.status === "failed" ? "warning" : "success",
    title: data.notification?.status === "failed" ? "飞书写入完成，通知失败" : "飞书写入完成",
    detail: `已写入 ${job?.result?.recordCount || posts.length} 条记录，处理 ${countPostMedia(posts)} 个素材。`,
    progress: 100,
    notification,
  };
}

function buildPublishMessage(data: FeishuPublishResponse) {
  if (data.status === "queued" || data.queueStatus === "queued") return data.message || "飞书写入任务已进入队列";
  if (data.status === "running" || data.queueStatus === "running") return data.message || "Feishu CLI 正在写入";
  if (data.status !== "published") return data.message || `飞书流程返回 ${data.status || "unknown"}`;
  return "飞书写入完成";
}

function formatPublishNotification(notification?: FeishuPublishResponse["notification"]) {
  if (!notification) return "通知：未触发";
  if (notification.status === "sent") return "通知：已发送到飞书";
  if (notification.status === "skipped") return "通知：未配置接收人，已跳过";
  if (notification.status === "failed") return `通知：发送失败，${notification.message || "请检查机器人权限和接收人配置"}`;
  return "通知：状态未知";
}

function isFeishuPublishQueueLive(status?: FeishuPublishJob["status"]) {
  return status === "queued" || status === "running";
}

function countPostMedia(posts: GeneratedPost[]) {
  return posts.reduce((sum, post) => sum + post.imageUrls.length + postVideoUrls(post).length, 0);
}

function postVideoUrls(post: GeneratedPost) {
  return Array.isArray(post.videoUrls) ? post.videoUrls.filter(Boolean) : [];
}

function formatReviewStatus(value: GeneratedPost["status"]) {
  const labels: Record<GeneratedPost["status"], string> = {
    draft: "草稿",
    editing: "编辑中",
    approved: "已审查",
    published: "已发布",
  };
  return labels[value] || value;
}

function formatShortTime(value?: string) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function navigatePreview(current: PreviewState, delta: number): PreviewState {
  if (!current) return current;
  const media = current.kind === "video" ? postVideoUrls(current.post) : current.post.imageUrls;
  if (!media.length) return current;
  const total = media.length;
  return {
    ...current,
    index: (current.index + delta + total) % total,
  };
}

function resolveDraftImagePrompt(post: GeneratedPost, imagePromptByIndex: Record<string, string>, index: number) {
  const manualPrompt = imagePromptByIndex[imagePromptKey(post.id, index)];
  if (manualPrompt !== undefined) return manualPrompt;

  const imagePromptParts = splitImagePrompt(post.imagePrompt);
  if (imagePromptParts.length > 1 && imagePromptParts[index]) return imagePromptParts[index];

  const selectedTasks = (post.imageTasks || []).filter((task) => task.selected);
  const taskPrompt = selectedTasks[index]?.prompt || post.imageTasks?.[index]?.prompt;
  if (taskPrompt?.trim()) return taskPrompt;

  return post.imagePrompt;
}

function imagePromptKey(postId: string, index: number) {
  return `${postId}:${index}`;
}

function moveImagePromptValues(current: Record<string, string>, post: GeneratedPost, index: number, nextIndex: number) {
  const next = { ...current };
  const sourceKey = imagePromptKey(post.id, index);
  const targetKey = imagePromptKey(post.id, nextIndex);
  const sourceValue = resolveDraftImagePrompt(post, current, index);
  const targetValue = resolveDraftImagePrompt(post, current, nextIndex);
  next[targetKey] = sourceValue;
  next[sourceKey] = targetValue;

  return next;
}

function removeImagePromptValue(current: Record<string, string>, post: GeneratedPost, removedIndex: number) {
  const next = { ...current };
  for (let index = 0; index < post.imageUrls.length; index += 1) {
    delete next[imagePromptKey(post.id, index)];
  }

  for (let index = 0; index < post.imageUrls.length; index += 1) {
    if (index === removedIndex) continue;
    const newIndex = index > removedIndex ? index - 1 : index;
    next[imagePromptKey(post.id, newIndex)] = resolveDraftImagePrompt(post, current, index);
  }

  return next;
}

function splitImagePrompt(value: string) {
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getClipboardImageFile(data: DataTransfer) {
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }

  return Array.from(data.files || []).find((file) => file.type.startsWith("image/"));
}

function getDataTransferImageFile(data: DataTransfer) {
  return Array.from(data.files || []).find((file) => file.type.startsWith("image/")) || getClipboardImageFile(data);
}

function toDisplayImageSrc(url?: string) {
  if (!url) return "";
  if (url.startsWith("/media/") || url.startsWith("/generated/")) return appendQueryParam(url, "v", localMediaPreviewVersion);
  if (/^https?:\/\//i.test(url)) return toRemoteImagePreviewSrc(url);
  return url;
}

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}
