import { NextResponse } from "next/server";
import { listLibraryAssets, parseLibrarySelection, setLibrarySelectionFavorite } from "@/lib/library-assets";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listLibraryAssets(await requireWorkspaceAccount(request), { favorite: true, limit: 100 }));
  } catch (error) {
    return respond(error);
  }
}

export async function POST(request: Request) {
  return mutate(request, true);
}

export async function DELETE(request: Request) {
  return mutate(request, false);
}

async function mutate(request: Request, favorite: boolean) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { selection?: unknown; assetIds?: unknown };
    const selection = parseLibrarySelection(body.selection ?? { mode: "ids", assetIds: body.assetIds });
    return NextResponse.json(await setLibrarySelectionFavorite(account, selection, favorite));
  } catch (error) {
    return respond(error);
  }
}

function respond(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Favorite request failed." }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
}
