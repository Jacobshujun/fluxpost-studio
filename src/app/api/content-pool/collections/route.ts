import { NextResponse } from "next/server";
import {
  ContentPoolCollectionValidationError,
  createContentPoolCollection,
  listContentPoolCollections,
} from "@/lib/content-pool-collections";
import { ContentPoolTagValidationError } from "@/lib/content-pool-tags";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json({ collections: await listContentPoolCollections(account) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { name?: unknown; parentId?: unknown };
    const collection = await createContentPoolCollection(account, { name: body.name, parentId: body.parentId });
    return NextResponse.json({ collection, collections: await listContentPoolCollections(account) });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to manage content-pool collections";
  const status = isWorkspaceSignInError(error) ? 401
    : error instanceof ContentPoolCollectionValidationError || error instanceof ContentPoolTagValidationError ? 400
      : 500;
  return NextResponse.json({ error: message }, { status });
}
