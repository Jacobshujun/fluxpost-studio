import { NextResponse } from "next/server";
import { cancelCanvasRun, getCanvasRun, retryCanvasNode } from "@/lib/canvas/runs";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import { canvasRunResponse } from "@/lib/canvas/schedule-response";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const result = await getCanvasRun((await context.params).id, account);
    if (!result) return NextResponse.json({ error: "Canvas run not found" }, { status: 404 });
    return NextResponse.json({ ...result, run: canvasRunResponse(result.run) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const runId = (await context.params).id;
    const body = (await request.json()) as { action?: "cancel" | "retry"; nodeId?: string };
    if (body.action === "cancel") return NextResponse.json({ run: canvasRunResponse(await cancelCanvasRun(runId, account)) });
    if (body.action === "retry" && body.nodeId?.trim()) {
      return NextResponse.json({ run: canvasRunResponse(await retryCanvasNode(runId, body.nodeId.trim(), account)) });
    }
    return NextResponse.json({ error: "Unsupported canvas run action." }, { status: 400 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Canvas run request failed.";
  return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : status });
}
