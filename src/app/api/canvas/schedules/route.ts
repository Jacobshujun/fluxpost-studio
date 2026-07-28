import { NextResponse } from "next/server";
import { createCanvasSchedule, kickCanvasSchedulerWorker, listCanvasSchedules } from "@/lib/canvas/scheduler";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    kickCanvasSchedulerWorker();
    return NextResponse.json({ schedules: await listCanvasSchedules(account) });
  } catch (error) {
    return scheduleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { workflowId?: string; name?: string };
    const workflowId = body.workflowId?.trim();
    if (!workflowId) return NextResponse.json({ error: "workflowId is required." }, { status: 400 });
    const schedule = await createCanvasSchedule(account, { workflowId, name: body.name });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    return scheduleError(error, 400);
  }
}

function scheduleError(error: unknown, status = 500) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Canvas schedule request failed." },
    { status: isWorkspaceSignInError(error) ? 401 : status },
  );
}
