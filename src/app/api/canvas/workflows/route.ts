import { NextResponse } from "next/server";
import { createCanvasWorkflow, listCanvasWorkflows } from "@/lib/canvas/workflows";
import type { CanvasGraph } from "@/lib/canvas/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json({ workflows: await listCanvasWorkflows(account) });
  } catch (error) {
    return errorResponse(error, "Canvas workflows could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { name?: string; graph?: CanvasGraph; isTemplate?: boolean };
    const workflow = await createCanvasWorkflow(account, body);
    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Canvas workflow could not be created.", 400);
  }
}

function errorResponse(error: unknown, fallback: string, callerStatus = 500) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : callerStatus });
}
