import { NextResponse } from "next/server";
import { kickLibraryTaggingWorker, listLibraryTaggingJobs } from "@/lib/library-tagging";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    kickLibraryTaggingWorker();
    return NextResponse.json({ jobs: await listLibraryTaggingJobs(account, Number(new URL(request.url).searchParams.get("limit") || 100)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tagging jobs request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
