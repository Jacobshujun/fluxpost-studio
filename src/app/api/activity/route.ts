import { NextResponse } from "next/server";
import { clearExecutionLogs, listExecutionLogs, recordExecutionLog } from "@/lib/activity-log";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 120), 1), 300);
    const entries = await listExecutionLogs(limit, account);
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list activity log" },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    await clearExecutionLogs(account);
    await recordExecutionLog({
      scope: "activity",
      action: "Execution log cleared",
      status: "info",
      message: "The current workspace activity view was cleared.",
      ownerUserId: account.id,
      ownerDisplayName: account.displayName,
    });
    return NextResponse.json({ status: "cleared" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear activity log" },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}
