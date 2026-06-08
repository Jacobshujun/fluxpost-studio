import { NextResponse } from "next/server";
import { clearExecutionLogs, listExecutionLogs, recordExecutionLog } from "@/lib/activity-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 120), 1), 300);
  const entries = await listExecutionLogs(limit);
  return NextResponse.json({ entries });
}

export async function DELETE() {
  await clearExecutionLogs();
  await recordExecutionLog({
    scope: "activity",
    action: "清空执行日志",
    status: "info",
    message: "前端观察窗已清空历史记录",
  });
  return NextResponse.json({ status: "cleared" });
}
