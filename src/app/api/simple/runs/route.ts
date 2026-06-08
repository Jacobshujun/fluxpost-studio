import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { listSimpleRuns, startSimpleRun } from "@/lib/simple-runs";
import type { Platform, WorkspacePromptSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ runs: await listSimpleRuns() });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as {
      keyword?: string;
      targetCount?: number;
      platforms?: Platform[];
      materialPaths?: string[];
      settings?: Partial<WorkspacePromptSettings>;
    };
    const run = await startSimpleRun({
      keyword: body.keyword || "",
      targetCount: Number(body.targetCount || 10),
      platforms: Array.isArray(body.platforms) ? body.platforms : [],
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
