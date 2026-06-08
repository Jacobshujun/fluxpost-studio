import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { ingestCrawlItems } from "@/lib/content-pool";
import { filterUnsafeSourceItems } from "@/lib/source-safety";
import { tagSourceItems } from "@/lib/source-tagging";
import { crawlTikHub } from "@/lib/tikhub";
import { makeDemoSourceItems } from "@/lib/mock-data";
import { saveJob, listJobs } from "@/lib/store";
import type { CrawlInput, Platform } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ jobs: await listJobs() });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as Partial<CrawlInput>;
    const input = parseCrawlInput(body);
    await recordExecutionLog({
      scope: "crawl/jobs",
      action: "开始关键词采集",
      status: "running",
      message: "解析请求参数后，准备调用 TikHub 采集接口",
      details: {
        platform: input.platform,
        query: input.query,
        targetCount: input.targetCount,
        sort: input.sort || null,
        hasCookie: Boolean(input.cookie),
      },
    });
    const now = new Date().toISOString();
    const job = await saveJob({
      id: `job-${Date.now()}`,
      status: "running",
      input,
      createdAt: now,
      updatedAt: now,
      items: [],
    });

    try {
      let items = await crawlTikHub(input);
      const rawItemCount = items.length;
      const safetyResult = await filterUnsafeSourceItems(items, { scope: "crawl/jobs", query: input.query });
      items = safetyResult.items;
      const downloadedVideoCount = items.filter((item) => item.downloadedVideoUrl).length;
      const extractedFrameCount = items.reduce((sum, item) => sum + (item.videoFrames?.length || 0), 0);
      await recordExecutionLog({
        scope: "crawl/jobs",
        action: "TikHub 返回原始样本",
        status: "info",
        message: `采集接口返回 ${items.length} 条标准化样本，准备写入关键词内容池`,
        durationMs: Date.now() - startedAt,
        details: {
          platform: input.platform,
          query: input.query,
          itemCount: rawItemCount,
          keptItems: items.length,
          filteredUnsafe: safetyResult.filtered.length,
          reviewUnsafe: safetyResult.reviewed.length,
          downloadedVideos: downloadedVideoCount,
          videoFrames: extractedFrameCount,
        },
      });
      items = await tagSourceItems(items);
      const taggedContentCount = items.filter((item) => item.contentTagging?.status === "success").length;
      const taggedVisualCount = items.reduce((sum, item) => sum + (item.visualTagging?.assets.length || 0), 0);
      await recordExecutionLog({
        scope: "crawl/jobs",
        action: "采集样本自动打标完成",
        status: "info",
        message: `已完成 ${taggedContentCount}/${items.length} 条内容标签，视觉标签 ${taggedVisualCount} 个`,
        durationMs: Date.now() - startedAt,
        details: {
          platform: input.platform,
          query: input.query,
          taggedContent: taggedContentCount,
          taggedVisual: taggedVisualCount,
        },
      });
      const project = await ingestCrawlItems(input.query, items);
      items = items.slice(0, input.targetCount);
      const updated = await saveJob({
        ...job,
        status: "completed",
        items,
        updatedAt: new Date().toISOString(),
      });
      await recordExecutionLog({
        scope: "crawl/jobs",
        action: "采集任务完成",
        status: "success",
        message: `内容池已更新：${project.totalItems} 条累计样本，本次返回 ${items.length} 条`,
        durationMs: Date.now() - startedAt,
        details: {
          query: input.query,
          projectItems: project.totalItems,
          returnedItems: items.length,
          downloadedVideos: downloadedVideoCount,
          videoFrames: extractedFrameCount,
        },
      });
      return NextResponse.json({ ...updated, project });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown crawler error";
      const isMissingTikHubKey = message.includes("TIKHUB_API_KEY");
      const updated = await saveJob({
        ...job,
        status: isMissingTikHubKey ? "needs_config" : "failed",
        warning: isMissingTikHubKey ? "TikHub API Key 未配置，已返回本地演示数据。" : undefined,
        error: isMissingTikHubKey ? undefined : message,
        items: isMissingTikHubKey ? makeDemoSourceItems(input.platform, input.targetCount) : [],
        updatedAt: new Date().toISOString(),
      });
      const project = isMissingTikHubKey ? await ingestCrawlItems(input.query, updated.items) : undefined;
      await recordExecutionLog({
        scope: "crawl/jobs",
        action: isMissingTikHubKey ? "采集降级为演示数据" : "采集任务失败",
        status: isMissingTikHubKey ? "info" : "error",
        message: isMissingTikHubKey ? "TikHub 未配置，系统返回本地演示样本" : compactError(error),
        durationMs: Date.now() - startedAt,
        details: {
          platform: input.platform,
          query: input.query,
          returnedItems: updated.items.length,
        },
      });
      return NextResponse.json({ ...updated, project }, { status: isMissingTikHubKey ? 200 : 502 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    await recordExecutionLog({
      scope: "crawl/jobs",
      action: "采集请求校验失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseCrawlInput(body: Partial<CrawlInput>): CrawlInput {
  const platform = body.platform;
  if (!isPlatform(platform)) throw new Error("Unsupported platform");
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) throw new Error("Query is required");

  const targetCount = Math.min(Math.max(Number(body.targetCount || 10), 1), 200);

  return {
    platform,
    query,
    targetCount,
    mode: body.mode,
    sort: typeof body.sort === "string" ? body.sort : undefined,
    noteType: Number.isFinite(Number(body.noteType)) ? Number(body.noteType) : undefined,
    searchType: typeof body.searchType === "string" ? body.searchType : undefined,
    includeType: typeof body.includeType === "string" ? body.includeType : undefined,
    timeScope: typeof body.timeScope === "string" ? body.timeScope : undefined,
    contentType: typeof body.contentType === "string" ? body.contentType : undefined,
    cookie: typeof body.cookie === "string" ? body.cookie : undefined,
  };
}

function isPlatform(value: unknown): value is Platform {
  return value === "wechat_channels" || value === "xiaohongshu" || value === "douyin" || value === "weibo";
}
