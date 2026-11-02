import { NextResponse } from "next/server";
import {
  ContentPoolCollectionValidationError,
  deleteContentPoolCollection,
  updateContentPoolCollection,
} from "@/lib/content-pool-collections";
import { ContentPoolTagValidationError } from "@/lib/content-pool-tags";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ collectionId: string }> }) {
  try {
    const account = await requireWorkspaceAccount(request);
    const { collectionId } = await context.params;
    const body = (await request.json()) as { name?: unknown; parentId?: unknown };
    const collection = await updateContentPoolCollection(account, collectionId, body);
    return NextResponse.json({ collection });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ collectionId: string }> }) {
  try {
    const account = await requireWorkspaceAccount(request);
    const { collectionId } = await context.params;
    return NextResponse.json(await deleteContentPoolCollection(account, collectionId));
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to manage the content-pool collection";
  const status = isWorkspaceSignInError(error) ? 401
    : error instanceof ContentPoolCollectionValidationError || error instanceof ContentPoolTagValidationError ? 400
      : 500;
  return NextResponse.json({ error: message }, { status });
}
