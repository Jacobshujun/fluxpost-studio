import { NextResponse } from "next/server";
import { deleteLibrarySmartFolder, updateLibrarySmartFolder } from "@/lib/library-assets";
import type { LibrarySmartFolder } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as Partial<Pick<LibrarySmartFolder, "name" | "visibility" | "match" | "conditions">>;
    return NextResponse.json({ smartFolder: await updateLibrarySmartFolder(account, (await context.params).id, body) });
  } catch (error) {
    return respond(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    return NextResponse.json(await deleteLibrarySmartFolder(await requireWorkspaceAccount(request), (await context.params).id));
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Smart folder request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
}
