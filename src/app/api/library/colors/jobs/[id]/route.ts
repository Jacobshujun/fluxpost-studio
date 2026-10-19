import { NextResponse } from "next/server";
import { getLibraryColorJob, libraryColorCoverage } from "@/lib/library-color-store";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await requireWorkspaceAccount(request);
    const job = await getLibraryColorJob(account, (await context.params).id);
    if (!job) return NextResponse.json({ error: "颜色分析任务不存在。" }, { status: 404 });
    return NextResponse.json({ job, coverage: await libraryColorCoverage(account) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "颜色分析状态读取失败。" }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
