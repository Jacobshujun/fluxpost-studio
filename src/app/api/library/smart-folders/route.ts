import { NextResponse } from "next/server";
import { createLibrarySmartFolder, listLibrarySmartFolders } from "@/lib/library-assets";
import type { LibrarySmartFolder } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ smartFolders: await listLibrarySmartFolders(await requireWorkspaceAccount(request)) });
  } catch (error) {
    return respond(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as Pick<LibrarySmartFolder, "name" | "visibility" | "match" | "conditions">;
    return NextResponse.json({ smartFolder: await createLibrarySmartFolder(account, body) });
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Smart folder request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
}
