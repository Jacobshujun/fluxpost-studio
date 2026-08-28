import { NextResponse } from "next/server";
import { createLibraryCollection, listLibraryNavigation } from "@/lib/library-assets";
import type { LibraryVisibility } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const result = await listLibraryNavigation(account);
    return NextResponse.json({ collections: result.collections });
  } catch (error) {
    return respond(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { name?: string; visibility?: LibraryVisibility; parentId?: string; role?: unknown };
    if (body.role !== undefined) throw new Error("Library roles are no longer supported.");
    return NextResponse.json({ collection: await createLibraryCollection(account, { name: body.name || "", visibility: body.visibility, parentId: body.parentId }) });
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Collection request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
}
