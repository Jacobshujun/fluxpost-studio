import { NextResponse } from "next/server";
import { enqueueLibraryTagging } from "@/lib/library-tagging";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { assetIds?: string[]; mode?: "failed" | "all" };
    const jobs = await enqueueLibraryTagging(account, Array.isArray(body.assetIds) ? body.assetIds : [], body.mode === "all" ? "all" : "failed");
    return NextResponse.json({ jobs, queued: jobs.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tagging request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
