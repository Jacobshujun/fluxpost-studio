import { NextResponse } from "next/server";
import { deleteGeneratedPost, listGeneratedPosts, saveGeneratedPost, updateGeneratedPost } from "@/lib/generated-posts";
import type { GeneratedPost } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const posts = await listGeneratedPosts();
  return NextResponse.json({ posts });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { post?: GeneratedPost };
    if (!body.post) return NextResponse.json({ error: "Post is required" }, { status: 400 });
    const post = await saveGeneratedPost(body.post);
    return NextResponse.json({ post });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save post" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; patch?: Partial<GeneratedPost> };
    if (!body.id) return NextResponse.json({ error: "Post id is required" }, { status: 400 });
    const post = await updateGeneratedPost(body.id, body.patch || {});
    return NextResponse.json({ post });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update post" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Post id is required" }, { status: 400 });
    await deleteGeneratedPost(id);
    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete post" }, { status: 400 });
  }
}
