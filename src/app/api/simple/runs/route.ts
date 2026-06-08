import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { listSimpleRuns, startSimpleRun, terminateSimpleRun } from "@/lib/simple-runs";
import type { Platform, WorkspacePromptSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ runs: await listSimpleRuns() });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as {
      sourceMode?: "keyword" | "links";
      keyword?: string;
      targetCount?: number;
      platforms?: Platform[];
      links?: string[] | string;
      linkPlatform?: Platform | "auto";
      materialPaths?: string[];
      settings?: Partial<WorkspacePromptSettings>;
    };
    const run = await startSimpleRun({
      sourceMode: body.sourceMode === "links" ? "links" : "keyword",
      keyword: body.keyword || "",
      targetCount: body.targetCount === undefined ? undefined : Number(body.targetCount),
      platforms: Array.isArray(body.platforms) ? body.platforms : [],
      links: body.links,
      linkPlatform: body.linkPlatform,
      materialPaths: Array.isArray(body.materialPaths) ? body.materialPaths : [],
      settings: body.settings,
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
    return NextResponse.json({ error: message }, { status: /required|platform/i.test(message) ? 400 : 500 });
  }
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();
  try {
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

    const run = await terminateSimpleRun(runId, body.reason);
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
    const status = /required/i.test(message) ? 400 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
