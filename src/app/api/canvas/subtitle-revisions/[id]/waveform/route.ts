import { NextResponse } from "next/server";
import { CanvasSubtitleRevisionNotFoundError, getCanvasSubtitleRevision } from "@/lib/canvas/subtitle-revisions";
import { getCanvasSubtitleWaveform } from "@/lib/canvas/subtitle-waveform";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const revision = await getCanvasSubtitleRevision((await context.params).id, account);
    if (!revision) throw new CanvasSubtitleRevisionNotFoundError("Subtitle revision not found.");
    const waveform = await getCanvasSubtitleWaveform(revision);
    return NextResponse.json({ durationMs: waveform.durationMs, pointsPerSecond: waveform.pointsPerSecond, peaks: waveform.peaks });
  } catch (error) {
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof CanvasSubtitleRevisionNotFoundError ? 404 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Subtitle waveform request failed." }, { status });
  }
}
