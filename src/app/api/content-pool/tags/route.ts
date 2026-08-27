import { NextResponse } from "next/server";
import { batchUpdateSourceItemCustomTags, listContentPoolTagSuggestions } from "@/lib/content-pool";
import { ContentPoolTagValidationError } from "@/lib/content-pool-tags";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const searchParams = new URL(request.url).searchParams;
    const tags = await listContentPoolTagSuggestions(account, {
      query: searchParams.get("q") || undefined,
      limit: Number(searchParams.get("limit") || 20),
    });
    return NextResponse.json({ tags });
  } catch (error) {
    return errorResponse(error, "Failed to list content-pool tags");
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { ids?: string[]; add?: unknown; remove?: unknown };
    const result = await batchUpdateSourceItemCustomTags(Array.isArray(body.ids) ? body.ids : [], {
      add: body.add,
      remove: body.remove,
    }, account);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Failed to update content-pool tags");
  }
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = isWorkspaceSignInError(error) ? 401 : error instanceof ContentPoolTagValidationError ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
