import { NextResponse } from "next/server";
import { migrateLegacyMaterialAssets } from "@/lib/library-assets";
import { kickLibraryTaggingWorker } from "@/lib/library-tagging";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const result = await migrateLegacyMaterialAssets(account, Number(body.limit || 20));
    if (result.imported) kickLibraryTaggingWorker();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Legacy migration failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
