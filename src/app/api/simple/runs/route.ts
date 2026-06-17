import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
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
      sourceMode?: "keyword" | "links" | "feishu";
      keyword?: string;
      targetCount?: number;
      platforms?: CrawlPlatform[];
      links?: string[] | string;
      linkPlatform?: SourceLinkPlatform | "auto";
      feishuTaskNumbers?: string[] | string;
      materialPaths?: string[];
      settings?: Partial<WorkspacePromptSettings>;
    };
    const run = await startSimpleRun({
      sourceMode: body.sourceMode === "feishu" ? "feishu" : body.sourceMode === "links" ? "links" : "keyword",
      keyword: body.keyword || "",
      targetCount: body.targetCount === undefined ? undefined : Number(body.targetCount),
      platforms: Array.isArray(body.platforms) ? body.platforms : [],
      links: body.links,
      linkPlatform: body.linkPlatform,
      feishuTaskNumbers: body.feishuTaskNumbers,
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
      action: "简单版全自动请求失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    const status = /sign-in/i.test(message) ? 401 : /required|platform/i.test(message) ? 400 : 500;
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
      action: "简单版任务强制终止失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    const status = /sign-in/i.test(message) ? 401 : /required/i.test(message) ? 400 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
