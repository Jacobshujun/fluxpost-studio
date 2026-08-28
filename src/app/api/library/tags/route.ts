import { NextResponse } from "next/server";
import { listLibraryTagSuggestions, parseLibrarySelection, updateLibraryAssetTags } from "@/lib/library-assets";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    return NextResponse.json({
      tags: await listLibraryTagSuggestions(account, {
        query: url.searchParams.get("q") || undefined,
        limit: Number(url.searchParams.get("limit") || 20),
      }),
    });
  } catch (error) {
    return respond(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { selection?: unknown; assetIds?: unknown; add?: unknown; remove?: unknown; role?: unknown };
    if (body.role !== undefined) throw new Error("Library roles are no longer supported.");
    return NextResponse.json(await updateLibraryAssetTags(account, {
      selection: parseLibrarySelection(body.selection ?? { mode: "ids", assetIds: body.assetIds }),
      add: Array.isArray(body.add) ? body.add.filter((value): value is string => typeof value === "string") : [],
      remove: Array.isArray(body.remove) ? body.remove.filter((value): value is string => typeof value === "string") : [],
    }));
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Library tag request failed." },
    { status: isWorkspaceSignInError(error) ? 401 : 400 },
  );
}
