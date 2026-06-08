import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { createAndRunBatchProduction, listBatchProductionJobs } from "@/lib/batch-production";

export const runtime = "nodejs";

export async function GET() {
  const jobs = await listBatchProductionJobs();
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
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
    });

    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "批量制作失败";
    const status = /请选择|未在内容池/.test(message) ? 400 : 500;
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
