import { NextResponse } from "next/server";
import { getCanvasIterationDetails, updateCanvasIteration } from "@/lib/canvas/iteration-actions";
import { canvasRunResponse } from "@/lib/canvas/schedule-response";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string; nodeId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const { id, nodeId } = await context.params;
    return NextResponse.json(await getCanvasIterationDetails(id, nodeId, account));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const { id, nodeId } = await context.params;
    const body = await request.json() as { action?: unknown };
    if (typeof body.action !== "string") throw new Error("Iteration action is required.");
    return NextResponse.json({ run: canvasRunResponse(await updateCanvasIteration(id, nodeId, body.action, account)) });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Iteration request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
}
