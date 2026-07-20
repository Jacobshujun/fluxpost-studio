import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { reconcilePendingRuntimeMedia } from "@/lib/runtime-media-storage";
import { isWorkspaceAdmin, isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) return NextResponse.json({ error: "Only workspace admins can reconcile TOS media" }, { status: 403 });
    const result = await reconcilePendingRuntimeMedia();
    await recordExecutionLog({
      scope: "storage/tos",
      action: "Reconcile pending TOS media",
      status: result.failed ? "error" : "success",
      message: `TOS pending reconciliation uploaded ${result.uploaded} file(s) and left ${result.failed} failure(s).`,
      durationMs: Date.now() - startedAt,
      details: { uploaded: result.uploaded, failed: result.failed },
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = isWorkspaceSignInError(error) ? 401 : 500;
    return NextResponse.json({ error: compactError(error) }, { status });
  }
}
