import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { batchDeleteSourceItems, batchUpdateSourceItemStatus } from "@/lib/content-pool";
import { backfillSourceItemMedia } from "@/lib/media-backfill";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { SourceUsageStatus } from "@/lib/types";

export const runtime = "nodejs";

const sourceStatusValues: SourceUsageStatus[] = ["new", "analyzed", "rewritten", "approved", "published"];

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      action?: "set_status" | "delete" | "cache_media";
      ids?: string[];
      status?: SourceUsageStatus;
    };
    const ids = normalizeIds(body.ids);
    if (!ids.length) return NextResponse.json({ error: "Item ids are required" }, { status: 400 });

    if (body.action === "set_status") {
      if (!body.status || !sourceStatusValues.includes(body.status)) {
        return NextResponse.json({ error: "Valid source status is required" }, { status: 400 });
      }
      const result = await batchUpdateSourceItemStatus(ids, body.status, account);
      await recordExecutionLog({
        scope: "content/items",
        action: "批量更新内容池状态",
        status: "success",
        message: `已更新 ${result.updatedCount} 条内容为 ${body.status}`,
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

    if (body.action === "cache_media") {
      const result = await backfillSourceItemMedia(ids, account);
      await recordExecutionLog({
        scope: "content/items",
        action: "批量补全本地素材",
        status: result.errorCount ? "info" : "success",
        message: `已处理 ${result.updatedCount} 条内容，本地图片 ${result.localImages} 张，本地视频 ${result.localVideos} 个，关键帧 ${result.videoFrames} 张`,
        durationMs: Date.now() - startedAt,
        details: {
          requestedCount: ids.length,
          updatedCount: result.updatedCount,
          notFoundCount: result.notFoundIds.length,
          localImages: result.localImages,
          remoteImages: result.remoteImages,
          localVideos: result.localVideos,
          videoFrames: result.videoFrames,
          errorCount: result.errorCount,
        },
      });
      return NextResponse.json({ action: body.action, ...result });
    }

    if (body.action === "delete") {
      const result = await batchDeleteSourceItems(ids, account);
      await recordExecutionLog({
        scope: "content/items",
        action: "批量删除内容池样本",
        status: "success",
        message: `已删除 ${result.deletedCount} 条内容池样本`,
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
      scope: "content/items",
      action: "内容池批量操作失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to batch update content items" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

function normalizeIds(values?: string[]) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => value.trim()).filter(Boolean)));
}
