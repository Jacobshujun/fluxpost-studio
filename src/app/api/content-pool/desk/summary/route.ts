import { NextResponse } from "next/server";
import { getContentPoolDeskSummary } from "@/lib/content-pool";
import { ContentPoolCollectionValidationError } from "@/lib/content-pool-collections";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const searchParams = new URL(request.url).searchParams;
    return NextResponse.json(await getContentPoolDeskSummary(account, {
      library: searchParams.get("library") || "all",
      includeDescendants: searchParams.get("descendants") !== "0",
      query: searchParams.get("query") || "",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read the content desk summary";
    const status = isWorkspaceSignInError(error) ? 401
      : error instanceof ContentPoolCollectionValidationError ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
