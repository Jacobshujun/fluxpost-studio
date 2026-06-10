import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { createAndRunBatchProduction, listBatchProductionJobs } from "@/lib/batch-production";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const jobs = await listBatchProductionJobs(account);
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list batch production jobs" },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      title?: string;
      sourceItemIds?: string[];
      materialPaths?: string[];
      instruction?: string;
    };

    await recordExecutionLog({
      scope: "production/batches",
      action: "接收批量制作请求",
      status: "running",
      message: "准备校验内容选择并创建批量任务",
      details: {
        sourceCount: Array.isArray(body.sourceItemIds) ? body.sourceItemIds.length : 0,
        materialCount: Array.isArray(body.materialPaths) ? body.materialPaths.length : 0,
      },
    });

    const job = await createAndRunBatchProduction({
      title: body.title,
      sourceItemIds: Array.isArray(body.sourceItemIds) ? body.sourceItemIds : [],
      materialPaths: Array.isArray(body.materialPaths) ? body.materialPaths : [],
      instruction: body.instruction,
    }, account);

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "批量制作失败";
    const status = isWorkspaceSignInError(error) ? 401 : /请选择|未在内容池/.test(message) ? 400 : 500;
    await recordExecutionLog({
      scope: "production/batches",
      action: "批量制作请求失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status });
  }
}
