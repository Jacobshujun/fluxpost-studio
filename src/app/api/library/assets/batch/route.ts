import { NextResponse } from "next/server";
import { updateLibraryAssetCollections } from "@/lib/library-assets";
import type { LibraryAssetRole, LibraryCollectionBatchRequest } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = parseLibraryCollectionBatchRequest(await request.json());
    return NextResponse.json(await updateLibraryAssetCollections(account, body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Library collection batch request failed." },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

function parseLibraryCollectionBatchRequest(value: unknown): LibraryCollectionBatchRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A JSON request body is required.");
  const body = value as Record<string, unknown>;
  const role = requireLibraryRole(body.role);
  const assetIds = requireIdArray(body.assetIds, "assetIds");
  if (body.action === "add_to_collections") {
    return {
      action: body.action,
      role,
      assetIds,
      collectionIds: requireIdArray(body.collectionIds, "collectionIds"),
    };
  }
  if (body.action === "create_collection_and_add") {
    if (typeof body.name !== "string") throw new Error("Collection name is required.");
    if (body.parentId !== undefined && typeof body.parentId !== "string") throw new Error("parentId must be a string.");
    return { action: body.action, role, assetIds, name: body.name, parentId: body.parentId };
  }
  if (body.action === "remove_from_collection") {
    if (typeof body.collectionId !== "string") throw new Error("collectionId is required.");
    return { action: body.action, role, assetIds, collectionId: body.collectionId };
  }
  throw new Error("Invalid library collection batch action.");
}

function requireLibraryRole(value: unknown): LibraryAssetRole {
  if (value !== "reference" && value !== "vehicle") throw new Error("A valid library role is required.");
  return value;
}

function requireIdArray(value: unknown, name: string) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  if (!value.every((item) => typeof item === "string")) throw new Error(`${name} must contain only strings.`);
  return value;
}
