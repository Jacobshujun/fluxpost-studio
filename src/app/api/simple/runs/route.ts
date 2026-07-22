import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { appConfig } from "@/lib/config";
import { listSimpleRuns, startSimpleRun, terminateSimpleRun } from "@/lib/simple-runs";
import { requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { CrawlPlatform, SourceLinkPlatform, WorkspacePromptSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json({ runs: await listSimpleRuns(20, account) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simple runs list failed";
    return NextResponse.json({ error: message }, { status: /sign-in/i.test(message) ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      sourceMode?: "keyword" | "links" | "feishu" | "viral" | "original" | "pool";
      keyword?: string;
      targetCount?: number;
      platforms?: CrawlPlatform[];
      links?: string[] | string;
      sourceItemIds?: string[];
      linkPlatform?: SourceLinkPlatform | "auto";
      cookie?: string;
      videoFrameOriginalReference?: boolean;
      useComfyUiKlein?: boolean;
      directOriginalReference?: boolean;
      includeSourceVideo?: boolean;
      enableVideoTranscription?: boolean;
      generateImages?: boolean;
      writeFeishu?: boolean;
      feishuTaskNumbers?: string[] | string;
      viralUrl?: string;
      viralImitateImages?: boolean;
      viralMaterialPaths?: string[];
      originalPrompt?: string;
      originalUseWebSearch?: boolean;
      materialPaths?: string[];
      settings?: Partial<WorkspacePromptSettings>;
    };
    if (body.sourceMode === "original" && body.originalUseWebSearch === true && appConfig.openaiTextEndpoint !== "responses") {
      throw new Error("Original-mode web search requires OPENAI_TEXT_ENDPOINT=responses; turn off web search or switch the text endpoint before starting this run.");
    }
    const baseSourceMode =
      body.sourceMode === "feishu" ? "feishu" : body.sourceMode === "links" ? "links" : body.sourceMode === "pool" ? "pool" : "keyword";
    const run = await startSimpleRun({
      sourceMode: body.sourceMode === "original" ? "original" : body.sourceMode === "viral" ? "viral" : baseSourceMode,
      keyword: body.keyword || "",
      targetCount: body.targetCount === undefined ? undefined : Number(body.targetCount),
      platforms: Array.isArray(body.platforms) ? body.platforms : [],
      links: body.links,
      sourceItemIds: Array.isArray(body.sourceItemIds) ? body.sourceItemIds : [],
      linkPlatform: body.linkPlatform,
      cookie: body.cookie,
      videoFrameOriginalReference: body.videoFrameOriginalReference !== false,
      useComfyUiKlein: body.useComfyUiKlein === true,
      directOriginalReference: body.directOriginalReference === true,
      includeSourceVideo: body.includeSourceVideo === true,
      enableVideoTranscription: body.enableVideoTranscription === true,
      generateImages: body.generateImages !== false,
      writeFeishu: body.writeFeishu === true,
      feishuTaskNumbers: body.feishuTaskNumbers,
      viralUrl: body.viralUrl,
      viralImitateImages: body.viralImitateImages === true,
      viralMaterialPaths: Array.isArray(body.viralMaterialPaths) ? body.viralMaterialPaths : [],
      originalPrompt: body.originalPrompt,
      originalUseWebSearch: body.originalUseWebSearch === true,
      materialPaths: Array.isArray(body.materialPaths) ? body.materialPaths : [],
      settings: body.settings,
      ownerUserId: account.id,
      ownerDisplayName: account.displayName,
    });
    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simple run failed";
    await recordExecutionLog({
      scope: "simple/run",
      action: "精简版全自动请求失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    const status = /sign-in/i.test(message) ? 401 : /requires|required|platform/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    let body: { runId?: string; reason?: string } = {};
    try {
      body = (await request.json()) as { runId?: string; reason?: string };
    } catch {
      body = {};
    }

    const url = new URL(request.url);
    const runId = (body.runId || url.searchParams.get("runId") || "").trim();
    if (!runId) {
      return NextResponse.json({ error: "Simple run id is required" }, { status: 400 });
    }

    const run = await terminateSimpleRun(runId, body.reason, account);
    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simple run termination failed";
    await recordExecutionLog({
      scope: "simple/run",
      action: "精简版任务强制终止失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    const status = /sign-in/i.test(message) ? 401 : /required/i.test(message) ? 400 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
