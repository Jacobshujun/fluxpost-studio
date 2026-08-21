import { NextResponse } from "next/server";
import { saveCanvasSubtitleRevision } from "@/lib/canvas/subtitle-revisions";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import { subtitleRevisionErrorResponse } from "../_response";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { revision?: number; segments?: unknown };
    return NextResponse.json({ revision: await saveCanvasSubtitleRevision(account, (await context.params).id, body) });
  } catch (error) {
    if (isWorkspaceSignInError(error)) return NextResponse.json({ error: error instanceof Error ? error.message : "Sign-in required." }, { status: 401 });
    return subtitleRevisionErrorResponse(error);
  }
}
