import { NextResponse } from "next/server";
import { getCanvasDirectorySnapshot } from "@/lib/canvas/directory-snapshots";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const id = new URL(request.url).searchParams.get("id")?.trim() || "";
    if (!id) return NextResponse.json({ error: "Snapshot id is required." }, { status: 400 });
    return NextResponse.json({ snapshot: await getCanvasDirectorySnapshot(id, account.id) });
  } catch (error) {
    const status = isWorkspaceSignInError(error) ? 401 : 404;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Snapshot not found." }, { status });
  }
}
