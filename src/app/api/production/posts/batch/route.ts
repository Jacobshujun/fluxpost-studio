import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { markSourceRewritten } from "@/lib/content-pool";
import { batchDeleteGeneratedPosts, batchUpdateGeneratedPostStatus } from "@/lib/generated-posts";
import type { GeneratedPost } from "@/lib/types";

export const runtime = "nodejs";

const generatedPostStatusValues: GeneratedPost["status"][] = ["draft", "editing", "approved", "published"];

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as {
      action?: "set_status" | "delete";
      ids?: string[];
      status?: GeneratedPost["status"];
    };
    const ids = normalizeIds(body.ids);
    if (!ids.length) return NextResponse.json({ error: "Post ids are required" }, { status: 400 });

    if (body.action === "set_status") {
      if (!body.status || !generatedPostStatusValues.includes(body.status)) {
        return NextResponse.json({ error: "Valid post status is required" }, { status: 400 });
      }
      const result = await batchUpdateGeneratedPostStatus(ids, body.status);
      if (body.status === "approved" || body.status === "published") {
        await Promise.all(result.posts.map((post) => markSourceRewritten(post.sourceItemId, post)));
      }
      await recordExecutionLog({
        scope: "production/posts",
        action: "批量更新生成稿状态",
        status: "success",
        message: `已更新 ${result.updatedCount} 条生成稿为 ${body.status}`,
        durationMs: Date.now() - startedAt,
        details: {
          requestedCount: ids.length,
          updatedCount: result.updatedCount,
          notFoundCount: result.notFoundIds.length,
          status: body.status,
        },
      });
      return NextResponse.json({ action: body.action, ...result });
    }

    if (body.action === "delete") {
      const result = await batchDeleteGeneratedPosts(ids);
      await recordExecutionLog({
        scope: "production/posts",
        action: "批量删除生成稿",
        status: "success",
        message: `已删除 ${result.deletedCount} 条生成稿`,
        durationMs: Date.now() - startedAt,
        details: {
          requestedCount: ids.length,
          deletedCount: result.deletedCount,
          notFoundCount: result.notFoundIds.length,
        },
      });
      return NextResponse.json({ action: body.action, ...result });
    }

    return NextResponse.json({ error: "Unsupported batch action" }, { status: 400 });
  } catch (error) {
    await recordExecutionLog({
      scope: "production/posts",
      action: "生成稿批量操作失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to batch update generated posts" }, { status: 400 });
  }
}

function normalizeIds(values?: string[]) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => value.trim()).filter(Boolean)));
}
