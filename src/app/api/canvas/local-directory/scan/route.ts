import { NextResponse } from "next/server";
import { scanCanvasLocalDirectory } from "@/lib/canvas/directory-snapshots";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = await request.json() as { path?: unknown };
    const filePath = typeof body.path === "string" ? body.path.trim() : "";
    if (!filePath) return NextResponse.json({ error: "Directory path is required." }, { status: 400 });
    return NextResponse.json({ snapshot: await scanCanvasLocalDirectory(filePath, account.id) });
  } catch (error) {
    const status = isWorkspaceSignInError(error) ? 401 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Directory scan failed." }, { status });
  }
}
