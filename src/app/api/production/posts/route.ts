import { NextResponse } from "next/server";
import { deleteGeneratedPost, listGeneratedPosts, saveGeneratedPost, updateGeneratedPost } from "@/lib/generated-posts";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { GeneratedPost } from "@/lib/types";

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

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { post?: GeneratedPost };
    if (!body.post) return NextResponse.json({ error: "Post is required" }, { status: 400 });
    const post = await saveGeneratedPost(body.post, account);
    return NextResponse.json({ post });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save post" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { id?: string; patch?: Partial<GeneratedPost> };
    if (!body.id) return NextResponse.json({ error: "Post id is required" }, { status: 400 });
    const post = await updateGeneratedPost(body.id, body.patch || {}, account);
    return NextResponse.json({ post });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update post" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Post id is required" }, { status: 400 });
    await deleteGeneratedPost(id, account);
    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete post" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}
