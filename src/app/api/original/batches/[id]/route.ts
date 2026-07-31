import { NextResponse } from "next/server";
import { OriginalBatchInputError, getOriginalBatch, updateOriginalBatch } from "@/lib/original-batches";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json({ batch: await getOriginalBatch((await context.params).id, account) });
  } catch (error) {
    return originalBatchDetailError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { action?: "pause" | "resume" | "cancel" | "retry_failed" };
    if (!body.action || !["pause", "resume", "cancel", "retry_failed"].includes(body.action)) {
      return NextResponse.json({ error: "Unsupported original batch action." }, { status: 400 });
    }
    const batch = await updateOriginalBatch((await context.params).id, body.action, account);
    return NextResponse.json({ batch });
  } catch (error) {
    return originalBatchDetailError(error);
  }
}

function originalBatchDetailError(error: unknown) {
  const message = error instanceof Error ? error.message : "Original batch request failed.";
  const status = isWorkspaceSignInError(error) ? 401 : /not found/i.test(message) ? 404 : error instanceof OriginalBatchInputError ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
