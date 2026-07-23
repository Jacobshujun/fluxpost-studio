import { NextResponse } from "next/server";
import { listLibraryAssets, parseLibraryAssetFilters } from "@/lib/library-assets";
import { kickLibraryTaggingWorker } from "@/lib/library-tagging";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    kickLibraryTaggingWorker();
    return NextResponse.json(await listLibraryAssets(account, parseLibraryAssetFilters(new URL(request.url))));
  } catch (error) {
    return libraryError(error, isWorkspaceSignInError(error) ? 401 : 400);
  }
}

function libraryError(error: unknown, status: number) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Library request failed." }, { status });
}
