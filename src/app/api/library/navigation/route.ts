import { NextResponse } from "next/server";
import { listLibraryNavigation } from "@/lib/library-assets";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listLibraryNavigation(await requireWorkspaceAccount(request)));
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Library navigation failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
}
