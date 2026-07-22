import { NextResponse } from "next/server";
import { listGeneratedPosts } from "@/lib/generated-posts";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const posts = await listGeneratedPosts(account);
    return NextResponse.json({ posts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list posts" },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}
