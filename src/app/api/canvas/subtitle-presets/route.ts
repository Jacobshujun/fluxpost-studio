import { NextResponse } from "next/server";
import { listCanvasSubtitleFonts } from "@/lib/canvas/subtitle-fonts";
import { CanvasSubtitlePresetConflictError, createCanvasSubtitlePreset, listCanvasSubtitlePresets } from "@/lib/canvas/subtitle-presets";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const [presets, fonts] = await Promise.all([listCanvasSubtitlePresets(account), listCanvasSubtitleFonts()]);
    const preferredFonts = ["Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", "DengXian", "SimHei"];
    const recommendedFont = preferredFonts.map((preferred) => fonts.find((font) => font.localeCompare(preferred, "zh-CN", { sensitivity: "accent" }) === 0)).find(Boolean) || fonts[0] || "";
    return NextResponse.json({ presets, fonts, recommendedFont, currentAccountId: account.id });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { name?: string; style?: unknown };
    return NextResponse.json({ preset: await createCanvasSubtitlePreset(account, body) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, error instanceof CanvasSubtitlePresetConflictError ? 409 : 400);
  }
}

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Subtitle preset request failed." }, { status: isWorkspaceSignInError(error) ? 401 : status });
}
