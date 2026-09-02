import { NextResponse } from "next/server";
import {
  acceptCanvasScheduleCandidates,
  acceptCanvasScheduleV2Candidates,
  cancelCanvasSchedule,
  CanvasScheduleRevisionConflictError,
  convertCanvasScheduleToV2,
  deleteCanvasSchedule,
  duplicateCanvasSchedule,
  getCanvasSchedule,
  launchCanvasSchedule,
  preflightCanvasSchedule,
  resampleCanvasSchedule,
  retryCanvasScheduleImageTask,
  retryCanvasScheduleContentTask,
  retryCanvasScheduleFailedTasks,
  retryCanvasScheduleV2ChildTask,
  retryCanvasScheduleV2MainTask,
  retryCanvasScheduleV2SharedTask,
  setCanvasSchedulePaused,
  updateCanvasScheduleDraft,
} from "@/lib/canvas/scheduler";
import type { CanvasScheduleBatch, CanvasScheduleV2Definition } from "@/lib/canvas/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import { canvasScheduleResponse } from "@/lib/canvas/schedule-response";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
type ScheduleAction = "save" | "preflight" | "resample" | "launch" | "duplicate" | "convert-v2" | "pause" | "resume" | "cancel" | "retry" | "retry-content" | "retry-row" | "retry-shared" | "retry-all" | "accept-candidates";

export async function GET(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const schedule = await getCanvasSchedule((await context.params).id, account);
    if (!schedule) return NextResponse.json({ error: "Canvas schedule not found" }, { status: 404 });
    return NextResponse.json({ schedule: canvasScheduleResponse(schedule) });
  } catch (error) {
    return scheduleError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const scheduleId = (await context.params).id;
    const body = (await request.json()) as {
      action?: ScheduleAction;
      revision?: number;
      previewRevision?: string;
      name?: string;
      batches?: CanvasScheduleBatch[];
      definition?: CanvasScheduleV2Definition;
      batchId?: string;
      contentTaskId?: string;
      imageTaskId?: string;
      mainTaskId?: string;
      childTaskId?: string;
    };
    const action = body.action || "save";
    let schedule;
    if (action === "save") {
      schedule = await updateCanvasScheduleDraft(scheduleId, account, {
        revision: Number(body.revision),
        name: body.name,
        batches: body.batches,
        definition: body.definition,
      });
    } else if (action === "preflight") {
      schedule = await preflightCanvasSchedule(scheduleId, account, Number(body.revision));
    } else if (action === "resample") {
      if (!body.batchId) return badRequest("batchId is required.");
      schedule = await resampleCanvasSchedule(scheduleId, account, {
        revision: Number(body.revision),
        batchId: body.batchId,
        contentTaskId: body.contentTaskId,
      });
    } else if (action === "launch") {
      if (!body.previewRevision) return badRequest("previewRevision is required.");
      schedule = await launchCanvasSchedule(scheduleId, account, {
        revision: Number(body.revision),
        previewRevision: body.previewRevision,
      });
    } else if (action === "duplicate") {
      schedule = await duplicateCanvasSchedule(scheduleId, account);
    } else if (action === "convert-v2") {
      schedule = await convertCanvasScheduleToV2(scheduleId, account);
    } else if (action === "pause" || action === "resume") {
      schedule = await setCanvasSchedulePaused(scheduleId, account, action === "pause");
    } else if (action === "cancel") {
      schedule = await cancelCanvasSchedule(scheduleId, account);
    } else if (action === "retry") {
      if (body.mainTaskId || body.childTaskId) {
        if (!body.mainTaskId || !body.childTaskId) return badRequest("mainTaskId and childTaskId are required.");
        schedule = await retryCanvasScheduleV2ChildTask(scheduleId, account, { mainTaskId: body.mainTaskId, childTaskId: body.childTaskId });
      } else {
        if (!body.batchId || !body.contentTaskId || !body.imageTaskId) return badRequest("batchId, contentTaskId, and imageTaskId are required.");
        schedule = await retryCanvasScheduleImageTask(scheduleId, account, {
          batchId: body.batchId,
          contentTaskId: body.contentTaskId,
          imageTaskId: body.imageTaskId,
        });
      }
    } else if (action === "retry-shared") {
      if (!body.mainTaskId) return badRequest("mainTaskId is required.");
      schedule = await retryCanvasScheduleV2SharedTask(scheduleId, account, { mainTaskId: body.mainTaskId });
    } else if (action === "retry-content") {
      if (!body.batchId || !body.contentTaskId) return badRequest("batchId and contentTaskId are required.");
      schedule = await retryCanvasScheduleContentTask(scheduleId, account, { batchId: body.batchId, contentTaskId: body.contentTaskId });
    } else if (action === "retry-row") {
      if (!body.mainTaskId) return badRequest("mainTaskId is required.");
      schedule = await retryCanvasScheduleV2MainTask(scheduleId, account, { mainTaskId: body.mainTaskId });
    } else if (action === "retry-all") {
      schedule = await retryCanvasScheduleFailedTasks(scheduleId, account);
    } else if (action === "accept-candidates") {
      if (body.mainTaskId) {
        schedule = await acceptCanvasScheduleV2Candidates(scheduleId, account, { mainTaskId: body.mainTaskId });
      } else {
        if (!body.batchId || !body.contentTaskId) return badRequest("batchId and contentTaskId are required.");
        schedule = await acceptCanvasScheduleCandidates(scheduleId, account, {
          batchId: body.batchId,
          contentTaskId: body.contentTaskId,
        });
      }
    } else {
      return badRequest("Unknown Canvas schedule action.");
    }
    return NextResponse.json({ schedule: canvasScheduleResponse(schedule) });
  } catch (error) {
    return scheduleError(error, error instanceof CanvasScheduleRevisionConflictError ? 409 : 400);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    await deleteCanvasSchedule((await context.params).id, account);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return scheduleError(error, 400);
  }
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function scheduleError(error: unknown, status = 500) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Canvas schedule request failed." },
    { status: isWorkspaceSignInError(error) ? 401 : status },
  );
}
