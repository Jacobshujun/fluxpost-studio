import { NextResponse } from "next/server";
import { openCanvasSubtitleRevision } from "@/lib/canvas/subtitle-revisions";
import { requireWorkspaceAccount } from "@/lib/workspace-accounts";
import { subtitleRevisionErrorResponse } from "./_response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { workflowId?: string; nodeId?: string; nodeRunId?: string };
    return NextResponse.json({ revision: await openCanvasSubtitleRevision(account, body) });
  } catch (error) {
    return subtitleRevisionErrorResponse(error);
  }
}
