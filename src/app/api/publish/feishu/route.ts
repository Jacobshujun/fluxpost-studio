import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { getSourceItemsByIds, markSourceRewritten } from "@/lib/content-pool";
import { publishPostsToFeishu } from "@/lib/feishu-cli";
import { saveGeneratedPost } from "@/lib/generated-posts";
import { savePost } from "@/lib/store";
import type { GeneratedPost } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as { posts?: GeneratedPost[] };
    const posts = Array.isArray(body.posts) ? body.posts : [];
    if (!posts.length) {
      await recordExecutionLog({
        scope: "publish/feishu",
        action: "飞书写入请求校验失败",
        status: "error",
        message: "没有可写入的已审查草稿",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "At least one approved post is required" }, { status: 400 });
    }

    await recordExecutionLog({
      scope: "publish/feishu",
      action: "开始写入飞书",
      status: "running",
      message: "准备调用 Feishu CLI 或生成 outbox payload",
      details: {
        postCount: posts.length,
        firstPostId: posts[0]?.id || null,
      },
    });
    const publishPosts = await enrichPostsWithContentTags(posts);
    const result = await publishPostsToFeishu(publishPosts);
    const nextStatus: GeneratedPost["status"] = result.status === "published" ? "published" : "approved";
    const feishuStateByPostId = new Map((result.postStates || []).map((item) => [item.postId, item.feishu]));
    await Promise.all(publishPosts.map(async (post) => {
      const nextPost = {
        ...post,
        feishu: feishuStateByPostId.get(post.id) || post.feishu,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      await savePost(nextPost);
      await saveGeneratedPost(nextPost);
      await markSourceRewritten(nextPost.sourceItemId, nextPost);
    }));

    await recordExecutionLog({
      scope: "publish/feishu",
      action: "飞书写入完成",
      status: result.status === "published" ? "success" : "info",
      message: result.message || `飞书流程返回 ${result.status}`,
      durationMs: Date.now() - startedAt,
      details: {
        status: result.status,
        payloadPath: result.payloadPath || null,
        notificationStatus: result.notification?.status || null,
        notificationMessage: result.notification?.message || null,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish to Feishu";
    await recordExecutionLog({
      scope: "publish/feishu",
      action: "飞书写入失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function enrichPostsWithContentTags(posts: GeneratedPost[]) {
  const missingTagSourceIds = posts.filter((post) => !post.contentTags?.length).map((post) => post.sourceItemId);
  if (!missingTagSourceIds.length) return posts;
  const sources = await getSourceItemsByIds(missingTagSourceIds);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return posts.map((post) => ({
    ...post,
    contentTags: post.contentTags?.length ? post.contentTags : sourceById.get(post.sourceItemId)?.contentTagging?.tags || [],
  }));
}
