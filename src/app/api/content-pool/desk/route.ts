import { NextResponse } from "next/server";
import { getContentPoolDesk } from "@/lib/content-pool";
import { ContentPoolCollectionValidationError } from "@/lib/content-pool-collections";
import { ContentPoolTagValidationError } from "@/lib/content-pool-tags";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import { parseContentPoolDeskRequest } from "./request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const { filter, cursor, limit } = parseContentPoolDeskRequest(new URL(request.url).searchParams);
    return NextResponse.json(await getContentPoolDesk(account, filter, cursor, limit));
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to read the content desk";
  const status = isWorkspaceSignInError(error) ? 401
    : error instanceof ContentPoolCollectionValidationError || error instanceof ContentPoolTagValidationError ? 400
      : 500;
  return NextResponse.json({ error: message }, { status });
}
