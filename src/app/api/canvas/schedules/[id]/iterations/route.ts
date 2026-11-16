import { NextResponse } from "next/server";
import { getCanvasScheduleIterationDetails } from "@/lib/canvas/scheduler";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await requireWorkspaceAccount(request);
    const params = new URL(request.url).searchParams;
    const mainTaskId = params.get("mainTaskId");
    const childTaskId = params.get("childTaskId") || undefined;
    const phase = params.get("phase");
    if (!mainTaskId || (phase !== "shared" && phase !== "child") || (phase === "child" && !childTaskId)) {
      return NextResponse.json({ error: "mainTaskId and a valid phase/childTaskId are required." }, { status: 400 });
    }
    const details = await getCanvasScheduleIterationDetails((await context.params).id, account, { mainTaskId, childTaskId, phase });
    return NextResponse.json({ details });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Iteration details failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
