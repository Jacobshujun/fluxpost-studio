import { NextResponse } from "next/server";
import { getReviewMetadata } from "@/lib/review-posts";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json(await getReviewMetadata(account, new URL(request.url).searchParams));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load review metadata" }, { status: isWorkspaceSignInError(error) ? 401 : 500 });
  }
}
