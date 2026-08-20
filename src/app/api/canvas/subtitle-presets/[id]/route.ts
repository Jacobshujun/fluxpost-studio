import { NextResponse } from "next/server";
import { CanvasSubtitlePresetConflictError, CanvasSubtitlePresetNotFoundError, deleteCanvasSubtitlePreset, updateCanvasSubtitlePreset } from "@/lib/canvas/subtitle-presets";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { name?: string; style?: unknown; revision?: number };
    return NextResponse.json({ preset: await updateCanvasSubtitlePreset(account, (await context.params).id, body) });
  } catch (error) {
    return errorResponse(error, error instanceof CanvasSubtitlePresetConflictError ? 409 : error instanceof CanvasSubtitlePresetNotFoundError ? 404 : 400);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const revision = Number(new URL(request.url).searchParams.get("revision"));
    await deleteCanvasSubtitlePreset(account, (await context.params).id, revision);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, error instanceof CanvasSubtitlePresetConflictError ? 409 : error instanceof CanvasSubtitlePresetNotFoundError ? 404 : 400);
  }
}

function errorResponse(error: unknown, status: number) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Subtitle preset request failed." }, { status: isWorkspaceSignInError(error) ? 401 : status });
}
