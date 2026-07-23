import { NextResponse } from "next/server";
import { removeLibraryAssetFromCollection } from "@/lib/library-assets";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ collectionId: string; assetId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const { collectionId, assetId } = await context.params;
    return NextResponse.json({ asset: await removeLibraryAssetFromCollection(account, collectionId, assetId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collection update failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
