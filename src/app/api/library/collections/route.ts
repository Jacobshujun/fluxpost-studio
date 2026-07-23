import { NextResponse } from "next/server";
import { createLibraryCollection, listLibraryAssets } from "@/lib/library-assets";
import type { LibraryAssetRole } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const result = await listLibraryAssets(account, { limit: 1 });
    return NextResponse.json({ collections: result.collections });
  } catch (error) {
    return respond(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { name?: string; role?: LibraryAssetRole; parentId?: string };
    return NextResponse.json({ collection: await createLibraryCollection(account, { name: body.name || "", role: body.role || "reference", parentId: body.parentId }) });
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Collection request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
}
