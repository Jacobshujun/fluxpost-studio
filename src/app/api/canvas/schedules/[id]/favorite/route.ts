import { NextResponse } from "next/server";
import { CanvasScheduleFavoriteError, getCanvasScheduleFavoriteSummary, removeCanvasScheduleFavorite, saveCanvasScheduleFavorite } from "@/lib/canvas/schedule-favorites";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const account = await requireWorkspaceAccount(request);
    const summary = await getCanvasScheduleFavoriteSummary(account, (await context.params).id);
    return NextResponse.json({ favorite: summary.favorite });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request, context: Context) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new CanvasScheduleFavoriteError("收藏信息无效。", 400);
    const favorite = await saveCanvasScheduleFavorite(account, (await context.params).id, body);
    return NextResponse.json({ favorite });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const account = await requireWorkspaceAccount(request);
    await removeCanvasScheduleFavorite(account, (await context.params).id);
    return NextResponse.json({ favorite: null });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "收藏操作失败。" }, {
    status: isWorkspaceSignInError(error) ? 401 : error instanceof CanvasScheduleFavoriteError ? error.status : error instanceof SyntaxError ? 400 : 500,
  });
}
