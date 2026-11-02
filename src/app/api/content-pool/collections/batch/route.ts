import { NextResponse } from "next/server";
import {
  ContentPoolCollectionValidationError,
  updateContentPoolCollectionItems,
} from "@/lib/content-pool-collections";
import { ContentPoolTagValidationError } from "@/lib/content-pool-tags";
import type { ContentPoolCollectionBatchRequest } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as Partial<ContentPoolCollectionBatchRequest> & { action?: string };
    const result = await updateContentPoolCollectionItems(account, parseBatchRequest(body));
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

function parseBatchRequest(body: Partial<ContentPoolCollectionBatchRequest> & { action?: string }): ContentPoolCollectionBatchRequest {
  switch (body.action) {
    case "add_to_collections":
      return {
        action: body.action,
        itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
        collectionIds: Array.isArray(body.collectionIds) ? body.collectionIds : [],
      };
    case "move_to_collection":
      return {
        action: body.action,
        itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
        sourceCollectionId: String(body.sourceCollectionId || ""),
        targetCollectionId: String(body.targetCollectionId || ""),
      };
    case "remove_from_collection":
      return {
        action: body.action,
        itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
        collectionId: String(body.collectionId || ""),
      };
    case "move_to_default":
      return {
        action: body.action,
        itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
      };
    case "create_collection_and_add":
      return {
        action: body.action,
        itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
        name: typeof body.name === "string" ? body.name : "",
        parentId: typeof body.parentId === "string" ? body.parentId : undefined,
      };
    default:
      throw new ContentPoolCollectionValidationError("不支持的批量归属操作。");
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to update content-pool collection items";
  const status = isWorkspaceSignInError(error) ? 401
    : error instanceof ContentPoolCollectionValidationError || error instanceof ContentPoolTagValidationError ? 400
      : 500;
  return NextResponse.json({ error: message }, { status });
}
