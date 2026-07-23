import { NextResponse } from "next/server";
import { listLibraryTagSuggestions, updateLibraryAssetTags } from "@/lib/library-assets";
import type { LibraryAssetRole } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const roleValue = url.searchParams.get("role");
    return NextResponse.json({
      tags: await listLibraryTagSuggestions(account, {
        role: roleValue ? requireLibraryRole(roleValue) : undefined,
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
    const body = (await request.json()) as { role?: unknown; assetIds?: unknown; add?: unknown; remove?: unknown };
    return NextResponse.json(await updateLibraryAssetTags(account, {
      role: requireLibraryRole(body.role),
      assetIds: Array.isArray(body.assetIds) ? body.assetIds.filter((value): value is string => typeof value === "string") : [],
      add: Array.isArray(body.add) ? body.add.filter((value): value is string => typeof value === "string") : [],
      remove: Array.isArray(body.remove) ? body.remove.filter((value): value is string => typeof value === "string") : [],
    }));
  } catch (error) {
    return respond(error);
  }
}

function requireLibraryRole(value: unknown): LibraryAssetRole {
  if (value !== "reference" && value !== "vehicle") throw new Error("A valid library role is required.");
  return value;
}

function respond(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Library tag request failed." },
    { status: isWorkspaceSignInError(error) ? 401 : 400 },
  );
}
