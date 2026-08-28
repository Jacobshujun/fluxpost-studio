import { NextResponse } from "next/server";
import {
  parseLibrarySelection,
  permanentlyDeleteLibrarySelection,
  setLibrarySelectionFavorite,
  setLibrarySelectionVisibility,
  updateLibraryAssetCollections,
} from "@/lib/library-assets";
import type { LibraryCollectionBatchRequest, LibraryVisibility } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A JSON request body is required.");
    const body = value as Record<string, unknown>;
    if ("role" in body) throw new Error("Library roles are no longer supported. Use a collection or smart folder.");
    const selection = parseLibrarySelection(body.selection ?? { mode: "ids", assetIds: body.assetIds });
    if (body.action === "set_favorite") return NextResponse.json(await setLibrarySelectionFavorite(account, selection, body.favorite === true));
    if (body.action === "set_visibility") return NextResponse.json(await setLibrarySelectionVisibility(account, selection, requireVisibility(body.visibility)));
    if (body.action === "delete") {
      if (body.confirm !== true) throw new Error("Permanent deletion requires confirm=true.");
      return NextResponse.json(await permanentlyDeleteLibrarySelection(account, selection));
    }
    return NextResponse.json(await updateLibraryAssetCollections(account, parseLibraryCollectionBatchRequest(body, selection)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Library collection batch request failed." },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

function parseLibraryCollectionBatchRequest(body: Record<string, unknown>, selection: LibraryCollectionBatchRequest["selection"]): LibraryCollectionBatchRequest {
  if (body.action === "add_to_collections") {
    return {
      action: body.action,
      selection,
      collectionIds: requireIdArray(body.collectionIds, "collectionIds"),
    };
  }
  if (body.action === "create_collection_and_add") {
    if (typeof body.name !== "string") throw new Error("Collection name is required.");
    if (body.parentId !== undefined && typeof body.parentId !== "string") throw new Error("parentId must be a string.");
    return { action: body.action, selection, name: body.name, parentId: body.parentId };
  }
  if (body.action === "remove_from_collection") {
    if (typeof body.collectionId !== "string") throw new Error("collectionId is required.");
    return { action: body.action, selection, collectionId: body.collectionId };
  }
  throw new Error("Invalid library collection batch action.");
}

function requireIdArray(value: unknown, name: string) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  if (!value.every((item) => typeof item === "string")) throw new Error(`${name} must contain only strings.`);
  return value;
}

function requireVisibility(value: unknown): LibraryVisibility {
  if (value !== "private" && value !== "team") throw new Error("visibility must be private or team.");
  return value;
}
