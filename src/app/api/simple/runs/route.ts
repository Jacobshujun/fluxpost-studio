import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { appConfig } from "@/lib/config";
import { resolveLibraryAssetSelections } from "@/lib/library-assets";
import { normalizeFeishuPublishMode } from "@/lib/feishu-publish-mode";
import { listSimpleRuns, pauseSimpleRun, resumeSimpleRun, startSimpleRun, terminateSimpleRun } from "@/lib/simple-runs";
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
      sourceMode?: "keyword" | "links" | "feishu" | "viral" | "original" | "pool" | "dongchedi_page";
      keyword?: string;
      targetCount?: number;
      platforms?: CrawlPlatform[];
      links?: string[] | string;
      pageUrl?: string;
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
      feishuPublishMode?: unknown;
      feishuTaskNumbers?: string[] | string;
      viralUrl?: string;
      viralImitateImages?: boolean;
      viralMaterialAssetIds?: string[];
      originalPrompt?: string;
      originalUseWebSearch?: boolean;
      materialAssetIds?: string[];
      settings?: Partial<WorkspacePromptSettings>;
    };
    if (body.sourceMode === "original" && body.originalUseWebSearch === true && appConfig.openaiTextEndpoint !== "responses") {
      throw new Error("Original-mode web search requires OPENAI_TEXT_ENDPOINT=responses; turn off web search or switch the text endpoint before starting this run.");
    }
    const baseSourceMode =
      body.sourceMode === "feishu" ? "feishu" : body.sourceMode === "links" ? "links" : body.sourceMode === "pool" ? "pool" : "keyword";
    const resolvedSourceMode =
      body.sourceMode === "original" ? "original" : body.sourceMode === "viral" ? "viral" : body.sourceMode === "dongchedi_page" ? "dongchedi_page" : baseSourceMode;
    const materialAssets = await resolveLibraryAssetSelections(
      account,
      Array.isArray(body.materialAssetIds) ? body.materialAssetIds : [],
      "vehicle",
    );
    const viralMaterialAssets = await resolveLibraryAssetSelections(
      account,
      Array.isArray(body.viralMaterialAssetIds) ? body.viralMaterialAssetIds : [],
      "vehicle",
    );
    let feishuPublishMode;
    try {
      feishuPublishMode = normalizeFeishuPublishMode(body.feishuPublishMode);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Feishu publish mode" }, { status: 400 });
    }
    const run = await startSimpleRun({
      sourceMode: resolvedSourceMode,
      keyword: body.keyword || "",
      targetCount: body.targetCount === undefined ? undefined : Number(body.targetCount),
      platforms: Array.isArray(body.platforms) ? body.platforms : [],
      links: body.links,
      pageUrl: body.pageUrl,
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
      feishuPublishMode,
      feishuTaskNumbers: body.feishuTaskNumbers,
      viralUrl: body.viralUrl,
      viralImitateImages: body.viralImitateImages === true,
      viralMaterialPaths: viralMaterialAssets.map((asset) => asset.publicUrl),
      originalPrompt: body.originalPrompt,
      originalUseWebSearch: body.originalUseWebSearch === true,
      materialPaths: materialAssets.map((asset) => asset.publicUrl),
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
    const status = /sign-in/i.test(message) ? 401 : /requires|required|platform/i.test(message) ? 400 : /dongchedi category|dongchedi cookie|encryption key/i.test(message) ? 400 : /library asset/i.test(message) ? 400 : 500;
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

export async function PATCH(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { runId?: string; action?: "pause" | "resume"; reason?: string; cookie?: string };
    const runId = (body.runId || "").trim();
    if (!runId) return NextResponse.json({ error: "Simple run id is required" }, { status: 400 });
    if (body.action === "pause") return NextResponse.json({ run: await pauseSimpleRun(runId, body.reason, account) });
    if (body.action === "resume") return NextResponse.json({ run: await resumeSimpleRun(runId, body.cookie, account) });
    return NextResponse.json({ error: "Simple run action must be pause or resume" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simple run control failed";
    const status = /sign-in/i.test(message) ? 401 : /not found/i.test(message) ? 404 : /required|only|cannot|available/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
