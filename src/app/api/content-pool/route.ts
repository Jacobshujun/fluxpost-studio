
import { NextResponse } from "next/server";
import { getContentPoolSnapshot } from "@/lib/content-pool";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("query") || undefined;
    const snapshot = await getContentPoolSnapshot(query, account);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read content pool";
    return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : 500 });
  }
}
