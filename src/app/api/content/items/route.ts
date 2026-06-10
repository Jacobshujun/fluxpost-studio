import { NextResponse } from "next/server";
import { createSourceItem, deleteSourceItem, getContentPoolSnapshot, updateSourceItem } from "@/lib/content-pool";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { NormalizedSourceItem } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("query") || undefined;
    const snapshot = await getContentPoolSnapshot(query, account);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read content items" },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { query?: string; item?: NormalizedSourceItem };
    if (!body.query?.trim()) return NextResponse.json({ error: "Query is required" }, { status: 400 });
    if (!body.item) return NextResponse.json({ error: "Item is required" }, { status: 400 });
    const result = await createSourceItem(body.query.trim(), body.item, account);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create content item" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { id?: string; patch?: Partial<NormalizedSourceItem> };
    if (!body.id) return NextResponse.json({ error: "Item id is required" }, { status: 400 });
    const item = await updateSourceItem(body.id, body.patch || {}, account);
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update content item" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Item id is required" }, { status: 400 });
    await deleteSourceItem(id, account);
    return NextResponse.json({ status: "deleted" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete content item" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}
