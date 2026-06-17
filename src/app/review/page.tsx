"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type { FeishuPostPublishState, FeishuPublishJob, GeneratedPost, Platform } from "@/lib/types";

type ReviewFilter = GeneratedPost["status"] | "all" | "ready";
type BusyState = "load" | "save" | "review" | "batch" | "publish" | null;

type FeishuPublishResponse = {
  status?: "queued" | "running" | "published" | "attachment_failed" | "needs_config" | "skipped" | "failed" | string;
  jobId?: string;
  queueStatus?: FeishuPublishJob["status"];
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

const platformLabels: Record<Platform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  weibo: "微博",
  wechat_channels: "视频号",
  xiaopeng_bbs: "小鹏社区",
  dongchedi: "\u61c2\u8f66\u5e1d",
  feishu: "飞书",
};

export default function ReviewPage() {
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<GeneratedPost | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>("ready");
  const [query, setQuery] = useState("");
  const [reviewPrompt, setReviewPrompt] = useState("");
  const [busy, setBusy] = useState<BusyState>("load");
  const [message, setMessage] = useState("");
  const [publish, setPublish] = useState<PublishSnapshot | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);

  const selectedPosts = useMemo(() => posts.filter((post) => selectedPostIds.includes(post.id)), [posts, selectedPostIds]);
  const filteredPosts = useMemo(() => filterPosts(posts, filter, query), [posts, filter, query]);
  const summary = useMemo(() => buildSummary(posts), [posts]);

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
    setMessage("");
  }

  function toggleSelection(postId: string) {
    setSelectedPostIds((current) => (current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]));
  }

  function selectVisible() {
    setSelectedPostIds(filteredPosts.slice(0, 200).map((post) => post.id));
  }

  async function saveDraft(patch?: Partial<GeneratedPost>, instruction?: string) {
    if (!draft) return;
    setBusy(instruction ? "review" : "save");
    setMessage("");
    try {
      const manualPatch = patch || {
        title: draft.title,
        body: draft.body,
        imagePrompt: draft.imagePrompt,
        imageUrls: draft.imageUrls,
        imageTasks: draft.imageTasks,
      };
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post: draft, manualPatch, instruction }),
      });
      const data = (await res.json()) as { post?: GeneratedPost; error?: string };
      if (!res.ok || !data.post) throw new Error(data.error || "保存审查修改失败");
      setDraft(data.post);
      setSelectedPostId(data.post.id);
      await loadPosts(data.post.id);
      setMessage(data.post.status === "approved" ? "已通过审查" : "已保存修改");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存审查修改失败");
    } finally {
      setBusy(null);
    }
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
    const postsToPublish = selectedPosts.length ? selectedPosts : draft ? [draft] : [];
    if (!postsToPublish.length) return;
    setBusy("publish");
    setMessage("");
    setPublish({
      postIds: postsToPublish.map((post) => post.id),
      status: "running",
      title: "正在提交飞书写入队列",
      detail: `准备写入 ${postsToPublish.length} 条内容，图片素材共 ${countImages(postsToPublish)} 张。`,
      progress: 32,
      notification: "完成后会按当前配置发送飞书通知。",
    });
    try {
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
            <div className="review-search">
              <Search className="h-4 w-4" />
              <input className="field search-field h-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或正文" />
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
                            <span className="status-badge text-[10px] text-[var(--text-muted)]">{post.imageUrls.length} 图</span>
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
                      draft.imageUrls.map((url, index) => (
                        <button
                          key={`${url}-${index}`}
                          className={`review-gallery-tile ${index === 0 ? "review-gallery-tile-primary" : ""}`}
                          type="button"
                          onClick={() => setPreview({ post: draft, index })}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img alt={`最终配图 ${index + 1}`} src={toDisplayImageSrc(url)} referrerPolicy="no-referrer" />
                          <span>{index + 1}</span>
                        </button>
                      ))
                    ) : (
                      <div className="review-gallery-empty">
                        <ImageIcon className="h-7 w-7" />
                        <span>暂无最终配图</span>
                      </div>
                    )}
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
                      <FieldLabel label="图片 Prompt" />
                      <textarea className="field mt-2 min-h-28 resize-y leading-6" value={draft.imagePrompt} onChange={(event) => setDraft({ ...draft, imagePrompt: event.target.value })} />
                    </label>
                  </div>
                </div>

                <div className="review-action-strip">
                  <button className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-xs font-black" type="button" onClick={() => setPreview({ post: draft, index: 0 })} disabled={!draft.imageUrls.length}>
                    <Maximize2 className="h-4 w-4" />
                    大图预览
                  </button>
                  <button className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-xs font-black" type="button" onClick={() => saveDraft()} disabled={Boolean(busy)}>
                    {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    保存修改
                  </button>
                  <button className="soft-button inline-flex h-11 items-center justify-center gap-2 px-4 text-xs font-black" type="button" onClick={() => saveDraft({ status: "approved" })} disabled={Boolean(busy)}>
                    <ShieldCheck className="h-4 w-4 text-[var(--mint)]" />
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
                    <StatusBadge status={post.status} />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>

      {preview ? <PreviewDialog preview={preview} onClose={() => setPreview(null)} onNavigate={(delta) => setPreview((current) => navigatePreview(current, delta))} /> : null}
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

function PreviewDialog({ preview, onClose, onNavigate }: { preview: PreviewState; onClose: () => void; onNavigate: (delta: number) => void }) {
  if (!preview) return null;
  const images = preview.post.imageUrls;
  const index = Math.min(Math.max(preview.index, 0), Math.max(images.length - 1, 0));
  const image = images[index];
  return (
    <div className="review-preview-backdrop" role="dialog" aria-modal="true">
      <div className="review-preview-panel">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{preview.post.title || "最终配图"}</p>
            <p className="mt-1 text-xs text-white/55">
              {index + 1} / {images.length}
            </p>
          </div>
          <button className="soft-button h-10 px-3 text-xs" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="review-preview-stage">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={toDisplayImageSrc(image)} referrerPolicy="no-referrer" />
          ) : null}
        </div>
        {images.length > 1 ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="soft-button h-10 text-xs" type="button" onClick={() => onNavigate(-1)}>
              上一张
            </button>
            <button className="soft-button h-10 text-xs" type="button" onClick={() => onNavigate(1)}>
              下一张
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function filterPosts(posts: GeneratedPost[], filter: ReviewFilter, query: string) {
  const trimmed = query.trim().toLowerCase();
  return posts.filter((post) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "ready" ? post.status === "approved" || post.status === "editing" || post.status === "draft" : post.status === filter);
    if (!matchesFilter) return false;
    if (!trimmed) return true;
    return `${post.title}\n${post.body}\n${post.imagePrompt}`.toLowerCase().includes(trimmed);
  });
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
      detail: data.message || `等待同用户写入队列处理，共 ${posts.length} 条内容。`,
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
    detail: `已写入 ${job?.result?.recordCount || posts.length} 条记录，处理 ${countImages(posts)} 张图片。`,
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

function countImages(posts: GeneratedPost[]) {
  return posts.reduce((sum, post) => sum + post.imageUrls.length, 0);
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
  if (!current?.post.imageUrls.length) return current;
  const total = current.post.imageUrls.length;
  return {
    ...current,
    index: (current.index + delta + total) % total,
  };
}

function toDisplayImageSrc(url?: string) {
  if (!url) return "";
  if (url.startsWith("/media/") || url.startsWith("/generated/")) return appendQueryParam(url, "v", localMediaPreviewVersion);
  if (/^https?:\/\//i.test(url)) return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  return url;
}

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}
