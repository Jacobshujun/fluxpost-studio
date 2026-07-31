import { NextResponse } from "next/server";
import { OriginalBatchInputError, regenerateOriginalSeriesCard } from "@/lib/original-batches";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { postId?: string; cardId?: string; prompt?: string };
    if (!body.postId?.trim() || !body.cardId?.trim()) return NextResponse.json({ error: "postId and cardId are required." }, { status: 400 });
    return NextResponse.json(await regenerateOriginalSeriesCard({ postId: body.postId.trim(), cardId: body.cardId.trim(), prompt: body.prompt }, account));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Original card regeneration failed.";
    return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : error instanceof OriginalBatchInputError ? 400 : 500 });
  }
}
