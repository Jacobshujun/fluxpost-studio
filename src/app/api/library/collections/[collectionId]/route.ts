import { NextResponse } from "next/server";
import { deleteLibraryCollection, updateLibraryCollection } from "@/lib/library-assets";
import type { LibraryVisibility } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ collectionId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { name?: string; visibility?: LibraryVisibility; parentId?: string | null };
    return NextResponse.json({ collection: await updateLibraryCollection(account, (await context.params).collectionId, body) });
  } catch (error) {
    return respond(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    return NextResponse.json(await deleteLibraryCollection(await requireWorkspaceAccount(request), (await context.params).collectionId));
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Collection request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
}
