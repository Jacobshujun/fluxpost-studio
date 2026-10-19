import { NextResponse } from "next/server";
import { enqueueLibraryColorJob, getLibraryColorJob, libraryColorCoverage } from "@/lib/library-color-store";
import { kickLibraryColorWorker } from "@/lib/library-colors";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const [job, coverage] = await Promise.all([getLibraryColorJob(account), libraryColorCoverage(account)]);
    return NextResponse.json({ job, coverage });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body: { mode?: unknown } = await request.json();
    if (body.mode !== "missing" && body.mode !== "failed") return NextResponse.json({ error: "请选择分析未处理图片或重试失败图片。" }, { status: 400 });
    const id = await enqueueLibraryColorJob(account, body.mode);
    kickLibraryColorWorker();
    return NextResponse.json({ job: await getLibraryColorJob(account, id), coverage: await libraryColorCoverage(account) }, { status: 202 });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "颜色分析请求失败。" }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
}
