import { NextResponse } from "next/server";
import { getContentPoolDeskIds } from "@/lib/content-pool";
import { ContentPoolCollectionValidationError } from "@/lib/content-pool-collections";
import { ContentPoolTagValidationError } from "@/lib/content-pool-tags";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import { parseContentPoolDeskRequest } from "../request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const { filter, limit } = parseContentPoolDeskRequest(new URL(request.url).searchParams);
    return NextResponse.json({ items: await getContentPoolDeskIds(account, filter, limit) });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to read content desk ids";
  const status = isWorkspaceSignInError(error) ? 401
    : error instanceof ContentPoolCollectionValidationError || error instanceof ContentPoolTagValidationError ? 400
      : 500;
  return NextResponse.json({ error: message }, { status });
}
