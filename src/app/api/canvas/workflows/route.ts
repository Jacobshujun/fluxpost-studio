import { NextResponse } from "next/server";
import { createCanvasWorkflow, listCanvasWorkflows } from "@/lib/canvas/workflows";
import type { CanvasGraph } from "@/lib/canvas/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import { isCanvasWorkflowTemplateKey, type CanvasWorkflowTemplateKey } from "@/lib/canvas/templates";
import { canvasWorkflowResponse } from "@/lib/canvas/schedule-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json({ workflows: (await listCanvasWorkflows(account)).map(canvasWorkflowResponse) });
  } catch (error) {
    return errorResponse(error, "Canvas workflows could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { name?: string; graph?: CanvasGraph; isTemplate?: boolean; templateKey?: CanvasWorkflowTemplateKey };
    if (body.templateKey !== undefined && !isCanvasWorkflowTemplateKey(body.templateKey)) throw new Error("Unsupported Canvas template key.");
    const workflow = await createCanvasWorkflow(account, body);
    return NextResponse.json({ workflow: canvasWorkflowResponse(workflow) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Canvas workflow could not be created.", 400);
  }
}

function errorResponse(error: unknown, fallback: string, callerStatus = 500) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : callerStatus });
}
