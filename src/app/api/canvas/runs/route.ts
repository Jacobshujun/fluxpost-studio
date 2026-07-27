import { NextResponse } from "next/server";
import {
  CanvasConfirmationRequiredError,
  createCanvasRun,
  listCanvasRunHistory,
  planCanvasRunWithMode,
} from "@/lib/canvas/runs";
import type { CanvasRunMode } from "@/lib/canvas/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const workflowId = new URL(request.url).searchParams.get("workflowId") || undefined;
    return NextResponse.json(await listCanvasRunHistory(account, workflowId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      action?: "plan";
      workflowId?: string;
      targetNodeIds?: string[];
      runMode?: CanvasRunMode;
      confirmed?: boolean;
      confirmationNodeIds?: string[];
    };
    const workflowId = body.workflowId?.trim();
    if (!workflowId) return NextResponse.json({ error: "workflowId is required." }, { status: 400 });
    if (body.action === "plan") {
      const { plan } = await planCanvasRunWithMode(workflowId, account, body.targetNodeIds, body.runMode);
      return NextResponse.json({ plan });
    }
    const run = await createCanvasRun(workflowId, account, body);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    if (error instanceof CanvasConfirmationRequiredError) {
      return NextResponse.json({ error: error.message, confirmationRequired: true, plan: error.plan }, { status: 409 });
    }
    return errorResponse(error, 400);
  }
}

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Canvas run request failed.";
  return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : status });
}
