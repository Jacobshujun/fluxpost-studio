import { NextResponse } from "next/server";
import { getGeneratedPost } from "@/lib/generated-posts";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await requireWorkspaceAccount(request);
    const post = await getGeneratedPost((await context.params).id, account);
    return post ? NextResponse.json({ post }) : NextResponse.json({ error: "Post not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load post" }, { status: isWorkspaceSignInError(error) ? 401 : 500 });
  }
}
