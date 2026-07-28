import { NextResponse } from "next/server";
import { getLibraryAsset, patchLibraryAssetWithResult, permanentlyDeleteLibraryAsset, type PatchLibraryAssetInput } from "@/lib/library-assets";
import { kickLibraryTaggingWorker } from "@/lib/library-tagging";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json({ asset: await getLibraryAsset(account, (await context.params).id) });
  } catch (error) {
    return libraryError(error, isWorkspaceSignInError(error) ? 401 : 404);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as PatchLibraryAssetInput;
    const result = await patchLibraryAssetWithResult(account, (await context.params).id, body);
    if (result.taggingQueued) kickLibraryTaggingWorker();
    return NextResponse.json({ asset: result.asset });
  } catch (error) {
    return libraryError(error, isWorkspaceSignInError(error) ? 401 : 400);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const result = await permanentlyDeleteLibraryAsset(account, (await context.params).id);
    return NextResponse.json(result, { status: result.status === "deleted" ? 200 : 502 });
  } catch (error) {
    return libraryError(error, isWorkspaceSignInError(error) ? 401 : 400);
  }
}

function libraryError(error: unknown, status: number) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Library request failed." }, { status });
}
