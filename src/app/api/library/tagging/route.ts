import { NextResponse } from "next/server";
import { parseLibrarySelection, resolveLibrarySelectionIds } from "@/lib/library-assets";
import { enqueueLibraryTagging } from "@/lib/library-tagging";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { selection?: unknown; assetIds?: string[]; mode?: "failed" | "all" };
    const selection = parseLibrarySelection(body.selection ?? { mode: "ids", assetIds: body.assetIds });
    const jobs = await enqueueLibraryTagging(account, await resolveLibrarySelectionIds(account, selection), body.mode === "all" ? "all" : "failed");
    return NextResponse.json({ jobs, queued: jobs.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tagging request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
