import { NextResponse } from "next/server";
import {
  CanvasRevisionConflictError,
  deleteCanvasWorkflow,
  duplicateCanvasWorkflow,
  getCanvasWorkflow,
  updateCanvasWorkflow,
} from "@/lib/canvas/workflows";
import type { CanvasGraph } from "@/lib/canvas/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const workflow = await getCanvasWorkflow((await context.params).id, account);
    if (!workflow) return NextResponse.json({ error: "Canvas workflow not found" }, { status: 404 });
    return NextResponse.json({ workflow });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const workflowId = (await context.params).id;
    const body = (await request.json()) as {
      action?: "duplicate" | "template-copy";
      name?: string;
      graph?: CanvasGraph;
      revision?: number;
      isTemplate?: boolean;
    };
    const workflow = body.action
      ? await duplicateCanvasWorkflow(workflowId, account, { asTemplate: body.action === "template-copy", name: body.name })
      : await updateCanvasWorkflow(workflowId, account, {
          name: body.name,
          graph: body.graph,
          revision: Number(body.revision),
          isTemplate: body.isTemplate,
        });
    return NextResponse.json({ workflow });
  } catch (error) {
    return errorResponse(error, error instanceof CanvasRevisionConflictError ? 409 : 400);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    await deleteCanvasWorkflow((await context.params).id, account);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 404);
  }
}

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Canvas workflow request failed.";
  return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : status });
}
